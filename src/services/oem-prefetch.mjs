// Background dashboard warming for the OEM Hub.
//
// Right after a super-admin logs in, we warm each active OEM's dashboard dataset
// so clicking a card lands on an already-populated dashboard instead of a cold
// fetch. Each OEM is warmed with its own X-Oem-Id header (bypassing the store's
// current-selection interceptor), independently caught so one OEM's broken
// credentials can't block the others, and with bounded concurrency so a super-admin
// with many OEMs doesn't fan out a burst that trips the proxy's own rate limiter.

import { getApi, postApi } from "./api.js";
import { fetchDashboardData } from "./dashboard-service.mjs";

const MAX_CONCURRENT_WARMS = 2;

// Wrap the shared api with a fixed X-Oem-Id header so every request this warm
// makes targets one specific OEM, regardless of which OEM is currently selected.
function oemScopedApi(oemId) {
  const headers = { "X-Oem-Id": oemId };
  return {
    getApi: (path, params = {}) => getApi(path, params, { headers }),
    postApi: (path, payload = {}, options = {}) =>
      postApi(path, payload, { ...options, headers: { ...(options.headers || {}), ...headers } })
  };
}

async function warmOne(oemStore, oem) {
  oemStore.setWarmState(oem.id, { status: "warming", error: "" });
  try {
    const dataset = await fetchDashboardData({
      activeType: "purchaseMoney",
      consumptionType: 4,
      api: oemScopedApi(oem.id)
    });
    oemStore.setWarmState(oem.id, { status: "ready", dataset, warmedAt: Date.now(), error: "" });
  } catch (error) {
    oemStore.setWarmState(oem.id, { status: "error", error: error?.message || "warm failed" });
  }
}

// Run warms in small batches so concurrency stays bounded.
async function runBounded(tasks, limit) {
  const queue = [...tasks];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const task = queue.shift();
      await task();
    }
  });
  await Promise.all(workers);
}

// Warm every active OEM's dashboard. Fire-and-forget from the caller's side; each
// OEM's failure is captured into its own warmCache entry, never thrown.
export async function warmAllOems(oemStore) {
  if (!oemStore.hasOems) {
    await oemStore.loadOems().catch(() => {});
  }
  const activeOems = oemStore.oems.filter((oem) => oem.status === "active");
  if (!activeOems.length) return;
  const tasks = activeOems.map((oem) => () => warmOne(oemStore, oem));
  await runBounded(tasks, MAX_CONCURRENT_WARMS);
}
