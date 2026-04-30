"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const matrixPath = path.join(root, "contracts", "live-route-matrix.json");
const samplesDir = path.join(root, "contracts", "samples");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sampleRows(body) {
  const result = body?.result || body?.data || body;
  if (Array.isArray(result?.records)) return result.records.length;
  if (Array.isArray(result?.data)) return result.data.length;
  if (Array.isArray(result?.list)) return result.list.length;
  if (Array.isArray(result?.readings)) return result.readings.length;
  if (Array.isArray(result?.events)) return result.events.length;
  if (Array.isArray(result?.points)) return result.points.length;
  if (Array.isArray(body?.payments)) return body.payments.length;
  if (Array.isArray(body?.readings)) return body.readings.length;
  return 0;
}

function main() {
  const matrix = readJson(matrixPath);
  const rows = matrix.routes.map((route) => {
    const samplePath = route.sample ? path.join(root, route.sample) : "";
    const sample = samplePath && fs.existsSync(samplePath) ? readJson(samplePath) : null;
    const body = sample?.body || {};
    const code = Number(body.code ?? 0);
    const businessOk = code === 0 || code === 200;
    return {
      hash: route.hash,
      endpoint: route.primaryEndpoint,
      source: route.source,
      sampleStatus: sample?.status || null,
      businessOk,
      rows: sampleRows(body)
    };
  });
  const failures = rows.filter((row) => row.source === "live-ready" && !row.businessOk);
  const blocked = rows.filter((row) => row.source === "blocked" || row.source === "guarded-write");
  const report = {
    generatedAt: new Date().toISOString(),
    routeCount: rows.length,
    liveReady: rows.filter((row) => row.source === "live-ready").length,
    liveDerived: rows.filter((row) => row.source === "live-derived").length,
    blocked: blocked.length,
    failures,
    blockedRoutes: blocked,
    rows
  };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exit(1);
}

main();
