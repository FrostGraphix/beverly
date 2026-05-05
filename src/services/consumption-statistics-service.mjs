import { postApi } from "./api.js";

const defaultRangeDays = 30;

function pad(value) {
  return String(value).padStart(2, "0");
}

export function defaultConsumptionStatisticsFilters(now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - (defaultRangeDays - 1));
  return {
    customerId: "",
    meterId: "",
    dateFrom: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    dateTo: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
    granularity: "daily"
  };
}

export function buildConsumptionStatisticsPayload(filters = {}, paging = {}) {
  const payload = {
    lang: "en",
    pageNumber: Number(paging.pageNumber || 1),
    pageSize: Number(paging.pageSize || 20),
    FROM: filters.dateFrom ? `${filters.dateFrom}T00:00:00.000Z` : undefined,
    TO: filters.dateTo ? `${filters.dateTo}T23:59:59.999Z` : undefined
  };

  if (filters.customerId) payload.customerId = String(filters.customerId).trim();
  if (filters.meterId) payload.meterId = String(filters.meterId).trim();
  if (filters.stationId) payload.stationId = String(filters.stationId).trim();

  return payload;
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function normalizeConsumptionStatisticRow(row = {}, index = 0) {
  const collectionDate = String(row.currentDate || row.collectionDate || row.timestamp || "");
  const rawConsumption = row.consumption ?? row.usage1 ?? row.energyConsumptionKwh ?? 0;
  const numericConsumption = Math.max(0, toNumber(rawConsumption, 0));
  return {
    id: row.id || `${collectionDate}-${row.meterId || row.customerId || index}`,
    collectionDate,
    consumption: numericConsumption,
    customerId: row.customerId || row.customerAccountId || "",
    customerName: row.customerName || "",
    meterId: row.meterId || "",
    stationId: row.stationId || "",
    source: row
  };
}

export function normalizeConsumptionStatisticsResponse(response = {}) {
  const result = response?.result || response?.data || {};
  const rows = Array.isArray(result.data) ? result.data : Array.isArray(result.rows) ? result.rows : [];
  return {
    rows: rows.map(normalizeConsumptionStatisticRow),
    total: Number(result.total || rows.length || 0)
  };
}

export async function fetchConsumptionStatistics(filters = {}, paging = {}, api = { postApi }) {
  const payload = buildConsumptionStatisticsPayload(filters, paging);
  const response = await api.postApi("/api/DailyDataMeter/read", payload);
  return normalizeConsumptionStatisticsResponse(response);
}

function groupKey(row, granularity) {
  const text = String(row.collectionDate || "");
  if (granularity === "monthly") return text.slice(0, 7);
  return text.slice(0, 10);
}

export function aggregateConsumptionRows(rows = [], granularity = "daily") {
  const grouped = new Map();

  for (const row of rows) {
    const key = groupKey(row, granularity);
    if (!key) continue;
    const current = grouped.get(key) || 0;
    grouped.set(key, current + toNumber(row.consumption, 0));
  }

  return Array.from(grouped.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([collectionDate, consumption], index) => ({
      id: `${granularity}-${collectionDate}-${index}`,
      collectionDate,
      consumption: Number(consumption.toFixed(3))
    }));
}

export function buildConsumptionChartOption(rows = [], granularity = "daily") {
  const title = granularity === "monthly" ? "Monthly Consumption" : "Daily Consumption";
  return {
    title: {
      text: title,
      left: "center",
      textStyle: {
        color: "#1296db",
        fontSize: 20,
        fontWeight: 400
      }
    },
    tooltip: {
      trigger: "axis"
    },
    grid: {
      left: 56,
      right: 16,
      top: 56,
      bottom: 44
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: rows.map((row) => row.collectionDate),
      axisLine: {
        lineStyle: {
          color: "#1296db"
        }
      },
      axisLabel: {
        color: "#1296db"
      }
    },
    yAxis: {
      type: "value",
      min: 0,
      axisLine: {
        lineStyle: {
          color: "#1296db"
        }
      },
      axisLabel: {
        color: "#1296db"
      },
      splitLine: {
        lineStyle: {
          color: "#edf2f7"
        }
      }
    },
    series: [{
      name: title,
      type: "line",
      smooth: false,
      symbol: "circle",
      symbolSize: 7,
      lineStyle: {
        color: "#3b82f6",
        width: 3
      },
      itemStyle: {
        color: "#3b82f6"
      },
      areaStyle: {
        color: "rgba(59,130,246,0.08)"
      },
      data: rows.map((row) => row.consumption)
    }]
  };
}
