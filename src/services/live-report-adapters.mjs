function toNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function collectionDate(value) {
  const text = String(value || "");
  return text.includes("T") ? text.slice(0, 10) : text.slice(0, 10);
}

function unwrap(payload) {
  if (Array.isArray(payload)) return { data: payload, result: payload, raw: payload };
  const source = asObject(payload);
  return {
    data: source.data,
    result: source.result,
    raw: source
  };
}

function firstValue(sources, keys, fallback = 0) {
  for (const source of sources) {
    const object = asObject(source);
    for (const key of keys) {
      if (key in object && object[key] !== null && object[key] !== "") {
        return object[key];
      }
    }
  }
  return fallback;
}

function nestedObjects(source) {
  const object = asObject(source);
  const data = asObject(object.data);
  const result = asObject(object.result);
  return [
    object,
    data,
    result,
    asObject(object.summary),
    asObject(object.metrics),
    asObject(data.summary),
    asObject(data.metrics),
    asObject(result.summary),
    asObject(result.metrics)
  ];
}

function extractArray(source) {
  if (Array.isArray(source)) return source;
  const object = asObject(source);
  const envelope = unwrap(object);
  const candidates = [
    envelope.data,
    envelope.result,
    object.series,
    object.items,
    object.rows,
    object.points,
    object.events,
    object.segments,
    object.readings,
    object.payments
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    const nested = asObject(candidate);
    for (const key of ["records", "list", "items", "rows", "points", "segments", "events", "data", "readings", "payments"]) {
      if (Array.isArray(nested[key])) return nested[key];
    }
  }
  return [];
}

function palette(index) {
  const colors = ["#35c2c1", "#5caee8", "#b399dd", "#ffb26a", "#db7a85", "#92a0bd", "#f3d600", "#9ab94f"];
  return colors[index % colors.length];
}

export function buildConsumptionRowsFromReadings(readings) {
  const totals = new Map();
  for (const reading of readings || []) {
    const date = collectionDate(reading.timestamp || reading.collectionDate || reading.createDate);
    if (!date) continue;
    const consumption = toNumber(reading.energyConsumptionKwh ?? reading.consumption ?? reading.totalEnergy, 0);
    totals.set(date, toNumber(totals.get(date), 0) + consumption);
  }

  return Array.from(totals.entries())
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([date, consumption]) => ({
      collectionDate: date,
      consumption: Number(consumption.toFixed(3))
    }));
}

export function buildPurchaseRowsFromPayments(payments) {
  const totals = new Map();
  for (const payment of payments || []) {
    const date = collectionDate(payment.timestamp || payment.transactionTime || payment.createDate);
    if (!date) continue;
    const amount = toNumber(payment.amount ?? payment.purchaseMoney ?? payment.money, 0);
    totals.set(date, toNumber(totals.get(date), 0) + amount);
  }

  return Array.from(totals.entries())
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([date, amount]) => ({
      collectionDate: date,
      amount: Number(amount.toFixed(2))
    }));
}

export function buildConsumptionStatisticsPayload(readings, source = "live-derived") {
  const rows = buildConsumptionRowsFromReadings(readings);
  return {
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
    },
    _proxy: {
      source
    }
  };
}

export function buildSeriesFromRows(rows, labelField, valueField) {
  return (rows || []).map((row) => ({
    label: String(row[labelField] || ""),
    value: toNumber(row[valueField], 0)
  })).filter((row) => row.label);
}

export function buildHourlySuccessSeries(readings) {
  const buckets = new Map();
  for (const reading of readings || []) {
    const timestamp = String(reading.timestamp || reading.collectionDate || "");
    const label = timestamp.includes("T") ? timestamp.slice(11, 16) : timestamp.slice(11, 16);
    if (!label) continue;
    const bucket = buckets.get(label) || { total: 0, success: 0 };
    bucket.total += 1;
    if (toNumber(reading.energyReadingKwh ?? reading.totalEnergy, 0) >= 0) bucket.success += 1;
    buckets.set(label, bucket);
  }

  return Array.from(buckets.entries()).slice(0, 29).map(([label, bucket]) => ({
    label,
    value: bucket.total ? Math.round((bucket.success / bucket.total) * 100) : 0
  }));
}

export function buildAlarmLegendFromReadings(readings) {
  const buckets = new Map([
    ["No Data Report", { color: "#35c2c1", value: 0 }],
    ["Active Readings", { color: "#5caee8", value: 0 }],
    ["Battery Low", { color: "#ffb26a", value: 0 }],
    ["Relay Open", { color: "#f97316", value: 0 }],
    ["Terminal Cover Open", { color: "#0ea5e9", value: 0 }],
    ["Current Reverse", { color: "#8b5cf6", value: 0 }],
    ["Current Unbalance", { color: "#db2777", value: 0 }],
    ["Magnetic Interference", { color: "#ef4444", value: 0 }]
  ]);

  for (const reading of readings || []) {
    const consumption = toNumber(reading.energyConsumptionKwh ?? reading.consumption, 0);
    if (consumption === 0) buckets.get("No Data Report").value += 1;
    else buckets.get("Active Readings").value += 1;

    if (String(reading.batteryStatus || "").toLowerCase() === "low") buckets.get("Battery Low").value += 1;
    if (String(reading.relayStatus || "").toLowerCase() === "open") buckets.get("Relay Open").value += 1;
    if (String(reading.terminalCover || "").toLowerCase() === "open") buckets.get("Terminal Cover Open").value += 1;
    if (String(reading.currentReverse || "").toLowerCase() === "yes") buckets.get("Current Reverse").value += 1;
    if (String(reading.currentUnbalance || "").toLowerCase() === "yes") buckets.get("Current Unbalance").value += 1;
    if (String(reading.magneticStatus || "").toLowerCase() === "abnormal") buckets.get("Magnetic Interference").value += 1;
  }

  return Array.from(buckets.entries())
    .map(([label, item]) => ({ label, color: item.color, value: item.value }))
    .filter((item) => item.value > 0);
}

export function axisLabels(maxValue, steps = 6) {
  const safeMax = Math.max(1, toNumber(maxValue, 1));
  const step = Math.ceil(safeMax / steps);
  return Array.from({ length: steps }, (_, index) => ((steps - index) * step).toLocaleString());
}

export function normalizeDashboardCards(payloads = []) {
  const sources = payloads.flatMap((payload) => nestedObjects(payload));
  return {
    totalAccountCount: toNumber(firstValue(sources, ["totalAccountCount", "accountCount", "accounts", "totalAccounts"], 0), 0),
    totalPurchaseTimes: toNumber(firstValue(sources, ["totalPurchaseTimes", "purchaseTimes", "paymentsCount", "transactionCount"], 0), 0),
    totalPurchaseUnit: toNumber(firstValue(sources, ["totalPurchaseUnit", "purchaseUnit", "unitsSold", "energySoldKwh", "totalEnergy"], 0), 0),
    totalPurchaseMoney: toNumber(firstValue(sources, ["totalPurchaseMoney", "purchaseMoney", "revenue", "amountCollected", "collectedRevenue"], 0), 0)
  };
}

export function normalizeDashboardSeries(payload, config = {}) {
  const title = config.fallbackTitle || "Series";
  const source = asObject(payload);
  const objects = nestedObjects(payload);
  const rows = extractArray(payload);
  const labelKeys = config.labelKeys || ["label", "date", "timestamp", "time", "hour", "name", "period"];
  const valueKeys = config.valueKeys || ["value", "amount", "revenue", "consumption", "usage", "count", "total", "ratio", "percentage"];

  const xData = firstValue(objects, ["xData", "labels", "dates", "categories"], []);
  const yData = firstValue(objects, ["yData", "values", "series", "amounts", "totals"], []);
  if (Array.isArray(xData) && Array.isArray(yData) && xData.length && yData.length) {
    return {
      title: String(firstValue(objects, ["title", "name"], title)),
      labels: xData.map((item) => String(item || "")),
      values: yData.map((item) => toNumber(item, 0))
    };
  }

  const derived = rows.map((row) => ({
    label: String(firstValue([row], labelKeys, "")),
    value: toNumber(firstValue([row], valueKeys, 0), 0)
  })).filter((row) => row.label);
  return {
    title: String(firstValue(objects, ["title", "name"], title)),
    labels: derived.map((row) => row.label),
    values: derived.map((row) => row.value)
  };
}

export function normalizeDashboardLegend(payload, fallback = []) {
  const objects = nestedObjects(payload);
  const labels = firstValue(objects, ["xData", "labels", "categories"], []);
  const values = firstValue(objects, ["yData", "values", "series"], []);
  if (Array.isArray(labels) && Array.isArray(values) && labels.length && values.length) {
    return labels.map((label, index) => ({
      label: String(label || ""),
      value: toNumber(values[index], 0),
      color: palette(index)
    })).filter((row) => row.label && row.value > 0);
  }
  const rows = extractArray(payload);
  const derived = rows.map((row, index) => ({
    label: String(firstValue([row], ["label", "name", "event", "status", "type", "category"], "")),
    value: toNumber(firstValue([row], ["value", "count", "total", "amount"], 0), 0),
    color: String(firstValue([row], ["color"], palette(index)))
  })).filter((row) => row.label && row.value > 0);
  return derived.length ? derived : fallback;
}
