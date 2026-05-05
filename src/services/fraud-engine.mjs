/**
 * fraud-engine.mjs
 * Station-normalized risk scoring for bypass and theft signals.
 */

import { splitRevenueGap } from "./consumption-aggregator.mjs";

export const RISK_TIERS = [
  { min: 0, max: 30, label: "LOW", cls: "risk-low" },
  { min: 31, max: 60, label: "MEDIUM", cls: "risk-medium" },
  { min: 61, max: 80, label: "HIGH", cls: "risk-high" },
  { min: 81, max: 100, label: "CRITICAL", cls: "risk-critical" },
];

/**
 * @param {number} score
 * @returns {{ min: number, max: number, label: string, cls: string }}
 */
export function getRiskTier(score) {
  return RISK_TIERS.find((tier) => score >= tier.min && score <= tier.max) || RISK_TIERS[0];
}

/**
 * @param {Map<string, Array<Object>>} deltaMap
 * @returns {number}
 */
export function computeStationAvgDaily(deltaMap) {
  if (!deltaMap.size) return 1;
  let totalDelta = 0;
  let totalDays = 0;
  for (const deltas of deltaMap.values()) {
    for (const delta of deltas) {
      totalDelta += Number(delta.delta) || 0;
      totalDays++;
    }
  }
  const average = totalDays > 0 ? totalDelta / totalDays : 0;
  return Math.max(0.1, average);
}

/**
 * @param {Object} params
 * @param {Array<Object>} params.deltas
 * @param {Array<Object>} params.rechargeRecords
 * @param {number} params.effectivePrice
 * @param {number} params.stationAvgDaily
 * @returns {{ score: number, signals: Record<string, number>, tier: Object }}
 */
export function computeRiskScore({ deltas, rechargeRecords, effectivePrice, stationAvgDaily }) {
  const signals = { divergence: 0, tamper: 0, flatline: 0, gap: 0 };

  const sortedRecharges = [...rechargeRecords].sort((left, right) =>
    String(right.createDate || "").localeCompare(String(left.createDate || ""))
  );
  const lastRechargeDate = sortedRecharges[0]
    ? String(sortedRecharges[0].createDate || "").substring(0, 10)
    : null;

  if (lastRechargeDate) {
    const postRechargeConsumption = deltas
      .filter((delta) => delta.date > lastRechargeDate)
      .reduce((sum, delta) => sum + (Number(delta.delta) || 0), 0);

    if (postRechargeConsumption > 0) {
      const ratio = postRechargeConsumption / stationAvgDaily;
      signals.divergence = Math.min(40, Math.round(ratio * 5));
    }
  } else {
    const totalConsumed = deltas.reduce((sum, delta) => sum + (Number(delta.delta) || 0), 0);
    if (totalConsumed > 0) signals.divergence = 40;
  }

  const tamperDays = deltas.filter((delta) => delta.tamper).length;
  signals.tamper = Math.min(30, tamperDays * 5);

  let flatlineAfterTamper = 0;
  for (let index = 1; index < deltas.length; index++) {
    const current = deltas[index];
    const previous = deltas[index - 1];
    if ((Number(current.delta) || 0) === 0 && !current.relayOpen && previous.tamper) {
      flatlineAfterTamper++;
    }
  }
  signals.flatline = Math.min(20, flatlineAfterTamper * 4);

  const totalConsumed = deltas.reduce((sum, delta) => sum + (Number(delta.delta) || 0), 0);
  const totalPaid = rechargeRecords.reduce((sum, record) => sum + (Number(record.totalPaid) || 0), 0);
  const expectedPaid = totalConsumed * effectivePrice;
  if (expectedPaid > 0) {
    const shortfallRatio = Math.max(0, expectedPaid - totalPaid) / expectedPaid;
    signals.gap = Math.min(10, Math.round(shortfallRatio * 10));
  }

  const rawScore = signals.divergence + signals.tamper + signals.flatline + signals.gap;
  const score = Math.min(100, Math.max(0, rawScore));
  return { score, signals, tier: getRiskTier(score) };
}

/**
 * @param {Object} params
 * @param {Array<Object>} params.accounts
 * @param {Map<string, Array<Object>>} params.deltaMap
 * @param {Array<Object>} params.tokenRecords
 * @param {Map<string, { effectivePrice: number }>} params.tariffMap
 * @returns {Array<Object>}
 */
export function buildSuspectLedger({ accounts, deltaMap, tokenRecords, tariffMap }) {
  const stationAvgDaily = computeStationAvgDaily(deltaMap);

  const rechargeIndex = new Map();
  for (const record of tokenRecords) {
    const customerKey = String(record.customerId || record.userId || record.accountId || "").toUpperCase();
    const meterKey = String(record.meterId || "").toUpperCase();
    for (const key of [customerKey, meterKey]) {
      if (!key) continue;
      if (!rechargeIndex.has(key)) rechargeIndex.set(key, []);
      rechargeIndex.get(key).push(record);
    }
  }

  const nameIndex = new Map();
  for (const record of tokenRecords) {
    const customerKey = String(record.customerId || record.userId || "").toUpperCase();
    if (customerKey && record.customerName && !nameIndex.has(customerKey)) {
      nameIndex.set(customerKey, record.customerName);
    }
  }

  const ledger = [];

  for (const account of accounts) {
    const customerId = account.customerId;
    const customerKey = String(customerId || "").toUpperCase();
    const meterId = account.meterId;
    const meterKey = String(meterId || "").toUpperCase();
    const deltas = deltaMap.get(meterKey) || deltaMap.get(customerKey) || [];
    const recharges = rechargeIndex.get(customerKey) || rechargeIndex.get(meterKey) || [];
    const effectivePrice = tariffMap.get(String(account.tariffId || "").toUpperCase())?.effectivePrice ?? 350;

    const totalConsumed = parseFloat(deltas.reduce((sum, delta) => sum + (Number(delta.delta) || 0), 0).toFixed(3));
    const totalPaid = parseFloat(recharges.reduce((sum, record) => sum + (Number(record.totalPaid) || 0), 0).toFixed(2));
    const totalUnits = parseFloat(recharges.reduce((sum, record) => sum + (Number(record.totalUnit) || 0), 0).toFixed(3));
    const expectedPaid = parseFloat((totalConsumed * effectivePrice).toFixed(2));
    const { netGap, shortfallGap, creditGap } = splitRevenueGap(expectedPaid - totalPaid);

    const sortedRecharges = [...recharges].sort((left, right) =>
      String(right.createDate || "").localeCompare(String(left.createDate || ""))
    );
    const lastRecharge = sortedRecharges[0]
      ? String(sortedRecharges[0].createDate || "").substring(0, 10)
      : null;

    const { score, signals, tier } = computeRiskScore({
      deltas,
      rechargeRecords: recharges,
      effectivePrice,
      stationAvgDaily,
    });

    ledger.push({
      customerId,
      customerName: nameIndex.get(customerKey) || account.customerName || account.name || customerId,
      meterId,
      stationId: account.stationId,
      tariffId: account.tariffId,
      effectivePrice,
      totalConsumed,
      totalUnits,
      totalPaid,
      expectedPaid,
      rawGap: netGap,
      netGap,
      shortfallGap,
      creditGap,
      gap: shortfallGap,
      lastRecharge,
      rechargeCount: recharges.length,
      daysSinceRecharge: lastRecharge
        ? Math.floor((Date.now() - new Date(lastRecharge).getTime()) / 86400000)
        : null,
      riskScore: score,
      riskSignals: signals,
      riskTier: tier,
      deltas,
      recharges,
    });
  }

  return ledger.sort((left, right) => right.riskScore - left.riskScore || right.shortfallGap - left.shortfallGap);
}
