<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { api } from '../lib/api';
import AppShell from '../components/AppShell.vue';

interface QueueStat {
  queue: string;
  label: string;
  pending: number;
  processing: number;
  failed: number;
  completed_24h: number;
}

interface Job {
  id: string;
  queue: string;
  payload_preview: string;
  status: 'pending' | 'processing' | 'failed' | 'completed';
  attempts: number;
  max_attempts: number;
  error: string | null;
  created_at: string;
  next_retry_at: string | null;
}

const QUEUES = ['token_dispatch', 'wallet_credit', 'sms_send', 'email_send', 'webhook_deliver', 'fraud_check'];

const stats   = ref<QueueStat[]>([]);
const jobs    = ref<Job[]>([]);
const loading = ref(false);
const error   = ref('');
const acting  = ref<string | null>(null);

const fQueue  = ref('');
const fStatus = ref('failed');

let timer: ReturnType<typeof setInterval> | null = null;

const filtered = computed(() => jobs.value.filter(j => {
  if (fQueue.value && j.queue !== fQueue.value) return false;
  if (fStatus.value && j.status !== fStatus.value) return false;
  return true;
}));

const totalFailed    = computed(() => stats.value.reduce((n, s) => n + s.failed, 0));
const totalPending   = computed(() => stats.value.reduce((n, s) => n + s.pending, 0));
const totalProcessing = computed(() => stats.value.reduce((n, s) => n + s.processing, 0));
const totalCompleted  = computed(() => stats.value.reduce((n, s) => n + s.completed_24h, 0));

async function load(quiet = false) {
  if (!quiet) { loading.value = true; error.value = ''; }
  try {
    const params = new URLSearchParams({ limit: '100' });
    if (fQueue.value)  params.set('queue', fQueue.value);
    if (fStatus.value) params.set('status', fStatus.value);
    const [s, j] = await Promise.all([
      api.get<{ queues: QueueStat[] }>('/api/v1/admin/dev/queues'),
      api.get<{ jobs: Job[] }>(`/api/v1/admin/dev/queues/jobs?${params}`),
    ]);
    stats.value = s.queues ?? [];
    jobs.value  = j.jobs ?? [];
  } catch (e: any) { error.value = e.message ?? 'Failed to load'; }
  finally { loading.value = false; }
}

async function retryJob(id: string) {
  acting.value = id;
  try { await api.post(`/api/v1/admin/dev/queues/jobs/${id}/retry`); await load(true); }
  catch (e: any) { error.value = e.message ?? 'Retry failed'; }
  finally { acting.value = null; }
}

async function discardJob(id: string) {
  if (!confirm('Discard this job? It will be permanently deleted.')) return;
  acting.value = id;
  try { await api.del(`/api/v1/admin/dev/queues/jobs/${id}`); await load(true); }
  catch (e: any) { error.value = e.message ?? 'Discard failed'; }
  finally { acting.value = null; }
}

async function retryAll() {
  if (!confirm(`Retry all ${totalFailed.value} failed jobs?`)) return;
  try { await api.post('/api/v1/admin/dev/queues/retry-all-failed'); await load(true); }
  catch (e: any) { error.value = e.message ?? 'Failed'; }
}

function fmt(s: string | null) {
  return s ? new Date(s).toLocaleString('en-NG', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

function queueLabel(q: string) {
  return stats.value.find(s => s.queue === q)?.label ?? q.replace(/_/g, ' ');
}

onMounted(() => { load(); timer = setInterval(() => load(true), 15_000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>

<template>
  <AppShell title="Queue Monitor">
    <div class="bw-page-actions">
      <button type="button" v-if="totalFailed > 0" class="bw-btn bw-btn-ghost bw-btn-sm" @click.prevent="retryAll">↺ Retry All Failed ({{ totalFailed }})</button>
      <button type="button" class="bw-btn bw-btn-ghost bw-btn-sm" @click.prevent="load()">↺ Refresh</button>
    </div>

    <div v-if="error" class="bw-error-banner" style="margin-bottom:var(--s-3)">{{ error }}</div>

    <!-- Summary KPIs -->
    <div class="kpi-row bw-mobile-kpi-grid" style="margin-bottom:var(--s-4)">
      <div class="bw-kpi">
        <span class="bw-kpi-label">Pending</span>
        <span class="bw-kpi-val">{{ totalPending }}</span>
      </div>
      <div class="bw-kpi">
        <span class="bw-kpi-label">Processing</span>
        <span class="bw-kpi-val" style="color:oklch(65% 0.18 270)">{{ totalProcessing }}</span>
      </div>
      <div class="bw-kpi">
        <span class="bw-kpi-label">Failed</span>
        <span class="bw-kpi-val" :style="totalFailed > 0 ? 'color:var(--danger)' : ''">{{ totalFailed }}</span>
      </div>
      <div class="bw-kpi">
        <span class="bw-kpi-label">Completed (24h)</span>
        <span class="bw-kpi-val bw-text-brand">{{ totalCompleted.toLocaleString() }}</span>
      </div>
    </div>

    <!-- Per-queue breakdown -->
    <div v-if="stats.length" class="queue-grid">
      <div v-for="q in stats" :key="q.queue" class="queue-card" :class="{ 'queue-card-alert': q.failed > 0 }">
        <div class="queue-card-name">{{ q.label }}</div>
        <div class="queue-card-stats">
          <div class="qstat"><span class="qstat-n">{{ q.pending }}</span><span class="qstat-l">Pending</span></div>
          <div class="qstat"><span class="qstat-n" style="color:oklch(65% 0.18 270)">{{ q.processing }}</span><span class="qstat-l">Running</span></div>
          <div class="qstat"><span class="qstat-n" :style="q.failed > 0 ? 'color:var(--danger)' : ''">{{ q.failed }}</span><span class="qstat-l">Failed</span></div>
        </div>
        <div class="queue-card-foot bw-text-muted">{{ q.completed_24h.toLocaleString() }} done today</div>
      </div>
    </div>

    <!-- Job table -->
    <div class="jobs-bar">
      <h3 class="section-hd">Jobs</h3>
      <div class="jobs-filters">
        <select v-model="fQueue" class="bw-select" style="min-width:160px" @change="load()">
          <option value="">All queues</option>
          <option v-for="q in QUEUES" :key="q" :value="q">{{ queueLabel(q) }}</option>
        </select>
        <select v-model="fStatus" class="bw-select" style="min-width:130px" @change="load()">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="failed">Failed</option>
          <option value="completed">Completed</option>
        </select>
      </div>
    </div>

    <div v-if="loading && !jobs.length" class="bw-loading">Loading…</div>
    <div v-else class="bw-table-wrapper">
      <table class="bw-table">
        <thead>
          <tr><th>Queue</th><th>Job ID</th><th>Payload</th><th>Status</th><th>Attempts</th><th>Created</th><th>Next Retry</th><th>Error</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="j in filtered" :key="j.id">
            <td><span class="queue-chip">{{ queueLabel(j.queue) }}</span></td>
            <td class="bw-mono bw-text-sm">{{ j.id.slice(0, 12) }}…</td>
            <td class="bw-text-sm payload-cell">{{ j.payload_preview }}</td>
            <td>
              <span :class="{
                'bw-badge-success':  j.status === 'completed',
                'bw-badge-danger':   j.status === 'failed',
                'bw-badge-warn':     j.status === 'processing',
                'bw-badge-neutral':  j.status === 'pending',
              }" class="bw-badge">{{ j.status }}</span>
            </td>
            <td class="bw-text-sm">{{ j.attempts }} / {{ j.max_attempts }}</td>
            <td class="bw-text-sm">{{ fmt(j.created_at) }}</td>
            <td class="bw-text-sm">{{ fmt(j.next_retry_at) }}</td>
            <td class="bw-text-sm error-cell bw-text-danger">{{ j.error ?? '—' }}</td>
            <td style="display:flex;gap:4px;min-width:110px">
              <button
                v-if="j.status === 'failed'"
                class="bw-btn bw-btn-ghost bw-btn-sm"
                :disabled="acting === j.id"
                @click="retryJob(j.id)"
              >Retry</button>
              <button
                v-if="j.status !== 'completed'"
                class="bw-btn bw-btn-ghost bw-btn-sm danger-btn"
                :disabled="acting === j.id"
                @click="discardJob(j.id)"
              >Discard</button>
            </td>
          </tr>
          <tr v-if="!filtered.length && !loading"><td colspan="9" class="bw-empty">No jobs match the current filters.</td></tr>
        </tbody>
      </table>
    </div>
  </AppShell>
</template>

<style scoped>
.kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--s-3); }

.queue-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--s-3); margin-bottom: var(--s-5); }
.queue-card {
  background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: var(--r-xl); padding: var(--s-4);
  backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
  display: flex; flex-direction: column; gap: var(--s-2);
}
.queue-card-alert { border-color: oklch(from var(--danger) l c h / 0.35); }
.queue-card-name { font-size: var(--t-sm); font-weight: 600; color: var(--text); text-transform: capitalize; }
.queue-card-stats { display: flex; gap: var(--s-3); }
.qstat { display: flex; flex-direction: column; align-items: center; gap: 1px; }
.qstat-n { font-family: var(--font-mono); font-size: var(--t-lg); font-weight: 700; }
.qstat-l { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
.queue-card-foot { font-size: 11px; }

.jobs-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--s-3); flex-wrap: wrap; gap: var(--s-2); }
.jobs-filters { display: flex; gap: var(--s-2); }
.section-hd { font-size: var(--t-md); font-weight: 700; margin: 0; }

.queue-chip {
  font-size: 10px; padding: 2px 7px; border-radius: var(--r-sm);
  background: var(--glass-bg-strong); border: 1px solid var(--glass-border);
  color: var(--text); white-space: nowrap;
}
.payload-cell { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); font-size: 11px; }
.error-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.danger-btn { color: var(--danger) !important; }
</style>
