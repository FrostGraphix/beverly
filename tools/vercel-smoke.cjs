"use strict";

const targetUrl = String(process.env.TARGET_URL || process.argv[2] || "").replace(/\/+$/, "");

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body)
  });
  return {
    status: response.status,
    body: await response.json()
  };
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });
  return {
    status: response.status,
    body: await response.json()
  };
}

async function main() {
  if (!targetUrl) {
    throw new Error("TARGET_URL is required");
  }

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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
