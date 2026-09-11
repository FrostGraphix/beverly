import assert from "node:assert/strict";
import { createPinia, setActivePinia } from "pinia";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key)
};

function successEnvelope(data) {
  return {
    data: { code: 0, msg: "Success", reason: "Success", data, result: data },
    status: 200,
    statusText: "OK",
    headers: {},
    config: {}
  };
}

function failedResponse(reference = "REQ-OEM-FAILURE") {
  const error = new Error("Inventory service unavailable");
  error.config = { url: "/system/oem/list", method: "get", silent: true };
  error.response = {
    status: 503,
    data: {
      code: 503,
      msg: "OEM inventory unavailable",
      reason: "OEM inventory unavailable",
      reference
    },
    headers: { "x-request-id": reference }
  };
  return error;
}

async function main() {
  const { apiClient } = await import("../src/services/api.js");
  const { useOemStore } = await import("../src/stores/oem-store.js");
  const originalAdapter = apiClient.defaults.adapter;
  setActivePinia(createPinia());
  const store = useOemStore();
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });

  apiClient.defaults.adapter = async () => {
    calls += 1;
    await pending;
    return successEnvelope({
      oems: [{ id: "oem-1", displayName: "Primary OEM" }],
      degraded: false,
      dependencies: { stationApi: { status: "available" } }
    });
  };

  const first = store.loadOems();
  const second = store.loadOems();
  release();
  await Promise.all([first, second]);

  assert.equal(calls, 1, "concurrent inventory loads share one request");
  assert.equal(store.status, "ready");
  assert.equal(store.oems.length, 1);
  assert.equal(store.isStale, false);
  assert.equal(store.warning, "");
  assert.ok(store.lastUpdatedAt > 0);

  apiClient.defaults.adapter = async () => {
    calls += 1;
    throw failedResponse();
  };
  await store.loadOems();

  assert.equal(store.status, "ready", "stale inventory remains usable");
  assert.equal(store.oems.length, 1, "stale rows remain visible");
  assert.equal(store.isStale, true);
  assert.match(store.warning, /previously loaded OEMs/i);
  assert.equal(store.error, "");
  assert.equal(store.errorReference, "REQ-OEM-FAILURE");

  apiClient.defaults.adapter = async () => successEnvelope({
    oems: [{ id: "oem-1", displayName: "Primary OEM", communityCountStatus: "stale" }],
    degraded: true,
    dependencies: { stationApi: { status: "unavailable", code: "STATION_API_UNAVAILABLE", reference: "REQ-DEGRADED" } }
  });
  await store.loadOems();

  assert.equal(store.status, "ready");
  assert.equal(store.isStale, true);
  assert.match(store.warning, /station counts/i);
  assert.equal(store.error, "");
  assert.equal(store.errorReference, "REQ-DEGRADED");

  store.$reset();
  apiClient.defaults.adapter = async () => { throw failedResponse("REQ-FIRST-FAILURE"); };
  await store.loadOems();

  assert.equal(store.status, "error");
  assert.equal(store.oems.length, 0);
  assert.equal(store.error, "OEM inventory unavailable");
  assert.equal(store.errorReference, "REQ-FIRST-FAILURE");

  apiClient.defaults.adapter = originalAdapter;
  console.log(JSON.stringify({ status: "OEM store resilience passed" }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
