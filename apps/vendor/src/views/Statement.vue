<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
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
const error   = ref<string | null>(null);

onMounted(async () => {
    try {
        const res = await api.get<{ batches: SettlementBatch[] }>('/api/v1/vendor/settlement');
        batches.value = res.batches;
    } catch (e: any) {
        error.value = e?.message ?? 'Failed to load statement';
    } finally {
        loading.value = false;
    }
});

const totals = computed(() => ({
    vends: batches.value.reduce((s, b) => s + b.total_vends, 0),
    gross: batches.value.reduce((s, b) => s + b.gross_amount_minor, 0),
    fees:  batches.value.reduce((s, b) => s + b.fee_minor, 0),
    net:   batches.value.reduce((s, b) => s + b.net_amount_minor, 0),
}));

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
}
</script>

<template>
  <AppShell title="Statement">

    <div v-if="loading" class="bw-loading">Loading statement…</div>
    <div v-else-if="error" class="bw-error-banner">{{ error }}</div>

    <template v-else>
      <!-- Summary cards -->
      <div class="summary-grid">
        <div class="bw-card stat-card">
          <span class="stat-label">Total Periods</span>
          <span class="stat-val">{{ batches.length }}</span>
        </div>
        <div class="bw-card stat-card">
          <span class="stat-label">Total Vends</span>
          <span class="stat-val">{{ totals.vends.toLocaleString() }}</span>
        </div>
        <div class="bw-card stat-card">
          <span class="stat-label">Gross Amount</span>
          <span class="stat-val">{{ naira(totals.gross) }}</span>
        </div>
        <div class="bw-card stat-card">
          <span class="stat-label">Platform Fees</span>
          <span class="stat-val fee">{{ naira(totals.fees) }}</span>
        </div>
        <div class="bw-card stat-card">
          <span class="stat-label">Net Settled</span>
          <span class="stat-val net">{{ naira(totals.net) }}</span>
        </div>
      </div>

      <div v-if="batches.length === 0" class="bw-empty">No settlement batches yet.</div>

      <template v-else>
        <!-- Desktop table -->
        <div class="bw-table-wrapper bw-table">
          <table>
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
              <tr v-for="b in batches" :key="b.id">
                <td>{{ fmtDate(b.period_start) }}<template v-if="b.period_start !== b.period_end"> – {{ fmtDate(b.period_end) }}</template></td>
                <td>{{ b.total_vends }}</td>
                <td>{{ naira(b.gross_amount_minor) }}</td>
                <td class="fee-col">{{ naira(b.fee_minor) }}</td>
                <td class="net-col">{{ naira(b.net_amount_minor) }}</td>
                <td><span :class="['bw-badge', b.status === 'settled' ? 'bw-badge-success' : 'bw-badge-warning']">{{ b.status }}</span></td>
                <td>{{ b.settled_at ? fmtDate(b.settled_at) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile cards -->
        <div class="bw-t-cards">
          <div v-for="b in batches" :key="b.id" class="bw-card batch-card">
            <div class="batch-period">{{ fmtDate(b.period_start) }}<template v-if="b.period_start !== b.period_end"> – {{ fmtDate(b.period_end) }}</template></div>
            <div class="batch-row"><span>Vends</span><span>{{ b.total_vends }}</span></div>
            <div class="batch-row"><span>Gross</span><span>{{ naira(b.gross_amount_minor) }}</span></div>
            <div class="batch-row"><span>Fees</span><span class="fee-col">{{ naira(b.fee_minor) }}</span></div>
            <div class="batch-row net-row"><span>Net</span><span class="net-col">{{ naira(b.net_amount_minor) }}</span></div>
            <div class="batch-row">
              <span>Status</span>
              <span :class="['bw-badge', b.status === 'settled' ? 'bw-badge-success' : 'bw-badge-warning']">{{ b.status }}</span>
            </div>
          </div>
        </div>
      </template>
    </template>

  </AppShell>
</template>

<style scoped>
.summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1.5rem;
}
.stat-card {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 1rem;
}
.stat-label { font-size: 0.75rem; color: var(--muted); }
.stat-val   { font-size: 1.1rem; font-weight: 600; }
.stat-val.fee { color: var(--red); }
.stat-val.net { color: var(--green); }

.fee-col { color: var(--red); }
.net-col { color: var(--green); font-weight: 600; }

.batch-card { padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
.batch-period { font-weight: 600; font-size: 0.9rem; margin-bottom: 0.25rem; }
.batch-row { display: flex; justify-content: space-between; font-size: 0.875rem; }
.net-row { padding-top: 0.25rem; border-top: 1px solid var(--border); font-weight: 600; }
</style>
