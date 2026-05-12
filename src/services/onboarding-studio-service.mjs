export const onboardingRouteHashes = {
  station: "#/admin/station",
  gateway: "#/management/gateway",
  meter: "#/admin/meter",
  tariff: "#/management/tariff",
  customer: "#/management/customer",
  account: "#/management/account"
};

export function normalizeOnboardingRows(response) {
  const result = response?.result;
  const data = response?.data;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.records)) return result.records;
  if (Array.isArray(result?.rows)) return result.rows;
  if (Array.isArray(result?.list)) return result.list;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(result)) return result;
  if (Array.isArray(data)) return data;
  return [];
}

export function normalizeOnboardingTotal(response) {
  const result = response?.result;
  const data = response?.data;
  const candidates = [result?.total, result?.count, data?.total, data?.count];
  const explicit = candidates.find((value) => Number.isFinite(Number(value)));
  if (explicit !== undefined) return Number(explicit);
  return normalizeOnboardingRows(response).length;
}

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function recordId(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

export function stationOption(row) {
  const value = upper(recordId(row, ["stationId", "id", "siteId"]));
  if (!value) return null;
  const name = recordId(row, ["name", "stationName", "label"]);
  return {
    value,
    label: name && upper(name) !== value ? `${value} - ${name}` : value,
    row
  };
}

export function stationOptionsFromRows(rows = []) {
  const seen = new Set();
  return rows
    .map(stationOption)
    .filter(Boolean)
    .filter((option) => {
      if (seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    });
}

export function selectStationValue(currentValue = "", options = []) {
  const selected = upper(currentValue);
  if (selected && options.some((option) => option.value === selected)) return selected;
  return options[0]?.value || "";
}

export function buildOnboardingBoard({ stationRows = [], gatewayRows = [], meterRows = [], customerRows = [], accountRows = [], tariffRows = [], selectedStation = "" } = {}) {
  const stationId = upper(selectedStation);
  const selectedStationRow = stationRows.find((row) => upper(row.stationId || row.id || row.siteId) === stationId) || null;
  const stationReady = Boolean(stationId && selectedStationRow);
  const metrics = {
    stations: stationReady ? 1 : 0,
    gateways: gatewayRows.length,
    meters: meterRows.length,
    customers: customerRows.length,
    accounts: accountRows.length,
    tariffs: tariffRows.length
  };

  return {
    selectedStation: stationId,
    selectedStationRow,
    rows: {
      stations: stationRows,
      gateways: gatewayRows,
      meters: meterRows,
      customers: customerRows,
      accounts: accountRows,
      tariffs: tariffRows
    },
    metrics,
    readiness: {
      station: stationReady,
      provisioning: stationReady && metrics.gateways > 0 && metrics.meters > 0,
      vending: stationReady && metrics.gateways > 0 && metrics.meters > 0 && metrics.customers > 0 && metrics.accounts > 0 && metrics.tariffs > 0,
      remote: stationReady && metrics.gateways > 0 && metrics.meters > 0 && metrics.customers > 0 && metrics.accounts > 0,
      report: stationReady && metrics.meters > 0 && metrics.customers > 0
    }
  };
}

export function onboardingPrefillRow(stepId, board = {}) {
  const stationId = upper(board.selectedStation);
  const rows = board.rows || {};
  const firstGateway = rows.gateways?.[0] || {};
  const firstMeter = rows.meters?.[0] || {};
  const firstCustomer = rows.customers?.[0] || {};
  const firstTariff = rows.tariffs?.[0] || {};

  if (stepId === "gateway") return { stationId };
  if (stepId === "meter") {
    return {
      stationId,
      type: "0",
      isThreePhase: "0",
      communicationWay: "1",
      protocolVersion: "2.2",
      gatewayId: recordId(firstGateway, ["gatewayId", "id"])
    };
  }
  if (stepId === "customer") return { stationId };
  if (stepId === "account") {
    const customerId = recordId(firstCustomer, ["customerId", "id"]);
    const meterId = recordId(firstMeter, ["meterId", "id"]);
    return {
      stationId,
      customerId,
      customerStationId: stationId,
      meterId,
      meterStationId: stationId,
      tariffId: recordId(firstTariff, ["tariffId", "id"]),
      ctRatio: "1",
      communicationWay: firstMeter.communicationWay || ""
    };
  }
  return {};
}

export function payloadStationIdFromAction(result = {}) {
  const payload = Array.isArray(result?.payload) ? result.payload[0] : result?.payload || {};
  return upper(payload.stationId || payload.id || payload.siteId);
}
