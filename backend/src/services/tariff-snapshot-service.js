"use strict";

const supabase = require("./supabase-service");

const BATCH_SIZE = 500;
function text(value) {
  return String(value ?? "").trim();
}

function dateKey(value, fallback = new Date()) {
  const match = text(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : fallback.toISOString().slice(0, 10);
}

function parseTariffPrice(value) {
  const parts = text(value).split("~").map(Number).filter(Number.isFinite);
  const price = parts.length >= 3 ? parts[2] : parts[0];
  return Number.isFinite(price) && price > 0 ? price : null;
}

function collectionRows(payload) {
  const candidates = [payload?.result?.list, payload?.data?.list, payload?.result?.rows, payload?.data?.rows, payload?.result, payload?.data];
  return candidates.find(Array.isArray) || [];
}

async function upsertBatches(pathname, rows) {
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    await supabase.restRequest(pathname, {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: rows.slice(index, index + BATCH_SIZE)
    });
  }
}

function normalizeAccount(row, observedAt) {
  const stationId = text(row?.stationId || row?.station_id).toUpperCase();
  const meterId = text(row?.meterId || row?.meter_id);
  const customerId = text(row?.customerId || row?.customer_id);
  if (!stationId || !meterId || !customerId) return null;
  const sourceUpdatedAt = text(row?.updateDate || row?.update_date || row?.createDate || row?.create_date);
  return {
    current: {
      customer_id: customerId,
      meter_id: meterId,
      station_id: stationId,
      tariff_id: text(row?.tariffId || row?.tariff_id),
      detail_json: { customerName: text(row?.customerName || row?.customer_name) },
      source: "live-reference-sync"
    },
    history: {
      station_id: stationId,
      meter_id: meterId,
      customer_id: customerId,
      tariff_id: text(row?.tariffId || row?.tariff_id),
      effective_from: dateKey(sourceUpdatedAt, observedAt),
      source_updated_at: sourceUpdatedAt,
      observed_at: observedAt.toISOString(),
      source: "live-account-read"
    }
  };
}

function normalizeTariff(row, observedAt) {
  const tariffId = text(row?.tariffId || row?.tariff_id);
  if (!tariffId) return null;
  const rawPrice = text(row?.price);
  const unitPrice = parseTariffPrice(rawPrice);
  const taxPct = Number(row?.tax);
  const normalizedTax = Number.isFinite(taxPct) ? taxPct : 0;
  const effectivePrice = unitPrice === null ? null : Number((unitPrice * (1 + normalizedTax / 100)).toFixed(6));
  const sourceUpdatedAt = text(row?.updateDate || row?.update_date || row?.createDate || row?.create_date);
  const sourceStation = text(row?.stationId || row?.station_id).toUpperCase();
  return {
    station_scope: sourceStation && sourceStation !== "ADMIN" ? sourceStation : "*",
    tariff_id: tariffId,
    tariff_name: text(row?.tariffName || row?.tariff_name),
    raw_price: rawPrice,
    unit_price_ngn: unitPrice,
    tax_pct: normalizedTax,
    effective_price_ngn: effectivePrice,
    is_valid: effectivePrice !== null && effectivePrice > 0,
    effective_from: dateKey(sourceUpdatedAt, observedAt),
    source_updated_at: sourceUpdatedAt,
    observed_at: observedAt.toISOString(),
    source: "live-tariff-read"
  };
}

async function syncAccountRows(rows, options = {}) {
  if (!supabase.serviceConfigured()) return { current: 0, history: 0, skipped: true };
  const observedAt = options.observedAt instanceof Date ? options.observedAt : new Date(options.observedAt || Date.now());
  const normalized = rows.map((row) => normalizeAccount(row, observedAt)).filter(Boolean);
  await upsertBatches("/account_bindings?on_conflict=customer_id,meter_id", normalized.map((row) => row.current));
  await upsertBatches("/account_tariff_history?on_conflict=station_id,meter_id,effective_from", normalized.map((row) => row.history));
  return { current: normalized.length, history: normalized.length, skipped: false };
}

async function syncTariffRows(rows, options = {}) {
  if (!supabase.serviceConfigured()) return { history: 0, skipped: true };
  const observedAt = options.observedAt instanceof Date ? options.observedAt : new Date(options.observedAt || Date.now());
  const normalized = rows.map((row) => normalizeTariff(row, observedAt)).filter(Boolean);
  await upsertBatches("/tariff_rate_history?on_conflict=station_scope,tariff_id,effective_from", normalized);
  return { history: normalized.length, skipped: false };
}

async function syncReferenceRead(pathname, responsePayload, options = {}) {
  const normalizedPath = text(pathname).toLowerCase();
  const rows = collectionRows(responsePayload);
  if (normalizedPath.endsWith("/api/account/read")) return syncAccountRows(rows, options);
  if (normalizedPath.endsWith("/api/tariff/read")) return syncTariffRows(rows, options);
  return { skipped: true };
}

module.exports = {
  collectionRows,
  dateKey,
  normalizeAccount,
  normalizeTariff,
  parseTariffPrice,
  syncAccountRows,
  syncReferenceRead,
  syncTariffRows
};
