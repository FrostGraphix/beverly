"use strict";

const assert = require("node:assert/strict");
const supabase = require("../backend/src/services/supabase-service");

const original = {
  restRequest: supabase.restRequest,
  restRequestWithResponse: supabase.restRequestWithResponse,
  createSignedStorageUrl: supabase.createSignedStorageUrl
};

const calls = [];
let fallbackMode = false;
supabase.restRequestWithResponse = async (pathname, options) => {
  calls.push({ kind: "list", pathname, options });
  return {
    response: { headers: { get: (name) => name.toLowerCase() === "content-range" ? "10-19/117" : null } },
    body: [{
      id: "11111111-1111-4111-8111-111111111111",
      oem_id: "22222222-2222-4222-8222-222222222222",
      station_id: "UMAISHA",
      report_type: "readings",
      granularity: "monthly",
      period_start: "2026-07-01",
      period_end: "2026-07-31",
      row_count: 10,
      byte_size: 120,
      object_path: "calinmeter/readings/monthly/UMAISHA/2026-07.csv.gz",
      created_at: "2026-08-01T01:00:00.000Z",
      updated_at: "2026-09-10T01:00:00.000Z"
    }]
  };
};
supabase.restRequest = async (pathname, options) => {
  calls.push({ kind: "rest", pathname, options });
  if (pathname === "/oem_manufacturers?select=id,slug") {
    return [{ id: "22222222-2222-4222-8222-222222222222", slug: "calinmeter" }];
  }
  if (pathname === "/rpc/archive_reports_summary") {
    if (fallbackMode) throw new Error("PGRST202 schema cache");
    return { totalReports: 2, totalRows: 10, totalBundleRows: 20, byStation: { UMAISHA: 2 } };
  }
  if (pathname.startsWith("/consumption_sync_station_state?")) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return [{
      station_id: "UMAISHA",
      last_status: "succeeded",
      last_success_at: new Date().toISOString(),
      cursor_date: yesterday,
      source_latest_date: yesterday,
      last_error: null
    }];
  }
  if (pathname.startsWith("/archive_reports?select=*&id=eq.")) {
    return [{
      id: "11111111-1111-4111-8111-111111111111",
      oem_id: "22222222-2222-4222-8222-222222222222",
      station_id: "UMAISHA",
      report_type: "readings",
      granularity: "monthly",
      period_start: "2026-07-01",
      bucket: "archives",
      object_path: "calinmeter/readings/monthly/UMAISHA/2026-07.csv.gz"
    }];
  }
  if (pathname.startsWith("/archive_reports?select=oem_id")) {
    return [{
      oem_id: "22222222-2222-4222-8222-222222222222",
      station_id: "UMAISHA",
      report_type: "readings",
      granularity: "monthly",
      period_start: "2026-07-01",
      row_count: 10,
      byte_size: 120,
      covers_from: "2026-07-01",
      covers_to: "2026-07-31",
      updated_at: "2026-09-10T01:00:00.000Z"
    }];
  }
  throw new Error(`Unexpected REST call: ${pathname}`);
};
supabase.createSignedStorageUrl = async (bucket, objectPath, ttl, filename) => ({
  signedUrl: `https://storage.example/${objectPath}`,
  bucket,
  ttl,
  filename
});

delete require.cache[require.resolve("../backend/src/services/reading-archive-service")];
const archive = require("../backend/src/services/reading-archive-service");

(async () => {
  try {
    const list = await archive.listReports({ page: 2, pageSize: 10, stationId: "UMAISHA" });
    assert.equal(list.totalCount, 117);
    assert.equal(list.page, 2);
    assert.equal(list.reports.length, 1);
    assert.equal(list.reports[0].refreshedAt, "2026-09-10T01:00:00.000Z");
    const listCall = calls.find((call) => call.kind === "list");
    assert.match(listCall.pathname, /station_id=eq\.UMAISHA/);
    assert.match(listCall.pathname, /limit=10/);
    assert.match(listCall.pathname, /offset=10/);
    assert.equal(listCall.options.prefer, "count=exact");

    const summary = await archive.reportsSummary({ stationId: "UMAISHA" });
    assert.equal(summary.totalRows, 10);
    assert.equal(summary.syncHealth.stationCount, 1);
    assert.equal(summary.syncHealth.maximumLagDays, 1);
    assert.equal(summary.syncHealth.staleCount, 0);
    const summaryCall = calls.find((call) => call.pathname === "/rpc/archive_reports_summary");
    assert.deepEqual(summaryCall.options.body, { p_station_id: "UMAISHA" });

    fallbackMode = true;
    const fallbackSummary = await archive.reportsSummary({ stationId: "UMAISHA" });
    assert.deepEqual(fallbackSummary.coverageRange, { earliest: "2026-07-01", latest: "2026-07-31" });
    assert.deepEqual(fallbackSummary.refreshRange, {
      earliest: "2026-09-10T01:00:00.000Z",
      latest: "2026-09-10T01:00:00.000Z"
    });
    fallbackMode = false;

    const download = await archive.signedDownloadUrl(
      "11111111-1111-4111-8111-111111111111",
      { stationScope: "UMAISHA" }
    );
    assert.equal(download.ok, true);
    const downloadCall = calls.find((call) => call.pathname?.startsWith("/archive_reports?select=*&id=eq."));
    assert.match(downloadCall.pathname, /station_id=eq\.UMAISHA/);

    const invalid = await archive.signedDownloadUrl("not-a-uuid", { stationScope: "UMAISHA" });
    assert.deepEqual(invalid, { ok: false, reason: "Invalid archive report id" });
    console.log("reading archive catalogue ok");
  } finally {
    Object.assign(supabase, original);
  }
})().catch((error) => {
  Object.assign(supabase, original);
  console.error(error);
  process.exit(1);
});
