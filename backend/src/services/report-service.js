/**
 * report-service.js — Backend report aggregation service.
 * Owns: querying wallet, funding, purchase data and building report payloads.
 * Used by: api/reference.js report endpoints.
 * Depends on: wallet-ledger-service.js, wallet-funding-service.js, wallet-purchase-service.js
 */

const { ensureDatabase } = require("./local-database");
const supabase = require("./supabase-service");
const consumptionStore = require("./consumption-store");

const liveTokenPath = "/api/token/creditTokenRecord/readMore";

function liveApiBaseUrl() {
  return String(process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL || "").replace(/\/+$/, "");
}

function usesShortLiveRange(start, end) {
  const duration = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(duration) && duration >= 0 && duration <= 31 * 86400000;
}

function reportStationDatabaseId(stationId) {
  const value = String(stationId || "").trim().toLowerCase();
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : "";
}

async function liveStationIds(baseUrl, token) {
  const response = await fetch(`${baseUrl}/api/station/read`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ pageNumber: 1, pageSize: 500 })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.reason || body.msg || `Live station request failed: ${response.status}`);
  const rows = [body?.result?.list, body?.data?.list, body?.result?.data, body?.data?.data, body?.result, body?.data]
    .find(Array.isArray) || [];
  const stationIds = [...new Set(rows
    .map((row) => String(row?.stationId || row?.station_id || row?.id || "").trim().toUpperCase())
    .filter((stationId) => stationId && stationId !== "ADMIN"))];
  if (!stationIds.length) throw new Error("Live station directory returned no stations");
  return stationIds;
}

async function liveTokenPayments(start, end, filters = {}) {
  const baseUrl = liveApiBaseUrl();
  if (!baseUrl || !usesShortLiveRange(start, end)) return null;
  const token = process.env.LIVE_API_BEARER_TOKEN || process.env.UPSTREAM_BEARER_TOKEN || "";
  const stationIds = filters.stationId ? [filters.stationId] : await liveStationIds(baseUrl, token);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const batches = await Promise.all(stationIds.map(async (stationId) => {
      const url = new URL(`${baseUrl}${liveTokenPath}`);
      url.searchParams.set("FROM", start);
      url.searchParams.set("TO", end);
      url.searchParams.set("SITE_ID", stationId);
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        signal: controller.signal
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.reason || body.msg || `Live report request failed: ${response.status}`);
      const rows = Array.isArray(body.payments) ? body.payments : [];
      if (!rows.length && Array.isArray(body.errors) && body.errors.length) throw new Error(`Live report source failed for ${stationId}`);
      return rows.map((row) => ({ ...row, reportStationId: stationId }));
    }));
    return batches.flat();
  } finally {
    clearTimeout(timeout);
  }
}

function liveRevenueReport(payments, stationId = "") {
  const byDate = new Map();
  const meters = new Set();
  const activeStations = new Set();
  for (const payment of payments) {
    const date = String(payment.timestamp || "").slice(0, 10);
    if (!date) continue;
    const station = payment.reportStationId || stationId;
    if (station) activeStations.add(station);
    const current = byDate.get(date) || { date, transactions: 0, revenue: 0, meters: new Set() };
    current.transactions += 1;
    current.revenue += Math.round((Number(payment.amount) || 0) * 100);
    const meter = payment.meterId || payment.serialNumber || "";
    if (meter) {
      current.meters.add(meter);
      meters.add(`${station}:${meter}`);
    }
    byDate.set(date, current);
  }
  const rows = Array.from(byDate.values())
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((row) => ({
      date: row.date,
      transactions: row.transactions,
      revenue: row.revenue,
      avgTicket: row.transactions ? Math.round(row.revenue / row.transactions) : 0,
      station: stationId || "All Stations"
    }));
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalTransactions = rows.reduce((sum, row) => sum + row.transactions, 0);
  return {
    rows,
    chartData: rows.map((row) => ({ label: row.date, value: row.revenue })),
    summary: {
      totalRevenue,
      totalTransactions,
      avgTicket: totalTransactions ? Math.round(totalRevenue / totalTransactions) : 0,
      meters: meters.size,
      activeStations: activeStations.size,
      revenueDelta: 0,
      transactionDelta: 0,
      avgTicketDelta: 0
    }
  };
}

function liveTransactionReport(payments, stationId = "") {
  const rows = payments.map((payment) => ({
    date: String(payment.timestamp || "").replace("T", " ").slice(0, 16),
    meter: payment.meterId || payment.serialNumber || "-",
    station: payment.reportStationId || stationId || "All Stations",
    customer: payment.customerId || "-",
    amount: Math.round((Number(payment.amount) || 0) * 100),
    kwh: Number(payment.transactionKwh) || 0
  })).sort((left, right) => right.date.localeCompare(left.date));
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
  const totalKwh = rows.reduce((sum, row) => sum + row.kwh, 0);
  return {
    rows,
    chartData: rows.slice().reverse().map((row) => ({ label: row.date.slice(0, 10), value: row.amount })),
    summary: {
      totalAmount,
      totalTransactions: rows.length,
      totalKwh: Math.round(totalKwh * 1000) / 1000,
      uniqueMeters: new Set(rows.filter((row) => row.meter !== "-").map((row) => `${row.station}:${row.meter}`)).size
    }
  };
}

async function supabaseRows(table, dateColumn, start, end, select = "*", equals = {}) {
  const filters = [`select=${select}`];
  if (start) filters.push(`${dateColumn}=gte.${encodeURIComponent(start)}`);
  if (end) filters.push(`${dateColumn}=lte.${encodeURIComponent(end)}`);
  for (const [column, value] of Object.entries(equals)) {
    if (value) filters.push(`${column}=eq.${encodeURIComponent(value)}`);
  }
  filters.push(`order=${dateColumn}.asc`);
  const pathname = `/${table}?${filters.join("&")}`;
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { body } = await supabase.restRequestWithResponse(pathname, {
      headers: { Range: `${offset}-${offset + pageSize - 1}` }
    });
    const page = Array.isArray(body) ? body : [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function objectValue(value) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}

function tokenSummaryReport(rows, previousRows, meterRows) {
  const byDate = new Map();
  for (const row of rows) {
    const date = row.tx_date;
    const current = byDate.get(date) || { date, transactions: 0, revenue: 0, meters: 0, station: "All Stations" };
    current.transactions += Number(row.tx_count) || 0;
    current.revenue += Math.round((Number(row.total_revenue) || 0) * 100);
    current.meters += Number(row.unique_meters) || 0;
    byDate.set(date, current);
  }
  const reportRows = Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date));
  const totalRevenue = reportRows.reduce((sum, row) => sum + row.revenue, 0);
  const totalTransactions = reportRows.reduce((sum, row) => sum + row.transactions, 0);
  const previousRevenue = previousRows.reduce((sum, row) => sum + Math.round((Number(row.total_revenue) || 0) * 100), 0);
  const previousTransactions = previousRows.reduce((sum, row) => sum + (Number(row.tx_count) || 0), 0);
  const avgTicket = totalTransactions ? Math.round(totalRevenue / totalTransactions) : 0;
  const previousAvg = previousTransactions ? Math.round(previousRevenue / previousTransactions) : 0;
  const meters = new Set();
  const activeStations = new Set();
  for (const row of meterRows) {
    const station = String(row.site_code || row.site_id || "").toUpperCase();
    const meter = row.meter_id || row.meter_sn || "";
    if (station) activeStations.add(station);
    if (station && meter) meters.add(`${station}:${meter}`);
  }
  const delta = (current, previous) => previous ? Math.round(((current - previous) / previous) * 1000) / 10 : 0;
  return {
    rows: reportRows,
    chartData: reportRows.map((row) => ({ label: row.date, value: row.revenue })),
    summary: {
      totalRevenue,
      totalTransactions,
      avgTicket,
      meters: meters.size,
      activeStations: activeStations.size,
      revenueDelta: delta(totalRevenue, previousRevenue),
      transactionDelta: delta(totalTransactions, previousTransactions),
      avgTicketDelta: delta(avgTicket, previousAvg)
    }
  };
}

function isMemory(db) {
  return Boolean(db?.memoryStore);
}

/* ── Revenue Report ── */

async function revenueReport(dateRange = {}, filters = {}) {
  const start = dateRange.start || new Date(Date.now() - 30 * 86400000).toISOString();
  const end = dateRange.end || new Date().toISOString();

  const livePayments = await liveTokenPayments(start, end, filters);
  if (livePayments) return liveRevenueReport(livePayments, filters.stationId);

  let startMs = new Date(start).getTime();
  let endMs = new Date(end).getTime();
  if (isNaN(startMs)) startMs = Date.now() - 30 * 86400000;
  if (isNaN(endMs)) endMs = Date.now();
  const duration = endMs - startMs;
  const prevStart = new Date(startMs - duration).toISOString();
  const prevEnd = start;

  if (supabase.serviceConfigured()) {
    const select = "site_id,tx_date,tx_count,total_revenue,total_kwh,unique_meters";
    const stationFilter = filters.stationId ? { site_id: reportStationDatabaseId(filters.stationId) } : {};
    const [currentRows, previousRows, meterRows] = await Promise.all([
      supabaseRows("mv_token_daily_summary", "tx_date", start.slice(0, 10), end.slice(0, 10), select, stationFilter),
      supabaseRows("mv_token_daily_summary", "tx_date", prevStart.slice(0, 10), prevEnd.slice(0, 10), select, stationFilter),
      supabaseRows("token_transactions", "transaction_at", start, end, "site_id,site_code,meter_id,meter_sn", stationFilter)
    ]);
    return tokenSummaryReport(currentRows, previousRows, meterRows);
  }

  const db = ensureDatabase();

  const currentData = getRevenueStats(db, start, end, filters.stationId);
  const prevData = getRevenueStats(db, prevStart, prevEnd, filters.stationId);

  const rows = [];
  const chartData = [];
  let totalRevenue = 0;
  let totalTransactions = 0;

  for (const day of currentData) {
    totalRevenue += day.revenue;
    totalTransactions += day.transactions;
    rows.push({
      date: day.date,
      transactions: day.transactions,
      revenue: day.revenue,
      avgTicket: day.transactions ? Math.round(day.revenue / day.transactions) : 0,
      station: day.station
    });
    chartData.push({ label: day.date, value: day.revenue });
  }

  const prevRevenue = prevData.reduce((sum, d) => sum + d.revenue, 0);
  const prevTransactions = prevData.reduce((sum, d) => sum + d.transactions, 0);
  const prevAvgTicket = prevTransactions ? Math.round(prevRevenue / prevTransactions) : 0;

  const revenueDelta = prevRevenue ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 1000) / 10 : 0;
  const transactionDelta = prevTransactions ? Math.round(((totalTransactions - prevTransactions) / prevTransactions) * 1000) / 10 : 0;
  const avgTicket = totalTransactions ? Math.round(totalRevenue / totalTransactions) : 0;
  const avgTicketDelta = prevAvgTicket ? Math.round(((avgTicket - prevAvgTicket) / prevAvgTicket) * 1000) / 10 : 0;

  let meters = 0;
  if (isMemory(db)) {
    const meterIds = new Set(
      (db.memoryStore.wallet_purchase_orders || [])
        .filter(p => p.createdAt >= start && p.createdAt <= end)
        .map(p => p.targetMeter)
    );
    meters = meterIds.size;
  } else {
    try {
      const row = db.prepare(`SELECT count(distinct target_meter) as count FROM wallet_purchase_orders WHERE created_at >= ? AND created_at <= ?`).get(start, end);
      meters = row?.count || 0;
    } catch {
      meters = 0;
    }
  }

  return {
    rows,
    chartData,
    summary: {
      totalRevenue,
      totalTransactions,
      avgTicket,
      meters,
      activeStations: new Set(currentData.map((row) => row.station).filter((station) => station && station !== "All Stations")).size,
      revenueDelta,
      transactionDelta,
      avgTicketDelta
    }
  };
}

async function transactionReport(dateRange = {}, filters = {}) {
  const start = dateRange.start || new Date(Date.now() - 30 * 86400000).toISOString();
  const end = dateRange.end || new Date().toISOString();
  const livePayments = await liveTokenPayments(start, end, filters);
  if (livePayments) return liveTransactionReport(livePayments, filters.stationId);
  if (!supabase.serviceConfigured()) return revenueReport(dateRange, filters);
  const stationFilter = filters.stationId ? { site_id: reportStationDatabaseId(filters.stationId) } : {};
  const source = await supabaseRows(
    "token_transactions",
    "transaction_at",
    start,
    end,
    "id,meter_sn,meter_id,site_id,site_code,customer_name,amount,kwh,transaction_at",
    stationFilter
  );
  const rows = source.map((row) => ({
    date: String(row.transaction_at || "").replace("T", " ").slice(0, 16),
    meter: row.meter_sn || row.meter_id || "-",
    station: String(row.site_code || row.site_id || "-").toUpperCase(),
    customer: row.customer_name || "-",
    amount: Math.round((Number(row.amount) || 0) * 100),
    kwh: Number(row.kwh) || 0
  })).reverse();
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
  const totalKwh = rows.reduce((sum, row) => sum + row.kwh, 0);
  return {
    rows,
    chartData: rows.slice().reverse().map((row) => ({ label: row.date.slice(0, 10), value: row.amount })),
    summary: {
      totalAmount,
      totalTransactions: rows.length,
      totalKwh: Math.round(totalKwh * 1000) / 1000,
      uniqueMeters: new Set(rows.filter((row) => row.meter !== "-").map((row) => `${row.station}:${row.meter}`)).size
    }
  };
}

function getRevenueStats(db, start, end, stationId) {
  if (isMemory(db)) {
    const list = db.memoryStore.wallet_purchase_orders || [];
    const filtered = list.filter(p => p.createdAt >= start && p.createdAt <= end);
    const groups = {};
    for (const p of filtered) {
      const dateStr = p.createdAt.slice(0, 10);
      const station = p.detail?.station || p.detail?.stationId || "Station A";
      if (stationId && station !== stationId) continue;
      const groupKey = stationId ? dateStr : `${dateStr}_${station}`;
      if (!groups[groupKey]) {
        groups[groupKey] = { date: dateStr, transactions: 0, revenue: 0, station };
      }
      groups[groupKey].transactions += 1;
      if (p.status === "delivered") {
        groups[groupKey].revenue += p.amountMinor;
      }
    }
    return Object.values(groups).sort((a, b) => a.date.localeCompare(b.date));
  } else {
    try {
      let sql, args;
      if (stationId) {
        sql = `
          SELECT 
            substr(created_at, 1, 10) as date,
            count(*) as transactions,
            sum(case when status = 'delivered' then amount_minor else 0 end) as revenue,
            ? as station
          FROM wallet_purchase_orders
          WHERE created_at >= ? AND created_at <= ? AND COALESCE(json_extract(detail_json, '$.station'), 'Station A') = ?
          GROUP BY date
          ORDER BY date ASC
        `;
        args = [stationId, start, end, stationId];
      } else {
        sql = `
          SELECT 
            substr(created_at, 1, 10) as date,
            count(*) as transactions,
            sum(case when status = 'delivered' then amount_minor else 0 end) as revenue,
            'All Stations' as station
          FROM wallet_purchase_orders
          WHERE created_at >= ? AND created_at <= ?
          GROUP BY date
          ORDER BY date ASC
        `;
        args = [start, end];
      }
      return db.prepare(sql).all(...args);
    } catch {
      return [];
    }
  }
}

/* ── Wallet Report ── */

async function walletReport(dateRange = {}, filters = {}) {
  const start = dateRange.start || new Date(Date.now() - 30 * 86400000).toISOString();
  const end = dateRange.end || new Date().toISOString();

  let startMs = new Date(start).getTime();
  let endMs = new Date(end).getTime();
  if (isNaN(startMs)) startMs = Date.now() - 30 * 86400000;
  if (isNaN(endMs)) endMs = Date.now();
  const duration = endMs - startMs;
  const prevStart = new Date(startMs - duration).toISOString();
  const prevEnd = start;

  let db;
  if (supabase.serviceConfigured()) {
    const [ledger, funding, purchases] = await Promise.all([
      supabaseRows("wallet_ledger_entries", "created_at", null, end, "*"),
      supabaseRows("wallet_funding_requests", "created_at", prevStart, end, "*"),
      supabaseRows("wallet_purchase_orders", "created_at", prevStart, end, "*")
    ]);
    db = { memoryStore: {
      wallet_ledger_entries: ledger.map((row) => ({ ...row, walletId: row.wallet_id, entryType: row.entry_type, amountMinor: Number(row.amount_minor) || 0, createdAt: row.created_at, detail: objectValue(row.detail_json) })),
      wallet_funding_requests: funding.map((row) => ({ ...row, amountMinor: Number(row.amount_minor) || 0, verifiedAmountMinor: Number(row.verified_amount_minor) || 0, createdAt: row.created_at })),
      wallet_purchase_orders: purchases.map((row) => ({ ...row, amountMinor: Number(row.amount_minor) || 0, createdAt: row.created_at }))
    } };
  } else {
    db = ensureDatabase();
  }

  let entries = [];
  if (isMemory(db)) {
    entries = (db.memoryStore.wallet_ledger_entries || [])
      .filter(e => e.createdAt >= start && e.createdAt <= end);
  } else {
    try {
      entries = db.prepare(`SELECT * FROM wallet_ledger_entries WHERE created_at >= ? AND created_at <= ? ORDER BY created_at ASC`).all(start, end);
    } catch {
      entries = [];
    }
  }

  let balance = 0;
  if (isMemory(db)) {
    const prevEntries = (db.memoryStore.wallet_ledger_entries || [])
      .filter(e => e.createdAt < start);
    for (const e of prevEntries) {
      balance += e.direction === "credit" ? e.amountMinor : -e.amountMinor;
    }
  } else {
    try {
      const row = db.prepare(`
        SELECT sum(case when direction = 'credit' then amount_minor else -amount_minor end) as balance 
        FROM wallet_ledger_entries 
        WHERE created_at < ?
      `).get(start);
      balance = row?.balance || 0;
    } catch {
      balance = 0;
    }
  }

  const rows = [];
  const chartData = [];
  const dailyChart = {};
  for (const e of entries) {
    const amt = e.direction === "credit" ? e.amountMinor : -e.amountMinor;
    balance += amt;
    const dateStr = e.createdAt.replace("T", " ").slice(0, 16);
    let details = {};
    if (isMemory(db)) {
      details = e.detail || {};
    } else {
      try {
        details = JSON.parse(e.detail_json || "{}");
      } catch {
        details = {};
      }
    }
    rows.push({
      date: dateStr,
      type: e.entryType || e.entry_type,
      description: details.description || details.reason || (e.direction === "credit" ? "Wallet top-up" : "Token purchase"),
      amount: amt,
      balance,
      wallet: e.walletId || e.wallet_id
    });

    const dayKey = e.createdAt.slice(0, 10);
    if (!dailyChart[dayKey]) dailyChart[dayKey] = 0;
    dailyChart[dayKey] += e.direction === "credit" ? e.amountMinor : 0;
  }

  const currentFunding = getFundingVolume(db, start, end);
  const currentPurchase = getPurchaseVolume(db, start, end);
  const prevFunding = getFundingVolume(db, prevStart, prevEnd);
  const prevPurchase = getPurchaseVolume(db, prevStart, prevEnd);

  const fundingDelta = prevFunding ? Math.round(((currentFunding - prevFunding) / prevFunding) * 1000) / 10 : 0;
  const purchaseDelta = prevPurchase ? Math.round(((currentPurchase - prevPurchase) / prevPurchase) * 1000) / 10 : 0;

  let activeWallets = 0;
  if (isMemory(db)) {
    const wallets = new Set((db.memoryStore.wallet_ledger_entries || []).map(e => e.walletId));
    activeWallets = wallets.size;
  } else {
    try {
      const row = db.prepare("SELECT count(distinct wallet_id) as count FROM wallet_ledger_entries").get();
      activeWallets = row?.count || 0;
    } catch {
      activeWallets = 0;
    }
  }

  const diff = new Date(end).getTime() - new Date(start).getTime();
  let days = Math.ceil(diff / 86400000);
  if (isNaN(days) || days <= 0) days = 7;
  for (let i = 0; i < days; i++) {
    const d = new Date(new Date(start).getTime() + i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    chartData.push({ label: dateStr, value: dailyChart[dateStr] || 0 });
  }

  return {
    rows: rows.reverse(),
    chartData,
    summary: {
      totalBalance: balance,
      fundingVolume: currentFunding,
      purchaseVolume: currentPurchase,
      activeWallets,
      fundingDelta,
      purchaseDelta
    }
  };
}

function getFundingVolume(db, start, end) {
  if (isMemory(db)) {
    return (db.memoryStore.wallet_funding_requests || [])
      .filter(f => f.createdAt >= start && f.createdAt <= end && f.status === "approved")
      .reduce((sum, f) => sum + (f.verifiedAmountMinor || f.amountMinor), 0);
  } else {
    try {
      const row = db.prepare(`SELECT sum(COALESCE(verified_amount_minor, amount_minor)) as sum FROM wallet_funding_requests WHERE created_at >= ? AND created_at <= ? AND status = 'approved'`).get(start, end);
      return row?.sum || 0;
    } catch {
      return 0;
    }
  }
}

function getPurchaseVolume(db, start, end) {
  if (isMemory(db)) {
    return (db.memoryStore.wallet_purchase_orders || [])
      .filter(p => p.createdAt >= start && p.createdAt <= end && p.status === "delivered")
      .reduce((sum, p) => sum + p.amountMinor, 0);
  } else {
    try {
      const row = db.prepare(`SELECT sum(amount_minor) as sum FROM wallet_purchase_orders WHERE created_at >= ? AND created_at <= ? AND status = 'delivered'`).get(start, end);
      return row?.sum || 0;
    } catch {
      return 0;
    }
  }
}

/* ── Customer Report ── */

async function customerReport(dateRange = {}, filters = {}) {
  const start = dateRange.start || new Date(Date.now() - 30 * 86400000).toISOString();
  const end = dateRange.end || new Date().toISOString();

  let startMs = new Date(start).getTime();
  let endMs = new Date(end).getTime();
  if (isNaN(startMs)) startMs = Date.now() - 30 * 86400000;
  if (isNaN(endMs)) endMs = Date.now();
  const duration = endMs - startMs;
  const prevStart = new Date(startMs - duration).toISOString();
  const prevEnd = start;

  if (supabase.serviceConfigured()) {
    const days = Math.max(1, Math.ceil(duration / 86400000));
    const granularity = days > 185 ? "monthly" : days > 45 ? "weekly" : "daily";
    const payload = (from, to) => ({ requestPayload: { from: from.slice(0, 10), to: to.slice(0, 10), granularity, stationId: filters.stationId || "" } });
    const [current, previous] = await Promise.all([
      consumptionStore.readDailyMeterSummary(payload(start, end)),
      consumptionStore.readDailyMeterSummary(payload(prevStart, prevEnd))
    ]);
    const data = current?.body?.data || {};
    const previousData = previous?.body?.data || {};
    const rows = (data.stationBar || []).map((row) => ({
      station: row.station,
      consumption: Number(row.totalKwh) || 0
    }));
    const totalConsumption = Number(data.consumedKwh) || 0;
    const previousConsumption = Number(previousData.consumedKwh) || 0;
    const meterCount = Number(data.meta?.meterCount) || 0;
    const previousMeters = Number(previousData.meta?.meterCount) || 0;
    const labels = data.temporal?.labels || [];
    const values = data.temporal?.kwhSeries || [];
    return {
      rows,
      chartData: labels.map((label, index) => ({ label, value: Number(values[index]) || 0 })),
      summary: {
        totalCustomers: meterCount,
        totalConsumption,
        avgMonthly: meterCount ? Math.round(totalConsumption / meterCount) : 0,
        zeroUsage: Math.max(0, meterCount - (Number(data.meta?.metersWithConsumption) || 0)),
        customerDelta: previousMeters ? Math.round(((meterCount - previousMeters) / previousMeters) * 1000) / 10 : 0,
        avgDelta: previousConsumption ? Math.round(((totalConsumption - previousConsumption) / previousConsumption) * 1000) / 10 : 0
      }
    };
  }

  const db = ensureDatabase();

  let currentReadings = [];
  if (isMemory(db)) {
    currentReadings = (db.memoryStore.daily_meter_readings || [])
      .filter(r => r.readingDate >= start.slice(0, 10) && r.readingDate <= end.slice(0, 10));
  } else {
    try {
      currentReadings = db.prepare(`SELECT * FROM daily_meter_readings WHERE reading_date >= ? AND reading_date <= ?`).all(start.slice(0, 10), end.slice(0, 10));
    } catch {
      currentReadings = [];
    }
  }

  const customerMap = {};
  for (const r of currentReadings) {
    const mid = r.meter_id || r.meterId;
    const cid = r.customer_id || r.customerId || mid;
    const name = r.customer_name || r.customerName || "Customer";
    const station = r.station_id || r.stationId || "Station A";
    const total1 = Number(r.total1);

    if (filters.stationId && station !== filters.stationId) continue;
    if (!customerMap[mid]) {
      customerMap[mid] = {
        customerId: cid,
        customerName: name,
        meterId: mid,
        readings: [],
        station
      };
    }
    if (Number.isFinite(total1)) {
      customerMap[mid].readings.push({ date: r.reading_date || r.readingDate, value: total1 });
    }
  }

  const rows = [];
  let totalConsumption = 0;
  let zeroUsage = 0;

  for (const mid in customerMap) {
    const c = customerMap[mid];
    c.readings.sort((a, b) => a.date.localeCompare(b.date));
    let consumption = 0;
    if (c.readings.length > 1) {
      consumption = c.readings[c.readings.length - 1].value - c.readings[0].value;
    } else if (c.readings.length === 1) {
      consumption = c.readings[0].value;
    }
    if (consumption <= 0) {
      zeroUsage += 1;
    }
    totalConsumption += consumption;
    const lastReadingDate = c.readings.length ? c.readings[c.readings.length - 1].date : "—";

    rows.push({
      customerId: c.customerId,
      customerName: c.customerName,
      meterId: c.meterId,
      consumption,
      lastPurchase: lastReadingDate,
      station: c.station
    });
  }

  let prevReadings = [];
  if (isMemory(db)) {
    prevReadings = (db.memoryStore.daily_meter_readings || [])
      .filter(r => r.readingDate >= prevStart.slice(0, 10) && r.readingDate <= prevEnd.slice(0, 10));
  } else {
    try {
      prevReadings = db.prepare(`SELECT * FROM daily_meter_readings WHERE reading_date >= ? AND reading_date <= ?`).all(prevStart.slice(0, 10), prevEnd.slice(0, 10));
    } catch {
      prevReadings = [];
    }
  }
  const prevCustomerMap = {};
  for (const r of prevReadings) {
    const mid = r.meter_id || r.meterId;
    const total1 = Number(r.total1);
    if (!prevCustomerMap[mid]) prevCustomerMap[mid] = [];
    if (Number.isFinite(total1)) prevCustomerMap[mid].push({ date: r.reading_date || r.readingDate, value: total1 });
  }
  let prevConsumption = 0;
  for (const mid in prevCustomerMap) {
    const readings = prevCustomerMap[mid].sort((a, b) => a.date.localeCompare(b.date));
    if (readings.length > 1) prevConsumption += (readings[readings.length - 1].value - readings[0].value);
    else if (readings.length === 1) prevConsumption += readings[0].value;
  }

  const customerCount = Object.keys(customerMap).length;
  const prevCustomerCount = Object.keys(prevCustomerMap).length;

  const customerDelta = prevCustomerCount ? Math.round(((customerCount - prevCustomerCount) / prevCustomerCount) * 1000) / 10 : 0;
  const avgMonthly = customerCount ? Math.round(totalConsumption / customerCount) : 0;
  const prevAvgMonthly = prevCustomerCount ? Math.round(prevConsumption / prevCustomerCount) : 0;
  const avgDelta = prevAvgMonthly ? Math.round(((avgMonthly - prevAvgMonthly) / prevAvgMonthly) * 1000) / 10 : 0;

  const chartMap = {};
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (const r of currentReadings) {
    const dateStr = r.reading_date || r.readingDate;
    if (!dateStr) continue;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;
    const mName = monthNames[date.getMonth()];
    if (!chartMap[mName]) chartMap[mName] = 0;
    chartMap[mName] += 1;
  }
  const chartData = monthNames.map(m => ({ label: m, value: chartMap[m] || 0 })).filter(c => c.value > 0);
  return {
    rows,
    chartData,
    summary: {
      totalCustomers: customerCount,
      totalConsumption,
      avgMonthly,
      zeroUsage,
      customerDelta,
      avgDelta
    }
  };
}

/* ── Audit Report ── */

async function auditReport(dateRange = {}, filters = {}) {
  const start = dateRange.start || new Date(Date.now() - 30 * 86400000).toISOString();
  const end = dateRange.end || new Date().toISOString();

  if (supabase.serviceConfigured()) {
    const source = await supabase.restRequest(`/audit_logs?select=user_id,actor_user_id,action,resource,resource_id,entity_type,entity_id,ip_address,source,created_at&created_at=gte.${encodeURIComponent(start)}&created_at=lte.${encodeURIComponent(end)}&order=created_at.desc&limit=500`);
    const actionCounts = {};
    const users = new Set();
    const rows = source.map((row) => {
      const action = row.action || "unknown";
      const actor = row.user_id || row.actor_user_id || "system";
      actionCounts[action] = (actionCounts[action] || 0) + 1;
      users.add(actor);
      return {
        timestamp: String(row.created_at || "").replace("T", " ").slice(0, 16),
        actor,
        role: "system",
        action,
        target: row.resource_id || row.entity_id || row.resource || row.entity_type || "system",
        status: "recorded",
        ip: row.ip_address || row.source || "-"
      };
    });
    return {
      rows,
      chartData: Object.entries(actionCounts).map(([label, value]) => ({ label, value })),
      summary: {
        totalEvents: rows.length,
        writeOps: rows.filter((row) => /create|update|delete|write|approve|reject|refund/i.test(row.action)).length,
        uniqueUsers: users.size,
        failures: rows.filter((row) => /fail|error|reject/i.test(row.action)).length
      }
    };
  }

  const db = ensureDatabase();

  let logs = [];
  if (isMemory(db)) {
    logs = (db.memoryStore.audit_logs || [])
      .filter(l => l.createdAt >= start && l.createdAt <= end);
  } else {
    try {
      logs = db.prepare(`SELECT * FROM audit_logs WHERE created_at >= ? AND created_at <= ? ORDER BY created_at DESC`).all(start, end);
    } catch {
      logs = [];
    }
  }

  const rows = [];
  const actionCounts = {};
  const uniqueUsers = new Set();
  let writeOps = 0;
  let failures = 0;

  for (const l of logs) {
    let details = {};
    if (isMemory(db)) {
      details = l.details || {};
    } else {
      try {
        details = JSON.parse(l.detail_json || "{}");
      } catch {
        details = {};
      }
    }
    const actor = details.userId || details.userName || details.actor || "system";
    const role = details.role || "system";
    const action = l.method + " " + l.path;
    const target = details.target || "system";
    const status = l.outcome;
    const ip = details.ip || l.proxySource || "127.0.0.1";

    uniqueUsers.add(actor);
    actionCounts[l.method] = (actionCounts[l.method] || 0) + 1;
    if (["POST", "PUT", "DELETE", "PATCH"].includes(l.method)) {
      writeOps += 1;
    }
    if (status === "failed" || String(l.statusCode).startsWith("4") || String(l.statusCode).startsWith("5")) {
      failures += 1;
    }

    rows.push({
      timestamp: String(l.createdAt || l.created_at || "").replace("T", " ").slice(0, 16),
      actor,
      role,
      action,
      target,
      status,
      ip
    });
  }

  const chartData = Object.entries(actionCounts).map(([label, value]) => ({ label, value }));

  return {
    rows,
    chartData,
    summary: {
      totalEvents: logs.length,
      writeOps,
      uniqueUsers: uniqueUsers.size,
      failures
    }
  };
}

async function disputeReport(dateRange = {}, filters = {}) {
  const start = dateRange.start || new Date(Date.now() - 30 * 86400000).toISOString();
  const end = dateRange.end || new Date().toISOString();
  if (!supabase.serviceConfigured()) return settlementReport(dateRange, filters);
  const source = await supabaseRows("disputes", "created_at", start, end, "id,reference,subject,status,created_at,resolved_at");
  const rows = source.map((row) => ({
    reference: row.reference,
    subject: row.subject,
    status: row.status,
    createdAt: String(row.created_at || "").replace("T", " ").slice(0, 16),
    resolvedAt: row.resolved_at ? String(row.resolved_at).replace("T", " ").slice(0, 16) : "-"
  })).reverse();
  const counts = rows.reduce((result, row) => ({ ...result, [row.status]: (result[row.status] || 0) + 1 }), {});
  return {
    rows,
    chartData: Object.entries(counts).map(([label, value]) => ({ label, value })),
    summary: {
      totalDisputes: rows.length,
      openDisputes: (counts.open || 0) + (counts.under_review || 0),
      resolvedDisputes: (counts.resolved || 0) + (counts.refund_issued || 0),
      rejectedDisputes: counts.rejected || 0
    }
  };
}

/* ── Settlement Report ── */

async function settlementReport(dateRange = {}, filters = {}) {
  const db = ensureDatabase();
  const start = dateRange.start || new Date(Date.now() - 30 * 86400000).toISOString();
  const end = dateRange.end || new Date().toISOString();

  let batches = [];
  if (isMemory(db)) {
    batches = (db.memoryStore.wallet_settlement_batches || [])
      .filter(b => b.createdAt >= start && b.createdAt <= end);
  } else {
    try {
      require("./wallet-settlement-service");
      batches = db.prepare(`SELECT * FROM wallet_settlement_batches WHERE created_at >= ? AND created_at <= ? ORDER BY created_at DESC`).all(start, end);
    } catch {
      batches = [];
    }
  }

  const rows = [];
  const chartData = [];
  let totalSettled = 0;
  let pending = 0;
  let failedCount = 0;

  for (const b of batches) {
    const purchases = Number(b.totalPurchaseMinor || b.total_purchase_minor || 0);
    const funding = Number(b.totalFundingMinor || b.total_funding_minor || 0);
    const net = Number(b.netMinor || b.net_minor || 0);
    const status = b.status;

    if (status === "settled") {
      totalSettled += net;
    } else if (status === "pending" || status === "processing") {
      pending += net;
    } else if (status === "failed") {
      failedCount += 1;
    }

    rows.push({
      batchRef: b.batchRef || b.batch_ref,
      period: `${b.periodStart || b.period_start} to ${b.periodEnd || b.period_end}`,
      purchases,
      funding,
      net,
      status
    });

    chartData.push({
      label: (b.createdAt || b.created_at).slice(0, 10),
      purchases,
      funding
    });
  }

  return {
    rows,
    chartData,
    summary: {
      totalSettled,
      pending,
      batchCount: batches.length,
      failedCount
    }
  };
}

module.exports = {
  revenueReport,
  transactionReport,
  walletReport,
  customerReport,
  auditReport,
  disputeReport,
  settlementReport
};
