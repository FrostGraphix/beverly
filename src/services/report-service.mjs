/**
 * report-service.mjs — Admin report data orchestration.
 * Owns: report fetching, KPI computation, chart option building.
 * Used by: ReportsPage.vue
 * Depends on: api.js
 */

import { postApi } from "./api";

/* ── Date Helpers ── */

/** @param {number} days */
export function dateRangeFromPreset(preset) {
  const end = new Date();
  const start = new Date();
  if (preset === "today") start.setHours(0, 0, 0, 0);
  else if (preset === "7d") start.setDate(start.getDate() - 7);
  else if (preset === "30d") start.setDate(start.getDate() - 30);
  else if (preset === "90d") start.setDate(start.getDate() - 90);
  else if (preset === "365d") start.setFullYear(start.getFullYear() - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function formatDateShort(iso) {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

export function formatMoney(minorAmount) {
  const amount = Number(minorAmount || 0) / 100;
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(amount);
}

/* ── Report Fetchers ── */

export async function fetchRevenueReport(dateRange, filters = {}) {
  try {
    const result = await postApi("/api/reports/revenue", { dateRange, filters });
    return result || { rows: [], summary: {}, chartData: [] };
  } catch {
    return generateDemoRevenueReport(dateRange);
  }
}

export async function fetchWalletReport(dateRange, filters = {}) {
  try {
    const result = await postApi("/api/reports/wallet", { dateRange, filters });
    return result || { rows: [], summary: {}, chartData: [] };
  } catch {
    return generateDemoWalletReport(dateRange);
  }
}

export async function fetchCustomerReport(dateRange, filters = {}) {
  try {
    const result = await postApi("/api/reports/customers", { dateRange, filters });
    return result || { rows: [], summary: {}, chartData: [] };
  } catch {
    return generateDemoCustomerReport(dateRange);
  }
}

export async function fetchAuditReport(dateRange, filters = {}) {
  try {
    const result = await postApi("/api/reports/audit", { dateRange, filters });
    return result || { rows: [], summary: {}, chartData: [] };
  } catch {
    return generateDemoAuditReport(dateRange);
  }
}

export async function fetchSettlementReport(dateRange, filters = {}) {
  try {
    const result = await postApi("/api/reports/settlement", { dateRange, filters });
    return result || { rows: [], summary: {}, chartData: [] };
  } catch {
    return generateDemoSettlementReport(dateRange);
  }
}

/* ── Report Type Registry ── */

export const reportTypes = [
  { id: "revenue", label: "Revenue Summary", icon: "chart", description: "Daily/weekly/monthly revenue from token sales" },
  { id: "wallet", label: "Wallet Activity", icon: "wallet", description: "Ledger movements, funding, and purchases" },
  { id: "customers", label: "Customer Usage", icon: "users", description: "Consumption patterns and top customers" },
  { id: "audit", label: "Operations Audit", icon: "shield", description: "System actions and compliance trail" },
  { id: "settlement", label: "Settlement", icon: "bank", description: "Settlement periods and disbursements" }
];

export function fetcherForType(reportType) {
  const map = {
    revenue: fetchRevenueReport,
    wallet: fetchWalletReport,
    customers: fetchCustomerReport,
    audit: fetchAuditReport,
    settlement: fetchSettlementReport
  };
  return map[reportType] || fetchRevenueReport;
}

/* ── KPI Builder ── */

export function buildKPIs(reportType, data) {
  if (reportType === "revenue") {
    return [
      { label: "Total Revenue", value: formatMoney(data.summary?.totalRevenue || 0), delta: data.summary?.revenueDelta, tone: "good" },
      { label: "Transactions", value: String(data.summary?.totalTransactions || 0), delta: data.summary?.transactionDelta, tone: "" },
      { label: "Avg. Ticket", value: formatMoney(data.summary?.avgTicket || 0), delta: data.summary?.avgTicketDelta, tone: "" },
      { label: "Active Meters", value: String(data.summary?.activeMeters || 0), delta: null, tone: "info" }
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
  if (reportType === "settlement") {
    return [
      { label: "Total Settled", value: formatMoney(data.summary?.totalSettled || 0), delta: null, tone: "good" },
      { label: "Pending", value: formatMoney(data.summary?.pending || 0), delta: null, tone: "warn" },
      { label: "Batches", value: String(data.summary?.batchCount || 0), delta: null, tone: "" },
      { label: "Failed", value: String(data.summary?.failedCount || 0), delta: null, tone: data.summary?.failedCount > 0 ? "danger" : "good" }
    ];
  }
  return [];
}

/* ── Column Definitions per Report ── */

export function columnsForType(reportType) {
  if (reportType === "revenue") {
    return [
      { key: "date", label: "Date" },
      { key: "transactions", label: "Transactions" },
      { key: "revenue", label: "Revenue", value: (r) => formatMoney(r.revenue) },
      { key: "avgTicket", label: "Avg. Ticket", value: (r) => formatMoney(r.avgTicket) },
      { key: "station", label: "Station" }
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

/* ── Chart Option Builder ── */

export function buildChartOptions(reportType, data, theme = "executive") {
  const textColor = theme === "light" ? "#334155" : "#94a3b8";
  const gridColor = theme === "light" ? "#e2e8f0" : "rgba(148,163,184,0.12)";
  const accentColor = "#22c55e";
  const accentSecondary = "#0ea5e9";

  const chartData = data.chartData || [];
  const categories = chartData.map((d) => d.label || d.date || "");

  if (reportType === "revenue" || reportType === "wallet") {
    return {
      tooltip: { trigger: "axis", backgroundColor: "rgba(15,17,23,0.92)", borderColor: "transparent", textStyle: { color: "#e2e8f0", fontSize: 12 } },
      grid: { left: 60, right: 20, top: 20, bottom: 36 },
      xAxis: { type: "category", data: categories, axisLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor, fontSize: 11 } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor, fontSize: 11, formatter: (v) => `₦${(v / 100).toLocaleString()}` } },
      series: [
        { type: "bar", data: chartData.map((d) => d.value), itemStyle: { color: accentColor, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 32 }
      ]
    };
  }

  if (reportType === "customers") {
    return {
      tooltip: { trigger: "axis", backgroundColor: "rgba(15,17,23,0.92)", borderColor: "transparent", textStyle: { color: "#e2e8f0", fontSize: 12 } },
      grid: { left: 60, right: 20, top: 20, bottom: 36 },
      xAxis: { type: "category", data: categories, axisLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor, fontSize: 11 } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor, fontSize: 11 } },
      series: [
        { type: "line", data: chartData.map((d) => d.value), smooth: true, lineStyle: { color: accentColor, width: 2 }, areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(34,197,94,0.25)" }, { offset: 1, color: "rgba(34,197,94,0)" }] } }, itemStyle: { color: accentColor } }
      ]
    };
  }

  if (reportType === "audit") {
    return {
      tooltip: { trigger: "item", backgroundColor: "rgba(15,17,23,0.92)", borderColor: "transparent", textStyle: { color: "#e2e8f0", fontSize: 12 } },
      series: [
        { type: "pie", radius: ["45%", "70%"], data: chartData.map((d) => ({ name: d.label, value: d.value })), label: { color: textColor, fontSize: 11 }, itemStyle: { borderRadius: 4, borderColor: "transparent", borderWidth: 2 }, color: [accentColor, accentSecondary, "#f59e0b", "#ef4444", "#8b5cf6"] }
      ]
    };
  }

  // settlement — stacked bar
  return {
    tooltip: { trigger: "axis", backgroundColor: "rgba(15,17,23,0.92)", borderColor: "transparent", textStyle: { color: "#e2e8f0", fontSize: 12 } },
    legend: { data: ["Purchases", "Funding"], textStyle: { color: textColor, fontSize: 11 }, bottom: 0 },
    grid: { left: 60, right: 20, top: 20, bottom: 50 },
    xAxis: { type: "category", data: categories, axisLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor, fontSize: 11 } },
    yAxis: { type: "value", splitLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor, fontSize: 11, formatter: (v) => `₦${(v / 100).toLocaleString()}` } },
    series: [
      { name: "Purchases", type: "bar", stack: "total", data: chartData.map((d) => d.purchases || 0), itemStyle: { color: accentColor, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 28 },
      { name: "Funding", type: "bar", stack: "total", data: chartData.map((d) => d.funding || 0), itemStyle: { color: accentSecondary, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 28 }
    ]
  };
}

/* ── Demo Data Generators ── */

function generateDemoRevenueReport(dateRange) {
  const days = Math.ceil((new Date(dateRange.end) - new Date(dateRange.start)) / 86400000) || 7;
  const rows = [];
  const chartData = [];
  let totalRevenue = 0;
  let totalTransactions = 0;
  const stations = ["Station A", "Station B", "Station C"];

  for (let i = 0; i < Math.min(days, 30); i++) {
    const d = new Date(dateRange.start);
    d.setDate(d.getDate() + i);
    const dateStr = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    const txns = 40 + Math.floor(Math.random() * 80);
    const rev = (txns * (1500 + Math.floor(Math.random() * 3000))) * 100;
    totalRevenue += rev;
    totalTransactions += txns;
    rows.push({ date: dateStr, transactions: txns, revenue: rev, avgTicket: Math.round(rev / txns), station: stations[i % 3] });
    chartData.push({ label: dateStr, value: rev });
  }

  return {
    rows,
    chartData,
    summary: {
      totalRevenue,
      totalTransactions,
      avgTicket: totalTransactions ? Math.round(totalRevenue / totalTransactions) : 0,
      activeMeters: 247 + Math.floor(Math.random() * 50),
      revenueDelta: +(8 + Math.random() * 12).toFixed(1),
      transactionDelta: +(3 + Math.random() * 8).toFixed(1),
      avgTicketDelta: +(-2 + Math.random() * 6).toFixed(1)
    }
  };
}

function generateDemoWalletReport(dateRange) {
  const types = ["funding_credit", "purchase_capture", "hold_placement", "hold_release", "manual_credit", "refund_adjustment"];
  const descs = ["Wallet top-up", "Token purchase — Meter 32814", "Hold for vend order", "Released hold — failed delivery", "Admin credit adjustment", "Refund posted"];
  const rows = [];
  const chartData = [];
  let balance = 5000000;

  for (let i = 0; i < 20; i++) {
    const d = new Date(dateRange.start);
    d.setDate(d.getDate() + Math.floor(i / 3));
    const amount = (500 + Math.floor(Math.random() * 10000)) * 100;
    const isCredit = i % 3 === 0;
    balance += isCredit ? amount : -amount;
    rows.push({
      date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
      type: types[i % types.length],
      description: descs[i % descs.length],
      amount: isCredit ? amount : -amount,
      balance,
      wallet: `WLT-${String(1000 + (i % 5)).slice(-4)}`
    });
  }

  for (let i = 0; i < 7; i++) {
    const d = new Date(dateRange.start);
    d.setDate(d.getDate() + i);
    chartData.push({ label: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), value: (20000 + Math.floor(Math.random() * 80000)) * 100 });
  }

  return {
    rows,
    chartData,
    summary: {
      totalBalance: balance,
      fundingVolume: 450000 * 100,
      purchaseVolume: 320000 * 100,
      activeWallets: 12,
      fundingDelta: 15.3,
      purchaseDelta: 8.7
    }
  };
}

function generateDemoCustomerReport() {
  const rows = [];
  const chartData = [];
  const names = ["Adebayo Motors", "Lagos Water Corp", "Ikeja Electric HQ", "Unilag Faculty", "Eko Hotels", "First Bank Branch", "LUTH Complex", "VGC Estate", "Lekki Phase 1 Mall", "Ikoyi Club"];
  const stations = ["Station A", "Station B", "Station C"];

  for (let i = 0; i < 10; i++) {
    const consumption = 800 + Math.floor(Math.random() * 4000);
    rows.push({
      customerId: `CST-${String(1000 + i).slice(-4)}`,
      customerName: names[i],
      meterId: `MTR-${String(20000 + i * 7).slice(-5)}`,
      consumption,
      lastPurchase: new Date(Date.now() - Math.random() * 30 * 86400000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      station: stations[i % 3]
    });
  }

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  for (const m of months) {
    chartData.push({ label: m, value: 15000 + Math.floor(Math.random() * 10000) });
  }

  return {
    rows,
    chartData,
    summary: { totalCustomers: 247, totalConsumption: 48320, avgMonthly: 8053, zeroUsage: 12, customerDelta: 3.2, avgDelta: -1.5 }
  };
}

function generateDemoAuditReport() {
  const actions = ["login", "generate_token", "create_customer", "approve_funding", "freeze_wallet", "export_data", "change_password", "update_tariff"];
  const actors = ["admin", "ops_manager", "account_officer", "finance_checker"];
  const roles = ["super-admin", "operations-manager", "account", "finance-checker"];
  const rows = [];
  const actionCounts = {};

  for (let i = 0; i < 25; i++) {
    const action = actions[i % actions.length];
    actionCounts[action] = (actionCounts[action] || 0) + 1;
    const d = new Date();
    d.setMinutes(d.getMinutes() - i * 47);
    rows.push({
      timestamp: d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
      actor: actors[i % actors.length],
      role: roles[i % roles.length],
      action,
      target: `Resource-${1000 + i}`,
      status: i % 7 === 0 ? "failed" : "success",
      ip: `192.168.1.${100 + (i % 20)}`
    });
  }

  const chartData = Object.entries(actionCounts).map(([label, value]) => ({ label, value }));

  return {
    rows,
    chartData,
    summary: { totalEvents: 25, writeOps: 15, uniqueUsers: 4, failures: 3 }
  };
}

function generateDemoSettlementReport() {
  const rows = [];
  const chartData = [];
  const statuses = ["settled", "pending", "settled", "settled", "processing"];

  for (let i = 0; i < 5; i++) {
    const purchases = (100000 + Math.floor(Math.random() * 500000)) * 100;
    const funding = (80000 + Math.floor(Math.random() * 400000)) * 100;
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    const periodEnd = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    rows.push({
      batchRef: `STL-${String(2000 + i).slice(-4)}`,
      period: `Week ending ${periodEnd}`,
      purchases,
      funding,
      net: purchases - funding,
      status: statuses[i]
    });
    chartData.push({ label: periodEnd, purchases, funding });
  }

  return {
    rows,
    chartData,
    summary: { totalSettled: 2450000 * 100, pending: 320000 * 100, batchCount: 5, failedCount: 0 }
  };
}
