<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../lib/api';
import AppShell from '../components/AppShell.vue';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  org_id: string | null;
  org_name: string | null;
  org_type: 'vendor' | 'customer' | 'system' | null;
  scopes: string[];
  last_used_at: string | null;
  last_used_ip: string | null;
  created_at: string;
  revoked_at: string | null;
}

const ALL_SCOPES = [
  'read:customers', 'write:customers',
  'read:wallets', 'write:wallets',
  'read:transactions', 'write:transactions',
  'read:meters', 'write:tokens',
  'webhook:receive', 'sandbox:use',
];

const keys      = ref<ApiKey[]>([]);
const loading   = ref(false);
const error     = ref('');
const showCreate = ref(false);
const creating  = ref(false);
const createErr = ref('');
const revoking  = ref<string | null>(null);
const newKey    = ref<string | null>(null);
const copied    = ref(false);

const newForm = ref({
  name: '', org_id: '', org_type: 'vendor' as 'vendor' | 'customer' | 'system',
  scopes: [] as string[],
});

const active  = computed(() => keys.value.filter(k => !k.revoked_at));
const revoked = computed(() => keys.value.filter(k => k.revoked_at));

async function load() {
  loading.value = true; error.value = '';
  try {
    const r = await api.get<{ keys: ApiKey[] }>('/api/v1/admin/dev/api-keys');
    keys.value = (r.keys ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
  } catch (e: any) { error.value = e.message ?? 'Failed to load'; }
  finally { loading.value = false; }
}

async function createKey() {
  createErr.value = '';
  if (!newForm.value.name.trim()) { createErr.value = 'Name is required.'; return; }
  creating.value = true;
  try {
    const r = await api.post<{ key: string }>('/api/v1/admin/dev/api-keys', {
      name: newForm.value.name.trim(),
      org_id: newForm.value.org_id || null,
      org_type: newForm.value.org_id ? newForm.value.org_type : null,
      scopes: newForm.value.scopes,
    });
    newKey.value = r.key;
    showCreate.value = false;
    newForm.value = { name: '', org_id: '', org_type: 'vendor', scopes: [] };
    await load();
  } catch (e: any) { createErr.value = e.message ?? 'Failed to create'; }
  finally { creating.value = false; }
}

async function revokeKey(id: string) {
  if (!confirm('Revoke this API key? Existing requests using it will fail immediately.')) return;
  revoking.value = id;
  try { await api.del(`/api/v1/admin/dev/api-keys/${id}`); await load(); }
  catch (e: any) { error.value = e.message ?? 'Failed to revoke'; }
  finally { revoking.value = null; }
}

async function rotateKey(id: string) {
  if (!confirm('Rotate this key? A new secret is generated and the old key stops working immediately.')) return;
  revoking.value = id;
  try {
    const r = await api.post<{ key: string }>(`/api/v1/admin/dev/api-keys/${id}/rotate`);
    newKey.value = r.key;
    await load();
  } catch (e: any) { error.value = e.message ?? 'Failed to rotate'; }
  finally { revoking.value = null; }
}

async function copyKey() {
  if (!newKey.value) return;
  await navigator.clipboard.writeText(newKey.value);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}

function toggleScope(s: string) {
  const i = newForm.value.scopes.indexOf(s);
  if (i === -1) newForm.value.scopes.push(s);
  else newForm.value.scopes.splice(i, 1);
}

function fmt(s: string | null) {
  return s ? new Date(s).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

onMounted(load);
</script>

<template>
  <AppShell title="API Keys">
    <div class="bw-page-actions">
      <button class="bw-btn bw-btn-primary" @click="showCreate = true">+ New Key</button>
    </div>

    <!-- New key banner -->
    <div v-if="newKey" class="key-banner" role="alert">
      <div class="key-banner-hd">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6M15.5 7.5l3 3"/></svg>
        API key created — copy it now. It won't be shown again.
      </div>
      <div class="key-banner-row">
        <code class="key-banner-val">{{ newKey }}</code>
        <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="copyKey">{{ copied ? '✓ Copied' : 'Copy' }}</button>
        <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="newKey = null">Dismiss</button>
      </div>
    </div>

    <div v-if="loading" class="bw-loading">Loading…</div>
    <div v-else-if="error" class="bw-error-banner">{{ error }}</div>

    <div v-else>
      <!-- KPI row -->
      <div class="kpi-row">
        <div class="bw-kpi">
          <span class="bw-kpi-label">Active Keys</span>
          <span class="bw-kpi-val">{{ active.length }}</span>
        </div>
        <div class="bw-kpi">
          <span class="bw-kpi-label">Revoked Keys</span>
          <span class="bw-kpi-val bw-text-muted">{{ revoked.length }}</span>
        </div>
        <div class="bw-kpi">
          <span class="bw-kpi-label">Last Used</span>
          <span class="bw-kpi-val bw-text-sm">{{ fmt(active.reduce((m, k) => (!m || (k.last_used_at ?? '') > m) ? (k.last_used_at ?? m) : m, null as string | null)) }}</span>
        </div>
      </div>

      <div class="bw-table-wrapper">
        <table class="bw-table">
          <thead>
            <tr>
              <th>Key</th><th>Name</th><th>Org</th><th>Scopes</th>
              <th>Last Used</th><th>Last IP</th><th>Created</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="k in keys" :key="k.id" :class="{ 'row-revoked': k.revoked_at }">
              <td class="bw-mono bw-text-sm">{{ k.prefix }}…</td>
              <td class="bw-text-sm">{{ k.name }}</td>
              <td class="bw-text-sm bw-text-muted">
                <span v-if="k.org_name">{{ k.org_name }} <span class="bw-badge bw-badge-neutral" style="font-size:10px">{{ k.org_type }}</span></span>
                <span v-else>—</span>
              </td>
              <td>
                <div class="scope-chips">
                  <span v-for="s in k.scopes" :key="s" class="scope-chip">{{ s }}</span>
                  <span v-if="!k.scopes.length" class="bw-text-muted bw-text-sm">none</span>
                </div>
              </td>
              <td class="bw-text-sm">{{ fmt(k.last_used_at) }}</td>
              <td class="bw-mono bw-text-sm">{{ k.last_used_ip ?? '—' }}</td>
              <td class="bw-text-sm">{{ fmt(k.created_at) }}</td>
              <td>
                <span v-if="k.revoked_at" class="bw-badge bw-badge-danger">Revoked</span>
                <span v-else class="bw-badge bw-badge-success">Active</span>
              </td>
              <td class="key-acts-col">
                <template v-if="!k.revoked_at">
                  <button class="bw-btn bw-btn-ghost bw-btn-sm" :disabled="revoking === k.id" @click="rotateKey(k.id)">Rotate</button>
                  <button class="bw-btn bw-btn-ghost bw-btn-sm danger-btn" :disabled="revoking === k.id" @click="revokeKey(k.id)">Revoke</button>
                </template>
              </td>
            </tr>
            <tr v-if="!keys.length"><td colspan="9" class="bw-empty">No API keys yet.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create modal -->
    <div v-if="showCreate" class="bw-modal-backdrop" @click.self="showCreate = false">
      <div class="bw-modal">
        <div class="bw-modal-header">
          <h2>New API Key</h2>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="showCreate = false">✕</button>
        </div>
        <div class="bw-modal-body">
          <div class="bw-form-group">
            <label class="bw-label">Key Name *</label>
            <input v-model="newForm.name" class="bw-input" placeholder="e.g. Vendor Webhook Consumer" />
          </div>
          <div class="bw-form-group">
            <label class="bw-label">Org ID <span class="bw-text-muted">(optional — blank = system-level)</span></label>
            <input v-model="newForm.org_id" class="bw-input bw-mono" placeholder="org_xxxxxxxxxxxx" />
          </div>
          <div v-if="newForm.org_id" class="bw-form-group">
            <label class="bw-label">Org Type</label>
            <select v-model="newForm.org_type" class="bw-select">
              <option value="vendor">Vendor</option>
              <option value="customer">Customer</option>
            </select>
          </div>
          <div class="bw-form-group">
            <label class="bw-label">Scopes</label>
            <div class="scope-grid">
              <label v-for="s in ALL_SCOPES" :key="s" class="scope-check">
                <input type="checkbox" :checked="newForm.scopes.includes(s)" @change="toggleScope(s)" />
                <code>{{ s }}</code>
              </label>
            </div>
          </div>
          <div v-if="createErr" class="bw-error-banner">{{ createErr }}</div>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="showCreate = false">Cancel</button>
          <button class="bw-btn bw-btn-primary" :disabled="creating" @click="createKey">
            {{ creating ? 'Generating…' : 'Generate Key' }}
          </button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--s-3); margin-bottom: var(--s-4); }

.key-banner {
  margin-bottom: var(--s-4);
  background: oklch(from var(--brand) l c h / 0.10);
  border: 1px solid oklch(from var(--brand) l c h / 0.30);
  border-radius: var(--r-lg);
  padding: var(--s-3) var(--s-4);
  display: flex; flex-direction: column; gap: var(--s-2);
}
.key-banner-hd { display: flex; align-items: center; gap: var(--s-2); color: var(--brand); font-size: var(--t-sm); font-weight: 600; }
.key-banner-row { display: flex; align-items: center; gap: var(--s-2); flex-wrap: wrap; }
.key-banner-val {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: var(--font-mono); font-size: var(--t-sm);
  background: var(--glass-bg-strong); border: 1px solid var(--glass-border);
  border-radius: var(--r-md); padding: 6px 10px;
}

.row-revoked td { opacity: 0.45; }
.key-acts-col { display: flex; gap: var(--s-1); min-width: 130px; }
.danger-btn { color: var(--danger) !important; }
.scope-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.scope-chip {
  font-family: var(--font-mono); font-size: 10px; padding: 2px 6px;
  background: var(--glass-bg-strong); border: 1px solid var(--glass-border);
  border-radius: var(--r-sm); color: var(--brand);
}
.scope-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-2); }
.scope-check { display: flex; align-items: center; gap: var(--s-2); font-size: var(--t-sm); cursor: pointer; }
.scope-check code { font-size: 11px; }
</style>
