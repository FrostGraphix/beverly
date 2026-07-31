import { postApi } from "./api.js";

const indexPageSize = 500;
const maxIndexPages = 60;

function collectionRows(response) {
  const payload = response?.result || response?.data || {};
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

async function loadIndex(path, keyField, api) {
  const index = new Map();
  for (let pageNumber = 1; pageNumber <= maxIndexPages; pageNumber += 1) {
    const rows = collectionRows(await api.postApi(path, { pageNumber, pageSize: indexPageSize }));
    for (const row of rows) {
      const key = String(row?.[keyField] || "").trim();
      if (key && !index.has(key)) index.set(key, row);
    }
    if (rows.length < indexPageSize) break;
  }
  return index;
}

export function accountPreflightIssue(row, customer, meter) {
  const customerId = String(row.customerId || "").trim();
  const meterId = String(row.meterId || "").trim();
  if (!customer) {
    return {
      kind: "missing-customer",
      blocking: true,
      message: `Customer ${customerId} does not exist upstream. Create the customer first.`
    };
  }
  if (!meter) {
    return {
      kind: "missing-meter",
      blocking: true,
      message: `Meter ${meterId} does not exist upstream. Register the meter first.`
    };
  }
  const customerStation = String(customer.stationId || "").trim();
  const meterStation = String(meter.stationId || "").trim();
  if (customerStation && meterStation && customerStation.toUpperCase() !== meterStation.toUpperCase()) {
    return {
      kind: "station-mismatch",
      blocking: true,
      // Upstream rejects these with code 99 "The meter and the customer are not
      // under the same Station." — caught here so the file never gets submitted
      // row by row just to collect the same error 164 times.
      message: `Meter ${meterId} is registered to station ${meterStation} but customer ${customerId} belongs to ${customerStation}.`,
      fix: {
        action: "align-meter-station",
        meterId,
        fromStation: meterStation,
        toStation: customerStation
      }
    };
  }
  const rowStation = String(row.stationId || "").trim();
  if (rowStation && customerStation && rowStation.toUpperCase() !== customerStation.toUpperCase()) {
    return {
      kind: "row-station-corrected",
      blocking: false,
      message: `Row station ${rowStation} replaced with the customer's station ${customerStation}.`,
      correctedStationId: customerStation
    };
  }
  return null;
}

export async function preflightAccountImport(rows = [], api = { postApi }) {
  if (!rows.length) return { rows: [], blocking: [], warnings: [], fixes: [], ready: [] };
  const [customers, meters] = await Promise.all([
    loadIndex("/api/customer/read", "customerId", api),
    loadIndex("/api/meter/read", "meterId", api)
  ]);
  const evaluated = rows.map((row, index) => {
    const customer = customers.get(String(row.customerId || "").trim()) || null;
    const meter = meters.get(String(row.meterId || "").trim()) || null;
    const issue = accountPreflightIssue(row, customer, meter);
    const payload = issue?.correctedStationId ? { ...row, stationId: issue.correctedStationId } : { ...row };
    return {
      line: index + 2,
      row: payload,
      customer,
      meter,
      issue
    };
  });
  return {
    rows: evaluated,
    blocking: evaluated.filter((entry) => entry.issue?.blocking),
    warnings: evaluated.filter((entry) => entry.issue && !entry.issue.blocking),
    fixes: evaluated.filter((entry) => entry.issue?.fix).map((entry) => ({ ...entry.issue.fix, line: entry.line })),
    ready: evaluated.filter((entry) => !entry.issue?.blocking).map((entry) => entry.row)
  };
}

// Opt-in repair: moves a meter to the station its customer belongs to. This is a
// live write against the meter record, so it only ever runs when the operator
// explicitly ticks it in the import dialog.
export async function alignMeterStations(fixes = [], api = { postApi }, meterIndex = null) {
  const results = [];
  for (const fix of fixes) {
    const meter = meterIndex?.get(String(fix.meterId)) || null;
    const payload = {
      ...(meter || {}),
      meterId: String(fix.meterId),
      stationId: String(fix.toStation)
    };
    delete payload.createDate;
    delete payload.updateDate;
    delete payload.createId;
    delete payload.updateId;
    delete payload.status;
    try {
      const response = await api.postApi("/api/meter/update", [payload]);
      const code = Number(response?.code);
      const ok = !Number.isFinite(code) || code === 0 || code === 200;
      results.push({
        meterId: payload.meterId,
        ok,
        error: ok ? "" : String(response?.reason || response?.msg || `code ${code}`)
      });
    } catch (error) {
      results.push({ meterId: payload.meterId, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

export function preflightSummary(report = {}) {
  const total = report.rows?.length || 0;
  const blocking = report.blocking?.length || 0;
  const warnings = report.warnings?.length || 0;
  if (!total) return "";
  if (!blocking && !warnings) return `${total} rows validated against the live API`;
  const parts = [`${total - blocking} of ${total} rows ready`];
  if (blocking) parts.push(`${blocking} blocked`);
  if (warnings) parts.push(`${warnings} auto-corrected`);
  return parts.join(" · ");
}

export function preflightReportCsv(report = {}) {
  const header = "Line,Customer Id,Meter Id,Issue,Message";
  const rows = (report.rows || [])
    .filter((entry) => entry.issue)
    .map((entry) => [
      entry.line,
      entry.row.customerId,
      entry.row.meterId,
      entry.issue.kind,
      `"${String(entry.issue.message).replace(/"/g, "\"\"")}"`
    ].join(","));
  return [header, ...rows].join("\n");
}
