"use strict";

const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const supabase = require("../backend/src/services/supabase-service");

const originalRestRequest = supabase.restRequest;
const originalUpload = supabase.uploadStorageObject;
const writes = [];
let uploaded = null;

supabase.restRequest = async (pathname, options = {}) => {
  writes.push({ pathname, options });
  return [];
};
supabase.uploadStorageObject = async (bucket, objectPath, content, contentType) => {
  uploaded = { bucket, objectPath, content, contentType };
  return { bucket, path: objectPath, size: content.length };
};

delete require.cache[require.resolve("../backend/src/services/reading-archive-service")];
const archive = require("../backend/src/services/reading-archive-service");

(async () => {
  try {
    const result = await archive.archiveProvidedRows({
      stationId: "OFEMILI",
      periodStart: "2025-08-01",
      reportType: "readings",
      rows: [
        { station_id: "OFEMILI", meter_id: "M-1", reading_date: "2025-08-11", total1: 10 },
        { station_id: "OFEMILI", meter_id: "M-2", reading_date: "2025-08-12", total1: 20 },
      ],
      oem: { oemId: "22222222-2222-4222-8222-222222222222", slug: "calinmeter" },
    });
    assert.equal(result.rowCount, 2);
    assert.equal(uploaded.contentType, "application/gzip");
    assert.match(zlib.gunzipSync(uploaded.content).toString("utf8"), /OFEMILI,M-1/);
    const indexWrite = writes.find((write) => write.pathname.startsWith("/archive_reports?on_conflict="));
    assert.equal(indexWrite.options.body.covers_from, "2025-08-11");
    assert.equal(indexWrite.options.body.covers_to, "2025-08-12");
    const paymentResult = await archive.archiveProvidedRows({
      stationId: "OFEMILI",
      periodStart: "2025-08-01",
      reportType: "payments",
      rows: [{ site_code: "ofemili", meter_sn: "M-1", transaction_at: "2025-08-12T10:00:00.000Z", amount: 1000 }],
      oem: { oemId: "22222222-2222-4222-8222-222222222222", slug: "calinmeter" },
    });
    assert.equal(paymentResult.rowCount, 1);
    await assert.rejects(() => archive.archiveProvidedRows({
      stationId: "OFEMILI",
      periodStart: "2025-08-01",
      reportType: "readings",
      rows: [{ station_id: "TUNGA", meter_id: "M-3", reading_date: "2025-08-12" }],
      oem: { oemId: "22222222-2222-4222-8222-222222222222", slug: "calinmeter" },
    }), /station boundary/i);
    console.log("reading cold archive passed");
  } finally {
    supabase.restRequest = originalRestRequest;
    supabase.uploadStorageObject = originalUpload;
  }
})().catch((error) => {
  supabase.restRequest = originalRestRequest;
  supabase.uploadStorageObject = originalUpload;
  throw error;
});
