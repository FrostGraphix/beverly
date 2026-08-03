<template>
  <AppShell title="Reconciliation">
    <div class="bw-filter-bar">
      <button class="bw-btn bw-btn-sm" :disabled="!runs.length" @click="exportCsvRows">Export CSV</button>
      <button class="bw-btn bw-btn-sm" :disabled="!runs.length" @click="exportPdfDoc">PDF</button>
      <button class="bw-btn bw-btn-primary" :disabled="running" @click="runNow">
        {{ running ? 'Running…' : 'Run Now' }}
      </button>
    </div>
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in runs" :key="r.id" :class="r.mismatch_minor > 0 ? 'row-alert' : ''">
              <td class="bw-mono bw-text-sm">{{ r.run_date || 'â€”' }}</td>
              <td><span :class="statusClass(r.status)" class="bw-badge">{{ r.status }}</span></td>
              <td>{{ naira(r.db_total_minor) }}</td>
              <td>{{ naira(r.gateway_total_minor) }}</td>
              <td :style="r.mismatch_minor > 0 ? 'color:var(--red);font-weight:600' : ''">
                {{ r.mismatch_minor > 0 ? naira(r.mismatch_minor) : 'â€”' }}
              </td>
              <td class="bw-text-sm" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ r.notes || 'â€”' }}</td>
              <td class="bw-text-sm">{{ fmtDate(r.created_at) }}</td>
              <td>
                <button v-if="hasDetails(r)" class="bw-btn bw-btn-sm" @click="openDetails(r)">Details</button>
              </td>
            </tr>
            <tr v-if="!runs.length">
              <td colspan="8" class="bw-empty">No reconciliation runs yet. Click "Run Now" to start.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards (â‰¤640px) -->
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
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Mismatch</span><span class="bw-tc-pair-val" :style="r.mismatch_minor > 0 ? 'color:var(--red)' : ''">{{ r.mismatch_minor > 0 ? naira(r.mismatch_minor) : 'â€”' }}</span></div>
          </div>
          <div v-if="hasDetails(r)" class="bw-tc-foot">
            <button class="bw-btn bw-btn-sm" @click="openDetails(r)">Details</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="detailsRun" class="bw-modal-backdrop" @click.self="detailsRun = null">
      <div class="bw-modal">
        <div class="bw-modal-header">
          <h2>Mismatch details — {{ detailsRun.run_date }}</h2>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="detailsRun = null">Close</button>
        </div>
        <div class="bw-modal-body">
          <p class="bw-muted" style="font-size:var(--t-sm)">
            References present on only one side of reconciliation. Investigate each before manual correction.
          </p>
          <div class="detail-col">
            <strong>In our DB, missing from gateway ({{ detailsRefs.db_only.length }})</strong>
            <ul v-if="detailsRefs.db_only.length" class="ref-list">
              <li v-for="ref in detailsRefs.db_only" :key="'db-' + ref" class="bw-mono">{{ ref }}</li>
            </ul>
            <p v-else class="bw-muted" style="font-size:var(--t-sm)">None</p>
          </div>
          <div class="detail-col">
            <strong>On gateway, missing from our DB ({{ detailsRefs.gateway_only.length }})</strong>
            <ul v-if="detailsRefs.gateway_only.length" class="ref-list">
              <li v-for="ref in detailsRefs.gateway_only" :key="'gw-' + ref" class="bw-mono">{{ ref }}</li>
            </ul>
            <p v-else class="bw-muted" style="font-size:var(--t-sm)">None</p>
          </div>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn" @click="detailsRun = null">Close</button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api, naira } from '../lib/api';
import AppShell from '../components/AppShell.vue';
import { exportCsv, printPdf } from '../lib/export';

const runs     = ref<any[]>([]);
const loading  = ref(false);
const error    = ref('');
const running  = ref(false);
const detailsRun = ref<any>(null);
const detailsRefs = computed(() => {
  const refs = detailsRun.value?.mismatched_references;
  return {
    db_only: Array.isArray(refs?.db_only) ? refs.db_only : [],
    gateway_only: Array.isArray(refs?.gateway_only) ? refs.gateway_only : [],
  };
});

function hasDetails(r: any) {
  const refs = r?.mismatched_references;
  return Boolean(refs && (refs.db_only?.length || refs.gateway_only?.length));
}

function openDetails(r: any) {
  detailsRun.value = r;
}

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

function fmtDate(s: string) { return s ? new Date(s).toLocaleString() : 'â€”'; }

function exportCsvRows() {
  exportCsv('reconciliation-runs', runs.value, [
    { key: 'run_date', header: 'Run Date', value: (r) => r.run_date },
    { key: 'status', header: 'Status', value: (r) => r.status },
    { key: 'db_total', header: 'DB Total (â‚¦)', value: (r) => (r.db_total_minor ?? 0) / 100 },
    { key: 'gateway_total', header: 'Gateway Total (â‚¦)', value: (r) => (r.gateway_total_minor ?? 0) / 100 },
    { key: 'mismatch', header: 'Mismatch (â‚¦)', value: (r) => (r.mismatch_minor ?? 0) / 100 },
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
        r.run_date ?? 'â€”', r.status, naira(r.db_total_minor), naira(r.gateway_total_minor),
        Number(r.mismatch_minor) > 0 ? naira(r.mismatch_minor) : 'â€”',
      ]),
    }],
  });
}

onMounted(load);
</script>

<style scoped>
.bw-filter-bar { display: flex; gap: .75rem; margin-bottom: 1rem; flex-wrap: wrap; }
.row-alert { background: oklch(from var(--red) l c h / 0.07); }
.detail-col { margin-top: 1rem; }
.detail-col strong { display: block; margin-bottom: .5rem; }
.ref-list { max-height: 220px; overflow-y: auto; padding-left: 1.1rem; margin: 0; font-size: var(--t-sm); }
.ref-list li { padding: 2px 0; }
</style>



