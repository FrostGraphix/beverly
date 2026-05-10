"use strict";

const fs = require("fs");
const path = require("path");
const { loadEnvFile } = require("./env-loader.cjs");

loadEnvFile();

const root = path.resolve(__dirname, "..");
const contractPath = path.join(root, "contracts", "reference-contract.generated.json");
const samplesDir = path.join(root, "contracts", "samples");
const baseUrl = process.env.UPSTREAM_API_URL || process.env.LIVE_API_BASE_URL || "http://8.208.16.168:9310";
const bearerToken = process.env.UPSTREAM_BEARER_TOKEN || process.env.LIVE_API_BEARER_TOKEN || "";
const allowWrites = process.env.ALLOW_LIVE_WRITES === "true";

const defaultQueries = {
  "/api/dashboard": "",
  "/api/dashboard/hourly": "",
  "/api/dashboard/gprs": "",
  "/api/dashboard/events": "",
  "/api/dashboard/risk-overlay": "",
  "/api/dashboard/revenue-vs-usage": "",
  "/api/dashboard/portfolio-health": "",
  "/api/token/creditTokenRecord/readMore": "FROM=2026-01-01T00:00:00.000Z&TO=2026-01-17T00:00:00.000Z&SITE_ID=KYAKALE",
  "/api/DailyDataMeter/readHourly": "offset=0&pageLimit=100&FROM=2026-01-10T00:00:00.000Z&TO=2026-01-17T00:00:00.000Z&SITE_ID=KYAKALE"
};

const readBody = {
  pageNumber: 1,
  pageSize: 20
};

const defaultBodies = {
  "/api/dashboard/readPanelGroup": {},
  "/api/dashboard/readLineChart": {
    type: 3
  },
  "/api/account/read": readBody,
  "/api/station/read": readBody,
  "/api/tariff/read": readBody,
  "/api/customer/read": readBody,
  "/api/gateway/read": readBody,
  "/api/user/read": readBody,
  "/api/role/read": readBody,
  "/api/Log/read": readBody,
  "/api/item/read": readBody,
  "/api/meter/read": readBody,
  "/api/debt/read": readBody,
  "/api/dlms/Read": readBody,
  "/api/dlt645/read": readBody,
  "/api/token/clearTamperTokenRecord/read": readBody,
  "/api/token/clearCreditTokenRecord/read": readBody,
  "/api/token/setMaximumPowerLimitTokenRecord/read": readBody,
  "/API/GPRSMeterTask/GPRSGetReadingTask": {
    lang: "en",
    pageNumber: 1,
    pageSize: 20
  },
  "/API/GPRSOnlineStatus/Read": readBody,
  "/API/LoadProfile/ElectricEnergyCurve": {
    lang: "en",
    pageNumber: 1,
    pageSize: 20
  },
  "/API/EventNotification/Read": {
    lang: "en",
    stationId: "KYAKALE",
    currentDateRange: ["2026-01-01T00:00:00.000Z", "2026-05-09T23:59:59.999Z"],
    pageNumber: 1,
    pageSize: 20
  },
  "/API/UpdateFirmwareTask/GetUpdateFirmwareTask": readBody,
  "/API/PrepayReport/LongNonpurchaseSituation": {
    lang: "en",
    pageNumber: 1,
    pageSize: 20
  },
  "/API/PrepayReport/LowPurchaseSituation": {
    lang: "en",
    stationId: "KYAKALE",
    dateRange: ["2026-01-01T00:00:00.000Z", "2026-01-17T00:00:00.000Z"],
    pageNumber: 1,
    pageSize: 20
  },
  "/API/PrepayReport/ConsumptionStatistics": {
    lang: "en",
    stationId: "KYAKALE",
    dateRange: ["2026-01-01T00:00:00.000Z", "2026-01-17T00:00:00.000Z"],
    isDaily: true,
    pageNumber: 1,
    pageSize: 20
  },
  "/API/RemoteMeterTask/GetReadingTask": {
    lang: "en",
    stationId: "KYAKALE",
    pageNumber: 1,
    pageSize: 20
  },
  "/API/RemoteMeterTask/GetSettingTask": {
    lang: "en",
    stationId: "KYAKALE",
    pageNumber: 1,
    pageSize: 20
  },
  "/API/RemoteMeterTask/GetControlTask": {
    lang: "en",
    stationId: "KYAKALE",
    pageNumber: 1,
    pageSize: 20
  },
  "/API/RemoteMeterTask/GetTokenTask": {
    lang: "en",
    stationId: "KYAKALE",
    pageNumber: 1,
    pageSize: 20
  },
  "/API/RemoteMeterTask/GetTransparentForwardingTask": {
    lang: "en",
    stationId: "KYAKALE",
    pageNumber: 1,
    pageSize: 20
  }
};

function businessFailed(body) {
  const code = Number(body?.code);
  return Number.isFinite(code) && code !== 0 && code !== 200 && (body.result === null || body.data === null);
}

function consumptionRowsFromReadings(readings) {
  const totals = new Map();
  for (const reading of readings || []) {
    const date = String(reading.timestamp || reading.collectionDate || "").slice(0, 10);
    if (!date) continue;
    const value = Number(reading.energyConsumptionKwh ?? reading.consumption ?? reading.totalEnergy ?? 0);
    totals.set(date, (totals.get(date) || 0) + (Number.isFinite(value) ? value : 0));
  }
  return Array.from(totals.entries())
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([collectionDate, consumption]) => ({ collectionDate, consumption: Number(consumption.toFixed(3)) }));
}

function sampleName(endpointPath) {
  return endpointPath.replace(/^\/+/, "").replace(/[/?&=:]+/g, "__").replace(/[^a-zA-Z0-9_.-]/g, "_");
}

async function callEndpoint(endpoint) {
  const method = endpoint.method === "GET" || endpoint.method === "GET_OR_POST" || defaultQueries[endpoint.path] ? "GET" : "POST";
  const query = defaultQueries[endpoint.path] ? `?${defaultQueries[endpoint.path]}` : "";
  const response = await fetch(`${baseUrl}${endpoint.path}${query}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: bearerToken ? `Bearer ${bearerToken}` : ""
    },
    body: method === "GET" ? undefined : JSON.stringify(defaultBodies[endpoint.path] || {})
  });
  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return {
    status: response.status,
    ok: response.ok,
    endpoint: endpoint.path,
    method,
    capturedAt: new Date().toISOString(),
    body
  };
}

async function callConsumptionFallback(result) {
  if (result.endpoint !== "/API/PrepayReport/ConsumptionStatistics" || !businessFailed(result.body)) return result;
  const response = await fetch(`${baseUrl}/api/DailyDataMeter/readHourly?${defaultQueries["/api/DailyDataMeter/readHourly"]}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: bearerToken ? `Bearer ${bearerToken}` : ""
    }
  });
  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  const rows = consumptionRowsFromReadings(body.readings || body.data?.readings || body.result?.readings || []);
  return {
    ...result,
    status: response.status,
    ok: response.ok,
    derivedFrom: "/api/DailyDataMeter/readHourly",
    upstreamFailure: result.body,
    body: {
      code: 0,
      reason: "success",
      msg: "success",
      result: {
        total: rows.length,
        data: rows
      },
      data: {
        total: rows.length,
        data: rows
      }
    }
  };
}

async function main() {
  if (!bearerToken) {
    console.error("Set UPSTREAM_BEARER_TOKEN first.");
    process.exit(1);
  }
  fs.mkdirSync(samplesDir, { recursive: true });
  const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  const requested = process.argv.slice(2);
  const targets = contract.endpoints.filter((endpoint) => {
    if (requested.length) return requested.includes(endpoint.path);
    if (endpoint.liveWrite && !allowWrites) return false;
    return endpoint.observed || endpoint.visibleRoute || defaultQueries[endpoint.path];
  });
  const results = [];
  for (const endpoint of targets) {
    const result = await callConsumptionFallback(await callEndpoint(endpoint));
    const filePath = path.join(samplesDir, `${sampleName(endpoint.path)}.json`);
    fs.writeFileSync(filePath, `${JSON.stringify(result, null, 2)}\n`);
    results.push({ endpoint: endpoint.path, status: result.status, filePath });
  }
  console.log(JSON.stringify({ captured: results.length, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
