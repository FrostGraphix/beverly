"use strict";

const crypto = require("crypto");
const localDatabase = require("./local-database");

const twilioApiBase = "https://api.twilio.com/2010-04-01";
const twilioVerifyBase = "https://verify.twilio.com/v2";
const e164Pattern = /^\+[1-9]\d{7,14}$/;
const trackedStatuses = new Set(["queued", "accepted", "scheduled", "sending", "sent", "delivered", "undelivered", "failed", "canceled", "read"]);
const verifyChannels = new Set(["sms", "call", "email", "whatsapp", "rcs", "sna"]);
const smsTrafficMemory = new Map();

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function normalizeBody(value) {
  const body = String(value || "").trim();
  if (!body) throw new Error("SMS body is required");
  if (body.length > 1600) throw new Error("SMS body must be 1600 characters or fewer");
  return body;
}

function normalizePhone(value, fieldName) {
  const phone = String(value || "").trim();
  if (!e164Pattern.test(phone)) throw new Error(`${fieldName} must be an E.164 phone number, for example +15558675310`);
  return phone;
}

function splitCountryCodes(value, fallback = "") {
  return String(value || fallback)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.startsWith("+") ? entry : `+${entry.replace(/\D/g, "")}`);
}

function smsCountryCode(phone) {
  const known = Array.from(new Set([
    ...splitCountryCodes(process.env.SMS_ALLOWED_COUNTRY_CODES, "+234"),
    ...splitCountryCodes(process.env.SMS_BLOCKED_COUNTRY_CODES),
    ...splitCountryCodes(process.env.SMS_HIGH_RISK_COUNTRY_CODES, "+234"),
    "+234"
  ])).sort((a, b) => b.length - a.length);
  return known.find((code) => phone.startsWith(code)) || `+${phone.slice(1, 4)}`;
}

function assertSmsDestinationAllowed(phone, purpose = "notification") {
  const countryCode = smsCountryCode(phone);
  const allowed = splitCountryCodes(process.env.SMS_ALLOWED_COUNTRY_CODES, "+234");
  const blocked = splitCountryCodes(process.env.SMS_BLOCKED_COUNTRY_CODES);
  if (blocked.includes(countryCode)) {
    const error = new Error("SMS is not available for this destination");
    error.status = 403;
    error.code = "sms_country_blocked";
    throw error;
  }
  if (allowed.length && !allowed.includes(countryCode)) {
    const error = new Error("SMS is only available for approved destinations");
    error.status = 403;
    error.code = "sms_country_not_allowed";
    throw error;
  }
  return {
    countryCode,
    highRisk: splitCountryCodes(process.env.SMS_HIGH_RISK_COUNTRY_CODES, "+234").includes(countryCode),
    purpose
  };
}

function assertSmsTrafficLimit(phone, purpose) {
  const windowSeconds = Number(process.env.SMS_OTP_RATE_LIMIT_WINDOW_SECONDS || 900);
  const max = Number(process.env.SMS_OTP_RATE_LIMIT_MAX || 2);
  const key = `${purpose}:${phone}`;
  const cutoff = Date.now() - windowSeconds * 1000;
  const recent = (smsTrafficMemory.get(key) || []).filter((ts) => ts > cutoff);
  if (recent.length >= max) {
    smsTrafficMemory.set(key, recent);
    const error = new Error("Too many SMS requests. Try again later");
    error.status = 429;
    error.code = "sms_rate_limited";
    throw error;
  }
  recent.push(Date.now());
  smsTrafficMemory.set(key, recent);
}

function callbackUrlFromPayload(payload = {}) {
  const explicit = String(payload.statusCallbackUrl || process.env.TWILIO_SMS_STATUS_CALLBACK_URL || "").trim();
  if (explicit) return explicit;
  const baseUrl = String(process.env.PUBLIC_BASE_URL || process.env.TARGET_URL || process.env.PRODUCTION_TARGET_URL || "").trim().replace(/\/+$/, "");
  return baseUrl ? `${baseUrl}/api/notifications/sms/status` : "";
}

function twilioAuthHeader(accountSid, authToken) {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

function sanitizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/token|secret|password|authorization/i.test(key))
      .map(([key, entry]) => [key, entry])
  );
}

function twilioFormPayload(fields) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && String(value) !== "") form.set(key, String(value));
  }
  return form;
}

async function sendSmsNotification(payload = {}) {
  const accountSid = requiredEnv("TWILIO_ACCOUNT_SID");
  const authToken = requiredEnv("TWILIO_AUTH_TOKEN");
  const messagingServiceSid = String(payload.messagingServiceSid || process.env.TWILIO_MESSAGING_SERVICE_SID || "").trim();
  const from = messagingServiceSid ? "" : normalizePhone(payload.from || process.env.TWILIO_FROM_NUMBER, "from");
  const to = normalizePhone(payload.to, "to");
  const guard = assertSmsDestinationAllowed(to, "notification");
  assertSmsTrafficLimit(to, "notification");
  const body = normalizeBody(payload.body);
  const callbackUrl = callbackUrlFromPayload(payload);
  const reference = String(payload.reference || payload.idempotencyKey || crypto.randomUUID()).trim();

  const form = twilioFormPayload({
    To: to,
    Body: body,
    From: from,
    MessagingServiceSid: messagingServiceSid,
    StatusCallback: callbackUrl
  });

  const response = await fetch(`${twilioApiBase}/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: twilioAuthHeader(accountSid, authToken),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result.message || result.error_message || `Twilio request failed with HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.details = result;
    throw error;
  }

  const notification = localDatabase.recordSmsNotification({
    messageSid: result.sid,
    to,
    from: result.from || from || messagingServiceSid,
    body,
    status: result.status || "queued",
    errorCode: result.error_code || "",
    errorMessage: result.error_message || "",
    reference,
    callbackUrl,
    details: {
      provider: "twilio",
      messagingServiceSid,
      metadata: sanitizeMetadata(payload.metadata),
      smsGuardrails: guard,
      trackingConfigured: Boolean(callbackUrl),
      twilio: {
        accountSid: result.account_sid,
        dateCreated: result.date_created,
        dateUpdated: result.date_updated,
        direction: result.direction,
        price: result.price,
        priceUnit: result.price_unit
      }
    }
  });

  return {
    messageSid: notification.messageSid,
    status: notification.status,
    to: notification.to,
    from: notification.from,
    reference: notification.reference,
    callbackUrl: notification.callbackUrl,
    trackingConfigured: Boolean(notification.callbackUrl)
  };
}

function verifyServiceSid() {
  return requiredEnv("TWILIO_VERIFY_SERVICE_SID");
}

function normalizeVerifyChannel(value) {
  const channel = String(value || "sms").trim().toLowerCase();
  if (!verifyChannels.has(channel)) throw new Error("Verify channel must be one of sms, call, email, whatsapp, rcs, or sna");
  return channel;
}

function normalizeVerifyTarget(value, channel) {
  const to = String(value || "").trim();
  if (channel === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("to must be a valid email address for email verification");
    return to;
  }
  return normalizePhone(to, "to");
}

async function twilioVerifyRequest(pathname, fields) {
  const accountSid = requiredEnv("TWILIO_ACCOUNT_SID");
  const authToken = requiredEnv("TWILIO_AUTH_TOKEN");
  const response = await fetch(`${twilioVerifyBase}${pathname}`, {
    method: "POST",
    headers: {
      Authorization: twilioAuthHeader(accountSid, authToken),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: twilioFormPayload(fields)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result.message || result.error_message || `Twilio Verify request failed with HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.details = result;
    throw error;
  }
  return result;
}

function mapVerifyResult(result = {}, reference = "") {
  const attempts = Array.isArray(result.send_code_attempts) ? result.send_code_attempts : [];
  return {
    verificationSid: result.sid,
    serviceSid: result.service_sid,
    status: result.status,
    valid: Boolean(result.valid),
    to: result.to,
    channel: result.channel,
    reference,
    sendCodeAttempts: attempts.map((attempt) => ({
      attemptSid: attempt.attempt_sid,
      channel: attempt.channel,
      time: attempt.time
    }))
  };
}

async function sendVerification(payload = {}) {
  const channel = normalizeVerifyChannel(payload.channel);
  const to = normalizeVerifyTarget(payload.to, channel);
  const guard = channel === "email" ? { countryCode: "email", highRisk: false, purpose: "verify" } : assertSmsDestinationAllowed(to, "verify");
  if (channel !== "email") assertSmsTrafficLimit(to, "verify");
  const serviceSid = verifyServiceSid();
  const reference = String(payload.reference || payload.idempotencyKey || crypto.randomUUID()).trim();
  const result = await twilioVerifyRequest(`/Services/${encodeURIComponent(serviceSid)}/Verifications`, {
    To: to,
    Channel: channel,
    Locale: payload.locale,
    CustomFriendlyName: payload.customFriendlyName
  });
  const mapped = mapVerifyResult(result, reference);
  localDatabase.recordSmsNotification({
    messageSid: mapped.verificationSid,
    to: mapped.to,
    from: mapped.serviceSid,
    body: `Twilio Verify ${mapped.channel} challenge`,
    status: mapped.status,
    reference,
    details: {
      provider: "twilio-verify",
      serviceSid: mapped.serviceSid,
      channel: mapped.channel,
      smsGuardrails: guard,
      sendCodeAttempts: mapped.sendCodeAttempts
    }
  });
  return mapped;
}

async function checkVerification(payload = {}) {
  const serviceSid = verifyServiceSid();
  const to = normalizePhone(payload.to, "to");
  const code = String(payload.code || "").trim();
  if (!/^\d{4,10}$/.test(code)) throw new Error("code must be a 4 to 10 digit verification code");
  const result = await twilioVerifyRequest(`/Services/${encodeURIComponent(serviceSid)}/VerificationCheck`, {
    To: to,
    Code: code
  });
  const mapped = mapVerifyResult(result, String(payload.reference || ""));
  localDatabase.updateSmsNotificationStatus({
    messageSid: mapped.verificationSid,
    status: mapped.status,
    to: mapped.to,
    from: mapped.serviceSid,
    raw: {
      provider: "twilio-verify",
      valid: mapped.valid,
      channel: mapped.channel
    }
  });
  return mapped;
}

function verifyTwilioSignature({ authToken, url, params, signature }) {
  if (!authToken || !signature || !url) return false;
  const sortedKeys = Object.keys(params || {}).sort();
  const signedPayload = sortedKeys.reduce((text, key) => `${text}${key}${params[key]}`, url);
  const digest = crypto.createHmac("sha1", authToken).update(signedPayload).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

function publicWebhookUrl(request, pathname) {
  const configured = String(process.env.TWILIO_WEBHOOK_BASE_URL || process.env.PUBLIC_BASE_URL || process.env.TARGET_URL || "").trim().replace(/\/+$/, "");
  if (configured) return `${configured}${pathname}`;
  const proto = String(request.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(request.headers["x-forwarded-host"] || request.headers.host || "").split(",")[0].trim();
  return host ? `${proto}://${host}${pathname}` : "";
}

function shouldValidateWebhooks() {
  if (process.env.TWILIO_VALIDATE_WEBHOOKS === "false") return false;
  return process.env.NODE_ENV === "production" || process.env.TWILIO_VALIDATE_WEBHOOKS === "true";
}

function recordSmsStatusCallback({ request, pathname, payload }) {
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const signature = String(request.headers["x-twilio-signature"] || "");
  const validationRequired = shouldValidateWebhooks();
  const signatureValidated = verifyTwilioSignature({
    authToken,
    url: publicWebhookUrl(request, pathname),
    params: payload,
    signature
  });

  if (validationRequired && !signatureValidated) {
    const error = new Error("Invalid Twilio signature");
    error.status = 403;
    throw error;
  }

  const messageSid = String(payload.MessageSid || payload.SmsSid || "").trim();
  if (!messageSid) {
    const error = new Error("MessageSid is required");
    error.status = 400;
    throw error;
  }
  const status = String(payload.MessageStatus || payload.SmsStatus || "unknown").trim().toLowerCase();
  const normalizedStatus = trackedStatuses.has(status) ? status : "unknown";
  const notification = localDatabase.updateSmsNotificationStatus({
    messageSid,
    status: normalizedStatus,
    to: payload.To,
    from: payload.From,
    errorCode: payload.ErrorCode,
    errorMessage: payload.ErrorMessage,
    raw: {
      ...payload,
      Body: undefined
    }
  });

  return {
    accepted: true,
    messageSid: notification.messageSid,
    status: notification.status,
    errorCode: notification.errorCode,
    errorMessage: notification.errorMessage,
    signatureValidated,
    validationRequired
  };
}

function listSmsNotifications(options = {}) {
  return localDatabase.listSmsNotifications(options);
}

module.exports = {
  listSmsNotifications,
  recordSmsStatusCallback,
  checkVerification,
  sendVerification,
  sendSmsNotification,
  verifyTwilioSignature
};
