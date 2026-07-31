"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { loadEnvFile } = require("./env-loader.cjs");

loadEnvFile();

const UPSTREAM_URL = process.env.UPSTREAM_API_URL || "http://8.208.16.168:9310";
const BEARER_TOKEN = process.env.UPSTREAM_BEARER_TOKEN || process.env.LIVE_API_BEARER_TOKEN || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://qpoipyqgrjsjdvfqmxok.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function request(urlStr, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === "https:" ? https : http;
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...(options.headers || {})
      },
      timeout: 15000
    };

    const req = lib.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    req.on("error", (e) => resolve({ status: 500, error: e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ status: 504, error: "timeout" }); });

    if (body) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  console.log("=== STARTING LIVE API AUDIT ===\n");
  const report = {};

  // 1. Audit OEM Upstream Stations Endpoint
  console.log("Auditing OEM Station API (/api/station/read)...");
  const stationsRes = await request(`${UPSTREAM_URL}/api/station/read`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${BEARER_TOKEN}` }
  }, { pageNumber: 1, pageSize: 50 });

  report.oem_stations = {
    status: stationsRes.status,
    data: stationsRes.body?.data || stationsRes.body?.result || stationsRes.body
  };

  // 2. Audit OEM Meter API (/api/meter/read)
  console.log("Auditing OEM Meter API (/api/meter/read)...");
  const metersRes = await request(`${UPSTREAM_URL}/api/meter/read`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${BEARER_TOKEN}` }
  }, { pageNumber: 1, pageSize: 10 });

  report.oem_meters_sample = {
    status: metersRes.status,
    total: metersRes.body?.data?.total || metersRes.body?.result?.total,
    first_row_keys: metersRes.body?.data?.data?.[0] ? Object.keys(metersRes.body.data.data[0]) : null,
    first_row_sample: metersRes.body?.data?.data?.[0] || null
  };

  // 3. Audit OEM Customer API (/api/customer/read)
  console.log("Auditing OEM Customer API (/api/customer/read)...");
  const customersRes = await request(`${UPSTREAM_URL}/api/customer/read`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${BEARER_TOKEN}` }
  }, { pageNumber: 1, pageSize: 10 });

  report.oem_customers_sample = {
    status: customersRes.status,
    total: customersRes.body?.data?.total || customersRes.body?.result?.total,
    first_row_keys: customersRes.body?.data?.data?.[0] ? Object.keys(customersRes.body.data.data[0]) : null,
    first_row_sample: customersRes.body?.data?.data?.[0] || null
  };

  // 4. Audit OEM DailyDataMeter/read
  console.log("Auditing OEM DailyDataMeter API (/api/DailyDataMeter/read)...");
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0, 10);
  const dmrRes = await request(`${UPSTREAM_URL}/api/DailyDataMeter/read`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${BEARER_TOKEN}` }
  }, { lang: "en", pageNumber: 1, pageSize: 5, SITE_ID: "TUNGA", FROM: monthAgo, TO: today });

  const dmrSampleRow = dmrRes.body?.data?.data?.[0] || dmrRes.body?.result?.data?.[0] || null;

  report.oem_daily_data_meter = {
    status: dmrRes.status,
    total: dmrRes.body?.data?.total || dmrRes.body?.result?.total,
    field_count: dmrSampleRow ? Object.keys(dmrSampleRow).length : 0,
    fields_list: dmrSampleRow ? Object.keys(dmrSampleRow).sort() : [],
    sample_row: dmrSampleRow
  };

  // 5. Audit OEM Credit Token Record (Shape A vs Shape B)
  console.log("Auditing OEM Token Record APIs...");
  const tokenReadRes = await request(`${UPSTREAM_URL}/api/token/creditTokenRecord/read`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${BEARER_TOKEN}` }
  }, { pageNumber: 1, pageSize: 5 });

  const tokenReadMoreRes = await request(`${UPSTREAM_URL}/api/token/creditTokenRecord/readMore`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${BEARER_TOKEN}` }
  }, { pageNumber: 1, pageSize: 5 });

  report.oem_token_read_shape_b = {
    status: tokenReadRes.status,
    total: tokenReadRes.body?.data?.total,
    sample_item_keys: tokenReadRes.body?.data?.data?.[0] ? Object.keys(tokenReadRes.body.data.data[0]).sort() : null,
    sample_item: tokenReadRes.body?.data?.data?.[0] || null
  };

  report.oem_token_readmore_shape_a = {
    status: tokenReadMoreRes.status,
    payments_count: Array.isArray(tokenReadMoreRes.body?.payments) ? tokenReadMoreRes.body.payments.length : 0,
    sample_item_keys: tokenReadMoreRes.body?.payments?.[0] ? Object.keys(tokenReadMoreRes.body.payments[0]).sort() : null,
    sample_item: tokenReadMoreRes.body?.payments?.[0] || null
  };

  // 6. Audit Supabase PostgREST API endpoints directly
  console.log("Auditing Supabase PostgREST API endpoints...");

  const spMetersCount = await request(`${SUPABASE_URL}/rest/v1/meters?select=count`, {
    headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Prefer": "count=exact" }
  });

  const spRPCStationIds = await request(`${SUPABASE_URL}/rest/v1/rpc/list_consumption_station_ids`, {
    method: "POST",
    headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` }
  }, {});

  report.supabase_api_verification = {
    meters_count_header: spMetersCount.headers?.["content-range"] || spMetersCount.body,
    rpc_list_station_ids_status: spRPCStationIds.status,
    rpc_list_station_ids_result: spRPCStationIds.body
  };

  const outPath = path.join(__dirname, "..", "tmp", "live-api-audit-report.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n=== LIVE API AUDIT COMPLETED. Results written to ${outPath} ===`);
}

run().catch((e) => {
  console.error("FATAL ERROR IN LIVE API AUDIT:", e);
  process.exit(1);
});
