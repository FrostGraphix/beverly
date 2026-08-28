"use strict";

const assert = require("node:assert/strict");
const supabase = require("../backend/src/services/supabase-service");

const original = {
  restRequest: supabase.restRequest,
  restRequestWithResponse: supabase.restRequestWithResponse,
  createSignedStorageUrl: supabase.createSignedStorageUrl
};

const calls = [];
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
      object_path: "calinmeter/readings/monthly/UMAISHA/2026-07.csv.gz"
    }]
  };
};
supabase.restRequest = async (pathname, options) => {
  calls.push({ kind: "rest", pathname, options });
  if (pathname === "/oem_manufacturers?select=id,slug") {
    return [{ id: "22222222-2222-4222-8222-222222222222", slug: "calinmeter" }];
  }
  if (pathname === "/rpc/archive_reports_summary") {
    return { totalReports: 2, totalRows: 10, totalBundleRows: 20, byStation: { UMAISHA: 2 } };
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
    const listCall = calls.find((call) => call.kind === "list");
    assert.match(listCall.pathname, /station_id=eq\.UMAISHA/);
    assert.match(listCall.pathname, /limit=10/);
    assert.match(listCall.pathname, /offset=10/);
    assert.equal(listCall.options.prefer, "count=exact");

    const summary = await archive.reportsSummary({ stationId: "UMAISHA" });
    assert.equal(summary.totalRows, 10);
    const summaryCall = calls.find((call) => call.pathname === "/rpc/archive_reports_summary");
    assert.deepEqual(summaryCall.options.body, { p_station_id: "UMAISHA" });

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
