/**
 * report-service.mjs - Admin report data orchestration.
 * Owns: report fetching, KPI computation, chart option building.
 * Used by: ReportsPage.vue
 * Depends on: api.js
 */

import { postApi } from "./api";

/* Date Helpers */

/** @param {number} days */
export function dateRangeFromPreset(preset) {
  const end = new Date();
  const start = new Date(end);
  if (preset === "1d") start.setTime(end.getTime() - 86400000);
  else start.setUTCHours(0, 0, 0, 0);
  if (preset === "7d") start.setUTCDate(start.getUTCDate() - 6);
  else if (preset === "30d") start.setUTCDate(start.getUTCDate() - 29);
  else if (preset === "90d") start.setUTCDate(start.getUTCDate() - 90);
  else if (preset === "365d") start.setUTCFullYear(start.getUTCFullYear() - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function formatDateShort(iso) {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";
}

export function formatMoney(minorAmount) {
  const amount = Number(minorAmount || 0) / 100;
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(amount);
}

/* Report Fetchers */

export async function fetchRevenueReport(dateRange, filters = {}) {
  return fetchOverviewReport("financial", dateRange, filters);
}

export async function fetchTransactionReport(dateRange, filters = {}) {
  return fetchOverviewReport("transactions", dateRange, filters);
}

export async function fetchWalletReport(dateRange, filters = {}) {
  return fetchOverviewReport("vendors-wallets", dateRange, filters);
}

export async function fetchCustomerReport(dateRange, filters = {}) {
  return fetchOverviewReport("general", dateRange, filters);
}

export async function fetchAuditReport(dateRange, filters = {}) {
  return fetchOverviewReport("audit", dateRange, filters);
}

export async function fetchDisputeReport(dateRange, filters = {}) {
  return fetchOverviewReport("disputes", dateRange, filters);
}

async function requestReport(endpoint, dateRange, filters) {
  const result = await postApi(endpoint, { dateRange, filters });
  return result?.data || result?.result || { rows: [], summary: {}, chartData: [] };
}

async function fetchOverviewReport(reportType, dateRange, filters = {}) {
  const fallback = {
    financial: "/api/reports/revenue",
    transactions: "/api/reports/transactions",
    "vendors-wallets": "/api/reports/wallet",
    audit: "/api/reports/audit",
    disputes: "/api/reports/disputes",
    general: "/api/reports/customers"
  }[reportType] || "/api/reports/revenue";
  return requestReport(fallback, dateRange, filters);
}

/* Report Type Registry */

export const reportTypes = [
  { id: "financial", label: "Financial Reports", icon: "chart", description: "Revenue, collections, settlement, and trends" },
  { id: "transactions", label: "Transaction Reports", icon: "wallet", description: "Token sales, outcomes, and volumes" },
  { id: "vendors-wallets", label: "Vendors and Wallets", icon: "users", description: "Wallet funding, balances, and vendor activity" },
  { id: "audit", label: "Audit Reports", icon: "shield", description: "System actions, exceptions, and control trails" },
  { id: "disputes", label: "Dispute Reports", icon: "bank", description: "Refunds, resolutions, and service recovery" },
  { id: "general", label: "General Reports", icon: "chart", description: "Executive operating performance overview" }
];

export function canonicalReportType(reportType) {
  return ({ financial: "revenue", transactions: "transactions", "vendors-wallets": "wallet", audit: "audit", disputes: "disputes", general: "customers" })[reportType] || reportType;
}

export function fetcherForType(reportType) {
  reportType = canonicalReportType(reportType);
  const map = {
    revenue: fetchRevenueReport,
    transactions: fetchTransactionReport,
    wallet: fetchWalletReport,
    customers: fetchCustomerReport,
    audit: fetchAuditReport,
    disputes: fetchDisputeReport
  };
  return map[reportType] || fetchRevenueReport;
}

/* KPI Builder */

export function buildKPIs(reportType, data) {
  reportType = canonicalReportType(reportType);
  if (reportType === "revenue") {
    return [
      { label: "Total Revenue", value: formatMoney(data.summary?.totalRevenue || 0), delta: data.summary?.revenueDelta, tone: "good" },
      { label: "Transactions", value: Number(data.summary?.totalTransactions || 0).toLocaleString("en-NG"), delta: data.summary?.transactionDelta, tone: "" },
      { label: "Avg. Ticket", value: formatMoney(data.summary?.avgTicket || 0), delta: data.summary?.avgTicketDelta, tone: "" },
      { label: "Active Meters", value: Number(data.summary?.activeMeters || 0).toLocaleString("en-NG"), delta: null, tone: "info" }
    ];
  }
  if (reportType === "transactions") {
    return [
      { label: "Transaction Value", value: formatMoney(data.summary?.totalAmount || 0), delta: null, tone: "good" },
      { label: "Transactions", value: Number(data.summary?.totalTransactions || 0).toLocaleString("en-NG"), delta: null, tone: "" },
      { label: "Energy Sold", value: `${Number(data.summary?.totalKwh || 0).toLocaleString("en-NG")} kWh`, delta: null, tone: "" },
      { label: "Unique Meters", value: Number(data.summary?.uniqueMeters || 0).toLocaleString("en-NG"), delta: null, tone: "info" }
    ];
  }
  if (reportType === "wallet") {
    return [
      { label: "Total Balance", value: formatMoney(data.summary?.totalBalance || 0), delta: null, tone: "good" },
      { label: "Funding Volume", value: formatMoney(data.summary?.fundingVolume || 0), delta: data.summary?.fundingDelta, tone: "" },
      { label: "Purchase Volume", value: formatMoney(data.summary?.purchaseVolume || 0), delta: data.summary?.purchaseDelta, tone: "" },
      { label: "Active Wallets", value: String(data.summary?.activeWallets || 0), delta: null, tone: "info" }
    ];
  }
  if (reportType === "customers") {
    return [
      { label: "Total Customers", value: String(data.summary?.totalCustomers || 0), delta: data.summary?.customerDelta, tone: "" },
      { label: "Total Consumption", value: `${(data.summary?.totalConsumption || 0).toLocaleString()} kWh`, delta: null, tone: "" },
      { label: "Avg. Monthly", value: `${(data.summary?.avgMonthly || 0).toLocaleString()} kWh`, delta: data.summary?.avgDelta, tone: "" },
      { label: "Zero Usage", value: String(data.summary?.zeroUsage || 0), delta: null, tone: data.summary?.zeroUsage > 0 ? "warn" : "good" }
    ];
  }
  if (reportType === "audit") {
    return [
      { label: "Total Events", value: String(data.summary?.totalEvents || 0), delta: null, tone: "" },
      { label: "Write Operations", value: String(data.summary?.writeOps || 0), delta: null, tone: "" },
      { label: "Unique Users", value: String(data.summary?.uniqueUsers || 0), delta: null, tone: "info" },
      { label: "Failures", value: String(data.summary?.failures || 0), delta: null, tone: data.summary?.failures > 0 ? "danger" : "good" }
    ];
  }
  if (reportType === "disputes") {
    return [
      { label: "Total Disputes", value: String(data.summary?.totalDisputes || 0), delta: null, tone: "" },
      { label: "Open", value: String(data.summary?.openDisputes || 0), delta: null, tone: "warn" },
      { label: "Resolved", value: String(data.summary?.resolvedDisputes || 0), delta: null, tone: "good" },
      { label: "Rejected", value: String(data.summary?.rejectedDisputes || 0), delta: null, tone: data.summary?.rejectedDisputes > 0 ? "danger" : "" }
    ];
  }
  return [];
}

/* Column Definitions per Report */

export function columnsForType(reportType) {
  if (reportType === "vendors-wallets") {
    return [
      { key: "date", label: "Date" },
      { key: "type", label: "Type" },
      { key: "description", label: "Description" },
      { key: "amount", label: "Amount", value: (r) => formatMoney(r.amount) },
      { key: "balance", label: "Balance", value: (r) => formatMoney(r.balance) },
      { key: "wallet", label: "Wallet" }
    ];
  }
  if (reportType === "audit") {
    return [
      { key: "timestamp", label: "Timestamp" },
      { key: "actor", label: "Actor" },
      { key: "role", label: "Role" },
      { key: "action", label: "Action" },
      { key: "target", label: "Target" },
      { key: "status", label: "Status" },
      { key: "ip", label: "IP Address" }
    ];
  }
  if (reportType === "disputes") {
    return [
      { key: "reference", label: "Reference" },
      { key: "subject", label: "Subject" },
      { key: "status", label: "Status" },
      { key: "createdAt", label: "Created" },
      { key: "resolvedAt", label: "Resolved" }
    ];
  }
  if (reportType === "general") {
    return [
      { key: "station", label: "Station" },
      { key: "consumption", label: "Consumption (kWh)", value: (r) => Number(r.consumption || 0).toLocaleString("en-NG") }
    ];
  }
  reportType = canonicalReportType(reportType);
  if (reportType === "revenue") {
    return [
      { key: "date", label: "Date" },
      { key: "transactions", label: "Transactions" },
      { key: "revenue", label: "Revenue", value: (r) => formatMoney(r.revenue) },
      { key: "avgTicket", label: "Avg. Ticket", value: (r) => formatMoney(r.avgTicket) },
      { key: "station", label: "Station" }
    ];
  }
  if (reportType === "transactions") {
    return [
      { key: "date", label: "Date" },
      { key: "meter", label: "Meter" },
      { key: "station", label: "Station" },
      { key: "customer", label: "Customer" },
      { key: "amount", label: "Amount", value: (r) => formatMoney(r.amount) },
      { key: "kwh", label: "Energy (kWh)" }
    ];
  }
  if (reportType === "wallet") {
    return [
      { key: "date", label: "Date" },
      { key: "type", label: "Type" },
      { key: "description", label: "Description" },
      { key: "amount", label: "Amount", value: (r) => formatMoney(r.amount) },
      { key: "balance", label: "Balance", value: (r) => formatMoney(r.balance) },
      { key: "wallet", label: "Wallet" }
    ];
  }
  if (reportType === "customers") {
    return [
      { key: "customerId", label: "Customer ID" },
      { key: "customerName", label: "Name" },
      { key: "meterId", label: "Meter" },
      { key: "consumption", label: "Consumption (kWh)" },
      { key: "lastPurchase", label: "Last Purchase" },
      { key: "station", label: "Station" }
    ];
  }
  if (reportType === "audit") {
    return [
      { key: "timestamp", label: "Timestamp" },
      { key: "actor", label: "Actor" },
      { key: "role", label: "Role" },
      { key: "action", label: "Action" },
      { key: "target", label: "Target" },
      { key: "status", label: "Status" },
      { key: "ip", label: "IP Address" }
    ];
  }
  if (reportType === "settlement") {
    return [
      { key: "batchRef", label: "Batch Ref" },
      { key: "period", label: "Period" },
      { key: "purchases", label: "Purchases", value: (r) => formatMoney(r.purchases) },
      { key: "funding", label: "Funding", value: (r) => formatMoney(r.funding) },
      { key: "net", label: "Net", value: (r) => formatMoney(r.net) },
      { key: "status", label: "Status" }
    ];
  }
  return [];
}

/* Chart Option Builder */

export function buildChartOptions(reportType, data, theme = "light") {
  reportType = canonicalReportType(reportType);
  const palette = {
    light: { text: "#334155", grid: "#e2e8f0", accent: "#16a34a", secondary: "#047857", tooltip: "rgba(255,255,255,0.96)", tooltipText: "#0f172a" },
    executive: { text: "#dcfce7", grid: "rgba(74,222,128,0.18)", accent: "#22c55e", secondary: "#86efac", tooltip: "rgba(3,10,5,0.96)", tooltipText: "#f0fdf4" },
    contrast: { text: "#fefce8", grid: "rgba(255,214,10,0.24)", accent: "#ffd60a", secondary: "#ffe45c", tooltip: "rgba(0,0,0,0.98)", tooltipText: "#ffffff" }
  }[theme] || { text: "#334155", grid: "#e2e8f0", accent: "#16a34a", secondary: "#047857", tooltip: "rgba(255,255,255,0.96)", tooltipText: "#0f172a" };
  const textColor = palette.text;
  const gridColor = palette.grid;
  const accentColor = palette.accent;
  const accentSecondary = palette.secondary;
  const tooltip = { backgroundColor: palette.tooltip, borderColor: gridColor, textStyle: { color: palette.tooltipText, fontSize: 12 } };

  const chartData = data.chartData || [];
  const categories = chartData.map((d) => d.label || d.date || "");

  if (reportType === "revenue" || reportType === "wallet" || reportType === "transactions") {
    return {
      tooltip: { trigger: "axis", ...tooltip },
      grid: { left: 60, right: 20, top: 20, bottom: 36 },
      xAxis: { type: "category", data: categories, axisLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor, fontSize: 11 } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor, fontSize: 11, formatter: (v) => `NGN ${(v / 100).toLocaleString()}` } },
      series: [
        { type: "bar", data: chartData.map((d) => d.value), itemStyle: { color: accentColor, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 32 }
      ]
    };
  }

  if (reportType === "customers") {
    return {
      tooltip: { trigger: "axis", ...tooltip },
      grid: { left: 60, right: 20, top: 20, bottom: 36 },
      xAxis: { type: "category", data: categories, axisLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor, fontSize: 11 } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor, fontSize: 11 } },
      series: [
        { type: "line", data: chartData.map((d) => d.value), smooth: true, lineStyle: { color: accentColor, width: 2 }, areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(34,197,94,0.25)" }, { offset: 1, color: "rgba(34,197,94,0)" }] } }, itemStyle: { color: accentColor } }
      ]
    };
  }

  if (reportType === "audit" || reportType === "disputes") {
    return {
      tooltip: { trigger: "item", ...tooltip },
      series: [
        { type: "pie", radius: ["45%", "70%"], data: chartData.map((d) => ({ name: d.label, value: d.value })), label: { color: textColor, fontSize: 11 }, itemStyle: { borderRadius: 4, borderColor: "transparent", borderWidth: 2 }, color: [accentColor, accentSecondary, "#f59e0b", "#ef4444", "#10b981"] }
      ]
    };
  }

  // settlement stacked bar
  return {
    tooltip: { trigger: "axis", ...tooltip },
    legend: { data: ["Purchases", "Funding"], textStyle: { color: textColor, fontSize: 11 }, bottom: 0 },
    grid: { left: 60, right: 20, top: 20, bottom: 50 },
    xAxis: { type: "category", data: categories, axisLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor, fontSize: 11 } },
    yAxis: { type: "value", splitLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor, fontSize: 11, formatter: (v) => `NGN ${(v / 100).toLocaleString()}` } },
    series: [
      { name: "Purchases", type: "bar", stack: "total", data: chartData.map((d) => d.purchases || 0), itemStyle: { color: accentColor, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 28 },
      { name: "Funding", type: "bar", stack: "total", data: chartData.map((d) => d.funding || 0), itemStyle: { color: accentSecondary, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 28 }
    ]
  };
}
