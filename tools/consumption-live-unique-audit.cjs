"use strict";

const fs = require("fs");
const path = require("path");
const { loadEnvFile } = require("./env-loader.cjs");
const {
  fetchStationDataset,
} = require("./consumption-live-dataset.cjs");
const { stations } = require("../backend/src/services/refresh-targets");

loadEnvFile();

const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "tmp", "consumption-live-unique-audit.json");
const pageSize = Number(process.env.CONSUMPTION_BACKFILL_PAGE_SIZE || 500);
const timeoutMs = Number(process.env.CONSUMPTION_BACKFILL_TIMEOUT_MS || 45000);
const stationArg = (() => {
  const index = process.argv.indexOf("--station");
  return index >= 0 ? String(process.argv[index + 1] || "") : "";
})();
const selectedStations = stationArg
  ? stationArg.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean)
  : stations;

function readExistingAudit() {
  try {
    const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    return Array.isArray(payload?.stations) ? payload : { generatedAt: null, stations: [] };
  } catch {
    return { generatedAt: null, stations: [] };
  }
}

async function auditStation(stationId) {
  const dataset = await fetchStationDataset(stationId, {
    pageSize,
    timeoutMs,
    onPage: ({ stationId: currentStation, pageNumber, rows, rawTotal }) => {
      console.log(JSON.stringify({ stationId: currentStation, pageNumber, rows, rawTotal, mode: "full-station-crawl" }));
    },
  });

  return {
    station: stationId,
    auditedAt: new Date().toISOString(),
    rawTotal: dataset.rawTotal,
    uniqueTotal: dataset.uniqueTotal,
    earliestReadingDate: dataset.earliestReadingDate,
    latestReadingDate: dataset.latestReadingDate,
  };
}

(async () => {
  const existing = readExistingAudit();
  const merged = new Map(
    (Array.isArray(existing.stations) ? existing.stations : []).map((station) => [
      String(station.station || "").trim().toUpperCase(),
      station,
    ])
  );
  const result = {
    generatedAt: new Date().toISOString(),
    stations: [],
  };
  for (const stationId of selectedStations) {
    merged.set(stationId, await auditStation(stationId));
  }
  result.stations = Array.from(merged.values()).sort((left, right) =>
    String(left.station || "").localeCompare(String(right.station || ""))
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ status: "consumption live unique audit complete", outputPath }, null, 2));
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
