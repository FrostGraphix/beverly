export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function toFiniteNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

export function firstDefinedValue(sources, keys, fallback = "") {
  for (const source of sources || []) {
    const record = isPlainObject(source) ? source : {};
    for (const key of keys || []) {
      if (record[key] !== null && typeof record[key] !== "undefined" && record[key] !== "") return record[key];
    }
  }
  return fallback;
}

export function envelopeSources(payload) {
  const envelope = normalizeEnvelope(payload);
  return [
    isPlainObject(payload) ? payload : {},
    isPlainObject(envelope.data) ? envelope.data : {},
    isPlainObject(envelope.result) ? envelope.result : {},
    isPlainObject(envelope.raw) ? envelope.raw : {},
    isPlainObject(envelope.data?.summary) ? envelope.data.summary : {},
    isPlainObject(envelope.data?.metrics) ? envelope.data.metrics : {},
    isPlainObject(envelope.result?.summary) ? envelope.result.summary : {},
    isPlainObject(envelope.result?.metrics) ? envelope.result.metrics : {}
  ];
}

const collectionFields = ["records", "list", "data", "items", "rows", "payments", "readings"];

export function normalizeEnvelope(payload) {
  if (Array.isArray(payload)) {
    return {
      code: 0,
      msg: "success",
      reason: "success",
      data: payload,
      result: payload,
      raw: payload
    };
  }

  if (!isPlainObject(payload)) {
    return {
      code: 0,
      msg: "success",
      reason: "success",
      data: payload,
      result: payload,
      raw: payload
    };
  }

  const data = "data" in payload ? payload.data : "result" in payload ? payload.result : payload;
  const result = "result" in payload ? payload.result : "data" in payload ? payload.data : payload;
  return {
    ...payload,
    code: "code" in payload ? payload.code : 0,
    msg: "msg" in payload ? payload.msg : "reason" in payload ? payload.reason : "success",
    reason: "reason" in payload ? payload.reason : "msg" in payload ? payload.msg : "success",
    data,
    result,
    raw: payload
  };
}

export function normalizeCollection(payload) {
  const envelope = normalizeEnvelope(payload);
  const source = isPlainObject(envelope.data) ? envelope.data : isPlainObject(envelope.result) ? envelope.result : envelope.raw;

  if (Array.isArray(envelope.data)) {
    return {
      envelope,
      rows: envelope.data,
      total: envelope.data.length
    };
  }

  if (Array.isArray(envelope.result)) {
    return {
      envelope,
      rows: envelope.result,
      total: envelope.result.length
    };
  }

  for (const field of collectionFields) {
    if (Array.isArray(source?.[field])) {
      return {
        envelope,
        rows: source[field],
        total: toFiniteNumber(source.total ?? source.count, source[field].length)
      };
    }
  }

  if (Array.isArray(envelope.raw?.payments)) {
    return {
      envelope,
      rows: envelope.raw.payments,
      total: toFiniteNumber(envelope.raw.total ?? envelope.raw.count, envelope.raw.payments.length)
    };
  }

  if (Array.isArray(envelope.raw?.readings)) {
    return {
      envelope,
      rows: envelope.raw.readings,
      total: toFiniteNumber(envelope.raw.total ?? envelope.raw.count, envelope.raw.readings.length)
    };
  }

  return {
    envelope,
    rows: [],
    total: 0
  };
}

export function normalizeDashboardMetrics(payload) {
  const envelope = normalizeEnvelope(payload);
  const source = isPlainObject(envelope.data) ? envelope.data : isPlainObject(envelope.result) ? envelope.result : {};
  return {
    totalAccountCount: toFiniteNumber(source.totalAccountCount, 0),
    totalPurchaseTimes: toFiniteNumber(source.totalPurchaseTimes, 0),
    totalPurchaseUnit: toFiniteNumber(source.totalPurchaseUnit, 0),
    totalPurchaseMoney: toFiniteNumber(source.totalPurchaseMoney, 0)
  };
}

export function normalizeChartPayload(payload, fallbackTitle = "Purchase Money") {
  const envelope = normalizeEnvelope(payload);
  const source = isPlainObject(envelope.data) ? envelope.data : isPlainObject(envelope.result) ? envelope.result : {};
  return {
    title: source.title || fallbackTitle,
    xData: Array.isArray(source.xData) ? source.xData : [],
    yData: Array.isArray(source.yData) ? source.yData : []
  };
}

export function normalizeActionResult(payload) {
  const envelope = normalizeEnvelope(payload);
  const source = isPlainObject(envelope.data) ? envelope.data : {};
  return {
    envelope,
    token: source.token || "",
    receiptId: source.receiptId || "",
    data: source
  };
}
