function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNumber(value, fallback) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
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

  if (!isObject(payload)) {
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
  const source = isObject(envelope.data) ? envelope.data : isObject(envelope.result) ? envelope.result : envelope.raw;

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
        total: toNumber(source.total ?? source.count, source[field].length)
      };
    }
  }

  if (Array.isArray(envelope.raw?.payments)) {
    return {
      envelope,
      rows: envelope.raw.payments,
      total: toNumber(envelope.raw.total ?? envelope.raw.count, envelope.raw.payments.length)
    };
  }

  if (Array.isArray(envelope.raw?.readings)) {
    return {
      envelope,
      rows: envelope.raw.readings,
      total: toNumber(envelope.raw.total ?? envelope.raw.count, envelope.raw.readings.length)
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
  const source = isObject(envelope.data) ? envelope.data : isObject(envelope.result) ? envelope.result : {};
  return {
    totalAccountCount: toNumber(source.totalAccountCount, 0),
    totalPurchaseTimes: toNumber(source.totalPurchaseTimes, 0),
    totalPurchaseUnit: toNumber(source.totalPurchaseUnit, 0),
    totalPurchaseMoney: toNumber(source.totalPurchaseMoney, 0)
  };
}

export function normalizeChartPayload(payload, fallbackTitle = "Purchase Money") {
  const envelope = normalizeEnvelope(payload);
  const source = isObject(envelope.data) ? envelope.data : isObject(envelope.result) ? envelope.result : {};
  return {
    title: source.title || fallbackTitle,
    xData: Array.isArray(source.xData) ? source.xData : [],
    yData: Array.isArray(source.yData) ? source.yData : []
  };
}

export function normalizeActionResult(payload) {
  const envelope = normalizeEnvelope(payload);
  const source = isObject(envelope.data) ? envelope.data : {};
  return {
    envelope,
    token: source.token || "",
    receiptId: source.receiptId || "",
    data: source
  };
}
