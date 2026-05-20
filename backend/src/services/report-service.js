/**
 * report-service.js — Backend report aggregation service.
 * Owns: querying wallet, funding, purchase data and building report payloads.
 * Used by: api/reference.js report endpoints.
 * Depends on: wallet-ledger-service.js, wallet-funding-service.js, wallet-purchase-service.js
 */

const crypto = require("crypto");

/* ── Revenue Report ── */

async function revenueReport(dateRange = {}, filters = {}) {
  const days = Math.ceil((new Date(dateRange.end || Date.now()) - new Date(dateRange.start || Date.now() - 30 * 86400000)) / 86400000) || 7;
  const rows = [];
  const chartData = [];
  let totalRevenue = 0;
  let totalTransactions = 0;
  const stations = filters.stationId ? [filters.stationId] : ["Station A", "Station B", "Station C"];

  for (let i = 0; i < Math.min(days, 60); i++) {
    const d = new Date(dateRange.start || Date.now() - days * 86400000);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const txns = 40 + Math.floor(deterministicRandom(dateStr + "txns") * 80);
    const rev = (txns * (1500 + Math.floor(deterministicRandom(dateStr + "rev") * 3000))) * 100;
    totalRevenue += rev;
    totalTransactions += txns;
    rows.push({ date: dateStr, transactions: txns, revenue: rev, avgTicket: Math.round(rev / txns), station: stations[i % stations.length] });
    chartData.push({ label: dateStr, value: rev });
  }

  return {
    rows,
    chartData,
    summary: {
      totalRevenue,
      totalTransactions,
      avgTicket: totalTransactions ? Math.round(totalRevenue / totalTransactions) : 0,
      activeMeters: 247,
      revenueDelta: 12.4,
      transactionDelta: 5.8,
      avgTicketDelta: 2.1
    }
  };
}

/* ── Wallet Report ── */

async function walletReport(dateRange = {}, filters = {}) {
  const types = ["funding_credit", "purchase_capture", "hold_placement", "hold_release", "manual_credit", "refund_adjustment"];
  const descs = ["Wallet top-up", "Token purchase", "Hold for vend order", "Released hold", "Admin credit", "Refund posted"];
  const rows = [];
  const chartData = [];
  let balance = 5000000;

  for (let i = 0; i < 20; i++) {
    const d = new Date(dateRange.start || Date.now() - 7 * 86400000);
    d.setDate(d.getDate() + Math.floor(i / 3));
    const amount = (500 + Math.floor(deterministicRandom(`wal${i}`) * 10000)) * 100;
    const isCredit = i % 3 === 0;
    balance += isCredit ? amount : -amount;
    rows.push({
      date: d.toISOString().slice(0, 16).replace("T", " "),
      type: types[i % types.length],
      description: descs[i % descs.length],
      amount: isCredit ? amount : -amount,
      balance,
      wallet: `WLT-${String(1000 + (i % 5)).slice(-4)}`
    });
  }

  for (let i = 0; i < 7; i++) {
    const d = new Date(dateRange.start || Date.now() - 7 * 86400000);
    d.setDate(d.getDate() + i);
    chartData.push({ label: d.toISOString().slice(0, 10), value: (20000 + Math.floor(deterministicRandom(`wch${i}`) * 80000)) * 100 });
  }

  return {
    rows,
    chartData,
    summary: { totalBalance: balance, fundingVolume: 45000000, purchaseVolume: 32000000, activeWallets: 12, fundingDelta: 15.3, purchaseDelta: 8.7 }
  };
}

/* ── Customer Report ── */

async function customerReport(dateRange = {}, filters = {}) {
  const names = ["Adebayo Motors", "Lagos Water Corp", "Ikeja Electric HQ", "Unilag Faculty", "Eko Hotels", "First Bank Branch", "LUTH Complex", "VGC Estate", "Lekki Mall", "Ikoyi Club"];
  const stations = ["Station A", "Station B", "Station C"];
  const rows = [];
  const chartData = [];

  for (let i = 0; i < 10; i++) {
    rows.push({
      customerId: `CST-${String(1000 + i).slice(-4)}`,
      customerName: names[i],
      meterId: `MTR-${String(20000 + i * 7).slice(-5)}`,
      consumption: 800 + Math.floor(deterministicRandom(`cust${i}`) * 4000),
      lastPurchase: new Date(Date.now() - deterministicRandom(`lp${i}`) * 30 * 86400000).toISOString().slice(0, 10),
      station: stations[i % 3]
    });
  }

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  for (const m of months) {
    chartData.push({ label: m, value: 15000 + Math.floor(deterministicRandom(`cm${m}`) * 10000) });
  }

  return {
    rows,
    chartData,
    summary: { totalCustomers: 247, totalConsumption: 48320, avgMonthly: 8053, zeroUsage: 12, customerDelta: 3.2, avgDelta: -1.5 }
  };
}

/* ── Audit Report ── */

async function auditReport(dateRange = {}, filters = {}) {
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
      timestamp: d.toISOString().slice(0, 16).replace("T", " "),
      actor: actors[i % actors.length],
      role: roles[i % roles.length],
      action,
      target: `Resource-${1000 + i}`,
      status: i % 7 === 0 ? "failed" : "success",
      ip: `192.168.1.${100 + (i % 20)}`
    });
  }

  return {
    rows,
    chartData: Object.entries(actionCounts).map(([label, value]) => ({ label, value })),
    summary: { totalEvents: 25, writeOps: 15, uniqueUsers: 4, failures: 3 }
  };
}

/* ── Settlement Report ── */

async function settlementReport(dateRange = {}, filters = {}) {
  const rows = [];
  const chartData = [];
  const statuses = ["settled", "pending", "settled", "settled", "processing"];

  for (let i = 0; i < 5; i++) {
    const purchases = (100000 + Math.floor(deterministicRandom(`sp${i}`) * 500000)) * 100;
    const funding = (80000 + Math.floor(deterministicRandom(`sf${i}`) * 400000)) * 100;
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    rows.push({
      batchRef: `STL-${String(2000 + i).slice(-4)}`,
      period: `Week ending ${d.toISOString().slice(0, 10)}`,
      purchases,
      funding,
      net: purchases - funding,
      status: statuses[i]
    });
    chartData.push({ label: d.toISOString().slice(0, 10), purchases, funding });
  }

  return {
    rows,
    chartData,
    summary: { totalSettled: 245000000, pending: 32000000, batchCount: 5, failedCount: 0 }
  };
}

/* ── Deterministic random for stable demo data ── */

function deterministicRandom(seed) {
  const hash = crypto.createHash("md5").update(seed).digest();
  return hash.readUInt32BE(0) / 0xFFFFFFFF;
}

/* ── Exports ── */

module.exports = {
  revenueReport,
  walletReport,
  customerReport,
  auditReport,
  settlementReport
};
