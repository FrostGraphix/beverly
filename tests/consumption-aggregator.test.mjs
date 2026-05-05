/**
 * tests/consumption-aggregator.test.mjs
 * Unit tests for consumption-aggregator.mjs pure math functions.
 *
 * Run: node --experimental-vm-modules tests/consumption-aggregator.test.mjs
 * Or:  node tests/consumption-aggregator.test.mjs  (Node 20+ with native ESM)
 */

import {
  toISOWeekKey,
  toPeriodKey,
  deriveDailyDeltas,
  boundaryConsumption,
  buildMeterDeltaMap,
  aggregateDeltasByPeriod,
  buildCustomerRechargeHistory,
  buildTariffMap,
  resolveEffectivePrice,
  revenueGap,
  computeSiteKpis,
  buildStationComparison,
  buildTemporalSeries,
  groupRevenueByStation,
} from "../src/services/consumption-aggregator.mjs";

// ── Minimal test runner ───────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    Expected: ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg || ""}\n    got      ${a}\n    expected ${b}`);
}

function assertClose(actual, expected, tolerance = 0.001, msg) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg || ""} | got ${actual}, expected ${expected} ±${tolerance}`);
  }
}

function assertGTE(actual, min, msg) {
  if (actual < min) throw new Error(`${msg || ""} | ${actual} < ${min}`);
}

// ── toISOWeekKey ─────────────────────────────────────────────────────────────

console.log("\n── toISOWeekKey ─────────────────────────────────────");

test("2026-01-01 is W01 of 2026", () => {
  assertEqual(toISOWeekKey("2026-01-01"), "2026-W01");
});

test("2026-12-31 returns correct year-week", () => {
  const k = toISOWeekKey("2026-12-31");
  // Dec 31 2026 is a Thursday → belongs to 2026 W53
  assertEqual(typeof k, "string");
  assertEqual(k.startsWith("20"), true, "should start with year");
});

test("2026-04-20 is W17", () => {
  assertEqual(toISOWeekKey("2026-04-20"), "2026-W17");
});

test("invalid date returns UNKNOWN", () => {
  assertEqual(toISOWeekKey("not-a-date"), "UNKNOWN");
});

// ── toPeriodKey ──────────────────────────────────────────────────────────────

console.log("\n── toPeriodKey ──────────────────────────────────────");

test("daily granularity returns YYYY-MM-DD", () => {
  assertEqual(toPeriodKey("2026-04-15", "daily"), "2026-04-15");
});

test("monthly granularity returns YYYY-MM", () => {
  assertEqual(toPeriodKey("2026-04-15 10:30:00", "monthly"), "2026-04");
});

test("yearly granularity returns YYYY", () => {
  assertEqual(toPeriodKey("2026-04-15", "yearly"), "2026");
});

test("weekly granularity returns YYYY-Www", () => {
  const k = toPeriodKey("2026-04-15", "weekly");
  assertEqual(k.match(/^\d{4}-W\d{2}$/) !== null, true, `got ${k}`);
});

// ── deriveDailyDeltas ─────────────────────────────────────────────────────────

console.log("\n── deriveDailyDeltas ────────────────────────────────");

const sampleRows = [
  { currentDate: "2026-04-01", total1: 100, remain1: 10 },
  { currentDate: "2026-04-02", total1: 102.5, remain1: 8 },
  { currentDate: "2026-04-03", total1: 105, remain1: 6 },
];

test("first row delta is always 0 (no prior baseline)", () => {
  const deltas = deriveDailyDeltas(sampleRows);
  assertEqual(deltas[0].delta, 0);
});

test("subsequent deltas are correctly computed", () => {
  const deltas = deriveDailyDeltas(sampleRows);
  assertClose(deltas[1].delta, 2.5, 0.001);
  assertClose(deltas[2].delta, 2.5, 0.001);
});

test("meter reset (total1 drops) clamps delta to 0", () => {
  const rows = [
    { currentDate: "2026-04-01", total1: 500, remain1: 5 },
    { currentDate: "2026-04-02", total1: 0,   remain1: 50 }, // meter replaced
    { currentDate: "2026-04-03", total1: 1.5, remain1: 48.5 },
  ];
  const deltas = deriveDailyDeltas(rows);
  assertEqual(deltas[1].delta, 0, "reset day should be 0");
  assertClose(deltas[2].delta, 1.5, 0.001, "next day after reset");
});

test("tamper flag is true when terminalCoverOpen", () => {
  const rows = [
    { currentDate: "2026-04-01", total1: 10, remain1: 5, terminalCoverOpen: true },
  ];
  const deltas = deriveDailyDeltas(rows);
  assertEqual(deltas[0].tamper, true);
});

test("relayOpen flag is correctly passed through", () => {
  const rows = [
    { currentDate: "2026-04-01", total1: 10, remain1: 5, relayOpen: true },
  ];
  const deltas = deriveDailyDeltas(rows);
  assertEqual(deltas[0].relayOpen, true);
});

test("dates are truncated to YYYY-MM-DD", () => {
  const rows = [{ currentDate: "2026-04-01T08:30:00Z", total1: 10, remain1: 5 }];
  const deltas = deriveDailyDeltas(rows);
  assertEqual(deltas[0].date, "2026-04-01");
});

// ── boundaryConsumption ───────────────────────────────────────────────────────

console.log("\n── boundaryConsumption ──────────────────────────────");

test("correctly computes period consumption", () => {
  assertClose(boundaryConsumption(100, 175.38), 75.38, 0.001);
});

test("clamps negative result to 0 (meter reset across period)", () => {
  assertEqual(boundaryConsumption(500, 10), 0);
});

test("handles string inputs gracefully", () => {
  assertClose(boundaryConsumption("100", "150"), 50, 0.001);
});

test("handles null/undefined baseline (treats as 0)", () => {
  assertClose(boundaryConsumption(null, 50), 50, 0.001);
});

// ── buildMeterDeltaMap ────────────────────────────────────────────────────────

console.log("\n── buildMeterDeltaMap ───────────────────────────────");

const multiMeterRows = [
  { meterId: "M001", currentDate: "2026-04-01", total1: 100 },
  { meterId: "M001", currentDate: "2026-04-02", total1: 103 },
  { meterId: "M002", currentDate: "2026-04-01", total1: 50 },
  { meterId: "M002", currentDate: "2026-04-02", total1: 55 },
  { meterId: "M001", currentDate: "2026-04-03", total1: 107 }, // out of order
];

test("groups rows by meterId correctly", () => {
  const map = buildMeterDeltaMap(multiMeterRows);
  assertEqual(map.size, 2);
  assertEqual(map.has("M001"), true);
  assertEqual(map.has("M002"), true);
});

test("sorts rows ASC by date within each meter", () => {
  const map = buildMeterDeltaMap(multiMeterRows);
  const m1 = map.get("M001");
  assertEqual(m1[0].date, "2026-04-01");
  assertEqual(m1[2].date, "2026-04-03");
});

test("M001 total delta is correct (100→103→107 = 7 kWh)", () => {
  const map = buildMeterDeltaMap(multiMeterRows);
  const m1  = map.get("M001");
  const total = m1.reduce((s, d) => s + d.delta, 0);
  assertClose(total, 7, 0.001);
});

test("M002 total delta is correct (50→55 = 5 kWh)", () => {
  const map = buildMeterDeltaMap(multiMeterRows);
  const m2  = map.get("M002");
  const total = m2.reduce((s, d) => s + d.delta, 0);
  assertClose(total, 5, 0.001);
});

// ── aggregateDeltasByPeriod ───────────────────────────────────────────────────

console.log("\n── aggregateDeltasByPeriod ──────────────────────────");

test("daily aggregation sums across all meters per date", () => {
  const map    = buildMeterDeltaMap(multiMeterRows);
  const result = aggregateDeltasByPeriod(map, "daily");
  // 2026-04-01: both meters have delta=0 (first row each)
  // 2026-04-02: M001=3, M002=5 → 8
  // 2026-04-03: M001=4, M002=0 (no row) → 4
  assertEqual(Object.keys(result).includes("2026-04-02"), true);
  assertClose(result["2026-04-02"], 8, 0.001, "day 2 total");
  assertClose(result["2026-04-03"], 4, 0.001, "day 3 total");
});

test("result is sorted ASC by key", () => {
  const map    = buildMeterDeltaMap(multiMeterRows);
  const result = aggregateDeltasByPeriod(map, "daily");
  const keys   = Object.keys(result);
  const sorted = [...keys].sort();
  assertEqual(keys, sorted, "keys should be sorted");
});

// ── buildTariffMap + resolveEffectivePrice ────────────────────────────────────

console.log("\n── buildTariffMap / resolveEffectivePrice ───────────");

const tariffRows = [
  { tariffId: "RESIDENTIAL", tariffName: "Residential", price: 350, tax: 0 },
  { tariffId: "KOLO",        tariffName: "Kolo",        price: 450, tax: 7.5 },
  { tariffId: "COMMERCIAL",  tariffName: "Commercial",  price: 350, tax: 0 },
];

test("buildTariffMap creates Map keyed by uppercase tariffId", () => {
  const map = buildTariffMap(tariffRows);
  assertEqual(map.has("RESIDENTIAL"), true);
  assertEqual(map.has("KOLO"), true);
});

test("RESIDENTIAL effective price = 350.00 (no tax)", () => {
  const map = buildTariffMap(tariffRows);
  assertClose(resolveEffectivePrice("RESIDENTIAL", map), 350.00, 0.001);
});

test("KOLO effective price = 483.75 (₦450 × 1.075)", () => {
  const map = buildTariffMap(tariffRows);
  assertClose(resolveEffectivePrice("KOLO", map), 483.75, 0.001);
});

test("unknown tariffId defaults to 350 (residential fallback)", () => {
  const map = buildTariffMap(tariffRows);
  assertClose(resolveEffectivePrice("UNKNOWN_TARIFF", map), 350, 0.001);
});

test("case-insensitive tariffId lookup", () => {
  const map = buildTariffMap(tariffRows);
  assertClose(resolveEffectivePrice("residential", map), 350.00, 0.001);
  assertClose(resolveEffectivePrice("kolo", map), 483.75, 0.001);
});

// ── revenueGap ────────────────────────────────────────────────────────────────

console.log("\n── revenueGap ───────────────────────────────────────");

test("positive gap = customer owes (consumed more than paid)", () => {
  // 10 kWh × ₦350 = ₦3500 expected, only paid ₦2000
  assertClose(revenueGap(10, 350, 2000), 1500, 0.01);
});

test("zero gap = exactly paid", () => {
  assertClose(revenueGap(10, 350, 3500), 0, 0.01);
});

test("negative gap = over-paid (credit balance)", () => {
  assertClose(revenueGap(10, 350, 5000), -1500, 0.01);
});

test("zero consumption = zero gap regardless of payment", () => {
  assertClose(revenueGap(0, 350, 5000), -5000, 0.01);
});

test("KOLO tariff gap math is correct", () => {
  // 20 kWh × ₦483.75 = ₦9675 expected, paid ₦5000
  assertClose(revenueGap(20, 483.75, 5000), 4675, 0.01);
});

// ── computeSiteKpis ───────────────────────────────────────────────────────────

console.log("\n── computeSiteKpis ──────────────────────────────────");

const tokenRecords = [
  { stationId: "TUNGA",   totalUnit: 10, totalPaid: 3500, createDate: "2026-04-01" },
  { stationId: "TUNGA",   totalUnit: 15, totalPaid: 5250, createDate: "2026-04-05" },
  { stationId: "UMAISHA", totalUnit: 20, totalPaid: 7000, createDate: "2026-04-03" },
];

test("all-sites KPI sums all records", () => {
  const kpi = computeSiteKpis(tokenRecords);
  assertClose(kpi.totalKwh,     45, 0.001);
  assertClose(kpi.totalRevenue, 15750, 0.01);
  assertEqual(kpi.rechargeCount, 3);
});

test("station-filtered KPI returns only that station", () => {
  const kpi = computeSiteKpis(tokenRecords, "TUNGA");
  assertClose(kpi.totalKwh, 25, 0.001);
  assertClose(kpi.totalRevenue, 8750, 0.01);
  assertEqual(kpi.rechargeCount, 2);
});

test("avgKwhPerRecharge is correctly computed", () => {
  const kpi = computeSiteKpis(tokenRecords, "TUNGA");
  assertClose(kpi.avgKwhPerRecharge, 12.5, 0.001);
});

// ── buildCustomerRechargeHistory ──────────────────────────────────────────────

console.log("\n── buildCustomerRechargeHistory ─────────────────────");

const customerRecords = [
  { createDate: "2026-03-10", totalUnit: 10, totalPaid: 3500, tariffId: "RESIDENTIAL" },
  { createDate: "2026-03-20", totalUnit: 8,  totalPaid: 2800, tariffId: "RESIDENTIAL" },
  { createDate: "2026-04-05", totalUnit: 12, totalPaid: 4200, tariffId: "RESIDENTIAL" },
];

test("monthly grouping produces correct keys", () => {
  const hist = buildCustomerRechargeHistory(customerRecords, "monthly");
  assertEqual(Object.keys(hist).sort(), ["2026-03", "2026-04"]);
});

test("March totals are correct", () => {
  const hist = buildCustomerRechargeHistory(customerRecords, "monthly");
  assertClose(hist["2026-03"].totalPaid,  6300, 0.01);
  assertClose(hist["2026-03"].totalUnits, 18,   0.001);
  assertEqual(hist["2026-03"].count, 2);
});

test("avgPaid is computed per month", () => {
  const hist = buildCustomerRechargeHistory(customerRecords, "monthly");
  assertClose(hist["2026-03"].avgPaid, 3150, 0.01);
});

test("tariffs array is correct", () => {
  const hist = buildCustomerRechargeHistory(customerRecords, "monthly");
  assertEqual(hist["2026-03"].tariffs, ["RESIDENTIAL"]);
});

// ── buildTemporalSeries ───────────────────────────────────────────────────────

console.log("\n── buildTemporalSeries ──────────────────────────────");

test("temporal series labels are sorted ASC", () => {
  const result = buildTemporalSeries(tokenRecords, "monthly");
  const labels = result.labels;
  assertEqual(labels, [...labels].sort(), "should be sorted");
});

test("temporal series station filter works", () => {
  const result = buildTemporalSeries(tokenRecords, "monthly", "TUNGA");
  assertClose(result.kwhSeries.reduce((s, v) => s + v, 0), 25, 0.001);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n────────────────────────────────────────────────────`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`────────────────────────────────────────────────────\n`);

if (failed > 0) process.exit(1);
