"use strict";

const assert = require("assert");

// Mock environment
process.env.SESSION_STORE_MODE = "supabase";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
process.env.UPSTREAM_API_URL = "https://mock-upstream.com";
process.env.UPSTREAM_BEARER_TOKEN = "mock-token";

const axios = require("axios");
const supabase = require("../backend/src/services/supabase-service");
const liveProbeEngine = require("../backend/src/services/live-probe-engine");
const store = require("../backend/src/services/consumption-store");

// Store originals to restore later
const originalRestRequest = supabase.restRequest;
const originalPost = axios.post;

(async () => {
  console.log("Starting live-probe-engine unit tests...");

  // Mock supabase rest requests
  supabase.restRequest = async (pathname, options = {}) => {
    if (pathname.includes("reading_date=eq.")) {
      // Mock yesterday rows
      return {
        body: [
          {
            station_id: "TUNGA",
            meter_id: "M-1",
            reading_date: "2026-05-19",
            total1: 250,
            remain1: 10
          }
        ]
      };
    }
    if (pathname.includes("select=id")) {
      // Mock count
      return {
        response: {
          headers: {
            get(name) {
              return String(name).toLowerCase() === "content-range" ? "0-0/100" : "";
            }
          }
        },
        body: []
      };
    }
    return { body: [] };
  };

  // Mock axios post to return mock API pages
  let axiosCalls = [];
  axios.post = async (url, data, config) => {
    axiosCalls.push({ url, data });
    
    // Page 1 contains a reading, page 2 is empty to terminate the loop
    if (data.pageNumber === 1) {
      return {
        data: {
          data: [
            {
              stationId: data.stationId,
              meterId: "M-1",
              currentDate: "2026-05-18 12:00:00",
              total1: 100
            },
            {
              stationId: data.stationId,
              meterId: "M-1",
              currentDate: "2026-05-19 12:00:00",
              total1: 250
            }
          ]
        }
      };
    }
    return { data: { data: [] } };
  };

  try {
    // 1. Test live probe computation
    const probeResult = await liveProbeEngine.runLiveProbe();
    
    assert.ok(probeResult.stations, "Should return station results");
    assert.strictEqual(probeResult.stations.length, 5, "Should return results for all 5 stations");
    
    const tunga = probeResult.stations.find(s => s.stationId === "TUNGA");
    assert.ok(tunga, "TUNGA should be present");
    assert.strictEqual(tunga.live.yesterday, 150, "Yesterday delta (250 - 100) should be 150");
    assert.strictEqual(tunga.live.week, 150, "Weekly delta should be 150");
    assert.strictEqual(tunga.live.allTime, 150, "All time delta should be 150");
    
    console.log("✓ runLiveProbe test passed");

    // 2. Test runSync
    let storeMockCalled = false;
    const originalWriteDailyMeterRows = store.writeDailyMeterRows;
    store.writeDailyMeterRows = async ({ pathname, requestPayload, responsePayload }) => {
      storeMockCalled = true;
      assert.strictEqual(pathname, "/api/DailyDataMeter/read");
      assert.strictEqual(requestPayload.stationId, "TUNGA");
      assert.ok(Array.isArray(responsePayload.data), "Should send array of data rows");
      return { stored: responsePayload.data.length };
    };

    const syncResult = await liveProbeEngine.runSync("TUNGA");
    assert.ok(syncResult.success, "Sync should report success");
    assert.ok(storeMockCalled, "writeDailyMeterRows should have been called");
    
    store.writeDailyMeterRows = originalWriteDailyMeterRows;
    console.log("✓ runSync test passed");

  } catch (err) {
    console.error("FAIL: Unit test encountered an error:", err);
    process.exit(1);
  } finally {
    // Restore mocks
    supabase.restRequest = originalRestRequest;
    axios.post = originalPost;
  }

  console.log("All live-probe-engine tests passed successfully!");
})();
