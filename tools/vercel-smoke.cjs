"use strict";

const targetUrl = String(
  process.env.TARGET_URL ||
  process.env.PREVIEW_TARGET_URL ||
  process.env.PRODUCTION_TARGET_URL ||
  process.argv[2] ||
  ""
).replace(/\/+$/, "");
const protectionBypass = String(
  process.env.VERCEL_PROTECTION_BYPASS ||
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET ||
  ""
).trim();
let smokeToken = String(process.env.SMOKE_AUTH_TOKEN || process.env.LIVE_API_BEARER_TOKEN || "").trim();

function automationHookUrl() {
  const explicit = String(process.env.AUTOMATION_HOOK_URL || "").trim();
  if (explicit) return explicit;
  if (!protectionBypass) return "";
  return targetUrl ? `${targetUrl}/api/system/automation-hooks/test` : "";
}

async function postJson(url, body) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  if (protectionBypass) headers["x-vercel-protection-bypass"] = protectionBypass;
  if (smokeToken) headers.Authorization = smokeToken.startsWith("Bearer ") ? smokeToken : `Bearer ${smokeToken}`;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Expected JSON from ${url}, got ${response.status} ${response.headers.get("content-type") || "unknown"}: ${text.slice(0, 120)}`);
  }
  return {
    status: response.status,
    body: parsed
  };
}

async function getJson(url) {
  const headers = { Accept: "application/json" };
  if (protectionBypass) headers["x-vercel-protection-bypass"] = protectionBypass;
  if (smokeToken) headers.Authorization = smokeToken.startsWith("Bearer ") ? smokeToken : `Bearer ${smokeToken}`;
  const response = await fetch(url, { headers });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Expected JSON from ${url}, got ${response.status} ${response.headers.get("content-type") || "unknown"}: ${text.slice(0, 120)}`);
  }
  return {
    status: response.status,
    body: parsed
  };
}

async function authenticateSmoke() {
  if (smokeToken) return;
  const userId = String(process.env.SMOKE_USER_ID || "").trim();
  const password = String(process.env.SMOKE_PASSWORD || "").trim();
  if (!userId || !password) return;

  const response = await postJson(`${targetUrl}/api/user/login`, {
    userId,
    password,
    verifycode: String(process.env.SMOKE_VERIFY_CODE || "s3b9")
  });
  const token = response.body?.data?.token || response.body?.result?.token;
  if (response.status !== 200 || !token) {
    throw new Error(`smoke login failed with ${response.status}: ${response.body?.msg || response.body?.reason || "missing token"}`);
  }
  smokeToken = String(token);
}

async function main() {
  if (!targetUrl) {
    throw new Error("TARGET_URL is required");
  }

  await authenticateSmoke();

  const health = await getJson(`${targetUrl}/api/system/health`);
  const dashboard = await postJson(`${targetUrl}/api/dashboard/readPanelGroup`, {});
  const chart = await postJson(`${targetUrl}/api/dashboard/readLineChart`, { type: 3 });
  const accountRead = await postJson(`${targetUrl}/api/account/read`, { pageNumber: 1, pageSize: 20 });
  const stationRead = await postJson(`${targetUrl}/api/station/read`, { pageNumber: 1, pageSize: 20 });
  const tariffRead = await postJson(`${targetUrl}/api/tariff/read`, { pageNumber: 1, pageSize: 20 });
  const customerRead = await postJson(`${targetUrl}/api/customer/read`, { pageNumber: 1, pageSize: 20 });
  const gatewayRead = await postJson(`${targetUrl}/api/gateway/read`, { pageNumber: 1, pageSize: 20 });
  const blockedWrite = await postJson(`${targetUrl}/api/account/create`, [{ customerId: "phase12-smoke" }]);

  if (health.status !== 200 || !health.body?.data?.ok) throw new Error("health failed");
  if (dashboard.status === 401) throw new Error("dashboard read unauthorized; set SMOKE_AUTH_TOKEN or SMOKE_USER_ID/SMOKE_PASSWORD");
  if (dashboard.status !== 200 || !dashboard.body?.data) throw new Error("dashboard read failed");
  if (chart.status !== 200 || !chart.body?.data) throw new Error("chart read failed");
  if (accountRead.status !== 200 || !accountRead.body?.data) throw new Error("account read failed");
  if (stationRead.status !== 200 || !stationRead.body?.data) throw new Error("station read failed");
  if (tariffRead.status !== 200 || !tariffRead.body?.data) throw new Error("tariff read failed");
  if (customerRead.status !== 200 || !customerRead.body?.data) throw new Error("customer read failed");
  if (gatewayRead.status !== 200 || !gatewayRead.body?.data) throw new Error("gateway read failed");
  if (![200, 403].includes(blockedWrite.status)) throw new Error("write check failed");

  console.log(JSON.stringify({
    targetUrl,
    protectionBypassEnabled: Boolean(protectionBypass),
    authEnabled: Boolean(smokeToken),
    healthStatus: health.status,
    readMode: health.body.data.readMode,
    liveProxyEnabled: health.body.data.liveProxyEnabled,
    allowLiveWrites: health.body.data.allowLiveWrites,
    dashboardStatus: dashboard.status,
    chartStatus: chart.status,
    accountReadStatus: accountRead.status,
    stationReadStatus: stationRead.status,
    tariffReadStatus: tariffRead.status,
    customerReadStatus: customerRead.status,
    gatewayReadStatus: gatewayRead.status,
    writeStatus: blockedWrite.status,
    writeGuarded: blockedWrite.status === 403,
    status: "vercel smoke passed"
  }, null, 2));
}

async function reportSmokeFailure(error) {
  const hookUrl = automationHookUrl();
  if (!hookUrl) return;
  try {
    await postJson(hookUrl, {
      kind: "smoke-failure",
      severity: "error",
      title: "Smoke monitor failure",
      message: error instanceof Error ? error.message : String(error),
      details: {
        targetUrl
      }
    });
  } catch (hookError) {
    console.error("[smoke-failure-hook]", hookError instanceof Error ? hookError.message : String(hookError));
  }
}

main().catch((error) => {
  reportSmokeFailure(error).finally(() => {
    console.error(error);
    process.exit(1);
  });
});
