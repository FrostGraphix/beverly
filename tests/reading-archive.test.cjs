"use strict";

// Contract for the cold-storage archive (backend/src/services/reading-archive-service.js).
// Covers the pure logic only -- CSV encoding, partition-key construction and the
// eligibility boundary. No Supabase, no Storage, no network, so it runs in CI.
//
// The sweep/upload paths are deliberately not exercised here: they are thin wrappers
// over supabase-service and would only assert that mocks were called. What is worth
// pinning is the stuff that silently corrupts an archive if it drifts -- column set,
// quoting, deterministic ordering, and which months are safe to freeze.

const assert = require("node:assert");
const zlib = require("node:zlib");

// Fixed so the eligibility assertions below are deterministic regardless of the
// deployment's own ARCHIVE_GRACE_DAYS. Must be set before the module is required.
process.env.ARCHIVE_GRACE_DAYS = "35";

const archive = require("../backend/src/services/reading-archive-service");

// ── 1. Archived column set ──────────────────────────────────────────────────
{
  const columns = archive.ARCHIVE_COLUMNS;
  assert(Array.isArray(columns) && columns.length === 28, "expected 28 archived columns");

  // The surrogate uuid PK is dropped by 20260811100000; archiving it would fail once
  // that migration is applied.
  assert(!columns.includes("id"), "must not archive the dropped uuid id column");

  // Identity + the reading itself.
  for (const required of ["station_id", "meter_id", "reading_date", "total1", "remain1"]) {
    assert(columns.includes(required), `missing identity/reading column ${required}`);
  }

  // Telemetry and tamper flags are the whole reason the archive exists -- the monthly
  // rollups cannot reconstruct them, so dropping one here loses it permanently.
  for (const telemetry of ["voltage_a", "current_a", "power", "interval_demand"]) {
    assert(columns.includes(telemetry), `missing telemetry column ${telemetry}`);
  }
  for (const flag of ["relay_open", "battery_low", "magnetic_interference",
    "terminal_cover_open", "cover_open", "current_reverse", "current_unbalance",
    "source2_activated"]) {
    assert(columns.includes(flag), `missing tamper/state flag ${flag}`);
  }
}

// ── 2. CSV encoding ─────────────────────────────────────────────────────────
{
  const csv = archive.toCsv([]);
  const header = csv.split("\n")[0];
  assert.strictEqual(header, archive.ARCHIVE_COLUMNS.join(","), "header must be the column list in order");
  assert(csv.endsWith("\n"), "file must end with a newline");
  assert.strictEqual(csv.split("\n").filter(Boolean).length, 1, "no rows means header only");
}

{
  // customer_name genuinely contains commas in this dataset, and upstream free text
  // can carry quotes and newlines. All three must survive a round-trip.
  const rows = [{
    station_id: "OLOYAN",
    meter_id: "47005335147",
    customer_name: 'DOE, JOHN "JD"',
    reading_date: "2026-01-05",
    total1: 12.5,
    remain1: null,
    relay_open: false,
  }];
  const line = archive.toCsv(rows).split("\n")[1];
  const cells = archive.ARCHIVE_COLUMNS.map((c) => rows[0][c]);

  assert(line.includes('"DOE, JOHN ""JD"""'), "comma + embedded quotes must be quoted and doubled");
  assert(line.startsWith("OLOYAN,47005335147,"), "unquoted cells must not gain quotes");
  assert.strictEqual(cells.length, archive.ARCHIVE_COLUMNS.length);

  // null and undefined both render as empty, never the literal strings.
  assert(!/null|undefined/.test(line), "null/undefined must render as empty cells");
  // false is a real value and must be preserved, not blanked as falsy.
  assert(line.includes("false"), "boolean false must survive as 'false'");
}

{
  const line = archive.toCsv([{ station_id: "A\nB", meter_id: "m1" }]).split("\n")[1];
  assert(line.startsWith('"A'), "embedded newline must force quoting");
}

// ── 3. Partition key construction ───────────────────────────────────────────
{
  // The OEM slug leads the path. station_id is NOT unique across manufacturers --
  // Calinmeter already owns a station called "0001" -- so without this prefix a second
  // OEM's "0001" would overwrite the first one's object and the retention interlock
  // would then delete source rows believing they were archived.
  assert.strictEqual(
    archive.objectPathFor("OLOYAN", "2026-01-01", "readings", "monthly", "calinmeter"),
    "calinmeter/readings/monthly/OLOYAN/2026-01.csv.gz"
  );
  assert.notStrictEqual(
    archive.objectPathFor("0001", "2026-01-01", "readings", "monthly", "calinmeter"),
    archive.objectPathFor("0001", "2026-01-01", "readings", "monthly", "sparkmeter"),
    "same station under two OEMs must not share an object path"
  );

  // Yearly bundles collapse the period to just the year.
  assert.strictEqual(
    archive.objectPathFor("OLOYAN", "2026-01-01", "readings", "yearly", "calinmeter"),
    "calinmeter/readings/yearly/OLOYAN/2026.csv.gz"
  );
  assert.strictEqual(
    archive.objectPathFor("OLOYAN", "2026-03-01", "payments", "monthly", "calinmeter"),
    "calinmeter/payments/monthly/OLOYAN/2026-03.csv.gz"
  );

  // A slash in any component must not create an extra path segment -- that would
  // scatter one station's periods across different prefixes.
  assert.strictEqual(
    archive.objectPathFor("a/b", "2026-01-01", "readings", "monthly", "calinmeter"),
    "calinmeter/readings/monthly/a_b/2026-01.csv.gz"
  );

  // Dot-only segments are relative path elements, not names.
  for (const traversal of ["..", ".", "../.."]) {
    const path = archive.objectPathFor(traversal, "2026-01-01", "readings", "monthly", traversal);
    assert(
      path.split("/").every((segment) => !/^\.+$/.test(segment)),
      `"${traversal}" must not yield a bare dot segment (got ${path})`
    );
  }

  assert.strictEqual(
    archive.objectPathFor("", "2026-01-01", "readings", "monthly", "calinmeter"),
    "calinmeter/readings/monthly/unknown/2026-01.csv.gz",
    "empty station id falls back rather than producing an empty segment"
  );
}

// ── 3b. Period bounds per granularity ───────────────────────────────────────
{
  assert.deepStrictEqual(archive.periodBounds("monthly", "2026-02-01"),
    { from: "2026-02-01", to: "2026-02-28" }, "February is 28 days in 2026");
  assert.deepStrictEqual(archive.periodBounds("monthly", "2024-02-01"),
    { from: "2024-02-01", to: "2024-02-29" }, "leap February must not lose a day");
  assert.deepStrictEqual(archive.periodBounds("monthly", "2026-12-01"),
    { from: "2026-12-01", to: "2026-12-31" }, "December must not roll into next year");
  assert.deepStrictEqual(archive.periodBounds("yearly", "2026-01-01"),
    { from: "2026-01-01", to: "2026-12-31" });
}

// ── 3c. Sweep matrix and payment columns ────────────────────────────────────
{
  const combos = archive.SWEEP_MATRIX.map((e) => `${e.reportType}/${e.granularity}`);
  assert.deepStrictEqual(combos.sort(), [
    "payments/monthly", "payments/yearly", "readings/monthly", "readings/yearly"
  ], "all four type x granularity combinations must be swept");

  // token_transactions minus raw_payload. Money and energy must both be present, or a
  // payments archive cannot answer what was sold.
  for (const required of ["amount", "kwh", "transaction_at", "meter_sn", "site_code", "customer_name"]) {
    assert(archive.PAYMENT_COLUMNS.includes(required), `payments archive missing ${required}`);
  }
  assert(!archive.PAYMENT_COLUMNS.includes("raw_payload"),
    "raw_payload duplicates first-class columns and is excluded by design");

  // The two sources must not be confused with each other.
  assert(!archive.PAYMENT_COLUMNS.includes("reading_date"));
  assert(!archive.ARCHIVE_COLUMNS.includes("amount"));
}

// ── 4. Eligibility boundary ─────────────────────────────────────────────────
{
  const month = (iso) => archive.newestEligibleMonth(new Date(iso)).toISOString().slice(0, 10);

  // 2026-08-11 minus 35d grace = 2026-07-07, whose month is still settling, so the
  // newest fully-settled month is June.
  assert.strictEqual(month("2026-08-11T00:00:00Z"), "2026-06-01");

  // Exactly on the month boundary: cutoff lands on 2026-07-01, still July -> June.
  assert.strictEqual(month("2026-08-05T00:00:00Z"), "2026-06-01");

  // One day earlier the cutoff falls back into June, so only May is settled.
  assert.strictEqual(month("2026-08-04T00:00:00Z"), "2026-05-01");

  // The archiver must never LAG the pruner. Retention deletes rows older than the
  // 90-day floor that are already archived, so archive coverage has to extend at
  // least as far forward as that floor -- otherwise months would cross the deletion
  // line before anything had exported them, and the interlock in
  // 20260811130000_phase2_raw_retention_90d.sql would stall the cleanup forever.
  //
  // Archiving data that is still inside the hot window is fine and intended: the
  // archive is a copy, not a move, so running early costs a little Storage and buys
  // the guarantee. What must never happen is running late.
  const now = new Date("2026-08-11T00:00:00Z");
  const eligibleEnd = new Date(archive.newestEligibleMonth(now));
  eligibleEnd.setUTCMonth(eligibleEnd.getUTCMonth() + 1); // first day after that month
  const retentionFloor = new Date(now.getTime() - 90 * 86400000);
  assert(
    eligibleEnd >= retentionFloor,
    `archive coverage must reach the 90-day retention floor (covers through ${eligibleEnd.toISOString()}, floor ${retentionFloor.toISOString()})`
  );

  // Restate as the property that actually matters: with a 35-day grace the archiver
  // stays ahead of the pruner by a wide margin at any time of month.
  for (const day of ["2026-08-01", "2026-08-15", "2026-08-28", "2026-02-01"]) {
    const at = new Date(`${day}T00:00:00Z`);
    const end = new Date(archive.newestEligibleMonth(at));
    end.setUTCMonth(end.getUTCMonth() + 1);
    assert(
      end >= new Date(at.getTime() - 90 * 86400000),
      `archiver lags the pruner on ${day}`
    );
  }
}

// ── 5. Gzip round-trip ──────────────────────────────────────────────────────
{
  // What actually lands in Storage is gzipped CSV; prove it decompresses back byte
  // for byte, and that the compression is worth doing at this shape of data.
  const rows = Array.from({ length: 500 }, (_, i) => ({
    station_id: "OLOYAN",
    meter_id: `4700533${String(i).padStart(4, "0")}`,
    reading_date: "2026-01-05",
    total1: 100 + i,
    remain1: 50,
    voltage_a: 230.1,
  }));
  const csv = archive.toCsv(rows);
  const gz = zlib.gzipSync(Buffer.from(csv, "utf8"), { level: 9 });
  assert.strictEqual(zlib.gunzipSync(gz).toString("utf8"), csv, "gzip must round-trip exactly");
  assert(gz.length < Buffer.byteLength(csv, "utf8") / 4, "repetitive reading rows should compress well past 4x");
}

console.log("reading-archive ok");
