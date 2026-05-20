<template>
  <AppShell title="Reconciliation">
    <template #topbar-end>
      <button class="bw-btn bw-btn-sm" :disabled="!runs.length" @click="exportCsvRows">CSV</button>
      <button class="bw-btn bw-btn-sm" :disabled="!runs.length" @click="exportPdfDoc" style="margin:0 6px">PDF</button>
      <button class="bw-btn bw-btn-primary" :disabled="running" @click="runNow">
        {{ running ? 'Running…' : 'Run Now' }}
      </button>
    </template>

    <div v-if="loading" class="bw-loading">Loading…</div>
    <div v-else-if="error" class="bw-error-banner">{{ error }}</div>

    <div v-else>
      <div class="bw-table-wrapper">
        <table class="bw-table">
          <thead>
            <tr>
              <th>Run Date</th>
              <th>Status</th>
              <th>DB Total</th>
              <th>Gateway Total</th>
              <th>Mismatch</th>
              <th>Notes</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in runs" :key="r.id" :class="r.mismatch_minor > 0 ? 'row-alert' : ''">
              <td class="bw-mono bw-text-sm">{{ r.run_date || '—' }}</td>
              <td><span :class="statusClass(r.status)" class="bw-badge">{{ r.status }}</span></td>
              <td>{{ naira(r.db_total_minor) }}</td>
              <td>{{ naira(r.gateway_total_minor) }}</td>
              <td :style="r.mismatch_minor > 0 ? 'color:var(--red);font-weight:600' : ''">
                {{ r.mismatch_minor > 0 ? naira(r.mismatch_minor) : '—' }}
              </td>
              <td class="bw-text-sm" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ r.notes || '—' }}</td>
              <td class="bw-text-sm">{{ fmtDate(r.created_at) }}</td>
            </tr>
            <tr v-if="!runs.length">
              <td colspan="7" class="bw-empty">No reconciliation runs yet. Click "Run Now" to start.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards (≤640px) -->
      <div class="bw-t-cards">
        <div v-if="!runs.length" class="bw-empty">No reconciliation runs yet.</div>
        <div v-for="r in runs" :key="r.id" class="bw-tc" :class="r.mismatch_minor > 0 ? 'row-alert' : ''">
          <div class="bw-tc-head">
            <span class="bw-mono" style="font-size:var(--t-sm)">{{ r.run_date }}</span>
            <span :class="statusClass(r.status)" class="bw-badge">{{ r.status }}</span>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">DB Total</span><span class="bw-tc-pair-val">{{ naira(r.db_total_minor) }}</span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Gateway</span><span class="bw-tc-pair-val">{{ naira(r.gateway_total_minor) }}</span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Mismatch</span><span class="bw-tc-pair-val" :style="r.mismatch_minor > 0 ? 'color:var(--red)' : ''">{{ r.mismatch_minor > 0 ? naira(r.mismatch_minor) : '—' }}</span></div>
          </div>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api, naira } from '../lib/api';
import AppShell from '../components/AppShell.vue';
import { exportCsv, printPdf } from '../lib/export';

const runs     = ref<any[]>([]);
const loading  = ref(false);
const error    = ref('');
const running  = ref(false);

async function load() {
  loading.value = true;
  error.value   = '';
  try {
    const res = await api.get<{ runs?: any[] }>('/api/v1/admin/reconciliation');
    runs.value = res.runs ?? [];
  } catch (e: any) {
    error.value = e.message ?? 'Failed to load reconciliation runs';
  } finally {
    loading.value = false;
  }
}

async function runNow() {
  running.value = true;
  error.value   = '';
  try {
    await api.post('/api/v1/admin/reconciliation/run', {});
    await load();
  } catch (e: any) {
    error.value = e.message ?? 'Reconciliation run failed';
  } finally {
    running.value = false;
  }
}

function statusClass(s: string) {
  return { ok: 'bw-badge-success', mismatch: 'bw-badge-error', running: 'bw-badge-warning', failed: 'bw-badge-error' }[s] ?? 'bw-badge-neutral';
}

function fmtDate(s: string) { return s ? new Date(s).toLocaleString() : '—'; }

function exportCsvRows() {
  exportCsv('reconciliation-runs', runs.value, [
    { key: 'run_date', header: 'Run Date', value: (r) => r.run_date },
    { key: 'status', header: 'Status', value: (r) => r.status },
    { key: 'db_total', header: 'DB Total (₦)', value: (r) => (r.db_total_minor ?? 0) / 100 },
    { key: 'gateway_total', header: 'Gateway Total (₦)', value: (r) => (r.gateway_total_minor ?? 0) / 100 },
    { key: 'mismatch', header: 'Mismatch (₦)', value: (r) => (r.mismatch_minor ?? 0) / 100 },
    { key: 'notes', header: 'Notes', value: (r) => r.notes ?? '' },
    { key: 'created_at', header: 'Created', value: (r) => r.created_at },
  ]);
}

function exportPdfDoc() {
  printPdf({
    title: 'Reconciliation Runs',
    subtitle: 'Daily ledger vs. gateway reconciliation',
    meta: [
      { label: 'Runs', value: String(runs.value.length) },
      { label: 'With mismatch', value: String(runs.value.filter((r) => Number(r.mismatch_minor) > 0).length) },
    ],
    tables: [{
      title: 'Runs',
      columns: ['Run Date', 'Status', 'DB Total', 'Gateway Total', 'Mismatch'],
      rows: runs.value.map((r) => [
        r.run_date ?? '—', r.status, naira(r.db_total_minor), naira(r.gateway_total_minor),
        Number(r.mismatch_minor) > 0 ? naira(r.mismatch_minor) : '—',
      ]),
    }],
  });
}

onMounted(load);
</script>

<style scoped>
.row-alert { background: oklch(from var(--red) l c h / 0.07); }
</style>
