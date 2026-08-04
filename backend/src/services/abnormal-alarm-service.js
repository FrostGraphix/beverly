const NO_DATA_TOTAL = -1;

const ALARM_SIGNALS = [
  { key: "relayOpen", label: "Relay Open", severity: "warning", category: "supply", description: "The meter reports an open supply relay.", action: "Confirm supply state and compare observed load.", fields: ["relayOpen", "relay_open", "relayStatus"] },
  { key: "magneticInterference", label: "Magnetic Interference", severity: "critical", category: "tamper", description: "The meter reports magnetic interference.", action: "Schedule a tamper inspection and preserve evidence.", fields: ["magneticInterference", "magnetic_interference", "magneticStatus", "magnetismStatus"] },
  { key: "batteryLow", label: "Battery Low", severity: "warning", category: "device", description: "The meter reports a low internal battery.", action: "Inspect or replace the meter battery.", fields: ["batteryLow", "battery_low", "batteryStatus", "batteryVoltageStatus"] },
  { key: "terminalCoverOpen", label: "Terminal Cover Open", severity: "critical", category: "tamper", description: "The terminal cover reports an open state.", action: "Inspect terminal seals and wiring.", fields: ["terminalCoverOpen", "terminal_cover_open", "terminalCover", "terminalStatus", "terminalCoverStatus"] },
  { key: "coverOpen", label: "Upper Cover Open", severity: "critical", category: "tamper", description: "The meter enclosure reports an open state.", action: "Inspect the enclosure and security seals.", fields: ["coverOpen", "cover_open", "upperOpen", "upperCoverOpen", "upperCoverStatus"] },
  { key: "currentReverse", label: "Current Reverse", severity: "critical", category: "tamper", description: "Current direction is reported as reversed.", action: "Inspect polarity, wiring, and possible bypass paths.", fields: ["currentReverse", "current_reverse", "reverseCurrent", "currentReverseStatus"] },
  { key: "currentUnbalance", label: "Current Unbalance", severity: "warning", category: "electrical", description: "Phase currents are materially unbalanced.", action: "Compare phase currents and inspect the load.", fields: ["currentUnbalance", "current_unbalance", "currentUnbalanceStatus", "unbalanceStatus"] },
];

const NO_DATA_SIGNAL = {
  key: "noData",
  label: "No Data Report",
  severity: "critical",
  category: "communication",
  description: "The interval source returned its no-data sentinel.",
  action: "Check gateway uptime and meter communications."
};

function conditionActive(value) {
  if (value === true) return false;
  if (value === false) return true;
  if (typeof value === "number") return value > 0;
  const text = String(value ?? "").trim().toLowerCase();
  return ["yes", "open", "low", "abnormal", "reverse", "unbalance"].includes(text);
}

function firstValue(record, fields) {
  for (const field of fields) {
    if (record?.[field] !== undefined && record?.[field] !== null) return record[field];
  }
  return undefined;
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function signalModel(signal) {
  return {
    alarmKey: signal.key,
    alarmLabel: signal.label,
    severity: signal.severity,
    category: signal.category,
    description: signal.description,
    recommendedAction: signal.action
  };
}

function normalizeIntervalRow(record, fallbackStationId = "") {
  return {
    ...record,
    stationId: record.stationId || record.station_id || record.station || record.siteId || record.SITE_ID || fallbackStationId,
    meterId: record.meterId || record.meter_id || record.serialNumber || record.METER_ID || "",
    customerId: record.customerId || record.customer_id || record.customerAccountId || record.CUSTOMER_ID || "",
    customerName: record.customerName || record.customer_name || record.name || record.CUSTOMER_NAME || "",
    gatewayId: record.gatewayId || record.gateway_id || record.gateway || record.GATEWAY_ID || "",
    currentDate: record.currentDate || record.current_date || record.collectionDate || record.readingDate || record.reading_date || record.timestamp || record.CURRENT_DATE || "",
    total1: firstValue(record, ["total1", "totalEnergy", "energyReadingKwh", "TOTAL1"]),
    usage1: firstValue(record, ["usage1", "lastHourUsage", "USAGE1", "energyConsumptionKwh", "consumption"]),
    remain1: firstValue(record, ["remain1", "creditBalance", "energyBalanceKwh", "REMAIN1", "remainingCredit"]),
    intervalDemand: firstValue(record, ["intervalDemand", "maximumDemand", "interval_demand", "INTERVAL_DEMAND"]),
    power: firstValue(record, ["power", "activePower", "active_power", "POWER"]),
    voltageA: firstValue(record, ["voltageA", "voltage_a", "VOLTAGE_A"]),
    voltageB: firstValue(record, ["voltageB", "voltage_b", "VOLTAGE_B"]),
    voltageC: firstValue(record, ["voltageC", "voltage_c", "VOLTAGE_C"]),
    currentA: firstValue(record, ["currentA", "current_a", "CURRENT_A"]),
    currentB: firstValue(record, ["currentB", "current_b", "CURRENT_B"]),
    currentC: firstValue(record, ["currentC", "current_c", "CURRENT_C"]),
    source2Activated: firstValue(record, ["source2Activated", "source_2_activated", "SOURCE2_ACTIVATED"]),
    updateDate: firstValue(record, ["updateDate", "updateTime", "update_date", "createDate", "UPDATE_DATE"]),
    relayOpen: firstValue(record, ["relayOpen", "relay_open", "relayStatus"]),
    batteryLow: firstValue(record, ["batteryLow", "battery_low", "batteryStatus", "batteryVoltageStatus"]),
    magneticInterference: firstValue(record, ["magneticInterference", "magnetic_interference", "magneticStatus", "magnetismStatus"]),
    terminalCoverOpen: firstValue(record, ["terminalCoverOpen", "terminal_cover_open", "terminalCover", "terminalStatus", "terminalCoverStatus"]),
    coverOpen: firstValue(record, ["coverOpen", "cover_open", "upperOpen", "upperCoverOpen", "upperCoverStatus"]),
    currentReverse: firstValue(record, ["currentReverse", "current_reverse", "reverseCurrent", "currentReverseStatus"]),
    currentUnbalance: firstValue(record, ["currentUnbalance", "current_unbalance", "currentUnbalanceStatus", "unbalanceStatus"]),
  };
}

function evidenceFor(row) {
  return {
    observedLoad: [row.power, row.intervalDemand, row.currentA, row.currentB, row.currentC, row.usage1].some(positive),
    power: row.power,
    intervalDemand: row.intervalDemand,
    currents: [row.currentA, row.currentB, row.currentC],
    voltages: [row.voltageA, row.voltageB, row.voltageC]
  };
}

function noDataAlarmRow(row) {
  return { ...row, ...signalModel(NO_DATA_SIGNAL), relatedAlarmKeys: ["noData"], evidenceCount: 1, bypassRisk: "low", evidence: evidenceFor(row) };
}

function buildAlarmRowsForSignals(row, activeSignals) {
  const relatedAlarmKeys = activeSignals.map((signal) => signal.key);
  const tamperCount = activeSignals.filter((signal) => signal.category === "tamper").length;
  const evidence = evidenceFor(row);
  const relayWithLoad = relatedAlarmKeys.includes("relayOpen") && evidence.observedLoad;
  const bypassRisk = tamperCount >= 2 || relayWithLoad ? "high" : tamperCount === 1 ? "medium" : "low";
  return activeSignals.map((signal) => ({
    ...row,
    ...signalModel(signal),
    relatedAlarmKeys,
    evidenceCount: activeSignals.length,
    bypassRisk,
    evidence
  }));
}

// Derives alarms from raw upstream-shaped rows (any of the alias field names in
// ALARM_SIGNALS[].fields, in whatever raw representation the OEM sent -- boolean,
// numeric, or string). Used for live-proxied data that was never persisted.
function deriveAbnormalAlarms(intervalRows, fallbackStationId = "") {
  return (Array.isArray(intervalRows) ? intervalRows : []).flatMap((record) => {
    const row = normalizeIntervalRow(record, fallbackStationId);
    const activeSignals = ALARM_SIGNALS.filter((signal) => signal.fields.some((field) => conditionActive(record?.[field])));
    if (Number(row.total1) === NO_DATA_TOTAL) return [noDataAlarmRow(row)];
    return buildAlarmRowsForSignals(row, activeSignals);
  });
}

// Derives alarms from rows whose alarm signals are already resolved to a clean
// "is this alarm active" boolean (true/false/null) under the canonical camelCase
// keys (relayOpen, batteryLow, ...) -- i.e. rows read back from
// daily_meter_readings' typed signal columns, which consumption-store.js populates
// by calling conditionActive() once at ingestion time. Deliberately does NOT call
// conditionActive() again here: that function inverts plain booleans (true means
// "healthy" on the raw wire, so conditionActive(true) === false), so re-applying it
// to an already-resolved "active" boolean would flip the answer. Kept as a separate
// function rather than a flag on deriveAbnormalAlarms so neither code path can
// accidentally receive the other's input shape.
function deriveAbnormalAlarmsFromResolvedFlags(rows, fallbackStationId = "") {
  return (Array.isArray(rows) ? rows : []).flatMap((record) => {
    const row = normalizeIntervalRow(record, fallbackStationId);
    if (Number(row.total1) === NO_DATA_TOTAL) return [noDataAlarmRow(row)];
    const activeSignals = ALARM_SIGNALS.filter((signal) => record?.[signal.key] === true);
    return buildAlarmRowsForSignals(row, activeSignals);
  });
}

function summarizeAbnormalAlarms(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    total: list.length,
    critical: list.filter((row) => row.severity === "critical").length,
    warning: list.filter((row) => row.severity === "warning").length,
    bypassCandidates: new Set(list.filter((row) => row.bypassRisk === "high").map((row) => row.meterId).filter(Boolean)).size,
    affectedMeters: new Set(list.map((row) => row.meterId).filter(Boolean)).size,
    affectedStations: new Set(list.map((row) => row.stationId).filter(Boolean)).size
  };
}

module.exports = {
  conditionActive,
  deriveAbnormalAlarms,
  deriveAbnormalAlarmsFromResolvedFlags,
  normalizeIntervalRow,
  summarizeAbnormalAlarms,
  ALARM_SIGNALS: [...ALARM_SIGNALS, NO_DATA_SIGNAL]
};
