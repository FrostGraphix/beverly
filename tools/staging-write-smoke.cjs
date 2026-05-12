"use strict";

const targetUrl = String(
  process.env.STAGING_TARGET_URL ||
  process.env.TARGET_URL ||
  process.env.PREVIEW_TARGET_URL ||
  ""
).replace(/\/+$/, "");
const approved = String(process.env.STAGING_WRITE_APPROVED || "false").toLowerCase() === "true";
const protectionBypass = String(
  process.env.VERCEL_PROTECTION_BYPASS ||
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET ||
  ""
).trim();

async function postJson(url, body) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  if (protectionBypass) headers["x-vercel-protection-bypass"] = protectionBypass;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch {
    bodyText = "";
  }
  let payload = null;
  try {
    payload = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    payload = { raw: bodyText.slice(0, 200) };
  }
  return { status: response.status, body: payload };
}

async function main() {
  if (!targetUrl) {
    console.log(JSON.stringify({
      skipped: true,
      reason: "STAGING_TARGET_URL or PREVIEW_TARGET_URL is required",
      status: "staging write smoke skipped"
    }, null, 2));
    return;
  }

  const health = await postJson(`${targetUrl}/api/account/create`, [{ customerId: "staging-write-smoke-blocked" }]);
  if (!approved) {
    if (health.status === 401 && !protectionBypass) {
      throw new Error("guarded staging write blocked by preview auth; set VERCEL_PROTECTION_BYPASS");
    }
    if (health.status !== 403) {
      throw new Error(`guarded staging write expected 403, got ${health.status}`);
    }
    console.log(JSON.stringify({
      targetUrl,
      approved,
      protectionBypassEnabled: Boolean(protectionBypass),
      writeStatus: health.status,
      status: "staging write guard passed"
    }, null, 2));
    return;
  }

  const payload = [{
    customerId: `staging-write-smoke-${Date.now()}`,
    customerName: "Staging Write Smoke",
    meterId: `SW${Date.now()}`,
    remark: "Automated staging write smoke. Delete after validation.",
    authorizationPassword: process.env.STAGING_WRITE_AUTHORIZATION_PASSWORD || ""
  }];
  const response = await postJson(`${targetUrl}/api/account/create`, payload);
  if (![200, 201].includes(response.status)) {
    throw new Error(`approved staging write failed with ${response.status}`);
  }
  console.log(JSON.stringify({
    targetUrl,
    approved,
    protectionBypassEnabled: Boolean(protectionBypass),
    writeStatus: response.status,
    status: "staging write smoke passed"
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
