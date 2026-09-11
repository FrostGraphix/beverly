import { defineStore } from "pinia";
import { getApi, postApi, putApi, deleteApi } from "../services/api.js";

const currentOemStorageKey = "beverly.currentOem";
const activeLoads = new WeakMap();

export const useOemStore = defineStore("oem", {
  state: () => ({
    currentOemId: "",
    oems: [],
    status: "idle", // idle | loading | refreshing | ready | error
    error: "",
    errorReference: "",
    warning: "",
    isStale: false,
    lastUpdatedAt: 0,
    warmCache: {}
  }),
  getters: {
    currentOem(state) {
      return state.oems.find((oem) => oem.id === state.currentOemId) || null;
    },
    hasOems(state) {
      return state.oems.length > 0;
    },
    isLoading(state) {
      return state.status === "loading" || state.status === "refreshing";
    }
  },
  actions: {
    async loadOems() {
      const activeLoad = activeLoads.get(this);
      if (activeLoad) return activeLoad;

      const hadOems = this.hasOems;
      this.status = hadOems ? "refreshing" : "loading";
      this.error = "";
      this.errorReference = "";

      const load = (async () => {
        try {
          const envelope = await getApi("/system/oem/list");
          const payload = envelope?.data || envelope?.result || {};
          this.oems = Array.isArray(payload?.oems) ? payload.oems : [];
          const stationDependency = payload?.dependencies?.stationApi || {};
          const stationUnavailable = stationDependency.status === "unavailable";
          this.isStale = payload?.degraded === true || stationUnavailable;
          this.warning = this.isStale
            ? "OEMs loaded. Station counts may be outdated."
            : "";
          this.errorReference = this.isStale ? String(stationDependency.reference || "") : "";
          this.lastUpdatedAt = Date.now();
          this.status = "ready";
          return this.oems;
        } catch (error) {
          this.errorReference = String(
            error?.response?.data?.reference
              || error?.response?.headers?.["x-request-id"]
              || ""
          );
          if (this.hasOems || hadOems) {
            this.status = "ready";
            this.isStale = true;
            this.warning = "Using previously loaded OEMs. Refresh failed.";
            this.error = "";
            return this.oems;
          }
          this.status = "error";
          this.isStale = false;
          this.warning = "";
          this.error = error?.message || "Failed to load OEMs";
          return [];
        }
      })();

      activeLoads.set(this, load);
      try {
        return await load;
      } finally {
        if (activeLoads.get(this) === load) activeLoads.delete(this);
      }
    },
    selectOem(oemId) {
      this.currentOemId = String(oemId || "");
      try {
        if (this.currentOemId) localStorage.setItem(currentOemStorageKey, this.currentOemId);
        else localStorage.removeItem(currentOemStorageKey);
      } catch {
        // localStorage unavailable (private mode / SSR) — selection just won't persist.
      }
    },
    restoreSelection() {
      try {
        const saved = localStorage.getItem(currentOemStorageKey);
        if (saved) this.currentOemId = saved;
      } catch {
        // ignore
      }
    },
    clearSelection() {
      this.selectOem("");
    },
    hasCapability(oemId, capabilityKey) {
      const oem = this.oems.find((entry) => entry.id === oemId);
      return Boolean(oem?.capabilities?.[capabilityKey]);
    },
    async createOem(payload) {
      const envelope = await postApi("/system/oem", payload);
      await this.loadOems();
      return envelope?.data?.oem || envelope?.result?.oem || null;
    },
    async updateOem(oemId, payload) {
      const envelope = await putApi(`/system/oem/${oemId}`, payload);
      await this.loadOems();
      return envelope?.data?.oem || envelope?.result?.oem || null;
    },
    async deleteOem(oemId) {
      await deleteApi(`/system/oem/${oemId}`);
      if (this.currentOemId === oemId) this.clearSelection();
      await this.loadOems();
    },
    async fetchOemDetail(oemId) {
      const envelope = await getApi(`/system/oem/${oemId}`);
      return envelope?.data || envelope?.result || null;
    },
    async saveCredentials(oemId, payload) {
      const envelope = await putApi(`/system/oem/${oemId}/credentials`, payload);
      return envelope?.data || envelope?.result || null;
    },
    async fetchEndpoints(oemId) {
      const envelope = await getApi(`/system/oem/${oemId}/endpoints`);
      return envelope?.data?.endpoints || envelope?.result?.endpoints || [];
    },
    async saveEndpoint(oemId, logicalKey, payload) {
      const envelope = await putApi(`/system/oem/${oemId}/endpoints/${encodeURIComponent(logicalKey)}`, payload);
      return envelope?.data?.endpoint || envelope?.result?.endpoint || null;
    },
    async deleteEndpoint(oemId, logicalKey) {
      await deleteApi(`/system/oem/${oemId}/endpoints/${encodeURIComponent(logicalKey)}`);
    },
    async cacheBust(oemId) {
      await postApi(`/system/oem/${oemId}/cache-bust`, {});
    },
    async testConnection(oemId) {
      const envelope = await postApi(`/system/oem/${oemId}/test-connection`, {});
      return envelope?.data || envelope?.result || null;
    },
    setWarmState(oemId, patch) {
      this.warmCache = {
        ...this.warmCache,
        [oemId]: { ...(this.warmCache[oemId] || {}), ...patch }
      };
    }
  }
});
