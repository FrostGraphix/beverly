"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const handler = require("../api/reference");
const localDatabase = require("../backend/src/services/local-database");

function startServer(listener) {
  return new Promise((resolve) => {
    const server = http.createServer(listener);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function createProxyServer() {
  return startServer((req, res) => {
    const apiResponse = {
      statusCode: 200,
      setHeader(name, value) {
        res.setHeader(name, value);
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        res.statusCode = this.statusCode;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(body));
      }
    };
    Promise.resolve(handler(req, apiResponse)).catch((error) => {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ code: 500, msg: error.message, data: null }));
    });
  });
}

function post(port, urlPath, payload, contentType = "application/json") {
  return new Promise((resolve, reject) => {
    const encoded = contentType.includes("json")
      ? JSON.stringify(payload || {})
      : new URLSearchParams(payload || {}).toString();
    const body = Buffer.from(encoded);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method: "POST",
      headers: {
        "Content-Type": contentType,
        "Content-Length": body.length
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode,
          body: text ? JSON.parse(text) : {}
        });
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const dbPath = path.join(__dirname, "..", "tmp", `sms-notification-api-${process.pid}.sqlite`);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const previousEnv = {
    LOCAL_DB_PATH: process.env.LOCAL_DB_PATH,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER,
    TWILIO_VERIFY_SERVICE_SID: process.env.TWILIO_VERIFY_SERVICE_SID,
    TWILIO_SMS_STATUS_CALLBACK_URL: process.env.TWILIO_SMS_STATUS_CALLBACK_URL,
    TWILIO_VALIDATE_WEBHOOKS: process.env.TWILIO_VALIDATE_WEBHOOKS,
    SMS_ALLOWED_COUNTRY_CODES: process.env.SMS_ALLOWED_COUNTRY_CODES
  };
  const originalFetch = global.fetch;

  process.env.LOCAL_DB_PATH = dbPath;
  process.env.TWILIO_ACCOUNT_SID = "AC123456789";
  process.env.TWILIO_AUTH_TOKEN = "test-token";
  process.env.TWILIO_FROM_NUMBER = "+15551230000";
  process.env.TWILIO_VERIFY_SERVICE_SID = "VA1234567890abcdef";
  process.env.TWILIO_SMS_STATUS_CALLBACK_URL = "https://example.test/api/notifications/sms/status";
  process.env.TWILIO_VALIDATE_WEBHOOKS = "false";
  process.env.SMS_ALLOWED_COUNTRY_CODES = "+1,+234";
  handler._test.resetContractCache();

  global.fetch = async (url, init) => {
    const form = new URLSearchParams(String(init.body));
    if (url === "https://verify.twilio.com/v2/Services/VA1234567890abcdef/Verifications") {
      assert.strictEqual(form.get("To"), "+15558675310");
      assert.strictEqual(form.get("Channel"), "sms");
      return {
        ok: true,
        status: 201,
        async json() {
          return {
            sid: "VE1234567890abcdef",
            service_sid: "VA1234567890abcdef",
            status: "pending",
            to: form.get("To"),
            channel: form.get("Channel"),
            valid: false,
            send_code_attempts: [{
              attempt_sid: "VL1234567890abcdef",
              channel: "sms",
              time: "2026-05-18T09:18:12.700Z"
            }]
          };
        }
      };
    }
    if (url === "https://verify.twilio.com/v2/Services/VA1234567890abcdef/VerificationCheck") {
      assert.strictEqual(form.get("To"), "+15558675310");
      assert.strictEqual(form.get("Code"), "123456");
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            sid: "VE1234567890abcdef",
            service_sid: "VA1234567890abcdef",
            status: "approved",
            to: form.get("To"),
            channel: "sms",
            valid: true
          };
        }
      };
    }
    assert.strictEqual(url, "https://api.twilio.com/2010-04-01/Accounts/AC123456789/Messages.json");
    assert.strictEqual(form.get("To"), "+15558675310");
    assert.strictEqual(form.get("From"), "+15551230000");
    assert.strictEqual(form.get("StatusCallback"), "https://example.test/api/notifications/sms/status");
    return {
      ok: true,
      status: 201,
      async json() {
        return {
          sid: "SM1234567890abcdef",
          status: "queued",
          to: form.get("To"),
          from: form.get("From"),
          account_sid: "AC123456789",
          direction: "outbound-api"
        };
      }
    };
  };

  const server = await createProxyServer();
  const port = server.address().port;

  try {
    const sent = await post(port, "/api/notifications/sms/send", {
      to: "+15558675310",
      body: "Your token purchase has been confirmed.",
      reference: "receipt-123"
    });
    assert.strictEqual(sent.status, 200);
    assert.strictEqual(sent.body.data.messageSid, "SM1234567890abcdef");
    assert.strictEqual(sent.body.data.trackingConfigured, true);

    const callback = await post(port, "/api/notifications/sms/status", {
      MessageSid: "SM1234567890abcdef",
      MessageStatus: "delivered",
      To: "+15558675310",
      From: "+15551230000"
    }, "application/x-www-form-urlencoded");
    assert.strictEqual(callback.status, 200);
    assert.strictEqual(callback.body.data.status, "delivered");

    const verification = await post(port, "/api/notifications/verify/send", {
      to: "+15558675310",
      channel: "sms",
      reference: "login-otp-123"
    });
    assert.strictEqual(verification.status, 200);
    assert.strictEqual(verification.body.data.verificationSid, "VE1234567890abcdef");
    assert.strictEqual(verification.body.data.status, "pending");
    assert.strictEqual(verification.body.data.sendCodeAttempts[0].attemptSid, "VL1234567890abcdef");

    const checked = await post(port, "/api/notifications/verify/check", {
      to: "+15558675310",
      code: "123456"
    });
    assert.strictEqual(checked.status, 200);
    assert.strictEqual(checked.body.data.status, "approved");
    assert.strictEqual(checked.body.data.valid, true);

    const list = await post(port, "/api/notifications/sms/list", { limit: 10 });
    assert.strictEqual(list.status, 200);
    assert(list.body.data.rows.some((row) => row.messageSid === "SM1234567890abcdef" && row.status === "delivered"));
    assert(list.body.data.rows.some((row) => row.messageSid === "VE1234567890abcdef" && row.status === "approved"));

    console.log(JSON.stringify({
      status: "sms notification api passed",
      messageSid: "SM1234567890abcdef",
      verificationSid: "VE1234567890abcdef",
      deliveryStatus: "delivered",
      verificationStatus: "approved"
    }, null, 2));
  } finally {
    await closeServer(server);
    global.fetch = originalFetch;
    handler._test.resetContractCache();
    localDatabase.resetForTests();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
