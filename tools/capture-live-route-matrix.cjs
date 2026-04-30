"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const root = path.resolve(__dirname, "..");
const matrixPath = path.join(root, "contracts", "live-route-matrix.json");
const auditPath = path.join(root, "docs", "live-route-gap-audit.md");
const observationPath = path.join(root, "contracts", "live-observation-log.json");
const sampleDir = path.join(root, "contracts", "samples");

function tableDataPath(hash, apis) {
  if (hash === "#/dashboard") return "/api/dashboard";
  if (hash.includes("clear-credit-token-record")) return "/api/token/clearCreditTokenRecord/read";
  if (hash.includes("clear-tamper-token-record")) return "/api/token/clearTamperTokenRecord/read";
  if (hash.includes("set-maximum-power-limit-token-record")) return "/api/token/setMaximumPowerLimitTokenRecord/read";
  if (hash.includes("credit-token-record")) return "/api/token/creditTokenRecord/readMore";
  if (hash.includes("remote-meter-reading-task")) return "/API/RemoteMeterTask/GetReadingTask";
  if (hash.includes("remote-meter-control-task")) return "/API/RemoteMeterTask/GetControlTask";
  if (hash.includes("remote-meter-token-task")) return "/API/RemoteMeterTask/GetTokenTask";
  if (hash.includes("long-nonpurchase-situation")) return "/API/PrepayReport/LongNonpurchaseSituation";
  if (hash.includes("low-purchase-situation")) return "/API/PrepayReport/LowPurchaseSituation";
  if (hash.includes("consumption-statistics")) return "/api/DailyDataMeter/readHourly";
  if (hash.includes("daily-data-meter")) return "/api/DailyDataMeter/readHourly";
  if (hash.includes("management/gateway")) return "/api/gateway/read";
  if (hash.includes("management/customer")) return "/api/customer/read";
  if (hash.includes("management/tariff")) return "/api/tariff/read";
  if (hash.includes("management/account")) return "/api/account/read";
  if (hash.includes("admin/log")) return "/api/Log/read";
  if (hash.includes("remote-operation")) return "/api/account/read";
  if (hash.includes("token-generate")) return "/api/account/read";
  return apis[apis.length - 1] || "";
}

function sampleName(endpointPath) {
  return endpointPath.replace(/^\/+/, "").replace(/[/?&=:]+/g, "__").replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function hasSample(endpointPath) {
  return fs.existsSync(path.join(sampleDir, `${sampleName(endpointPath)}.json`));
}

function sampleOk(endpointPath) {
  const filePath = path.join(sampleDir, `${sampleName(endpointPath)}.json`);
  if (!fs.existsSync(filePath)) return false;
  try {
    const sample = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const code = Number(sample.body?.code ?? 0);
    return sample.status >= 200 && sample.status < 300 && (code === 0 || code === 200);
  } catch {
    return false;
  }
}

function dashboardSamplesReady() {
  return [
    "/api/dashboard/readPanelGroup",
    "/api/dashboard/readLineChart"
  ].every(sampleOk);
}

function sourceStatus(endpointPath, hash) {
  if (!endpointPath) return "unmapped";
  if (hash.includes("file-upload")) return "guarded-write";
  if (hash === "#/dashboard") {
    return dashboardSamplesReady()
      ? "live-ready"
      : "mixed";
  }
  if (hash.includes("consumption-statistics")) return "live-derived";
  if (sampleOk(endpointPath)) return "live-ready";
  if (hasSample(endpointPath)) return "blocked";
  return "mixed";
}

async function main() {
  const routeModule = await import(pathToFileURL(path.join(root, "src", "data", "route-manifest.js")).href);
  const routes = routeModule.routeManifest;
  const matrix = routes.map((route) => {
    const primaryEndpoint = tableDataPath(route.hash, route.apis);
    return {
      group: route.group,
      title: route.title,
      hash: route.hash,
      visibleReference: routeModule.referenceVisibleRoutes().some((item) => item.hash === route.hash),
      primaryEndpoint,
      declaredEndpoints: route.apis,
      source: sourceStatus(primaryEndpoint, route.hash),
      sample: hasSample(primaryEndpoint) ? `contracts/samples/${sampleName(primaryEndpoint)}.json` : null,
      actions: route.actions,
      roles: route.roles || []
    };
  });

  fs.writeFileSync(matrixPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), routes: matrix }, null, 2)}\n`);
  fs.writeFileSync(observationPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    observations: matrix.map((route) => ({
      hash: route.hash,
      endpoint: route.primaryEndpoint,
      source: route.source,
      sample: route.sample,
      note: route.hash === "#/dashboard"
        ? "Dashboard uses panel group and line chart live endpoints."
        : route.hash.includes("consumption-statistics")
          ? "Direct PrepayReport endpoint returns code 99, so live hourly readings are aggregated."
          : ""
    }))
  }, null, 2)}\n`);

  const lines = [
    "# Live Route Gap Audit",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| Route | Endpoint | Source | Gap |",
    "| --- | --- | --- | --- |",
    ...matrix.map((route) => {
      const gap = route.source === "live-ready" || route.source === "live-derived"
        ? "none"
        : route.source === "guarded-write"
          ? "write endpoint stays guarded"
          : route.source === "blocked"
            ? "blocked by upstream"
            : "needs live sample";
      return `| ${route.title} | \`${route.primaryEndpoint}\` | ${route.source} | ${gap} |`;
    }),
    "",
    "## Known Upstream Defect",
    "",
    "`/API/PrepayReport/ConsumptionStatistics` returns code 99 with valid schema payloads.",
    "The app now derives that report from `/api/DailyDataMeter/readHourly`.",
    "This keeps the route live-backed without sampled rows."
  ];
  fs.writeFileSync(auditPath, `${lines.join("\n")}\n`);

  console.log(JSON.stringify({
    routes: matrix.length,
    liveReady: matrix.filter((route) => route.source === "live-ready").length,
    liveDerived: matrix.filter((route) => route.source === "live-derived").length,
    matrixPath,
    auditPath,
    observationPath
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
