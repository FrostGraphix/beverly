import { postApi } from "./api.js";

const indexPageSize = 500;
const maxIndexPages = 60;
const importTimeoutMs = 15 * 60 * 1000;
const customerReadbackDelaysMs = [2_000, 5_000, 10_000];

function wait(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectionRows(response) {
  const payload = response?.result || response?.data || {};
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

async function loadIndex(path, keyField, api) {
  const index = new Map();
  const keyFields = Array.isArray(keyField) ? keyField : [keyField];
  for (let pageNumber = 1; pageNumber <= maxIndexPages; pageNumber += 1) {
    const rows = collectionRows(await api.postApi(
      path,
      { pageNumber, pageSize: indexPageSize },
      { timeout: importTimeoutMs }
    ));
    for (const row of rows) {
      const key = String(keyFields.map((field) => row?.[field]).find(Boolean) || "").trim();
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
  if (!rows.length) return { rows: [], blocking: [], warnings: [], fixes: [], ready: [], missingCustomers: [], missingMeters: [] };
  const [customers, meters] = await Promise.all([
    loadIndex("/api/customer/read", ["customerId", "id"], api),
    loadIndex("/api/meter/read", ["meterId", "id"], api)
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
  const missingCustomers = [];
  const seenMissingCustomers = new Set();
  for (const entry of evaluated) {
    if (entry.issue?.kind !== "missing-customer" || !entry.meter) continue;
    const customerId = String(entry.row.customerId || "").trim();
    if (!customerId || seenMissingCustomers.has(customerId)) continue;
    seenMissingCustomers.add(customerId);
    missingCustomers.push({
      customerId,
      customerName: String(entry.row.customerName || "").trim(),
      stationId: String(entry.row.stationId || "").trim(),
      phone: "",
      address: "",
      remark: "Imported with account CSV"
    });
  }
  const missingMeters = evaluated
    .filter((entry) => !entry.meter)
    .map((entry) => ({
      line: entry.line,
      meterId: String(entry.row.meterId || "").trim(),
      customerId: String(entry.row.customerId || "").trim()
    }));
  return {
    rows: evaluated,
    blocking: evaluated.filter((entry) => entry.issue?.blocking),
    warnings: evaluated.filter((entry) => entry.issue && !entry.issue.blocking),
    fixes: evaluated.filter((entry) => entry.issue?.fix).map((entry) => ({ ...entry.issue.fix, line: entry.line })),
    ready: evaluated.filter((entry) => !entry.issue?.blocking).map((entry) => entry.row),
    missingCustomers,
    missingMeters
  };
}

export async function provisionMissingCustomers(report = {}, api = { postApi }) {
  const customers = Array.isArray(report.missingCustomers) ? report.missingCustomers : [];
  if (!customers.length) return { attempted: 0, created: 0 };
  const incomplete = customers.find((customer) => (
    !String(customer.customerId || "").trim()
    || !String(customer.customerName || "").trim()
    || !String(customer.stationId || "").trim()
  ));
  if (incomplete) {
    throw new Error("Every missing customer needs an ID, name and station before provisioning.");
  }
  const response = await api.postApi("/api/customer/import", customers, {
    timeout: importTimeoutMs,
    headers: {
      "X-Route-Hash": "#/management/customer",
      "X-Route-Action": "Import"
    }
  });
  const code = Number(response?.code);
  if (Number.isFinite(code) && code !== 0 && code !== 200) {
    throw new Error(String(response?.reason || response?.msg || `Customer import failed with code ${code}`));
  }
  return { attempted: customers.length, created: customers.length };
}

export async function provisionAndRecheckAccountImport(rows = [], report = {}, api = { postApi }, options = {}) {
  const provisioned = await provisionMissingCustomers(report, api);
  let refreshedReport = await preflightAccountImport(rows, api);
  const delays = Array.isArray(options.readbackDelaysMs)
    ? options.readbackDelaysMs
    : customerReadbackDelaysMs;
  for (const delayMs of delays) {
    if (!refreshedReport.missingCustomers.length) break;
    await wait(delayMs);
    refreshedReport = await preflightAccountImport(rows, api);
  }
  return { provisioned, report: refreshedReport };
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
