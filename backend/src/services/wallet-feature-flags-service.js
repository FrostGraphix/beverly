"use strict";

function nowIso() { return new Date().toISOString(); }

const flagStore = new Map();

function seedDefaults() {
  if (flagStore.size > 0) return;
  const defaults = [
    { key: "wallet.vending.enabled",        description: "Enable wallet-based vending for vendors",       enabled: true,  rollout_percent: 100, regions: [] },
    { key: "wallet.funding.bank_transfer",   description: "Allow bank transfer as a funding channel",      enabled: true,  rollout_percent: 100, regions: [] },
    { key: "wallet.funding.paystack",        description: "Allow Paystack online funding channel",         enabled: false, rollout_percent: 0,   regions: [] },
    { key: "wallet.refunds.self_service",    description: "Allow vendors to request refunds directly",     enabled: true,  rollout_percent: 100, regions: [] },
    { key: "eih.fraud.auto_flag",            description: "Auto-flag EIH anomalies in fraud engine",       enabled: true,  rollout_percent: 100, regions: [] },
    { key: "settlement.auto_batch",          description: "Automatically generate daily settlement batches", enabled: false, rollout_percent: 0, regions: [] },
  ];
  for (const d of defaults) {
    flagStore.set(d.key, { ...d, created_at: nowIso(), updated_at: nowIso() });
  }
}

seedDefaults();

function listFlags() {
  return Array.from(flagStore.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function getFlag(key) {
  const k = String(key || "").trim().toLowerCase();
  return flagStore.get(k) || null;
}

function createFlag({ key, description }) {
  const k = String(key || "").trim().toLowerCase();
  if (!k || !description) throw new Error("key and description are required");
  if (!/^[a-z0-9._-]+$/.test(k)) throw new Error("key must be lowercase alphanumeric with dots/dashes only");
  if (flagStore.has(k)) throw new Error(`Flag '${k}' already exists`);
  const flag = { key: k, description: String(description).trim(), enabled: false, rollout_percent: 0, regions: [], created_at: nowIso(), updated_at: nowIso() };
  flagStore.set(k, flag);
  return flag;
}

function updateFlag(key, { enabled, rollout_percent, regions }) {
  const k = String(key || "").trim().toLowerCase();
  const flag = flagStore.get(k);
  if (!flag) throw new Error(`Flag '${k}' not found`);
  if (enabled !== undefined) flag.enabled = Boolean(enabled);
  if (rollout_percent !== undefined) flag.rollout_percent = Math.max(0, Math.min(100, Number(rollout_percent) || 0));
  if (Array.isArray(regions)) flag.regions = regions.map(String).filter(Boolean);
  flag.updated_at = nowIso();
  return flag;
}

module.exports = { listFlags, getFlag, createFlag, updateFlag };
