<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../lib/api';
import AppShell from '../components/AppShell.vue';

interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret_prefix: string;
  enabled: boolean;
  created_at: string;
  last_delivery_at: string | null;
  failure_count: number;
}

interface Delivery {
  id: string;
  webhook_id: string;
  webhook_url: string;
  event_type: string;
  status: 'delivered' | 'failed' | 'retrying';
  http_status: number | null;
  attempt: number;
  latency_ms: number | null;
  delivered_at: string | null;
  request_body: string;
  response_body: string | null;
}

const ALL_EVENTS = [
  'transaction.completed', 'transaction.failed', 'token.vended',
  'wallet.funded', 'wallet.debited', 'dispute.opened', 'dispute.resolved',
  'customer.created', 'vendor.approved', 'meter.reading_updated',
];

const tab       = ref<'endpoints' | 'deliveries'>('endpoints');
const hooks     = ref<Webhook[]>([]);
const deliveries = ref<Delivery[]>([]);
const loading   = ref(false);
const dlLoading = ref(false);
const error     = ref('');
const showCreate = ref(false);
const editing   = ref<Webhook | null>(null);
const saving    = ref(false);
const saveErr   = ref('');
const inspecting = ref<Delivery | null>(null);
const replaying = ref<string | null>(null);
const filterHook = ref('');

const newForm = ref({ url: '', events: [] as string[], secret: '' });
const editForm = ref({ url: '', events: [] as string[], enabled: true });

const filteredDl = computed(() =>
  filterHook.value
    ? deliveries.value.filter(d => d.webhook_id === filterHook.value)
    : deliveries.value
);

async function loadHooks() {
  loading.value = true; error.value = '';
  try {
    const r = await api.get<{ webhooks: Webhook[] }>('/api/v1/admin/dev/webhooks');
    hooks.value = r.webhooks ?? [];
  } catch (e: any) { error.value = e.message ?? 'Failed to load'; }
  finally { loading.value = false; }
}

async function loadDeliveries() {
  dlLoading.value = true;
  try {
    const r = await api.get<{ deliveries: Delivery[] }>('/api/v1/admin/dev/webhooks/deliveries?limit=100');
    deliveries.value = r.deliveries ?? [];
  } catch (e: any) { error.value = e.message ?? 'Failed to load deliveries'; }
  finally { dlLoading.value = false; }
}

async function switchTab(t: 'endpoints' | 'deliveries') {
  tab.value = t;
  if (t === 'deliveries' && !deliveries.value.length) await loadDeliveries();
}

function openCreate() { newForm.value = { url: '', events: [], secret: '' }; showCreate.value = true; }
function openEdit(h: Webhook) {
  editing.value = h;
  editForm.value = { url: h.url, events: [...h.events], enabled: h.enabled };
}

async function create() {
  saveErr.value = '';
  if (!newForm.value.url) { saveErr.value = 'URL is required.'; return; }
  if (!newForm.value.events.length) { saveErr.value = 'Select at least one event.'; return; }
  saving.value = true;
  try {
    await api.post('/api/v1/admin/dev/webhooks', {
      url: newForm.value.url.trim(),
      events: newForm.value.events,
      secret: newForm.value.secret || undefined,
    });
    showCreate.value = false;
    await loadHooks();
  } catch (e: any) { saveErr.value = e.message ?? 'Failed to create'; }
  finally { saving.value = false; }
}

async function save() {
  if (!editing.value) return;
  saveErr.value = '';
  saving.value = true;
  try {
    await api.patch(`/api/v1/admin/dev/webhooks/${editing.value.id}`, {
      url: editForm.value.url.trim(),
      events: editForm.value.events,
      enabled: editForm.value.enabled,
    });
    editing.value = null;
    await loadHooks();
  } catch (e: any) { saveErr.value = e.message ?? 'Failed to save'; }
  finally { saving.value = false; }
}

async function remove(id: string) {
  if (!confirm('Delete this webhook endpoint?')) return;
  try { await api.del(`/api/v1/admin/dev/webhooks/${id}`); await loadHooks(); }
  catch (e: any) { error.value = e.message ?? 'Failed to delete'; }
}

async function replay(d: Delivery) {
  replaying.value = d.id;
  try {
    await api.post(`/api/v1/admin/dev/webhooks/deliveries/${d.id}/replay`);
    await loadDeliveries();
  } catch (e: any) { error.value = e.message ?? 'Failed to replay'; }
  finally { replaying.value = null; }
}

function toggleNewEvent(e: string) {
  const i = newForm.value.events.indexOf(e);
  if (i === -1) newForm.value.events.push(e);
  else newForm.value.events.splice(i, 1);
}

function toggleEditEvent(e: string) {
  const i = editForm.value.events.indexOf(e);
  if (i === -1) editForm.value.events.push(e);
  else editForm.value.events.splice(i, 1);
}

function fmt(s: string | null) {
  return s ? new Date(s).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function fmtJson(raw: string) {
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}

onMounted(loadHooks);
</script>

<template>
  <AppShell title="Webhooks">
    <div class="bw-page-actions">
      <button class="bw-btn bw-btn-primary" @click="openCreate">+ New Endpoint</button>
    </div>

    <!-- Sub-nav -->
    <div class="bw-segmented" style="max-width:280px; margin-bottom:var(--s-4)">
      <button :class="['bw-seg', { active: tab === 'endpoints' }]" @click="switchTab('endpoints')">Endpoints</button>
      <button :class="['bw-seg', { active: tab === 'deliveries' }]" @click="switchTab('deliveries')">Delivery Log</button>
    </div>

    <div v-if="error" class="bw-error-banner" style="margin-bottom:var(--s-3)">{{ error }}</div>

    <!-- Endpoints tab -->
    <div v-if="tab === 'endpoints'">
      <div v-if="loading" class="bw-loading">Loading…</div>
      <div v-else class="bw-table-wrapper">
        <table class="bw-table">
          <thead>
            <tr><th>URL</th><th>Events</th><th>Status</th><th>Failures</th><th>Last Delivery</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="h in hooks" :key="h.id">
              <td class="bw-mono bw-text-sm url-cell">{{ h.url }}</td>
              <td>
                <div class="scope-chips">
                  <span v-for="ev in h.events.slice(0,3)" :key="ev" class="scope-chip">{{ ev }}</span>
                  <span v-if="h.events.length > 3" class="scope-chip muted">+{{ h.events.length - 3 }}</span>
                </div>
              </td>
              <td>
                <span :class="h.enabled ? 'bw-badge-success' : 'bw-badge-neutral'" class="bw-badge">
                  {{ h.enabled ? 'Active' : 'Paused' }}
                </span>
              </td>
              <td class="bw-text-sm">
                <span :class="h.failure_count > 0 ? 'bw-text-danger' : 'bw-text-muted'">{{ h.failure_count }}</span>
              </td>
              <td class="bw-text-sm">{{ fmt(h.last_delivery_at) }}</td>
              <td style="display:flex;gap:4px;min-width:110px">
                <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="openEdit(h)">Edit</button>
                <button class="bw-btn bw-btn-ghost bw-btn-sm danger-btn" @click="remove(h.id)">Delete</button>
              </td>
            </tr>
            <tr v-if="!hooks.length"><td colspan="6" class="bw-empty">No webhook endpoints registered.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Delivery log tab -->
    <div v-if="tab === 'deliveries'">
      <div class="dl-filter">
        <select v-model="filterHook" class="bw-select" style="max-width:320px">
          <option value="">All endpoints</option>
          <option v-for="h in hooks" :key="h.id" :value="h.id">{{ h.url }}</option>
        </select>
        <button type="button" class="bw-btn bw-btn-ghost bw-btn-sm" @click.prevent="loadDeliveries">Refresh</button>
      </div>
      <div v-if="dlLoading" class="bw-loading">Loading…</div>
      <div v-else class="bw-table-wrapper">
        <table class="bw-table">
          <thead>
            <tr><th>Event</th><th>Endpoint</th><th>Status</th><th>HTTP</th><th>Latency</th><th>Attempt</th><th>Time</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="d in filteredDl" :key="d.id">
              <td class="bw-mono bw-text-sm">{{ d.event_type }}</td>
              <td class="bw-text-sm url-cell">{{ d.webhook_url }}</td>
              <td>
                <span :class="{
                  'bw-badge-success': d.status === 'delivered',
                  'bw-badge-danger':  d.status === 'failed',
                  'bw-badge-warn':    d.status === 'retrying',
                }" class="bw-badge">{{ d.status }}</span>
              </td>
              <td class="bw-mono bw-text-sm" :class="(d.http_status ?? 0) >= 400 ? 'bw-text-danger' : ''">
                {{ d.http_status ?? '—' }}
              </td>
              <td class="bw-text-sm">{{ d.latency_ms != null ? `${d.latency_ms}ms` : '—' }}</td>
              <td class="bw-text-sm">{{ d.attempt }}</td>
              <td class="bw-text-sm">{{ fmt(d.delivered_at) }}</td>
              <td style="display:flex;gap:4px">
                <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="inspecting = d">Inspect</button>
                <button class="bw-btn bw-btn-ghost bw-btn-sm" :disabled="replaying === d.id" @click="replay(d)">
                  {{ replaying === d.id ? '…' : 'Replay' }}
                </button>
              </td>
            </tr>
            <tr v-if="!filteredDl.length"><td colspan="8" class="bw-empty">No deliveries found.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Delivery inspector -->
    <div v-if="inspecting" class="bw-modal-backdrop" @click.self="inspecting = null">
      <div class="bw-modal inspect-modal">
        <div class="bw-modal-header">
          <div>
            <h2>{{ inspecting.event_type }}</h2>
            <span class="bw-mono bw-text-muted" style="font-size:11px">{{ inspecting.webhook_url }}</span>
          </div>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="inspecting = null">✕</button>
        </div>
        <div class="bw-modal-body">
          <div class="inspect-grid">
            <div>
              <div class="inspect-label">Request Body</div>
              <pre class="code-block">{{ fmtJson(inspecting.request_body) }}</pre>
            </div>
            <div>
              <div class="inspect-label">Response Body</div>
              <pre class="code-block">{{ inspecting.response_body ? fmtJson(inspecting.response_body) : '(empty)' }}</pre>
            </div>
          </div>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="inspecting = null">Close</button>
          <button class="bw-btn bw-btn-primary" :disabled="replaying === inspecting!.id" @click="replay(inspecting!)">
            {{ replaying === inspecting!.id ? 'Replaying…' : 'Replay' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Create modal -->
    <div v-if="showCreate" class="bw-modal-backdrop" @click.self="showCreate = false">
      <div class="bw-modal">
        <div class="bw-modal-header">
          <h2>New Webhook Endpoint</h2>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="showCreate = false">✕</button>
        </div>
        <div class="bw-modal-body">
          <div class="bw-form-group">
            <label class="bw-label">Endpoint URL *</label>
            <input v-model="newForm.url" class="bw-input bw-mono" placeholder="https://yourapp.com/webhooks/beverly" />
          </div>
          <div class="bw-form-group">
            <label class="bw-label">Signing Secret <span class="bw-text-muted">(leave blank to auto-generate)</span></label>
            <input v-model="newForm.secret" class="bw-input bw-mono" placeholder="whsec_…" />
          </div>
          <div class="bw-form-group">
            <label class="bw-label">Event Subscriptions *</label>
            <div class="event-grid">
              <label v-for="ev in ALL_EVENTS" :key="ev" class="scope-check">
                <input type="checkbox" :checked="newForm.events.includes(ev)" @change="toggleNewEvent(ev)" />
                <code>{{ ev }}</code>
              </label>
            </div>
          </div>
          <div v-if="saveErr" class="bw-error-banner">{{ saveErr }}</div>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="showCreate = false">Cancel</button>
          <button class="bw-btn bw-btn-primary" :disabled="saving" @click="create">{{ saving ? 'Creating…' : 'Create' }}</button>
        </div>
      </div>
    </div>

    <!-- Edit modal -->
    <div v-if="editing" class="bw-modal-backdrop" @click.self="editing = null">
      <div class="bw-modal">
        <div class="bw-modal-header">
          <h2>Edit Webhook</h2>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="editing = null">✕</button>
        </div>
        <div class="bw-modal-body">
          <div class="bw-form-group">
            <label class="bw-label">Endpoint URL</label>
            <input v-model="editForm.url" class="bw-input bw-mono" />
          </div>
          <div class="bw-form-group">
            <label class="bw-label">Status</label>
            <div style="display:flex;align-items:center;gap:var(--s-3)">
              <input type="checkbox" v-model="editForm.enabled" id="hook-enabled" />
              <label for="hook-enabled" style="font-size:var(--t-sm)">Enabled</label>
            </div>
          </div>
          <div class="bw-form-group">
            <label class="bw-label">Event Subscriptions</label>
            <div class="event-grid">
              <label v-for="ev in ALL_EVENTS" :key="ev" class="scope-check">
                <input type="checkbox" :checked="editForm.events.includes(ev)" @change="toggleEditEvent(ev)" />
                <code>{{ ev }}</code>
              </label>
            </div>
          </div>
          <div v-if="saveErr" class="bw-error-banner">{{ saveErr }}</div>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="editing = null">Cancel</button>
          <button class="bw-btn bw-btn-primary" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save' }}</button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.url-cell { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dl-filter { display: flex; align-items: center; gap: var(--s-2); margin-bottom: var(--s-3); }
.scope-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.scope-chip {
  font-family: var(--font-mono); font-size: 10px; padding: 2px 6px;
  background: var(--glass-bg-strong); border: 1px solid var(--glass-border);
  border-radius: var(--r-sm); color: var(--brand);
}
.scope-chip.muted { color: var(--text-muted); }
.danger-btn { color: var(--danger) !important; }
.event-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-2); }
.scope-check { display: flex; align-items: center; gap: var(--s-2); font-size: var(--t-sm); cursor: pointer; }
.scope-check code { font-size: 11px; }
.inspect-modal { max-width: min(900px, 95vw) !important; }
.inspect-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-4); }
.inspect-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: var(--s-2); }
.code-block {
  background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: var(--r-md); padding: var(--s-3);
  font-family: var(--font-mono); font-size: 11px; line-height: 1.6;
  overflow: auto; max-height: 320px; white-space: pre;
  color: var(--text);
}
@media (max-width: 640px) { .inspect-grid { grid-template-columns: 1fr; } }
</style>
