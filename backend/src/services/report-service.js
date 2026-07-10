/**
 * report-service.js — Backend report aggregation service.
 * Owns: querying wallet, funding, purchase data and building report payloads.
 * Used by: api/reference.js report endpoints.
 * Depends on: wallet-ledger-service.js, wallet-funding-service.js, wallet-purchase-service.js
 */

const crypto = require("crypto");
const { ensureDatabase } = require("./local-database");

function isMemory(db) {
  return Boolean(db?.memoryStore);
}

/* ── Revenue Report ── */

async function revenueReport(dateRange = {}, filters = {}) {
  const db = ensureDatabase();
  const start = dateRange.start || new Date(Date.now() - 30 * 86400000).toISOString();
  const end = dateRange.end || new Date().toISOString();

  let startMs = new Date(start).getTime();
  let endMs = new Date(end).getTime();
  if (isNaN(startMs)) startMs = Date.now() - 30 * 86400000;
  if (isNaN(endMs)) endMs = Date.now();
  const duration = endMs - startMs;
  const prevStart = new Date(startMs - duration).toISOString();
  const prevEnd = start;

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

  let activeMeters = 0;
  if (isMemory(db)) {
    const meters = new Set(
      (db.memoryStore.wallet_purchase_orders || [])
        .filter(p => p.createdAt >= start && p.createdAt <= end)
        .map(p => p.targetMeter)
    );
    activeMeters = meters.size;
  } else {
    try {
      const row = db.prepare(`SELECT count(distinct target_meter) as count FROM wallet_purchase_orders WHERE created_at >= ? AND created_at <= ?`).get(start, end);
      activeMeters = row?.count || 0;
    } catch {
      activeMeters = 0;
    }
  }

  return {
    rows,
    chartData,
    summary: {
      totalRevenue,
      totalTransactions,
      avgTicket,
      activeMeters,
      revenueDelta,
      transactionDelta,
      avgTicketDelta
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
  const db = ensureDatabase();
  const start = dateRange.start || new Date(Date.now() - 30 * 86400000).toISOString();
  const end = dateRange.end || new Date().toISOString();

  let startMs = new Date(start).getTime();
  let endMs = new Date(end).getTime();
  if (isNaN(startMs)) startMs = Date.now() - 30 * 86400000;
  if (isNaN(endMs)) endMs = Date.now();
  const duration = endMs - startMs;
  const prevStart = new Date(startMs - duration).toISOString();
  const prevEnd = start;

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
  const db = ensureDatabase();
  const start = dateRange.start || new Date(Date.now() - 30 * 86400000).toISOString();
  const end = dateRange.end || new Date().toISOString();

  let startMs = new Date(start).getTime();
  let endMs = new Date(end).getTime();
  if (isNaN(startMs)) startMs = Date.now() - 30 * 86400000;
  if (isNaN(endMs)) endMs = Date.now();
  const duration = endMs - startMs;
  const prevStart = new Date(startMs - duration).toISOString();
  const prevEnd = start;

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
  if (!chartData.length) {
    chartData.push({ label: "Jul", value: customerCount || 10 });
  }

  return {
    rows,
    chartData,
    summary: {
      totalCustomers: customerCount || 10,
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
  const db = ensureDatabase();
  const start = dateRange.start || new Date(Date.now() - 30 * 86400000).toISOString();
  const end = dateRange.end || new Date().toISOString();

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
      timestamp: l.createdAt.replace("T", " ").slice(0, 16),
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
  walletReport,
  customerReport,
  auditReport,
  settlementReport
};
