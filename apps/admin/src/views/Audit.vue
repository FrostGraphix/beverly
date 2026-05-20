<script setup lang="ts">
/**
 * Audit Log — full experience for super-admin.
 *
 * Tabs:
 *   1. Audit trail   — every business mutation (filter + cursor pagination + CSV export + detail drawer)
 *   2. Security events — login/logout/MFA/password/abuse signals (severity-coloured)
 *   3. Summary       — last 7d counts by action and actor type (heat list)
 */
import { onMounted, ref, computed, watch } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, shortDate, API_BASE, ApiError } from '../lib/api';

// ─ Types ──────────────────────────────────────────────────────────
interface AuditEntry {
    id: string;
    actor_user_id: string | null;
    actor_type: string | null;
    actor_role: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    before: any;
    after: any;
    metadata: any;
    ip: string | null;
    user_agent: string | null;
    correlation_id: string | null;
    created_at: string;
}

interface SecurityEvent {
    id: string;
    event_type: string;
    severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
    actor_user_id: string | null;
    ip_address: string | null;
    user_agent: string | null;
    metadata: any;
    created_at: string;
}

interface SummaryResp {
    days: number;
    total: number;
    byAction: Record<string, number>;
    byActorType: Record<string, number>;
}

// ─ Tabs ──────────────────────────────────────────────────────────
const tab = ref<'audit' | 'security' | 'summary'>('audit');

// ─ Audit list ────────────────────────────────────────────────────
const entries = ref<AuditEntry[]>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);
const auditError = ref('');
const lastAuditLoadedAt = ref<string | null>(null);
const exporting = ref(false);
const fActor = ref('');
const fActorType = ref('');
const fAction = ref('');
const fTargetType = ref('');
const fTarget = ref('');
const fSince = ref('');
const fUntil = ref('');

async function loadAudit(reset = true) {
    loading.value = true;
    auditError.value = '';
    try {
        const p = auditQueryParams();
        p.set('limit', '100');
        if (!reset && cursor.value) p.set('cursor', cursor.value);
        const r = await api.get<{ entries: AuditEntry[]; nextCursor: string | null }>(`/api/v1/admin/audit?${p}`);
        entries.value = reset ? r.entries : [...entries.value, ...r.entries];
        cursor.value = r.nextCursor;
        lastAuditLoadedAt.value = new Date().toISOString();
    } catch (error) {
        auditError.value = readableError(error, 'Audit log failed to load.');
    } finally { loading.value = false; }
}

function resetFilters() {
    fActor.value = '';
    fActorType.value = '';
    fAction.value = '';
    fTargetType.value = '';
    fTarget.value = '';
    fSince.value = '';
    fUntil.value = '';
    void loadAudit();
}

function auditQueryParams() {
    const p = new URLSearchParams();
    if (fActor.value)      p.set('actor',      fActor.value);
    if (fActorType.value)  p.set('actorType',  fActorType.value);
    if (fAction.value)     p.set('action',     fAction.value);
    if (fTargetType.value) p.set('targetType', fTargetType.value);
    if (fTarget.value)     p.set('target',     fTarget.value);
    if (fSince.value)      p.set('since',      new Date(fSince.value).toISOString());
    if (fUntil.value)      p.set('until',      new Date(fUntil.value).toISOString());
    return p;
}

async function exportCsv() {
    exporting.value = true;
    auditError.value = '';
    const p = auditQueryParams();
    const token = localStorage.getItem('beverly.staff.access_token') ?? '';
    try {
        const response = await fetch(`${API_BASE}/api/v1/admin/audit/export.csv?${p}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            credentials: 'include',
        });
        if (!response.ok) throw new Error(`status ${response.status}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (error) {
        auditError.value = readableError(error, 'Audit export failed.');
    } finally {
        exporting.value = false;
    }
}

// ─ Detail drawer ─────────────────────────────────────────────────
const detail = ref<AuditEntry | null>(null);
function openDetail(e: AuditEntry) { detail.value = e; }
function closeDetail() { detail.value = null; }

// ─ Security events ───────────────────────────────────────────────
const events = ref<SecurityEvent[]>([]);
const sevFilter = ref<'' | 'info' | 'low' | 'medium' | 'high' | 'critical'>('');
const evtFilter = ref('');
const loadingSec = ref(false);
const securityError = ref('');

async function loadSecurity() {
    loadingSec.value = true;
    securityError.value = '';
    try {
        const p = new URLSearchParams();
        if (evtFilter.value) p.set('eventType', evtFilter.value);
        if (sevFilter.value) p.set('severity',  sevFilter.value);
        p.set('limit', '200');
        const r = await api.get<{ events: SecurityEvent[] }>(`/api/v1/admin/security-events?${p}`);
        events.value = r.events;
    } catch (error) {
        securityError.value = readableError(error, 'Security events failed to load.');
    } finally { loadingSec.value = false; }
}

// ─ Summary ───────────────────────────────────────────────────────
const summary = ref<SummaryResp | null>(null);
const summaryDays = ref(7);
const loadingSum = ref(false);
const summaryError = ref('');

async function loadSummary() {
    loadingSum.value = true;
    summaryError.value = '';
    try {
        summary.value = await api.get<SummaryResp>(`/api/v1/admin/audit/summary?days=${summaryDays.value}`);
    } catch (error) {
        summaryError.value = readableError(error, 'Audit summary failed to load.');
    } finally { loadingSum.value = false; }
}

const summarySortedActions = computed(() => {
    if (!summary.value) return [] as Array<[string, number]>;
    return Object.entries(summary.value.byAction)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25);
});

const summaryActorRows = computed(() => {
    if (!summary.value) return [] as Array<[string, number, number]>;
    const max = Math.max(1, ...Object.values(summary.value.byActorType));
    return Object.entries(summary.value.byActorType)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => [k, v, Math.round((v / max) * 100)] as [string, number, number]);
});

// ─ Helpers ───────────────────────────────────────────────────────
function actorBadge(t: string | null) {
    return ({
        staff: 'info', vendor_user: 'success', customer: 'neutral',
        webhook: 'warn', system: 'neutral',
    } as Record<string, string>)[t ?? ''] ?? 'neutral';
}

function sevBadge(s: string) {
    return ({
        info: 'neutral', low: 'success', medium: 'warn',
        high: 'warn', critical: 'danger',
    } as Record<string, string>)[s] ?? 'neutral';
}

function shortId(s: string | null) { return s ? s.slice(0, 8) : '—'; }

function readableError(error: unknown, fallback: string) {
    if (error instanceof ApiError) return `${fallback} ${error.message}`;
    if (error instanceof Error) return `${fallback} ${error.message}`;
    return fallback;
}

const newestEntry = computed(() => entries.value[0]?.created_at ?? null);
const oldestEntry = computed(() => entries.value.at(-1)?.created_at ?? null);
const actorTypeCount = computed(() => new Set(entries.value.map((entry) => entry.actor_type).filter(Boolean)).size);

watch(tab, (v) => {
    if (v === 'security' && !events.value.length) void loadSecurity();
    if (v === 'summary'  && !summary.value)        void loadSummary();
});

onMounted(loadAudit);
</script>

<template>
  <AppShell title="Audit Log">

    <!-- Tabs -->
    <div class="audit-tabs">
      <button :class="['tab', { active: tab === 'audit' }]"    @click="tab = 'audit'">
        Audit trail
      </button>
      <button :class="['tab', { active: tab === 'security' }]" @click="tab = 'security'">
        Security events
      </button>
      <button :class="['tab', { active: tab === 'summary' }]"  @click="tab = 'summary'">
        Summary (last {{ summaryDays }}d)
      </button>
    </div>

    <div v-if="tab === 'audit'" class="audit-overview" aria-label="Audit log health">
      <div class="audit-stat">
        <span>Loaded entries</span>
        <strong>{{ entries.length.toLocaleString() }}</strong>
        <small>{{ cursor ? 'More available' : 'Current page complete' }}</small>
      </div>
      <div class="audit-stat">
        <span>Newest event</span>
        <strong>{{ newestEntry ? shortDate(newestEntry) : 'None' }}</strong>
        <small>{{ lastAuditLoadedAt ? `Loaded ${shortDate(lastAuditLoadedAt)}` : 'Waiting for data' }}</small>
      </div>
      <div class="audit-stat">
        <span>Oldest loaded</span>
        <strong>{{ oldestEntry ? shortDate(oldestEntry) : 'None' }}</strong>
        <small>{{ actorTypeCount }} actor types visible</small>
      </div>
    </div>

    <!-- ═══ TAB: AUDIT TRAIL ═══ -->
    <section v-if="tab === 'audit'">
      <div class="bw-card filter-card">
        <div class="filter-grid">
          <div>
            <label class="bw-label">Action prefix</label>
            <input class="bw-input bw-mono" v-model="fAction" placeholder="e.g. wallet.funding" @keyup.enter="loadAudit()" />
          </div>
          <div>
            <label class="bw-label">Actor type</label>
            <select class="bw-input" v-model="fActorType" @change="loadAudit()">
              <option value="">All</option>
              <option value="staff">staff</option>
              <option value="vendor_user">vendor_user</option>
              <option value="customer">customer</option>
              <option value="webhook">webhook</option>
              <option value="system">system</option>
            </select>
          </div>
          <div>
            <label class="bw-label">Actor user id</label>
            <input class="bw-input bw-mono" v-model="fActor" placeholder="uuid" @keyup.enter="loadAudit()" />
          </div>
          <div>
            <label class="bw-label">Target type</label>
            <input class="bw-input bw-mono" v-model="fTargetType" placeholder="vendor_organization, wallet…" @keyup.enter="loadAudit()" />
          </div>
          <div>
            <label class="bw-label">Target id</label>
            <input class="bw-input bw-mono" v-model="fTarget" placeholder="uuid" @keyup.enter="loadAudit()" />
          </div>
          <div>
            <label class="bw-label">Since</label>
            <input class="bw-input" type="datetime-local" v-model="fSince" @change="loadAudit()" />
          </div>
          <div>
            <label class="bw-label">Until</label>
            <input class="bw-input" type="datetime-local" v-model="fUntil" @change="loadAudit()" />
          </div>
          <div class="filter-actions">
            <button class="bw-btn" @click="resetFilters">Reset</button>
            <button class="bw-btn primary" :disabled="loading" @click="loadAudit()">
              {{ loading ? 'Loading...' : 'Apply' }}
            </button>
            <button class="bw-btn" :disabled="exporting || loading" @click="exportCsv">
              {{ exporting ? 'Exporting...' : 'Export CSV' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="auditError" class="audit-alert danger" role="alert">
        <strong>{{ auditError }}</strong>
        <button class="bw-btn" :disabled="loading" @click="loadAudit()">Retry</button>
      </div>

      <!-- List -->
      <div class="bw-card flush">
        <div class="bw-table-head-bar">
          <h2 class="bw-h2" style="margin: 0">{{ entries.length }} entries</h2>
          <span class="bw-spacer"></span>
          <span v-if="loading" class="bw-muted bw-mono" style="font-size: var(--t-xs)">loading…</span>
        </div>

        <div class="bw-t-wrap">
          <table class="bw-table audit-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>IP</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="e in entries"
                :key="e.id"
                class="audit-row"
                tabindex="0"
                :aria-label="`Open audit entry ${e.action}`"
                @click="openDetail(e)"
                @keyup.enter="openDetail(e)"
                @keyup.space.prevent="openDetail(e)"
              >
                <td class="bw-mono bw-muted" style="font-size: var(--t-xs)">{{ shortDate(e.created_at) }}</td>
                <td>
                  <span :class="['bw-badge', actorBadge(e.actor_type)]">{{ e.actor_type || '—' }}</span>
                  <div class="bw-mono bw-muted row-sub">{{ e.actor_role || shortId(e.actor_user_id) }}</div>
                </td>
                <td class="bw-mono">{{ e.action }}</td>
                <td>
                  <div class="bw-muted row-sub-strong">{{ e.target_type || '—' }}</div>
                  <div class="bw-mono row-sub">#{{ shortId(e.target_id) }}</div>
                </td>
                <td class="bw-mono bw-muted row-sub">{{ e.ip || '—' }}</td>
                <td class="row-arrow">→</td>
              </tr>
              <tr v-if="!entries.length && !loading">
                <td colspan="6" class="bw-muted empty">No matching entries.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="cursor" class="load-more">
          <button class="bw-btn" :disabled="loading" @click="loadAudit(false)">
            {{ loading ? 'Loading…' : 'Load more' }}
          </button>
        </div>
      </div>
    </section>

    <!-- ═══ TAB: SECURITY EVENTS ═══ -->
    <section v-else-if="tab === 'security'">
      <div class="bw-card filter-card">
        <div class="filter-grid">
          <div>
            <label class="bw-label">Event type</label>
            <select class="bw-input" v-model="evtFilter" @change="loadSecurity">
              <option value="">All</option>
              <option v-for="t in ['login_success','login_failure','logout','password_change',
                'mfa_enabled','mfa_disabled','mfa_failure','suspicious_activity',
                'rate_limit_hit','permission_denied','session_timeout','temp_password_issued','temp_password_used']" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <div>
            <label class="bw-label">Severity</label>
            <select class="bw-input" v-model="sevFilter" @change="loadSecurity">
              <option value="">All</option>
              <option value="info">info</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </select>
          </div>
          <div class="filter-actions">
            <button class="bw-btn primary" :disabled="loadingSec" @click="loadSecurity">
              {{ loadingSec ? 'Loading...' : 'Refresh' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="securityError" class="audit-alert danger" role="alert">
        <strong>{{ securityError }}</strong>
        <button class="bw-btn" :disabled="loadingSec" @click="loadSecurity">Retry</button>
      </div>

      <div class="bw-card flush">
        <div class="bw-table-head-bar">
          <h2 class="bw-h2" style="margin: 0">{{ events.length }} events</h2>
          <span class="bw-spacer"></span>
          <span v-if="loadingSec" class="bw-muted bw-mono" style="font-size: var(--t-xs)">loading…</span>
        </div>

        <div class="bw-t-wrap">
          <table class="bw-table">
            <thead>
              <tr><th>When</th><th>Event</th><th>Severity</th><th>Actor</th><th>IP</th></tr>
            </thead>
            <tbody>
              <tr v-for="e in events" :key="e.id">
                <td class="bw-mono bw-muted" style="font-size: var(--t-xs)">{{ shortDate(e.created_at) }}</td>
                <td class="bw-mono">{{ e.event_type }}</td>
                <td><span :class="['bw-badge', sevBadge(e.severity)]">{{ e.severity }}</span></td>
                <td class="bw-mono row-sub">{{ shortId(e.actor_user_id) }}</td>
                <td class="bw-mono bw-muted row-sub">{{ e.ip_address || '—' }}</td>
              </tr>
              <tr v-if="!events.length && !loadingSec">
                <td colspan="5" class="bw-muted empty">No matching events.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ═══ TAB: SUMMARY ═══ -->
    <section v-else-if="tab === 'summary'">
      <div class="bw-card filter-card">
        <label class="bw-label">Days back</label>
        <input class="bw-input bw-mono" v-model.number="summaryDays" type="number" min="1" max="90" @change="loadSummary" style="max-width: 120px" />
        <button class="bw-btn primary" :disabled="loadingSum" @click="loadSummary" style="margin-left: var(--s-3)">
          {{ loadingSum ? 'Loading...' : 'Refresh' }}
        </button>
        <span v-if="summary" class="bw-muted" style="margin-left: var(--s-4); font-size: var(--t-sm)">
          {{ summary.total.toLocaleString() }} events in {{ summary.days }} days
        </span>
      </div>

      <div v-if="summaryError" class="audit-alert danger" role="alert">
        <strong>{{ summaryError }}</strong>
        <button class="bw-btn" :disabled="loadingSum" @click="loadSummary">Retry</button>
      </div>

      <div class="summary-grid" v-if="summary">
        <div class="bw-card">
          <h3 class="bw-h3" style="margin: 0 0 var(--s-3)">Top actions</h3>
          <ul class="bar-list">
            <li v-for="[name, n] in summarySortedActions" :key="name">
              <span class="bw-mono bar-label">{{ name }}</span>
              <span class="bar-track">
                <span class="bar-fill" :style="{ width: `${Math.min(100, (n / summarySortedActions[0][1]) * 100)}%` }" />
              </span>
              <span class="bw-mono bar-count">{{ n }}</span>
            </li>
            <li v-if="!summarySortedActions.length" class="bw-muted empty">No data.</li>
          </ul>
        </div>

        <div class="bw-card">
          <h3 class="bw-h3" style="margin: 0 0 var(--s-3)">By actor type</h3>
          <ul class="bar-list">
            <li v-for="[name, n, pct] in summaryActorRows" :key="name">
              <span class="bw-mono bar-label">{{ name }}</span>
              <span class="bar-track">
                <span class="bar-fill" :style="{ width: `${pct}%` }" />
              </span>
              <span class="bw-mono bar-count">{{ n }}</span>
            </li>
            <li v-if="!summaryActorRows.length" class="bw-muted empty">No data.</li>
          </ul>
        </div>
      </div>
      <div v-else-if="loadingSum" class="bw-card empty">Loading…</div>
    </section>

    <!-- ═══ DETAIL DRAWER ═══ -->
    <Teleport to="body">
      <Transition name="drawer">
        <div v-if="detail" class="drawer-scrim" @click.self="closeDetail">
          <aside class="drawer" role="dialog" aria-modal="true">
            <header class="drawer-head">
              <div>
                <p class="drawer-eyebrow">Audit entry</p>
                <h2 class="drawer-title bw-mono">{{ detail.action }}</h2>
              </div>
              <button class="drawer-x" @click="closeDetail" aria-label="Close">×</button>
            </header>

            <dl class="drawer-dl">
              <dt>When</dt>            <dd>{{ new Date(detail.created_at).toLocaleString() }}</dd>
              <dt>Actor type</dt>      <dd><span :class="['bw-badge', actorBadge(detail.actor_type)]">{{ detail.actor_type || '—' }}</span></dd>
              <dt>Actor role</dt>      <dd>{{ detail.actor_role || '—' }}</dd>
              <dt>Actor user id</dt>   <dd class="bw-mono">{{ detail.actor_user_id || '—' }}</dd>
              <dt>Target type</dt>     <dd>{{ detail.target_type || '—' }}</dd>
              <dt>Target id</dt>       <dd class="bw-mono">{{ detail.target_id || '—' }}</dd>
              <dt>IP</dt>              <dd class="bw-mono">{{ detail.ip || '—' }}</dd>
              <dt>User-Agent</dt>      <dd class="ua">{{ detail.user_agent || '—' }}</dd>
              <dt>Correlation id</dt>  <dd class="bw-mono">{{ detail.correlation_id || '—' }}</dd>
            </dl>

            <div v-if="detail.before" class="json-block">
              <p class="json-label">Before</p>
              <pre>{{ JSON.stringify(detail.before, null, 2) }}</pre>
            </div>
            <div v-if="detail.after" class="json-block">
              <p class="json-label">After</p>
              <pre>{{ JSON.stringify(detail.after, null, 2) }}</pre>
            </div>
            <div v-if="detail.metadata && Object.keys(detail.metadata).length" class="json-block">
              <p class="json-label">Metadata</p>
              <pre>{{ JSON.stringify(detail.metadata, null, 2) }}</pre>
            </div>
          </aside>
        </div>
      </Transition>
    </Teleport>

  </AppShell>
</template>

<style scoped>
.audit-tabs {
  display: flex;
  gap: var(--s-2);
  margin-bottom: var(--s-4);
  border-bottom: 1px solid var(--border);
}
.tab {
  background: transparent;
  border: none;
  padding: 10px 16px;
  color: var(--text-muted);
  font-weight: 600;
  font-size: var(--t-sm);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color var(--dur-fast), border-color var(--dur-fast);
}
.tab:hover { color: var(--text); }
.tab.active { color: var(--brand); border-bottom-color: var(--brand); }

.filter-card {
  margin-bottom: var(--s-3);
}
.audit-overview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-3);
  margin-bottom: var(--s-4);
}
.audit-stat {
  padding: var(--s-4);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background:
    linear-gradient(135deg, color-mix(in oklch, var(--brand) 12%, transparent), transparent 48%),
    var(--surface);
}
.audit-stat span,
.audit-stat small {
  display: block;
  color: var(--text-muted);
  font-size: var(--t-xs);
}
.audit-stat strong {
  display: block;
  margin: 4px 0;
  color: var(--text);
  font-size: clamp(22px, 4vw, 34px);
  line-height: 1;
}
.audit-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  margin: 0 0 var(--s-3);
  padding: var(--s-3) var(--s-4);
  border-radius: var(--r-md);
  font-size: var(--t-sm);
}
.audit-alert.danger {
  color: var(--danger);
  background: color-mix(in oklch, var(--danger) 12%, transparent);
  border: 1px solid color-mix(in oklch, var(--danger) 35%, transparent);
}
.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--s-3);
  align-items: end;
}
.filter-actions {
  display: flex;
  gap: var(--s-2);
  align-items: end;
}

.audit-row { cursor: pointer; }
.audit-row:hover { background: var(--surface-2); }
.row-sub { font-size: 10px; margin-top: 2px; }
.row-sub-strong { font-size: var(--t-xs); }
.row-arrow { color: var(--text-muted); text-align: right; width: 24px; }

.empty {
  text-align: center;
  padding: var(--s-6);
}
.load-more {
  padding: var(--s-3);
  text-align: center;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--s-3);
}
.bar-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}
.bar-list li {
  display: grid;
  grid-template-columns: 1fr 100px 50px;
  gap: var(--s-2);
  align-items: center;
  font-size: var(--t-xs);
}
.bar-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track {
  height: 6px;
  background: var(--surface-2);
  border-radius: var(--r-full);
  overflow: hidden;
}
.bar-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--brand-300), var(--brand));
  border-radius: var(--r-full);
}
.bar-count { text-align: right; color: var(--brand); font-weight: 700; }

/* Drawer */
.drawer-scrim {
  position: fixed;
  inset: 0;
  background: oklch(0% 0 0 / 0.55);
  z-index: 200;
  display: flex;
  justify-content: flex-end;
}
.drawer {
  width: min(640px, 100%);
  height: 100%;
  background: var(--surface);
  border-left: 1px solid var(--border);
  overflow-y: auto;
  padding: var(--s-5);
  box-shadow: -16px 0 48px oklch(0% 0 0 / 0.40);
}
.drawer-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: var(--s-4);
}
.drawer-eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: var(--brand);
  margin: 0 0 2px;
}
.drawer-title { margin: 0; font-size: var(--t-lg); word-break: break-all; }
.drawer-x {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
  padding: 4px 10px;
  border-radius: var(--r-sm);
}
.drawer-x:hover { color: var(--text); background: var(--surface-2); }

.drawer-dl {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: 6px var(--s-3);
  margin: 0 0 var(--s-5);
  font-size: var(--t-sm);
}
.drawer-dl dt { color: var(--text-muted); }
.drawer-dl dd { margin: 0; word-break: break-word; }
.ua { font-family: var(--font-mono); font-size: var(--t-xs); color: var(--text-dim); }

.json-block { margin-top: var(--s-4); }
.json-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--brand);
  margin: 0 0 4px;
}
.json-block pre {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: var(--s-3);
  font-size: var(--t-xs);
  overflow-x: auto;
  margin: 0;
  color: var(--text);
  line-height: 1.5;
}

.drawer-enter-active, .drawer-leave-active { transition: opacity 0.20s var(--ease-out); }
.drawer-enter-active .drawer, .drawer-leave-active .drawer { transition: transform 0.22s var(--ease-out); }
.drawer-enter-from { opacity: 0; }
.drawer-enter-from .drawer { transform: translateX(40px); }
.drawer-leave-to { opacity: 0; }
.drawer-leave-to .drawer { transform: translateX(40px); }

@media (max-width: 640px) {
  .audit-overview { grid-template-columns: 1fr; }
  .audit-alert { align-items: stretch; flex-direction: column; }
  .filter-grid { grid-template-columns: 1fr; }
  .drawer { width: 100%; padding: var(--s-4); }
  .drawer-dl { grid-template-columns: 1fr; }
  .drawer-dl dt { font-weight: 700; margin-top: var(--s-2); }
}
</style>
