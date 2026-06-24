<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { api } from '../lib/api';
import AppShell from '../components/AppShell.vue';

interface ServiceStatus {
  id: string;
  name: string;
  category: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  latency_ms: number | null;
  uptime_7d: number | null;  // percentage 0-100
  checked_at: string | null;
  message: string | null;
}

interface Incident {
  id: string;
  service_id: string;
  service_name: string;
  severity: 'minor' | 'major' | 'critical';
  title: string;
  started_at: string;
  resolved_at: string | null;
}

const services  = ref<ServiceStatus[]>([]);
const incidents = ref<Incident[]>([]);
const loading   = ref(false);
const error     = ref('');
let timer: ReturnType<typeof setInterval> | null = null;

const CATEGORIES = ['Infrastructure', 'Payments', 'Telecom', 'Meter APIs'];

function byCategory(cat: string) {
  return services.value.filter(s => s.category === cat);
}

function overallStatus() {
  if (services.value.some(s => s.status === 'down')) return 'down';
  if (services.value.some(s => s.status === 'degraded')) return 'degraded';
  if (services.value.every(s => s.status === 'healthy')) return 'healthy';
  return 'unknown';
}

async function load() {
  if (!loading.value) error.value = '';
  loading.value = true;
  try {
    const [h, i] = await Promise.all([
      api.get<{ services: ServiceStatus[] }>('/api/v1/admin/dev/health'),
      api.get<{ incidents: Incident[] }>('/api/v1/admin/dev/health/incidents'),
    ]);
    services.value  = h.services ?? [];
    incidents.value = i.incidents ?? [];
  } catch (e: any) { error.value = e.message ?? 'Failed to load'; }
  finally { loading.value = false; }
}

function statusColor(s: ServiceStatus['status']) {
  return { healthy: 'var(--brand)', degraded: 'var(--warn, oklch(78% 0.16 75))', down: 'var(--danger)', unknown: 'var(--text-muted)' }[s];
}

function statusLabel(s: ServiceStatus['status']) {
  return { healthy: 'Healthy', degraded: 'Degraded', down: 'Down', unknown: 'Unknown' }[s];
}

function uptimeBar(pct: number | null) {
  if (pct === null) return '#555';
  if (pct >= 99.9) return 'var(--brand)';
  if (pct >= 99)   return 'var(--warn, oklch(78% 0.16 75))';
  return 'var(--danger)';
}

function fmt(s: string | null) {
  return s ? new Date(s).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function fmtDuration(start: string, end: string | null) {
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : Date.now();
  const diff = to - from;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

onMounted(() => {
  load();
  timer = setInterval(load, 30_000);
});
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>

<template>
  <AppShell title="Service Health">
    <div class="bw-page-actions">
      <button class="bw-btn bw-btn-ghost bw-btn-sm" :disabled="loading" @click="load">
        {{ loading ? '…' : '↺ Refresh' }}
      </button>
    </div>

    <div v-if="error" class="bw-error-banner" style="margin-bottom:var(--s-3)">{{ error }}</div>

    <!-- Overall status bar -->
    <div v-if="services.length" :class="['overall-bar', `overall-${overallStatus()}`]">
      <span class="overall-dot" />
      <span class="overall-text">
        <strong v-if="overallStatus() === 'healthy'">All systems operational</strong>
        <strong v-else-if="overallStatus() === 'degraded'">Partial degradation detected</strong>
        <strong v-else-if="overallStatus() === 'down'">Service outage in progress</strong>
        <strong v-else>Status unknown</strong>
      </span>
      <span class="overall-refresh">Auto-refreshes every 30s</span>
    </div>

    <!-- Service grid by category -->
    <div v-for="cat in CATEGORIES" :key="cat">
      <div v-if="byCategory(cat).length" class="category-section">
        <h3 class="category-hd">{{ cat }}</h3>
        <div class="service-grid">
          <div v-for="s in byCategory(cat)" :key="s.id" class="service-tile">
            <div class="service-top">
              <span class="svc-dot" :style="{ background: statusColor(s.status) }" />
              <span class="svc-name">{{ s.name }}</span>
              <span class="svc-badge" :style="{ color: statusColor(s.status) }">{{ statusLabel(s.status) }}</span>
            </div>
            <div v-if="s.message" class="svc-msg">{{ s.message }}</div>
            <div class="svc-stats">
              <div class="svc-stat">
                <span class="svc-stat-label">Latency</span>
                <span class="svc-stat-val bw-mono" :class="(s.latency_ms ?? 0) > 500 ? 'warn-text' : ''">
                  {{ s.latency_ms != null ? `${s.latency_ms}ms` : '—' }}
                </span>
              </div>
              <div class="svc-stat">
                <span class="svc-stat-label">7-day uptime</span>
                <span class="svc-stat-val bw-mono" :style="{ color: uptimeBar(s.uptime_7d) }">
                  {{ s.uptime_7d != null ? `${s.uptime_7d.toFixed(2)}%` : '—' }}
                </span>
              </div>
            </div>
            <!-- Uptime bar -->
            <div class="uptime-bar-wrap">
              <div class="uptime-bar" :style="{ width: `${s.uptime_7d ?? 0}%`, background: uptimeBar(s.uptime_7d) }" />
            </div>
            <div class="svc-checked">Checked {{ fmt(s.checked_at) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading && !services.length" class="service-grid">
      <div v-for="i in 6" :key="i" class="service-tile skel">
        <div class="skel-line w80" /><div class="skel-line w50" /><div class="skel-line w30" />
      </div>
    </div>

    <!-- Incidents -->
    <h3 class="section-hd" style="margin-top:var(--s-5)">Incident History</h3>
    <div class="bw-table-wrapper">
      <table class="bw-table">
        <thead><tr><th>Service</th><th>Severity</th><th>Title</th><th>Started</th><th>Resolved</th><th>Duration</th></tr></thead>
        <tbody>
          <tr v-for="inc in incidents" :key="inc.id">
            <td class="bw-text-sm">{{ inc.service_name }}</td>
            <td>
              <span :class="{
                'bw-badge-danger': inc.severity === 'critical',
                'bw-badge-warn':   inc.severity === 'major',
                'bw-badge-neutral': inc.severity === 'minor',
              }" class="bw-badge">{{ inc.severity }}</span>
            </td>
            <td class="bw-text-sm">{{ inc.title }}</td>
            <td class="bw-text-sm">{{ fmt(inc.started_at) }}</td>
            <td class="bw-text-sm">
              <span v-if="inc.resolved_at">{{ fmt(inc.resolved_at) }}</span>
              <span v-else class="bw-text-danger">Ongoing</span>
            </td>
            <td class="bw-text-sm bw-mono">{{ fmtDuration(inc.started_at, inc.resolved_at) }}</td>
          </tr>
          <tr v-if="!incidents.length && !loading"><td colspan="6" class="bw-empty">No incidents recorded.</td></tr>
        </tbody>
      </table>
    </div>
  </AppShell>
</template>

<style scoped>
.overall-bar {
  display: flex; align-items: center; gap: var(--s-3);
  padding: var(--s-3) var(--s-4); border-radius: var(--r-lg);
  margin-bottom: var(--s-4); border: 1px solid;
}
.overall-healthy  { background: oklch(from var(--brand) l c h / 0.08); border-color: oklch(from var(--brand) l c h / 0.25); }
.overall-degraded { background: oklch(78% 0.16 75 / 0.08); border-color: oklch(78% 0.16 75 / 0.25); }
.overall-down     { background: oklch(from var(--danger) l c h / 0.08); border-color: oklch(from var(--danger) l c h / 0.25); }
.overall-unknown  { background: var(--glass-bg); border-color: var(--glass-border); }
.overall-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  .overall-healthy &  { background: var(--brand); animation: pulse-green 2s infinite; }
  .overall-degraded & { background: oklch(78% 0.16 75); }
  .overall-down &     { background: var(--danger); animation: pulse-red 1s infinite; }
  .overall-unknown &  { background: var(--text-muted); }
}
@keyframes pulse-green { 0%,100% { box-shadow: 0 0 0 0 oklch(from var(--brand) l c h / 0.5); } 50% { box-shadow: 0 0 0 5px oklch(from var(--brand) l c h / 0); } }
@keyframes pulse-red { 0%,100% { box-shadow: 0 0 0 0 oklch(from var(--danger) l c h / 0.5); } 50% { box-shadow: 0 0 0 5px oklch(from var(--danger) l c h / 0); } }
.overall-text { flex: 1; font-size: var(--t-sm); }
.overall-refresh { font-size: 11px; color: var(--text-muted); }

.category-section { margin-bottom: var(--s-5); }
.category-hd { font-size: var(--t-sm); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin: 0 0 var(--s-3); }

.service-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--s-3); }
.service-tile {
  background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: var(--r-xl); padding: var(--s-4);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
  display: flex; flex-direction: column; gap: var(--s-2);
}
.service-top { display: flex; align-items: center; gap: var(--s-2); }
.svc-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.svc-name { flex: 1; font-weight: 600; font-size: var(--t-sm); }
.svc-badge { font-size: 10px; font-weight: 700; }
.svc-msg { font-size: 11px; color: var(--text-muted); line-height: 1.4; }
.svc-stats { display: flex; gap: var(--s-4); }
.svc-stat { display: flex; flex-direction: column; gap: 2px; }
.svc-stat-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.svc-stat-val { font-size: var(--t-sm); }
.warn-text { color: var(--warn, oklch(78% 0.16 75)); }
.uptime-bar-wrap { height: 3px; background: var(--glass-bg-strong); border-radius: 2px; overflow: hidden; }
.uptime-bar { height: 100%; border-radius: 2px; transition: width 0.5s; }
.svc-checked { font-size: 10px; color: var(--text-muted); }

.skel { animation: skeleton-pulse 1.5s ease-in-out infinite; }
@keyframes skeleton-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
.skel-line { height: 14px; border-radius: var(--r-sm); background: var(--glass-bg-strong); margin-bottom: 8px; }
.w80 { width: 80%; } .w50 { width: 50%; } .w30 { width: 30%; }

.section-hd { font-size: var(--t-md); font-weight: 700; margin: 0 0 var(--s-3); }
</style>
