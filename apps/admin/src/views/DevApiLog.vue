<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../lib/api';
import AppShell from '../components/AppShell.vue';

interface LogEntry {
  id: string;
  ts: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  actor_id: string | null;
  actor_type: 'staff' | 'vendor' | 'customer' | 'api_key' | null;
  actor_label: string | null;
  status: number;
  latency_ms: number;
  req_size_bytes: number;
  res_size_bytes: number;
  req_body: string | null;
  res_body: string | null;
  ip: string | null;
}

const entries    = ref<LogEntry[]>([]);
const loading    = ref(false);
const error      = ref('');
const inspecting = ref<LogEntry | null>(null);
const cursor     = ref<string | null>(null);
const hasMore    = ref(false);

const fMethod  = ref('');
const fStatus  = ref('');
const fActor   = ref('');
const fPath    = ref('');
const fDateFrom = ref('');

const filtered = computed(() => entries.value.filter(e => {
  if (fMethod.value && e.method !== fMethod.value) return false;
  if (fStatus.value) {
    const code = parseInt(fStatus.value);
    if (fStatus.value.endsWith('xx')) {
      const prefix = Math.floor(code / 100) * 100;
      if (Math.floor(e.status / 100) * 100 !== prefix) return false;
    } else if (e.status !== code) return false;
  }
  if (fActor.value && !(e.actor_id?.includes(fActor.value) || e.actor_label?.toLowerCase().includes(fActor.value.toLowerCase()))) return false;
  if (fPath.value && !e.path.toLowerCase().includes(fPath.value.toLowerCase())) return false;
  return true;
}));

function statusClass(s: number) {
  if (s < 300) return 'bw-text-brand';
  if (s < 400) return 'bw-text-muted';
  if (s < 500) return 'bw-text-warn';
  return 'bw-text-danger';
}

function methodClass(m: string) {
  const map: Record<string, string> = { GET: 'badge-method-get', POST: 'badge-method-post', DELETE: 'badge-method-del', PATCH: 'badge-method-patch', PUT: 'badge-method-put' };
  return map[m] ?? '';
}

async function load(append = false) {
  loading.value = true; error.value = '';
  try {
    const params = new URLSearchParams({ limit: '50' });
    if (append && cursor.value) params.set('cursor', cursor.value);
    if (fDateFrom.value) params.set('from', new Date(fDateFrom.value).toISOString());
    const r = await api.get<{ entries: LogEntry[]; cursor: string | null; has_more: boolean }>(
      `/api/v1/admin/dev/api-log?${params}`
    );
    if (append) entries.value.push(...(r.entries ?? []));
    else entries.value = r.entries ?? [];
    cursor.value = r.cursor;
    hasMore.value = r.has_more ?? false;
  } catch (e: any) { error.value = e.message ?? 'Failed to load'; }
  finally { loading.value = false; }
}

function refresh() { cursor.value = null; load(false); }
function loadMore() { load(true); }

function fmt(s: string) {
  return new Date(s).toLocaleString('en-NG', { dateStyle: 'short', timeStyle: 'medium' });
}

function fmtJson(raw: string | null) {
  if (!raw) return '(empty)';
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n}B`;
  return `${(n / 1024).toFixed(1)}K`;
}

onMounted(refresh);
</script>

<template>
  <AppShell title="API Request Log">
    <div class="bw-page-actions">
      <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="refresh">↺ Refresh</button>
    </div>

    <!-- Filter bar -->
    <div class="bw-filter-bar" style="margin-bottom:var(--s-3)">
      <select v-model="fMethod" class="bw-select filter-select">
        <option value="">All methods</option>
        <option v-for="m in ['GET','POST','PUT','PATCH','DELETE']" :key="m" :value="m">{{ m }}</option>
      </select>
      <input v-model="fPath" class="bw-input filter-input" placeholder="Path filter…" />
      <input v-model="fActor" class="bw-input filter-input" placeholder="Actor ID / name…" />
      <select v-model="fStatus" class="bw-select filter-select">
        <option value="">All statuses</option>
        <option value="2xx">2xx Success</option>
        <option value="4xx">4xx Client error</option>
        <option value="5xx">5xx Server error</option>
      </select>
      <input v-model="fDateFrom" type="date" class="bw-input filter-date" title="From date" />
      <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="refresh">Apply</button>
    </div>

    <div v-if="error" class="bw-error-banner" style="margin-bottom:var(--s-3)">{{ error }}</div>

    <!-- Result count -->
    <div style="font-size:var(--t-xs);color:var(--text-muted);margin-bottom:var(--s-2)">
      {{ filtered.length }} entries{{ filtered.length < entries.length ? ` (filtered from ${entries.length})` : '' }}
    </div>

    <div class="bw-table-wrapper">
      <table class="bw-table log-table">
        <thead>
          <tr>
            <th style="width:140px">Time</th>
            <th style="width:70px">Method</th>
            <th>Path</th>
            <th>Actor</th>
            <th style="width:60px">Status</th>
            <th style="width:80px">Latency</th>
            <th style="width:80px">Size</th>
            <th style="width:40px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && !entries.length"><td colspan="8" class="bw-loading">Loading…</td></tr>
          <tr v-for="e in filtered" :key="e.id" class="log-row" @click="inspecting = e">
            <td class="bw-mono bw-text-sm ts-cell">{{ fmt(e.ts) }}</td>
            <td><span :class="['method-badge', methodClass(e.method)]">{{ e.method }}</span></td>
            <td class="bw-mono bw-text-sm path-cell" :title="e.path">{{ e.path }}</td>
            <td class="bw-text-sm actor-cell">
              <span v-if="e.actor_label">{{ e.actor_label }}</span>
              <span v-else-if="e.actor_id" class="bw-mono bw-text-muted">{{ e.actor_id.slice(0, 12) }}…</span>
              <span v-else class="bw-text-muted">anonymous</span>
            </td>
            <td class="bw-mono bw-text-sm" :class="statusClass(e.status)">{{ e.status }}</td>
            <td class="bw-text-sm" :class="e.latency_ms > 1000 ? 'bw-text-warn' : ''">{{ e.latency_ms }}ms</td>
            <td class="bw-text-sm bw-text-muted">{{ fmtBytes(e.res_size_bytes) }}</td>
            <td class="bw-text-muted" style="font-size:12px">›</td>
          </tr>
          <tr v-if="!loading && !filtered.length"><td colspan="8" class="bw-empty">No entries match the current filters.</td></tr>
        </tbody>
      </table>
    </div>

    <div v-if="hasMore" style="text-align:center;padding:var(--s-4)">
      <button class="bw-btn bw-btn-ghost" :disabled="loading" @click="loadMore">
        {{ loading ? 'Loading…' : 'Load more' }}
      </button>
    </div>

    <!-- Inspect drawer -->
    <div v-if="inspecting" class="bw-modal-backdrop" @click.self="inspecting = null">
      <div class="bw-modal inspect-modal">
        <div class="bw-modal-header">
          <div>
            <span :class="['method-badge', methodClass(inspecting.method)]" style="margin-right:8px">{{ inspecting.method }}</span>
            <span class="bw-mono" style="font-size:var(--t-sm)">{{ inspecting.path }}</span>
          </div>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="inspecting = null">✕</button>
        </div>
        <div class="bw-modal-body">
          <div class="meta-row">
            <div class="meta-item"><span class="meta-label">Status</span><span class="bw-mono" :class="statusClass(inspecting.status)">{{ inspecting.status }}</span></div>
            <div class="meta-item"><span class="meta-label">Latency</span><span>{{ inspecting.latency_ms }}ms</span></div>
            <div class="meta-item"><span class="meta-label">Actor</span><span class="bw-mono bw-text-sm">{{ inspecting.actor_id ?? '—' }}</span></div>
            <div class="meta-item"><span class="meta-label">IP</span><span class="bw-mono bw-text-sm">{{ inspecting.ip ?? '—' }}</span></div>
            <div class="meta-item"><span class="meta-label">Time</span><span class="bw-text-sm">{{ fmt(inspecting.ts) }}</span></div>
          </div>
          <div class="inspect-grid">
            <div>
              <div class="inspect-label">Request Body ({{ fmtBytes(inspecting.req_size_bytes) }})</div>
              <pre class="code-block">{{ fmtJson(inspecting.req_body) }}</pre>
            </div>
            <div>
              <div class="inspect-label">Response Body ({{ fmtBytes(inspecting.res_size_bytes) }})</div>
              <pre class="code-block">{{ fmtJson(inspecting.res_body) }}</pre>
            </div>
          </div>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="inspecting = null">Close</button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.filter-select { min-width: 140px; }
.filter-input  { min-width: 160px; }
.filter-date   { min-width: 140px; }

.log-table { font-variant-numeric: tabular-nums; }
.log-row { cursor: pointer; }
.log-row:hover { background: var(--glass-bg) !important; }
.ts-cell { white-space: nowrap; }
.path-cell { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actor-cell { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.method-badge {
  display: inline-block; padding: 2px 6px; border-radius: var(--r-sm);
  font-family: var(--font-mono); font-size: 10px; font-weight: 700;
}
.badge-method-get    { background: oklch(from var(--brand) l c h / 0.14); color: var(--brand); }
.badge-method-post   { background: oklch(65% 0.18 270 / 0.14); color: oklch(65% 0.18 270); }
.badge-method-patch  { background: oklch(78% 0.16 75 / 0.14); color: oklch(78% 0.16 75); }
.badge-method-put    { background: oklch(78% 0.16 75 / 0.14); color: oklch(78% 0.16 75); }
.badge-method-del    { background: oklch(from var(--danger) l c h / 0.14); color: var(--danger); }

.inspect-modal { max-width: min(920px, 96vw) !important; }
.meta-row { display: flex; flex-wrap: wrap; gap: var(--s-4); margin-bottom: var(--s-4); }
.meta-item { display: flex; flex-direction: column; gap: 2px; }
.meta-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.inspect-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-4); }
.inspect-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: var(--s-2); }
.code-block {
  background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: var(--r-md); padding: var(--s-3);
  font-family: var(--font-mono); font-size: 11px; line-height: 1.6;
  overflow: auto; max-height: 360px; white-space: pre; color: var(--text);
}
@media (max-width: 640px) { .inspect-grid { grid-template-columns: 1fr; } }
</style>
