<template>
  <div class="oem-settings">
    <header class="oem-settings__header">
      <button type="button" class="bw-btn ghost sm oem-settings__back" @click="$emit('back')">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6" /></svg>
        Back to Hub
      </button>
      <div class="oem-settings__title-row">
        <h1 class="oem-settings__title">{{ oem.displayName }} settings</h1>
        <button type="button" class="bw-btn ghost sm" @click="$emit('edit', oem)">Edit name/details</button>
      </div>
    </header>

    <div v-if="loading" class="bw-loading">Loading settings…</div>
    <div v-else-if="loadError" class="bw-error-banner" role="alert">
      {{ loadError }}
      <button type="button" class="bw-btn ghost sm" @click="load">Retry</button>
    </div>

    <template v-else>
      <!-- Overview -->
      <section class="bw-card oem-settings__section">
        <h2 class="oem-settings__section-title">Overview</h2>
        <dl class="oem-settings__meta">
          <div><dt>Slug</dt><dd>{{ oem.slug }}</dd></div>
          <div><dt>Status</dt><dd><span class="bw-badge" :class="statusBadgeClass">{{ oem.status }}</span></dd></div>
          <div><dt>Vending strategy</dt><dd>{{ oem.vendingStrategy === 'direct_credit' ? 'Direct credit' : 'STS token' }}</dd></div>
          <div><dt>Endpoints configured</dt><dd>{{ endpoints.length }}</dd></div>
        </dl>
        <div class="oem-settings__caps">
          <span v-for="cap in enabledCapabilities" :key="cap" class="bw-badge oem-settings__cap">{{ cap }}</span>
          <span v-if="!enabledCapabilities.length" class="oem-settings__empty">No capabilities enabled yet.</span>
        </div>

        <div class="oem-settings__rate-limit">
          <div class="oem-settings__field">
            <label class="bw-label" for="rl-window">Rate limit window (ms)</label>
            <input id="rl-window" v-model.number="rateLimitForm.windowMs" class="bw-input" type="number" min="0" placeholder="Uses global default" />
          </div>
          <div class="oem-settings__field">
            <label class="bw-label" for="rl-max">Max requests per window</label>
            <input id="rl-max" v-model.number="rateLimitForm.maxRequests" class="bw-input" type="number" min="0" placeholder="Uses global default" />
          </div>
          <button type="button" class="bw-btn ghost sm" :disabled="savingRateLimit" @click="saveRateLimit">
            {{ savingRateLimit ? "Saving…" : "Save limits" }}
          </button>
        </div>
        <span v-if="rateLimitSaved" class="oem-settings__saved">Saved.</span>
      </section>

      <!-- Credentials -->
      <section class="bw-card oem-settings__section">
        <h2 class="oem-settings__section-title">Connection & credentials</h2>
        <div class="oem-settings__field">
          <label class="bw-label" for="cred-strategy">Auth strategy</label>
          <select id="cred-strategy" v-model="credForm.authStrategy" class="bw-select">
            <option value="bearer_static">Static bearer token</option>
            <option value="bearer_login">Login → cached bearer token</option>
            <option value="api_key_header">API key header</option>
            <option value="oauth2_client_credentials">OAuth2 client credentials</option>
          </select>
        </div>
        <div class="oem-settings__field">
          <label class="bw-label" for="cred-baseurl">Base URL</label>
          <input id="cred-baseurl" v-model="credForm.baseUrl" class="bw-input" type="text" placeholder="Enter API base URL" />
        </div>
        <div class="oem-settings__field">
          <label class="bw-label" for="cred-token">{{ credForm.authStrategy === "api_key_header" ? "API key" : "Bearer token" }}</label>
          <input id="cred-token" v-model="credForm.bearerToken" class="bw-input" type="password" :placeholder="credStatus.hasBearerToken ? '•••••• (set — leave blank to keep)' : (credForm.authStrategy === 'api_key_header' ? 'Paste API key' : 'Paste bearer token')" autocomplete="off" />
          <small class="oem-settings__hint">Encrypted at rest. Leave blank to keep the current value.</small>
        </div>
        <div v-if="credForm.authStrategy === 'api_key_header'" class="oem-settings__field">
          <label class="bw-label" for="cred-apikeyname">Header name</label>
          <input id="cred-apikeyname" v-model="credForm.apiKeyHeaderName" class="bw-input" type="text" placeholder="X-Api-Key" />
          <small class="oem-settings__hint">Sent as this exact header, e.g. "X-Api-Key" or "Ocp-Apim-Subscription-Key". Defaults to X-Api-Key if left blank.</small>
        </div>
        <div v-if="credForm.authStrategy === 'bearer_login' || credForm.authStrategy === 'oauth2_client_credentials'" class="oem-settings__login-grid">
          <div class="oem-settings__field">
            <label class="bw-label" for="cred-tokenpath">Token endpoint path</label>
            <input id="cred-tokenpath" v-model="credForm.tokenEndpointPath" class="bw-input" type="text" placeholder="/api/auth/token" />
          </div>
          <div class="oem-settings__field">
            <label class="bw-label" for="cred-user">Username / client ID</label>
            <input id="cred-user" v-model="credForm.username" class="bw-input" type="text" :placeholder="credStatus.hasUsername ? '•••••• (set)' : ''" autocomplete="off" />
          </div>
          <div class="oem-settings__field">
            <label class="bw-label" for="cred-pass">Password / client secret</label>
            <input id="cred-pass" v-model="credForm.password" class="bw-input" type="password" :placeholder="credStatus.hasPassword ? '•••••• (set)' : ''" autocomplete="off" />
          </div>
        </div>
        <div class="oem-settings__section-footer">
          <span v-if="credSaved" class="oem-settings__saved">Saved.</span>
          <span v-if="credError" class="oem-settings__error">{{ credError }}</span>
          <button type="button" class="bw-btn ghost" :disabled="testingConnection" @click="runTestConnection">
            {{ testingConnection ? "Testing…" : "Test Connection" }}
          </button>
          <button type="button" class="bw-btn primary" :disabled="savingCreds" @click="saveCredentials">
            {{ savingCreds ? "Saving…" : "Save connection" }}
          </button>
        </div>
        <div v-if="testResult" class="oem-settings__test-result" :class="testResult.ok ? 'oem-settings__test-result--ok' : 'oem-settings__test-result--fail'" role="status">
          <strong>{{ testResult.ok ? "✓ Connection looks good" : "✗ Connection failed" }}</strong>
          <p v-if="testResult.message">{{ testResult.message }}</p>
          <p v-if="testResult.testedPath">Tested <code>{{ testResult.testedPath }}</code> → HTTP {{ testResult.status }} ({{ testResult.latencyMs }}ms)</p>
          <p v-if="testResult.error">{{ testResult.error }}</p>
        </div>
      </section>

      <!-- Endpoints -->
      <section class="bw-card oem-settings__section">
        <div class="oem-settings__section-head">
          <h2 class="oem-settings__section-title">API endpoints</h2>
          <div class="oem-settings__endpoint-tools">
            <input v-model="endpointQuery" class="bw-input oem-settings__endpoint-search" type="search" placeholder="Filter endpoints…" aria-label="Filter endpoints" />
            <button type="button" class="bw-btn ghost sm" @click="addEndpoint">Add endpoint</button>
          </div>
        </div>
        <div class="oem-settings__table-wrap">
          <table class="oem-settings__table">
            <thead>
              <tr><th>Logical key</th><th>Path</th><th>Method</th><th>Enabled</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="ep in filteredEndpoints" :key="ep.logicalKey">
                <td class="oem-settings__key">{{ ep.logicalKey }}</td>
                <td class="oem-settings__path">{{ ep.upstreamPath }}</td>
                <td>{{ ep.method }}</td>
                <td><span class="bw-badge" :class="ep.enabled ? 'success' : 'rejected'">{{ ep.enabled ? "On" : "Off" }}</span></td>
                <td class="oem-settings__row-actions">
                  <button type="button" class="bw-btn ghost sm" @click="editEndpoint(ep)">Edit</button>
                  <button type="button" class="bw-btn ghost sm oem-settings__danger" @click="removeEndpoint(ep)">Delete</button>
                </td>
              </tr>
              <tr v-if="!filteredEndpoints.length">
                <td colspan="5" class="oem-settings__empty-row">
                  {{ endpoints.length ? "No endpoint matches your filter." : "No endpoints configured yet." }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <OemEndpointEditModal
      v-if="editingEndpoint"
      :endpoint="editingEndpoint"
      :is-new="editingIsNew"
      :existing-keys="endpoints.map((e) => e.logicalKey)"
      @close="closeEndpointModal"
      @save="onEndpointSave"
    />
  </div>
</template>

<script>
import { useOemStore } from "../../stores/oem-store";
import OemEndpointEditModal from "./OemEndpointEditModal.vue";
import { CAPABILITY_DEFINITIONS } from "./oem-capabilities.mjs";

export default {
  name: "OemSettingsPage",
  components: { OemEndpointEditModal },
  props: {
    oem: {
      type: Object,
      required: true
    }
  },
  emits: ["back", "edit"],
  setup() {
    return { store: useOemStore() };
  },
  data() {
    return {
      loading: true,
      loadError: "",
      endpoints: [],
      endpointQuery: "",
      credStatus: {},
      credForm: {
        authStrategy: "bearer_static",
        baseUrl: "",
        bearerToken: "",
        tokenEndpointPath: "",
        apiKeyHeaderName: "",
        username: "",
        password: ""
      },
      savingCreds: false,
      credSaved: false,
      credError: "",
      testingConnection: false,
      testResult: null,
      rateLimitForm: {
        windowMs: null,
        maxRequests: null
      },
      savingRateLimit: false,
      rateLimitSaved: false,
      editingEndpoint: null,
      editingIsNew: false
    };
  },
  computed: {
    statusBadgeClass() {
      if (this.oem.status === "active") return "success";
      if (this.oem.status === "disabled") return "rejected";
      return "pending";
    },
    enabledCapabilities() {
      return CAPABILITY_DEFINITIONS.filter((cap) => this.oem.capabilities?.[cap.key]).map((cap) => cap.label);
    },
    filteredEndpoints() {
      const query = this.endpointQuery.trim().toLowerCase();
      if (!query) return this.endpoints;
      return this.endpoints.filter((ep) =>
        ep.logicalKey.toLowerCase().includes(query) || String(ep.upstreamPath || "").toLowerCase().includes(query)
      );
    }
  },
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      this.loadError = "";
      try {
        const detail = await this.store.fetchOemDetail(this.oem.id);
        this.endpoints = await this.store.fetchEndpoints(this.oem.id);
        const creds = detail?.credentials || {};
        this.credStatus = creds;
        this.credForm.authStrategy = creds.authStrategy || "bearer_static";
        this.credForm.baseUrl = creds.baseUrl || "";
        this.credForm.tokenEndpointPath = creds.tokenEndpointPath || "";
        this.credForm.apiKeyHeaderName = creds.apiKeyHeaderName || "";
        this.rateLimitForm.windowMs = this.oem.rateLimitWindowMs ?? null;
        this.rateLimitForm.maxRequests = this.oem.rateLimitMaxRequests ?? null;
      } catch (err) {
        this.loadError = err?.message || "Could not load OEM settings";
      } finally {
        this.loading = false;
      }
    },
    async saveCredentials() {
      this.credError = "";
      this.credSaved = false;
      this.savingCreds = true;
      try {
        const payload = {
          authStrategy: this.credForm.authStrategy,
          baseUrl: this.credForm.baseUrl
        };
        if (this.credForm.bearerToken) payload.bearerToken = this.credForm.bearerToken;
        if (this.credForm.tokenEndpointPath) payload.tokenEndpointPath = this.credForm.tokenEndpointPath;
        if (this.credForm.authStrategy === "api_key_header") payload.apiKeyHeaderName = this.credForm.apiKeyHeaderName;
        if (this.credForm.username) payload.username = this.credForm.username;
        if (this.credForm.password) payload.password = this.credForm.password;
        this.credStatus = await this.store.saveCredentials(this.oem.id, payload);
        this.credForm.bearerToken = "";
        this.credForm.username = "";
        this.credForm.password = "";
        this.credSaved = true;
        this.testResult = null;
      } catch (err) {
        this.credError = err?.response?.data?.msg || err?.message || "Could not save credentials";
      } finally {
        this.savingCreds = false;
      }
    },
    async runTestConnection() {
      this.testingConnection = true;
      this.testResult = null;
      try {
        this.testResult = await this.store.testConnection(this.oem.id);
      } catch (err) {
        this.testResult = { ok: false, error: err?.response?.data?.msg || err?.message || "Test connection request failed" };
      } finally {
        this.testingConnection = false;
      }
    },
    async saveRateLimit() {
      this.savingRateLimit = true;
      this.rateLimitSaved = false;
      try {
        await this.store.updateOem(this.oem.id, {
          rateLimitWindowMs: this.rateLimitForm.windowMs || null,
          rateLimitMaxRequests: this.rateLimitForm.maxRequests || null
        });
        this.rateLimitSaved = true;
      } finally {
        this.savingRateLimit = false;
      }
    },
    addEndpoint() {
      this.editingIsNew = true;
      this.editingEndpoint = {
        logicalKey: "",
        upstreamPath: "",
        method: "GET",
        casingVariant: "",
        paginationStyle: "none",
        enabled: true,
        requiresLiveRead: false,
        requestFieldMap: {},
        payloadShape: {}
      };
    },
    editEndpoint(ep) {
      this.editingIsNew = false;
      this.editingEndpoint = { ...ep };
    },
    closeEndpointModal() {
      this.editingEndpoint = null;
      this.editingIsNew = false;
    },
    async onEndpointSave(payload) {
      await this.store.saveEndpoint(this.oem.id, payload.logicalKey, payload);
      await this.store.cacheBust(this.oem.id);
      this.endpoints = await this.store.fetchEndpoints(this.oem.id);
      this.closeEndpointModal();
    },
    async removeEndpoint(ep) {
      if (!window.confirm(`Delete endpoint "${ep.logicalKey}"?`)) return;
      await this.store.deleteEndpoint(this.oem.id, ep.logicalKey);
      await this.store.cacheBust(this.oem.id);
      this.endpoints = await this.store.fetchEndpoints(this.oem.id);
    }
  }
};
</script>

<style scoped>
.oem-settings { display: flex; flex-direction: column; gap: var(--s-4); padding: var(--s-6); max-width: 900px; margin: 0 auto; width: 100%; }
.oem-settings__header { display: flex; flex-direction: column; gap: var(--s-3); }
.oem-settings__back { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; }
.oem-settings__title-row { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); flex-wrap: wrap; }
.oem-settings__title { margin: 0; font-size: var(--t-xl, 1.5rem); font-weight: 700; letter-spacing: -0.02em; }

.oem-settings__section { display: flex; flex-direction: column; gap: var(--s-3); }
.oem-settings__section-title { margin: 0; font-size: var(--t-md); font-weight: 600; }
.oem-settings__section-head { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); flex-wrap: wrap; }
.oem-settings__section-footer { display: flex; align-items: center; justify-content: flex-end; gap: var(--s-3); margin-top: var(--s-2); }

.oem-settings__meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--s-3); margin: 0; }
.oem-settings__meta dt { color: var(--text-muted); font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.08em; }
.oem-settings__meta dd { margin: 4px 0 0; font-size: var(--t-sm); font-weight: 600; }
.oem-settings__caps { display: flex; flex-wrap: wrap; gap: 6px; }
.oem-settings__cap { text-transform: none; letter-spacing: normal; }
.oem-settings__empty, .oem-settings__empty-row { color: var(--text-muted); font-size: var(--t-sm); }
.oem-settings__empty-row { text-align: center; padding: var(--s-5); }

.oem-settings__rate-limit { display: flex; align-items: flex-end; gap: var(--s-3); flex-wrap: wrap; padding-top: var(--s-2); border-top: 1px solid var(--border); }
.oem-settings__rate-limit .oem-settings__field { flex: 1; min-width: 160px; }
.oem-settings__rate-limit .bw-btn { flex-shrink: 0; }

.oem-settings__test-result { border-radius: var(--r-md); padding: var(--s-3) var(--s-4); font-size: var(--t-sm); }
.oem-settings__test-result p { margin: 4px 0 0; }
.oem-settings__test-result code { font-family: var(--font-mono, monospace); }
.oem-settings__test-result--ok { background: color-mix(in srgb, var(--semantic-positive, #22c55e) 12%, transparent); color: var(--semantic-positive, #22c55e); }
.oem-settings__test-result--fail { background: color-mix(in srgb, var(--semantic-negative, #ef4444) 12%, transparent); color: var(--semantic-negative, #ef4444); }

.oem-settings__field { display: flex; flex-direction: column; gap: 6px; }
.oem-settings__hint { color: var(--text-muted); font-size: var(--t-xs); }
.oem-settings__login-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--s-3); }
.oem-settings__saved { color: var(--semantic-positive, #22c55e); font-size: var(--t-sm); }
.oem-settings__error { color: var(--danger-on-surface, #ef4444); font-size: var(--t-sm); }

.oem-settings__endpoint-tools { display: flex; align-items: center; gap: var(--s-2); }
.oem-settings__endpoint-search { height: 34px; width: 200px; max-width: 50vw; }
.oem-settings__table-wrap { overflow-x: auto; }
.oem-settings__table { width: 100%; border-collapse: collapse; font-size: var(--t-sm); }
.oem-settings__table th { text-align: left; padding: 8px 10px; color: var(--text-muted); font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid var(--border); }
.oem-settings__table td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.oem-settings__key { font-weight: 600; }
.oem-settings__path { font-family: var(--font-mono, monospace); color: var(--text-dim, var(--text-muted)); white-space: nowrap; }
.oem-settings__row-actions { display: flex; gap: 4px; justify-content: flex-end; }
.oem-settings__danger { color: var(--danger-on-surface, #ef4444); }

/* ── Responsive ─────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .oem-settings { padding: var(--s-4); gap: var(--s-3); }
  .oem-settings__meta { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 560px) {
  .oem-settings__title-row { flex-direction: column; align-items: stretch; }
  .oem-settings__title { font-size: var(--t-lg, 1.25rem); }
  .oem-settings__meta { grid-template-columns: 1fr 1fr; gap: var(--s-2); }
  .oem-settings__section-head { flex-direction: column; align-items: stretch; }
  .oem-settings__endpoint-tools { flex-direction: column; align-items: stretch; }
  .oem-settings__endpoint-search { width: 100%; max-width: none; }
  .oem-settings__login-grid { grid-template-columns: 1fr; }
  .oem-settings__section-footer { flex-direction: column-reverse; align-items: stretch; }
  .oem-settings__section-footer .bw-btn { width: 100%; justify-content: center; }
  .oem-settings__rate-limit { flex-direction: column; align-items: stretch; }
  .oem-settings__rate-limit .bw-btn { width: 100%; justify-content: center; }
}
@media (max-width: 420px) {
  .oem-settings__meta { grid-template-columns: 1fr; }
  .oem-settings__table { font-size: var(--t-xs); }
  .oem-settings__path { white-space: normal; word-break: break-all; }
}
</style>
