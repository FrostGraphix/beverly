<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { exportCsv, type Column } from '../lib/export';
import { naira } from '../lib/format';

interface SettlementBatch {
    id: string;
    period_start: string;
    period_end: string;
    total_vends: number;
    gross_amount_minor: number;
    fee_minor: number;
    net_amount_minor: number;
    status: string;
    settled_at: string | null;
}

const batches = ref<SettlementBatch[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const totals = computed(() => ({
    vends: batches.value.reduce((sum, batch) => sum + (batch.total_vends ?? 0), 0),
    gross: batches.value.reduce((sum, batch) => sum + (batch.gross_amount_minor ?? 0), 0),
    fees: batches.value.reduce((sum, batch) => sum + (batch.fee_minor ?? 0), 0),
    net: batches.value.reduce((sum, batch) => sum + (batch.net_amount_minor ?? 0), 0),
}));

const CSV_COLUMNS: Column<SettlementBatch>[] = [
    { key: 'period_start', header: 'Period Start', value: (row) => row.period_start },
    { key: 'period_end', header: 'Period End', value: (row) => row.period_end },
    { key: 'total_vends', header: 'Total Vends', value: (row) => row.total_vends },
    { key: 'gross', header: 'Gross Amount (NGN)', value: (row) => (row.gross_amount_minor / 100).toFixed(2) },
    { key: 'fees', header: 'Platform Fees (NGN)', value: (row) => (row.fee_minor / 100).toFixed(2) },
    { key: 'net', header: 'Net Settled (NGN)', value: (row) => (row.net_amount_minor / 100).toFixed(2) },
    { key: 'status', header: 'Status', value: (row) => row.status },
    { key: 'settled_at', header: 'Settled At', value: (row) => row.settled_at ?? '' },
];

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusBadge(status: string) {
    return status === 'settled' ? 'success' : 'warn';
}

function exportStatement() {
    exportCsv('beverly-vendor-statement', batches.value, CSV_COLUMNS);
}

onMounted(async () => {
    try {
        const response = await api.get<{ batches: SettlementBatch[] }>('/api/v1/vendor/settlement');
        batches.value = response.batches ?? [];
    } catch (cause: any) {
        error.value = cause?.message ?? 'Failed to load statement';
    } finally {
        loading.value = false;
    }
});
</script>

<template>
  <AppShell title="Statement">
    <div v-if="loading" class="bw-loading">Loading statement...</div>
    <div v-else-if="error" class="bw-error-banner">{{ error }}</div>

    <template v-else>
      <div class="bw-kpi-grid statement-stat-grid" aria-label="Statement summary">
        <div class="bw-kpi statement-stat">
          <span class="bw-kpi-label">Total Periods</span>
          <strong class="bw-kpi-value statement-stat-value">{{ batches.length }}</strong>
        </div>
        <div class="bw-kpi statement-stat">
          <span class="bw-kpi-label">Total Vends</span>
          <strong class="bw-kpi-value statement-stat-value">{{ totals.vends.toLocaleString() }}</strong>
        </div>
        <div class="bw-kpi statement-stat">
          <span class="bw-kpi-label">Gross Amount</span>
          <strong class="bw-kpi-value statement-stat-value">{{ naira(totals.gross) }}</strong>
        </div>
        <div class="bw-kpi statement-stat">
          <span class="bw-kpi-label">Platform Fees</span>
          <strong class="bw-kpi-value statement-stat-value fee">{{ naira(totals.fees) }}</strong>
        </div>
        <div class="bw-kpi statement-stat featured">
          <span class="bw-kpi-label">Net Settled</span>
          <strong class="bw-kpi-value statement-stat-value net">{{ naira(totals.net) }}</strong>
        </div>
      </div>

      <div v-if="batches.length === 0" class="bw-empty">No settlement batches yet.</div>

      <div v-else class="bw-card flush statement-periods">
        <div class="bw-table-head-bar">
          <div>
            <div class="bw-card-title">Settlement periods</div>
            <div class="bw-card-sub">{{ batches.length }} {{ batches.length === 1 ? 'period' : 'periods' }}</div>
          </div>
          <button class="bw-btn sm" @click="exportStatement">Export CSV</button>
        </div>

        <div class="bw-t-wrap">
          <table class="bw-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Vends</th>
                <th>Gross</th>
                <th>Fees</th>
                <th>Net</th>
                <th>Status</th>
                <th>Settled</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="batch in batches" :key="batch.id">
                <td>{{ fmtDate(batch.period_start) }}<template v-if="batch.period_start !== batch.period_end"> - {{ fmtDate(batch.period_end) }}</template></td>
                <td>{{ batch.total_vends }}</td>
                <td>{{ naira(batch.gross_amount_minor) }}</td>
                <td class="fee-col">{{ naira(batch.fee_minor) }}</td>
                <td class="net-col">{{ naira(batch.net_amount_minor) }}</td>
                <td><span :class="['bw-badge', statusBadge(batch.status)]">{{ batch.status }}</span></td>
                <td>{{ batch.settled_at ? fmtDate(batch.settled_at) : '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="bw-t-cards">
          <article v-for="batch in batches" :key="batch.id" class="bw-tc">
            <div class="bw-tc-top">
              <div>
                <div class="bw-tc-vendor">{{ fmtDate(batch.period_start) }}</div>
                <div v-if="batch.period_start !== batch.period_end" class="bw-tc-id">to {{ fmtDate(batch.period_end) }}</div>
              </div>
              <span :class="['bw-badge', statusBadge(batch.status)]">{{ batch.status }}</span>
            </div>
            <div class="bw-tc-mid">
              <div class="bw-tc-pair"><span class="bw-tc-pair-label">Vends</span><strong class="bw-tc-pair-val">{{ batch.total_vends }}</strong></div>
              <div class="bw-tc-pair"><span class="bw-tc-pair-label">Gross</span><strong class="bw-tc-pair-val">{{ naira(batch.gross_amount_minor) }}</strong></div>
              <div class="bw-tc-pair"><span class="bw-tc-pair-label">Fees</span><strong class="bw-tc-pair-val fee-col">{{ naira(batch.fee_minor) }}</strong></div>
              <div class="bw-tc-pair"><span class="bw-tc-pair-label">Net</span><strong class="bw-tc-pair-val net-col">{{ naira(batch.net_amount_minor) }}</strong></div>
              <div class="bw-tc-pair"><span class="bw-tc-pair-label">Settled</span><strong class="bw-tc-pair-val">{{ batch.settled_at ? fmtDate(batch.settled_at) : '-' }}</strong></div>
            </div>
          </article>
        </div>
      </div>
    </template>
  </AppShell>
</template>

<style scoped>
.statement-stat-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    margin-bottom: var(--s-4);
}

.statement-stat {
    min-height: 112px;
    padding: var(--s-4);
    justify-content: space-between;
}

.statement-stat .bw-kpi-label { letter-spacing: 0; }
.statement-stat-value { min-width: 0; font-size: var(--t-xl); letter-spacing: 0; overflow-wrap: anywhere; }
.statement-stat-value.fee { color: var(--danger); }
.statement-stat-value.net { color: var(--brand); }
.fee-col { color: var(--danger); }
.net-col { color: var(--brand); font-weight: 600; }
.statement-periods { overflow: hidden; }

@media (max-width: 1100px) {
    .statement-stat-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
    .statement-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-2); }
    .statement-stat { min-height: 96px; padding: var(--s-3); }
    .statement-stat:last-child { grid-column: 1 / -1; }
    .statement-stat-value { font-size: var(--t-lg); }
    .statement-periods .bw-table-head-bar { align-items: center; }
}
</style>
