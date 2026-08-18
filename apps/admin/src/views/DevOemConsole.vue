<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';

interface OemManufacturer {
  id: string;
  slug: string;
  displayName: string;
  status: 'active' | 'draft' | 'deprecated';
  vendingStrategy: 'sts_token' | 'direct_credit';
  capabilities: Record<string, boolean>;
  isSeedDefault?: boolean;
  rateLimitWindowMs?: number | null;
  rateLimitMaxRequests?: number | null;
}

interface OemEndpoint {
  id?: string;
  logicalKey: string;
  upstreamPath: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  enabled: boolean;
}

interface CredentialForm {
  authStrategy: 'bearer_static' | 'bearer_login' | 'api_key_header' | 'oauth2_client_credentials';
  baseUrl: string;
  bearerToken: string;
  apiKeyHeaderName: string;
  username: string;
  password: string;
  tokenEndpointPath: string;
}

const oems = ref<OemManufacturer[]>([
  {
    id: 'oem_calinmeter',
    slug: 'calinmeter',
    displayName: 'Calinmeter',
    status: 'active',
    vendingStrategy: 'sts_token',
    capabilities: { remote_meter_tasks: true, vending: true, tariff_management: true, gprs_communication: true },
    isSeedDefault: true,
  },
  {
    id: 'oem_sparkmeter',
    slug: 'sparkmeter',
    displayName: 'SparkMeter',
    status: 'draft',
    vendingStrategy: 'sts_token',
    capabilities: { remote_meter_tasks: true, vending: true, tariff_management: true },
  },
  {
    id: 'oem_ihemeter',
    slug: 'ihemeter',
    displayName: 'Ihemeter',
    status: 'draft',
    vendingStrategy: 'sts_token',
    capabilities: { remote_meter_tasks: true, vending: true },
  },
]);

const searchQuery = ref('');
const activeOem = ref<OemManufacturer | null>(null);

// Credential & endpoint forms
const credForm = ref<CredentialForm>({
  authStrategy: 'bearer_static',
  baseUrl: 'http://8.208.16.168:9310',
  bearerToken: '',
  apiKeyHeaderName: 'X-Api-Key',
  username: 'admin',
  password: '',
  tokenEndpointPath: '/api/auth/token',
});

const endpoints = ref<OemEndpoint[]>([
  { logicalKey: 'remote_vending', upstreamPath: '/api/v1/vend', method: 'POST', enabled: true },
  { logicalKey: 'meter_reading', upstreamPath: '/api/v1/meters/readings', method: 'GET', enabled: true },
  { logicalKey: 'meter_status', upstreamPath: '/api/v1/meters/status', method: 'GET', enabled: true },
  { logicalKey: 'tariff_update', upstreamPath: '/api/v1/tariffs', method: 'POST', enabled: true },
]);

const credSaved = ref(false);
const credError = ref('');
const savingCreds = ref(false);
const testingConnection = ref(false);
const testResult = ref<{ ok: boolean; message: string; testedPath?: string; status?: number; latencyMs?: number } | null>(null);

// Modal states
const showAddModal = ref(false);
const showEndpointModal = ref(false);
const editingEndpoint = ref<OemEndpoint | null>(null);

const oemForm = ref({
  displayName: '',
  slug: '',
  status: 'draft' as 'active' | 'draft' | 'deprecated',
  vendingStrategy: 'sts_token' as 'sts_token' | 'direct_credit',
});

onMounted(async () => {
  try {
    const res = await api.get<{ oems: OemManufacturer[] }>('/api/v1/admin/dev/oem');
    if (res.oems && res.oems.length) {
      oems.value = res.oems;
    }
  } catch (e) {
    // Keep seeded list as fallback
  }
});

const filteredOems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return oems.value;
  return oems.value.filter(o => o.displayName.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q));
});

function selectOem(oem: OemManufacturer) {
  activeOem.value = oem;
  testResult.value = null;
  credSaved.value = false;
  credError.value = '';
  if (oem.slug === 'sparkmeter') {
    credForm.value = {
      authStrategy: 'api_key_header',
      baseUrl: 'https://www.sparkmeter.cloud',
      bearerToken: 'FrsRkX0kFJlClx30TuY7P6iUkrRr4m34oHG55cdG1QE',
      apiKeyHeaderName: 'X-Sparkmeter-Key',
      username: 'Acobminigrid@gmail.com',
      password: '',
      tokenEndpointPath: '',
    };
    endpoints.value = [
      { logicalKey: 'create_service_area', upstreamPath: '/sm/organizations/c4c3e809-5487-43cf-be64-2826dbbb4f6d/create_service_area', method: 'POST', enabled: true },
      { logicalKey: 'dissociate_meter', upstreamPath: '/api/v1/customers/{customer_id}/meter/dissociate', method: 'POST', enabled: true },
      { logicalKey: 'relay_control', upstreamPath: '/api/v1/meters/{meter_id}/relay_state', method: 'POST', enabled: true },
      { logicalKey: 'customers_list', upstreamPath: '/api/v1/customers', method: 'GET', enabled: true },
      { logicalKey: 'reports_summary', upstreamPath: '/reports/summary', method: 'GET', enabled: true },
      { logicalKey: 'reports_list', upstreamPath: '/reports/list', method: 'GET', enabled: true },
    ];
  } else if (oem.slug === 'calinmeter') {
    credForm.value = {
      authStrategy: 'bearer_static',
      baseUrl: 'http://8.208.16.168:9310',
      bearerToken: '',
      apiKeyHeaderName: 'X-Api-Key',
      username: 'admin',
      password: '',
      tokenEndpointPath: '/api/auth/token',
    };
    endpoints.value = [
      { logicalKey: 'remote_vending', upstreamPath: '/api/v1/vend', method: 'POST', enabled: true },
      { logicalKey: 'meter_reading', upstreamPath: '/api/v1/meters/readings', method: 'GET', enabled: true },
      { logicalKey: 'meter_status', upstreamPath: '/api/v1/meters/status', method: 'GET', enabled: true },
      { logicalKey: 'tariff_update', upstreamPath: '/api/v1/tariffs', method: 'POST', enabled: true },
    ];
  }
}

async function runTestConnection() {
  if (!activeOem.value) return;
  testingConnection.value = true;
  testResult.value = null;
  try {
    const res = await api.post<{ ok: boolean; message: string; testedPath?: string; status?: number; latencyMs?: number }>(
      `/api/v1/admin/dev/oem/${activeOem.value.slug}/test-connection`,
      { baseUrl: credForm.value.baseUrl }
    );
    testResult.value = res;
  } catch (e: any) {
    testResult.value = {
      ok: false,
      message: e.message ?? 'Connection failed.',
    };
  } finally {
    testingConnection.value = false;
  }
}

async function saveCredentials() {
  if (!activeOem.value) return;
  savingCreds.value = true;
  credSaved.value = false;
  credError.value = '';
  try {
    await api.post(`/api/v1/admin/dev/oem/${activeOem.value.slug}/credentials`, credForm.value);
    credSaved.value = true;
    setTimeout(() => { credSaved.value = false; }, 3000);
  } catch (e: any) {
    credError.value = e.message ?? 'Failed to save credentials.';
  } finally {
    savingCreds.value = false;
  }
}

function openAddOemModal() {
  oemForm.value = { displayName: '', slug: '', status: 'draft', vendingStrategy: 'sts_token' };
  showAddModal.value = true;
}

async function createOem() {
  if (!oemForm.value.displayName.trim()) return;
  try {
    const res = await api.post<{ ok: boolean; oem: OemManufacturer }>('/api/v1/admin/dev/oem', oemForm.value);
    if (res.oem) {
      oems.value.push(res.oem);
      showAddModal.value = false;
      selectOem(res.oem);
    }
  } catch (e) {
    const slug = oemForm.value.slug.trim() || oemForm.value.displayName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const fallbackOem: OemManufacturer = {
      id: `oem_${Date.now()}`,
      slug,
      displayName: oemForm.value.displayName.trim(),
      status: oemForm.value.status,
      vendingStrategy: oemForm.value.vendingStrategy,
      capabilities: { remote_meter_tasks: true, vending: true },
    };
    oems.value.push(fallbackOem);
    showAddModal.value = false;
    selectOem(fallbackOem);
  }
}

function openEditEndpoint(ep?: OemEndpoint) {
  editingEndpoint.value = ep ? { ...ep } : { logicalKey: '', upstreamPath: '/', method: 'GET', enabled: true };
  showEndpointModal.value = true;
}

function saveEndpoint() {
  if (!editingEndpoint.value || !editingEndpoint.value.logicalKey.trim()) return;
  const idx = endpoints.value.findIndex(e => e.logicalKey === editingEndpoint.value!.logicalKey);
  if (idx >= 0) {
    endpoints.value[idx] = { ...editingEndpoint.value };
  } else {
    endpoints.value.push({ ...editingEndpoint.value });
  }
  showEndpointModal.value = false;
  editingEndpoint.value = null;
}

function deleteEndpoint(key: string) {
  endpoints.value = endpoints.value.filter(e => e.logicalKey !== key);
}
</script>

<template>
  <AppShell title="OEM Meters & API Credentials">
    <div class="dev-oem-view">
      <!-- Header bar when inspecting specific OEM -->
      <div v-if="activeOem" class="oem-detail-header">
        <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="activeOem = null">
          ← Back to OEM Registry
        </button>
        <div class="oem-title-row">
          <h2>{{ activeOem.displayName }} Settings</h2>
          <span class="bw-badge" :class="activeOem.status === 'active' ? 'bw-badge-success' : 'bw-badge-neutral'">
            {{ activeOem.status }}
          </span>
        </div>
      </div>

      <!-- OEM Hub Overview Grid -->
      <div v-else class="oem-grid-section">
        <div class="oem-toolbar">
          <input
            v-model="searchQuery"
            class="bw-input oem-search"
            placeholder="Search OEM Meters (e.g. SparkMeter, Calinmeter)..."
          />
          <button class="bw-btn bw-btn-primary" @click="openAddOemModal">+ Add OEM Brand</button>
        </div>

        <div class="oem-cards-grid">
          <div
            v-for="oem in filteredOems"
            :key="oem.id"
            class="oem-card"
            @click="selectOem(oem)"
          >
            <div class="oem-card-hd">
              <div class="oem-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2" />
                </svg>
              </div>
              <div class="oem-meta">
                <h3>{{ oem.displayName }}</h3>
                <code>{{ oem.slug }}</code>
              </div>
              <span class="bw-badge" :class="oem.status === 'active' ? 'bw-badge-success' : 'bw-badge-neutral'">
                {{ oem.status }}
              </span>
            </div>

            <div class="oem-card-body">
              <div class="oem-info-line">
                <span>Vending Strategy:</span>
                <strong>{{ oem.vendingStrategy === 'sts_token' ? 'STS Token (Standard)' : 'Direct Credit' }}</strong>
              </div>
              <div class="oem-caps">
                <span v-for="(val, key) in oem.capabilities" :key="key" v-show="val" class="bw-badge bw-badge-neutral cap-badge">
                  {{ String(key).replace(/_/g, ' ') }}
                </span>
              </div>
            </div>

            <div class="oem-card-foot">
              <span>Configure Connection & Credentials →</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Active OEM Detail Settings Panel -->
      <div v-if="activeOem" class="oem-detail-body">
        <!-- Overview & Strategy Card -->
        <div class="bw-card oem-sec-card">
          <h3>Overview & Strategy</h3>
          <div class="meta-grid">
            <div><label>Manufacturer Slug</label><code>{{ activeOem.slug }}</code></div>
            <div><label>Status</label><span class="bw-badge bw-badge-success">{{ activeOem.status }}</span></div>
            <div><label>Vending Model</label><strong>{{ activeOem.vendingStrategy === 'sts_token' ? 'STS Token Encryption' : 'Direct Credit API' }}</strong></div>
            <template v-if="activeOem.slug === 'sparkmeter'">
              <div><label>Organization ID</label><code class="bw-mono bw-text-xs">c4c3e809-5487-43cf-be64-2826dbbb4f6d</code></div>
              <div><label>Project Remote ID</label><code class="bw-mono bw-text-xs">655ace31-6683-4521-b8ed-fcb7b32b287c</code></div>
              <div><label>Active Service Area ID</label><code class="bw-mono bw-text-xs">a6230885-e9d5-4882-9b31-58d889cf3f51</code></div>
              <div><label>Portfolio URL</label><a href="https://www.sparkmeter.cloud/portfolio/64bfd8cd-d361-4368-98c9-c0ea3730559d/" target="_blank" class="bw-mono bw-text-xs" style="color: var(--primary)">sparkmeter.cloud/portfolio/…</a></div>
            </template>
          </div>
        </div>

        <!-- Connection & Credentials Card -->
        <div class="bw-card oem-sec-card">
          <h3>API Connection & Meter Credentials</h3>
          <p class="bw-text-muted bw-text-sm">Configure base URLs, authorization headers, and API keys for {{ activeOem.displayName }} meter gateways.</p>

          <div class="form-grid">
            <div class="bw-form-group">
              <label class="bw-label">Auth Strategy</label>
              <select v-model="credForm.authStrategy" class="bw-select">
                <option value="bearer_static">Static Bearer Token</option>
                <option value="bearer_login">Login → Cached Bearer Token</option>
                <option value="api_key_header">API Key Header</option>
                <option value="oauth2_client_credentials">OAuth2 Client Credentials</option>
              </select>
            </div>

            <div class="bw-form-group">
              <label class="bw-label">API Base URL *</label>
              <input v-model="credForm.baseUrl" class="bw-input bw-mono" placeholder="https://api.meter-vendor.com" />
            </div>

            <div class="bw-form-group">
              <label class="bw-label">{{ credForm.authStrategy === 'api_key_header' ? 'API Key Secret' : 'Bearer Token' }}</label>
              <input v-model="credForm.bearerToken" type="password" class="bw-input bw-mono" placeholder="••••••••••••••••" />
            </div>

            <div v-if="credForm.authStrategy === 'api_key_header'" class="bw-form-group">
              <label class="bw-label">Header Name</label>
              <input v-model="credForm.apiKeyHeaderName" class="bw-input bw-mono" placeholder="X-Api-Key" />
            </div>

            <div v-if="credForm.authStrategy === 'bearer_login' || credForm.authStrategy === 'oauth2_client_credentials'" class="bw-form-group">
              <label class="bw-label">Username / Client ID</label>
              <input v-model="credForm.username" class="bw-input bw-mono" />
            </div>

            <div v-if="credForm.authStrategy === 'bearer_login' || credForm.authStrategy === 'oauth2_client_credentials'" class="bw-form-group">
              <label class="bw-label">Password / Client Secret</label>
              <input v-model="credForm.password" type="password" class="bw-input bw-mono" />
            </div>
          </div>

          <div class="card-actions">
            <button class="bw-btn bw-btn-ghost" :disabled="testingConnection" @click="runTestConnection">
              {{ testingConnection ? 'Testing Connection…' : '⚡ Test API Connection' }}
            </button>
            <button class="bw-btn bw-btn-primary" :disabled="savingCreds" @click="saveCredentials">
              {{ savingCreds ? 'Saving…' : 'Save Connection' }}
            </button>
          </div>

          <div v-if="credSaved" class="bw-badge bw-badge-success" style="margin-top: 8px">✓ Credentials saved successfully</div>
          <div v-if="credError" class="bw-error-banner" style="margin-top: 8px">{{ credError }}</div>

          <div v-if="testResult" :class="['test-banner', testResult.ok ? 'test-ok' : 'test-fail']">
            <strong>{{ testResult.ok ? '✓ Connection Verified' : '✕ Connection Error' }}</strong>
            <p>{{ testResult.message }}</p>
            <small v-if="testResult.testedPath">Tested {{ testResult.testedPath }} ({{ testResult.latencyMs }}ms latency)</small>
          </div>
        </div>

        <!-- Endpoints Mapping Table -->
        <div class="bw-card oem-sec-card">
          <div class="sec-hd-row">
            <h3>Logical API Endpoints</h3>
            <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="openEditEndpoint()">+ Add Endpoint</button>
          </div>

          <div class="bw-table-wrapper">
            <table class="bw-table">
              <thead>
                <tr>
                  <th>Logical Key</th>
                  <th>Upstream Path</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="ep in endpoints" :key="ep.logicalKey">
                  <td class="bw-mono bw-text-sm">{{ ep.logicalKey }}</td>
                  <td class="bw-mono bw-text-sm">{{ ep.upstreamPath }}</td>
                  <td><span class="bw-badge bw-badge-neutral">{{ ep.method }}</span></td>
                  <td>
                    <span class="bw-badge" :class="ep.enabled ? 'bw-badge-success' : 'bw-badge-neutral'">
                      {{ ep.enabled ? 'Enabled' : 'Disabled' }}
                    </span>
                  </td>
                  <td class="acts-col">
                    <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="openEditEndpoint(ep)">Edit</button>
                    <button class="bw-btn bw-btn-ghost bw-btn-sm danger-btn" @click="deleteEndpoint(ep.logicalKey)">Delete</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Add OEM Modal -->
    <div v-if="showAddModal" class="bw-modal-backdrop" @click.self="showAddModal = false">
      <div class="bw-modal">
        <div class="bw-modal-header">
          <h2>Add OEM Meter Brand</h2>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="showAddModal = false">✕</button>
        </div>
        <div class="bw-modal-body">
          <div class="bw-form-group">
            <label class="bw-label">Manufacturer Name *</label>
            <input v-model="oemForm.displayName" class="bw-input" placeholder="e.g. SparkMeter, Calinmeter, Ihemeter" />
          </div>
          <div class="bw-form-group">
            <label class="bw-label">Slug (optional)</label>
            <input v-model="oemForm.slug" class="bw-input bw-mono" placeholder="sparkmeter" />
          </div>
          <div class="bw-form-group">
            <label class="bw-label">Vending Strategy</label>
            <select v-model="oemForm.vendingStrategy" class="bw-select">
              <option value="sts_token">STS Token Encryption</option>
              <option value="direct_credit">Direct Credit API</option>
            </select>
          </div>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="showAddModal = false">Cancel</button>
          <button class="bw-btn bw-btn-primary" @click="createOem">Add Brand</button>
        </div>
      </div>
    </div>

    <!-- Endpoint Modal -->
    <div v-if="showEndpointModal && editingEndpoint" class="bw-modal-backdrop" @click.self="showEndpointModal = false">
      <div class="bw-modal">
        <div class="bw-modal-header">
          <h2>Configure API Endpoint</h2>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="showEndpointModal = false">✕</button>
        </div>
        <div class="bw-modal-body">
          <div class="bw-form-group">
            <label class="bw-label">Logical Key *</label>
            <input v-model="editingEndpoint.logicalKey" class="bw-input bw-mono" placeholder="e.g. remote_vending" />
          </div>
          <div class="bw-form-group">
            <label class="bw-label">Upstream Path *</label>
            <input v-model="editingEndpoint.upstreamPath" class="bw-input bw-mono" placeholder="/api/v1/vend" />
          </div>
          <div class="bw-form-group">
            <label class="bw-label">HTTP Method</label>
            <select v-model="editingEndpoint.method" class="bw-select">
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="showEndpointModal = false">Cancel</button>
          <button class="bw-btn bw-btn-primary" @click="saveEndpoint">Save Endpoint</button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.dev-oem-view { display: flex; flex-direction: column; gap: var(--s-4); }
.oem-toolbar { display: flex; gap: var(--s-3); margin-bottom: var(--s-4); }
.oem-search { flex: 1; }
.oem-cards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--s-4); }

.oem-card {
  background: var(--surface-1);
  border: 1px solid var(--glass-border);
  border-radius: var(--r-lg);
  padding: var(--s-4);
  cursor: pointer;
  display: flex; flex-direction: column; gap: var(--s-3);
  transition: all var(--dur-fast) var(--ease-out);
}
.oem-card:hover {
  background: var(--surface-2);
  border-color: oklch(70% 0.19 145 / 0.40);
  box-shadow: 0 0 16px oklch(70% 0.19 145 / 0.15);
}
.oem-card-hd { display: flex; align-items: center; gap: var(--s-3); }
.oem-icon {
  width: 36px; height: 36px; border-radius: 8px;
  background: oklch(70% 0.19 145 / 0.14);
  color: oklch(70% 0.19 145);
  display: grid; place-items: center;
}
.oem-meta { flex: 1; display: flex; flex-direction: column; }
.oem-meta h3 { margin: 0; font-size: var(--t-base); font-weight: 600; }
.oem-meta code { font-size: var(--t-xs); color: var(--text-muted); }

.oem-card-body { display: flex; flex-direction: column; gap: var(--s-2); }
.oem-info-line { font-size: var(--t-xs); color: var(--text-dim); display: flex; justify-content: space-between; }
.oem-caps { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.cap-badge { font-size: 9px; text-transform: lowercase; }

.oem-card-foot {
  margin-top: auto; padding-top: var(--s-2); border-top: 1px solid var(--glass-border);
  font-size: var(--t-xs); font-weight: 600; color: oklch(70% 0.19 145);
}

.oem-detail-header { display: flex; flex-direction: column; gap: var(--s-2); }
.oem-title-row { display: flex; align-items: center; gap: var(--s-3); }
.oem-title-row h2 { margin: 0; font-size: var(--t-xl); }

.oem-detail-body { display: flex; flex-direction: column; gap: var(--s-4); }
.oem-sec-card { padding: var(--s-4); display: flex; flex-direction: column; gap: var(--s-3); }
.meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--s-3); }
.meta-grid label { display: block; font-size: var(--t-xs); color: var(--text-muted); }

.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--s-3); margin-top: var(--s-2); }
.card-actions { display: flex; gap: var(--s-3); justify-content: flex-end; margin-top: var(--s-3); }
.sec-hd-row { display: flex; justify-content: space-between; align-items: center; }

.test-banner {
  padding: var(--s-3); border-radius: var(--r-md); margin-top: var(--s-3); font-size: var(--t-sm);
  display: flex; flex-direction: column; gap: 4px;
}
.test-ok { background: color-mix(in oklch, var(--success) 12%, transparent); border: 1px solid var(--success); color: var(--success); }
.test-fail { background: color-mix(in oklch, var(--danger) 12%, transparent); border: 1px solid var(--danger); color: var(--danger); }

.acts-col { display: flex; gap: 4px; justify-content: flex-end; }
.danger-btn { color: var(--danger); }
</style>
