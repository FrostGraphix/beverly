<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../lib/api';
import AppShell from '../components/AppShell.vue';

interface ErrorGroup {
  fingerprint: string;
  message: string;
  source: string;
  severity: 'error' | 'warning' | 'critical';
  count: number;
  first_seen: string;
  last_seen: string;
  affected_actors: string[];
  sample_stack: string | null;
  resolved: boolean;
}

interface SlowQuery {
  id: string;
  query_preview: string;
  duration_ms: number;
  table_hints: string[];
  called_at: string;
  source: string | null;
}

const tab         = ref<'errors' | 'slow-queries'>('errors');
const groups      = ref<ErrorGroup[]>([]);
const slowQueries = ref<SlowQuery[]>([]);
const loading     = ref(false);
const sqLoading   = ref(false);
const error       = ref('');
const detail      = ref<ErrorGroup | null>(null);
const resolving   = ref<string | null>(null);

const fSeverity   = ref('');
const fSource     = ref('');
const fResolved   = ref('false');
const fThreshold  = ref(500);

const filtered = computed(() => groups.value.filter(g => {
  if (fSeverity.value && g.severity !== fSeverity.value) return false;
  if (fSource.value && !g.source.toLowerCase().includes(fSource.value.toLowerCase())) return false;
  if (fResolved.value === 'true' && !g.resolved) return false;
  if (fResolved.value === 'false' && g.resolved) return false;
  return true;
}));

const totalErrors   = computed(() => groups.value.filter(g => !g.resolved).reduce((n, g) => n + g.count, 0));
const totalCritical = computed(() => groups.value.filter(g => g.severity === 'critical' && !g.resolved).length);
const affectedActors = computed(() => {
  const s = new Set<string>();
  groups.value.filter(g => !g.resolved).forEach(g => g.affected_actors.forEach(a => s.add(a)));
  return s.size;
});
const last24h = computed(() => groups.value.filter(g => {
  const d = Date.now() - new Date(g.last_seen).getTime();
  return d < 86_400_000 && !g.resolved;
}).length);

async function loadErrors() {
  loading.value = true; error.value = '';
  try {
    const r = await api.get<{ groups: ErrorGroup[] }>('/api/v1/admin/dev/errors');
    groups.value = r.groups ?? [];
  } catch (e: any) { error.value = e.message ?? 'Failed to load'; }
  finally { loading.value = false; }
}

async function loadSlowQueries() {
  sqLoading.value = true;
  try {
    const r = await api.get<{ queries: SlowQuery[] }>(`/api/v1/admin/dev/slow-queries?threshold_ms=${fThreshold.value}`);
    slowQueries.value = r.queries ?? [];
  } catch (e: any) { error.value = e.message ?? 'Failed to load slow queries'; }
  finally { sqLoading.value = false; }
}

async function switchTab(t: typeof tab.value) {
  tab.value = t;
  if (t === 'slow-queries' && !slowQueries.value.length) await loadSlowQueries();
}

async function resolveGroup(fp: string) {
  resolving.value = fp;
  try {
    await api.post(`/api/v1/admin/dev/errors/${encodeURIComponent(fp)}/resolve`);
    await loadErrors();
    if (detail.value?.fingerprint === fp) detail.value = null;
  } catch (e: any) { error.value = e.message ?? 'Failed to resolve'; }
  finally { resolving.value = null; }
}

function severityColor(s: ErrorGroup['severity']) {
  return { critical: 'var(--danger)', error: 'oklch(65% 0.18 30)', warning: 'var(--warn, oklch(78% 0.16 75))' }[s];
}

function fmt(s: string) {
  return new Date(s).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

function relativeTime(s: string) {
  const diff = Date.now() - new Date(s).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

onMounted(loadErrors);
</script>

<template>
  <AppShell title="Error Explorer">
    <div class="bw-page-actions">
      <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="tab === 'errors' ? loadErrors() : loadSlowQueries()">↺ Refresh</button>
    </div>

    <div v-if="error" class="bw-error-banner" style="margin-bottom:var(--s-3)">{{ error }}</div>

    <!-- Tab switcher -->
    <div class="bw-segmented" style="max-width:320px; margin-bottom:var(--s-4)">
      <button :class="['bw-seg', { active: tab === 'errors' }]" @click="switchTab('errors')">Runtime Errors</button>
      <button :class="['bw-seg', { active: tab === 'slow-queries' }]" @click="switchTab('slow-queries')">Slow Queries</button>
    </div>

    <!-- ERRORS TAB -->
    <div v-if="tab === 'errors'">
      <!-- KPIs -->
      <div class="kpi-row bw-mobile-kpi-grid">
        <div class="bw-kpi">
          <span class="bw-kpi-label">Total Occurrences</span>
          <span class="bw-kpi-val" :style="totalErrors > 0 ? 'color:var(--danger)' : ''">{{ totalErrors.toLocaleString() }}</span>
        </div>
        <div class="bw-kpi">
          <span class="bw-kpi-label">Critical Groups</span>
          <span class="bw-kpi-val" :style="totalCritical > 0 ? 'color:var(--danger)' : ''">{{ totalCritical }}</span>
        </div>
        <div class="bw-kpi">
          <span class="bw-kpi-label">Affected Actors</span>
          <span class="bw-kpi-val">{{ affectedActors }}</span>
        </div>
        <div class="bw-kpi">
          <span class="bw-kpi-label">Active (24h)</span>
          <span class="bw-kpi-val">{{ last24h }}</span>
        </div>
      </div>

      <!-- Filters -->
      <div class="filter-row">
        <select v-model="fSeverity" class="bw-select">
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
        </select>
        <input v-model="fSource" class="bw-input" placeholder="Source filter…" style="max-width:200px" />
        <select v-model="fResolved" class="bw-select">
          <option value="false">Unresolved</option>
          <option value="true">Resolved</option>
          <option value="">All</option>
        </select>
      </div>

      <div v-if="loading" class="bw-loading">Loading…</div>
      <div v-else class="error-list">
        <div
          v-for="g in filtered"
          :key="g.fingerprint"
          :class="['error-row', `error-${g.severity}`, { 'error-resolved': g.resolved }]"
          @click="detail = g"
        >
          <div class="error-row-left">
            <span class="sev-dot" :style="{ background: severityColor(g.severity) }" />
            <div class="error-row-body">
              <div class="error-msg">{{ g.message }}</div>
              <div class="error-meta">
                <span class="error-source">{{ g.source }}</span>
                <span class="error-sep">·</span>
                <span>{{ g.count.toLocaleString() }} occurrences</span>
                <span class="error-sep">·</span>
                <span>last {{ relativeTime(g.last_seen) }}</span>
                <span v-if="g.affected_actors.length" class="error-sep">·</span>
                <span v-if="g.affected_actors.length">{{ g.affected_actors.length }} actor{{ g.affected_actors.length > 1 ? 's' : '' }}</span>
              </div>
            </div>
          </div>
          <div class="error-row-right">
            <span v-if="g.resolved" class="bw-badge bw-badge-neutral">Resolved</span>
            <span v-else :class="['bw-badge', g.severity === 'critical' ? 'bw-badge-danger' : g.severity === 'error' ? 'bw-badge-warn' : 'bw-badge-neutral']">
              {{ g.severity }}
            </span>
            <span class="error-arrow">›</span>
          </div>
        </div>
        <div v-if="!filtered.length" class="bw-empty">No error groups match.</div>
      </div>
    </div>

    <!-- SLOW QUERIES TAB -->
    <div v-if="tab === 'slow-queries'">
      <div class="filter-row">
        <label class="bw-label" style="white-space:nowrap">Threshold (ms)</label>
        <input v-model.number="fThreshold" type="number" min="100" step="100" class="bw-input" style="max-width:120px" />
        <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="loadSlowQueries">Apply</button>
      </div>

      <div v-if="sqLoading" class="bw-loading">Loading…</div>
      <div v-else class="bw-table-wrapper">
        <table class="bw-table">
          <thead>
            <tr><th>Query</th><th>Duration</th><th>Table Hints</th><th>Source</th><th>Time</th></tr>
          </thead>
          <tbody>
            <tr v-for="q in slowQueries" :key="q.id">
              <td class="bw-mono bw-text-sm query-cell">{{ q.query_preview }}</td>
              <td class="bw-mono bw-text-sm" :class="q.duration_ms > 2000 ? 'bw-text-danger' : 'bw-text-warn'">
                {{ q.duration_ms }}ms
              </td>
              <td>
                <div class="hint-chips">
                  <span v-for="h in q.table_hints" :key="h" class="hint-chip">{{ h }}</span>
                  <span v-if="!q.table_hints.length" class="bw-text-muted bw-text-sm">—</span>
                </div>
              </td>
              <td class="bw-text-sm bw-text-muted">{{ q.source ?? '—' }}</td>
              <td class="bw-text-sm">{{ fmt(q.called_at) }}</td>
            </tr>
            <tr v-if="!slowQueries.length"><td colspan="5" class="bw-empty">No slow queries above {{ fThreshold }}ms threshold.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Error detail modal -->
    <div v-if="detail" class="bw-modal-backdrop" @click.self="detail = null">
      <div class="bw-modal detail-modal">
        <div class="bw-modal-header">
          <div>
            <div style="display:flex;align-items:center;gap:var(--s-2);margin-bottom:4px">
              <span class="sev-dot" :style="{ background: severityColor(detail.severity) }" />
              <span :class="['bw-badge', detail.severity === 'critical' ? 'bw-badge-danger' : detail.severity === 'error' ? 'bw-badge-warn' : 'bw-badge-neutral']">
                {{ detail.severity }}
              </span>
              <span class="bw-mono bw-text-muted" style="font-size:10px">{{ detail.fingerprint.slice(0, 16) }}</span>
            </div>
            <div class="error-msg" style="font-size:var(--t-md)">{{ detail.message }}</div>
          </div>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="detail = null">✕</button>
        </div>
        <div class="bw-modal-body">
          <div class="detail-meta">
            <div class="meta-item"><span class="meta-label">Source</span><span>{{ detail.source }}</span></div>
            <div class="meta-item"><span class="meta-label">Occurrences</span><span class="bw-mono">{{ detail.count.toLocaleString() }}</span></div>
            <div class="meta-item"><span class="meta-label">First seen</span><span>{{ fmt(detail.first_seen) }}</span></div>
            <div class="meta-item"><span class="meta-label">Last seen</span><span>{{ fmt(detail.last_seen) }}</span></div>
          </div>

          <div v-if="detail.affected_actors.length" style="margin-bottom:var(--s-4)">
            <div class="section-label">Affected Actors ({{ detail.affected_actors.length }})</div>
            <div class="actor-chips">
              <code v-for="a in detail.affected_actors.slice(0, 20)" :key="a" class="actor-chip">{{ a }}</code>
              <span v-if="detail.affected_actors.length > 20" class="bw-text-muted bw-text-sm">+{{ detail.affected_actors.length - 20 }} more</span>
            </div>
          </div>

          <div v-if="detail.sample_stack">
            <div class="section-label">Stack Trace (sample)</div>
            <pre class="code-block">{{ detail.sample_stack }}</pre>
          </div>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="detail = null">Close</button>
          <button
            v-if="!detail.resolved"
            class="bw-btn bw-btn-primary"
            :disabled="resolving === detail.fingerprint"
            @click="resolveGroup(detail.fingerprint)"
          >
            {{ resolving === detail.fingerprint ? 'Resolving…' : 'Mark Resolved' }}
          </button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--s-3); margin-bottom: var(--s-4); }
.filter-row { display: flex; align-items: center; gap: var(--s-2); margin-bottom: var(--s-3); flex-wrap: wrap; }

.error-list { display: flex; flex-direction: column; gap: var(--s-2); }
.error-row {
  display: flex; align-items: center; justify-content: space-between; gap: var(--s-3);
  background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: var(--r-xl); padding: var(--s-3) var(--s-4);
  cursor: pointer; transition: border-color var(--dur-fast), transform var(--dur-fast);
  backdrop-filter: blur(12px) saturate(140%); -webkit-backdrop-filter: blur(12px) saturate(140%);
}
.error-row:hover { border-color: var(--glass-border-strong); transform: translateY(-1px); }
.error-critical { border-left: 3px solid var(--danger); }
.error-error    { border-left: 3px solid oklch(65% 0.18 30); }
.error-warning  { border-left: 3px solid var(--warn, oklch(78% 0.16 75)); }
.error-resolved { opacity: 0.5; }

.error-row-left { display: flex; align-items: flex-start; gap: var(--s-3); flex: 1; min-width: 0; }
.sev-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
.error-row-body { flex: 1; min-width: 0; }
.error-msg { font-size: var(--t-sm); font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.error-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 3px; font-size: 11px; color: var(--text-muted); }
.error-source { font-family: var(--font-mono); color: var(--brand); }
.error-sep { color: var(--text-muted); opacity: 0.5; }
.error-row-right { display: flex; align-items: center; gap: var(--s-2); flex-shrink: 0; }
.error-arrow { color: var(--text-muted); font-size: 16px; }

.query-cell { max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hint-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.hint-chip {
  font-size: 10px; padding: 2px 7px; border-radius: var(--r-sm);
  background: oklch(from var(--warn, oklch(78% 0.16 75)) l c h / 0.12);
  border: 1px solid oklch(from var(--warn, oklch(78% 0.16 75)) l c h / 0.30);
  color: var(--warn, oklch(78% 0.16 75));
}

.detail-modal { max-width: min(680px, 95vw) !important; }
.detail-meta { display: flex; flex-wrap: wrap; gap: var(--s-4); margin-bottom: var(--s-4); }
.meta-item { display: flex; flex-direction: column; gap: 2px; }
.meta-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: var(--s-2); }
.actor-chips { display: flex; flex-wrap: wrap; gap: var(--s-1); margin-bottom: var(--s-3); }
.actor-chip {
  font-size: 10px; padding: 2px 6px;
  background: var(--glass-bg-strong); border: 1px solid var(--glass-border);
  border-radius: var(--r-sm); color: var(--text);
}
.code-block {
  background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: var(--r-md);
  padding: var(--s-3); font-family: var(--font-mono); font-size: 11px; line-height: 1.6;
  overflow: auto; max-height: 320px; white-space: pre; color: var(--text);
  tab-size: 2;
}
</style>
