function toNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function collectionDate(value) {
  const text = String(value || "");
  return text.includes("T") ? text.slice(0, 10) : text.slice(0, 10);
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
  const total = (readings || []).length;
  const zeroConsumption = (readings || []).filter((reading) => toNumber(reading.energyConsumptionKwh, 0) === 0).length;
  return [
    { label: "No Data Report", color: "#35c2c1", value: zeroConsumption },
    { label: "Active Readings", color: "#5caee8", value: Math.max(0, total - zeroConsumption) }
  ].filter((item) => item.value > 0);
}

export function axisLabels(maxValue, steps = 6) {
  const safeMax = Math.max(1, toNumber(maxValue, 1));
  const step = Math.ceil(safeMax / steps);
  return Array.from({ length: steps }, (_, index) => ((steps - index) * step).toLocaleString());
}
