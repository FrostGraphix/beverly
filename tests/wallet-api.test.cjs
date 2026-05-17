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

function request(port, urlPath, payload) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload || {}));
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
  const dbPath = path.join(__dirname, "..", "tmp", `wallet-api-${process.pid}.sqlite`);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const previousPath = process.env.LOCAL_DB_PATH;
  process.env.LOCAL_DB_PATH = dbPath;
  handler._test.resetContractCache();
  const server = await createProxyServer();
  const port = server.address().port;

  try {
    const vendor = await request(port, "/api/vendor/organization/create", {
      organizationName: "Beverly Vendor API",
      stationIds: ["UMAISHA"],
      actorId: "admin"
    });
    assert.strictEqual(vendor.status, 200);
    assert.strictEqual(vendor.body.data.status, "pending_review");

    const approval = await request(port, "/api/vendor/organization/approve", {
      organizationId: vendor.body.data.id,
      actorId: "finance"
    });
    assert.strictEqual(approval.status, 200);
    assert.strictEqual(approval.body.data.wallet.status, "active");

    const funding = await request(port, "/api/wallet/funding/create", {
      organizationId: vendor.body.data.id,
      amountMinor: 100000,
      idempotencyKey: "api-funding-1",
      actorId: "vendor-user"
    });
    assert.strictEqual(funding.status, 200);
    assert.strictEqual(funding.body.data.status, "initiated");

    const proof = await request(port, "/api/wallet/funding/upload-proof", {
      fundingRequestId: funding.body.data.id,
      storagePath: "proofs/api.png",
      fileName: "api.png",
      contentType: "image/png",
      actorId: "vendor-user"
    });
    assert.strictEqual(proof.status, 200);
    assert.strictEqual(proof.body.data.status, "proof_uploaded");

    const credited = await request(port, "/api/wallet/funding/approve", {
      fundingRequestId: funding.body.data.id,
      verifiedAmountMinor: 100000,
      actorId: "finance-checker"
    });
    assert.strictEqual(credited.status, 200);
    assert.strictEqual(credited.body.data.walletSummary.availableBalanceMinor, 100000);

    const order = await request(port, "/api/wallet/purchase/create", {
      organizationId: vendor.body.data.id,
      mode: "token",
      targetMeter: "MTR-200",
      amountMinor: 25000,
      idempotencyKey: "api-purchase-1",
      actorId: "vendor-user"
    });
    assert.strictEqual(order.status, 200);
    assert.strictEqual(order.body.data.status, "hold_active");

    const delivered = await request(port, "/api/wallet/purchase/complete-token", {
      purchaseOrderId: order.body.data.id,
      actorId: "vendor-user"
    });
    assert.strictEqual(delivered.status, 200);
    assert.strictEqual(delivered.body.data.order.status, "delivered");
    assert.strictEqual(delivered.body.data.walletSummary.availableBalanceMinor, 75000);

    const manual = await request(port, "/api/wallet/manual-credit/request", {
      organizationId: vendor.body.data.id,
      amountMinor: 15000,
      reasonCode: "support_remediation",
      actorId: "ops-maker"
    });
    assert.strictEqual(manual.status, 200);
    assert.strictEqual(manual.body.data.status, "pending");

    const manualApproved = await request(port, "/api/wallet/manual-credit/approve", {
      approvalRequestId: manual.body.data.id,
      actorId: "finance-checker"
    });
    assert.strictEqual(manualApproved.status, 200);
    assert.strictEqual(manualApproved.body.data.walletSummary.availableBalanceMinor, 90000);

    const remote = await request(port, "/api/wallet/purchase/create", {
      organizationId: vendor.body.data.id,
      mode: "remote_send",
      targetMeter: "MTR-REMOTE",
      amountMinor: 10000,
      idempotencyKey: "api-remote-1",
      actorId: "vendor-user"
    });
    assert.strictEqual(remote.status, 200);

    const remotePending = await request(port, "/api/wallet/purchase/remote-pending", {
      purchaseOrderId: remote.body.data.id,
      remoteReference: "REMOTE-PENDING",
      actorId: "vendor-user"
    });
    assert.strictEqual(remotePending.body.data.order.status, "delivery_pending_review");

    const remoteDone = await request(port, "/api/wallet/purchase/complete-remote", {
      purchaseOrderId: remote.body.data.id,
      remoteReference: "REMOTE-DONE",
      actorId: "vendor-user"
    });
    assert.strictEqual(remoteDone.body.data.order.status, "delivered");

    const report = await request(port, "/api/wallet/reconciliation/report", {});
    assert.strictEqual(report.status, 200);
    assert(report.body.data.deliveredPurchaseMinor >= 35000);

    const recon = await request(port, "/api/wallet/reconciliation/run", {});
    assert.strictEqual(recon.body.data.status, "balanced");

    console.log(JSON.stringify({
      status: "wallet api passed",
      receiptNumber: delivered.body.data.order.receiptNumber,
      availableBalanceMinor: remoteDone.body.data.walletSummary.availableBalanceMinor
    }, null, 2));
  } finally {
    await closeServer(server);
    handler._test.resetContractCache();
    localDatabase.resetForTests();
    if (previousPath === undefined) delete process.env.LOCAL_DB_PATH;
    else process.env.LOCAL_DB_PATH = previousPath;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
