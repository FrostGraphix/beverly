<template>
  <AppShell title="Settlement Batches">
    <template #topbar-end>
      <button class="bw-btn bw-btn-sm" :disabled="!filteredBatches.length" @click="exportCsvRows">CSV</button>
      <button class="bw-btn bw-btn-sm" :disabled="!filteredBatches.length" @click="exportPdfDoc" style="margin-left:6px">PDF</button>
    </template>

    <div class="bw-filter-bar">
      <input v-model="search" class="bw-input bw-input-sm bw-mono" placeholder="Search vendor org…" @keyup.enter="applySearch" />
      <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="applySearch">Search</button>
    </div>

    <div v-if="loading" class="bw-loading">Loading…</div>
    <div v-else-if="error" class="bw-error-banner">{{ error }}</div>

    <div v-else>
      <div class="bw-table-wrapper">
        <table class="bw-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Vendor Org</th>
              <th>Period</th>
              <th>Gross</th>
              <th>Fee</th>
              <th>Net</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in filteredBatches" :key="b.id">
              <td class="bw-mono bw-text-sm">{{ b.id?.slice(0, 8) }}</td>
              <td class="bw-text-sm">{{ b.vendor_organizations?.trading_name || b.vendor_organizations?.legal_name || b.vendor_organization_id?.slice(0, 8) || '—' }}</td>
              <td class="bw-text-sm">{{ fmtPeriod(b.period_start, b.period_end) }}</td>
              <td>{{ naira(b.gross_amount_minor) }}</td>
              <td>{{ naira(b.fee_minor) }}</td>
              <td :style="netStyle(b.net_amount_minor)"><strong>{{ naira(b.net_amount_minor) }}</strong></td>
              <td><span :class="statusClass(b.status)" class="bw-badge">{{ b.status }}</span></td>
              <td class="bw-text-sm">{{ fmtDate(b.created_at) }}</td>
            </tr>
            <tr v-if="!filteredBatches.length">
              <td colspan="8" class="bw-empty">No settlement batches found.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards (≤640px) -->
      <div class="bw-t-cards">
        <div v-if="!filteredBatches.length" class="bw-empty">No settlement batches found.</div>
        <div v-for="b in filteredBatches" :key="b.id" class="bw-tc">
          <div class="bw-tc-head">
            <span class="bw-mono" style="font-size:var(--t-sm)">{{ b.id?.slice(0, 8) }}</span>
            <span :class="statusClass(b.status)" class="bw-badge">{{ b.status }}</span>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Vendor</span><span class="bw-tc-pair-val">{{ b.vendor_organizations?.legal_name || '—' }}</span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Net</span><span class="bw-tc-pair-val" :style="netStyle(b.net_amount_minor)">{{ naira(b.net_amount_minor) }}</span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Period</span><span class="bw-tc-pair-val">{{ fmtPeriod(b.period_start, b.period_end) }}</span></div>
          </div>
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

const allBatches = ref<any[]>([]);
const loading    = ref(false);
const error      = ref('');
const search     = ref('');
const searchQ    = ref('');

const filteredBatches = computed(() => {
  const q = searchQ.value.toLowerCase();
  return q
    ? allBatches.value.filter(b =>
        (b.vendor_organizations?.legal_name || '').toLowerCase().includes(q) ||
        (b.vendor_organizations?.trading_name || '').toLowerCase().includes(q) ||
        (b.vendor_organization_id || '').toLowerCase().includes(q)
      )
    : allBatches.value;
});

function applySearch() { searchQ.value = search.value; }

async function load() {
  loading.value = true;
  error.value   = '';
  try {
    const res = await api.get<{ batches?: any[] }>('/api/v1/admin/settlement');
    allBatches.value = res.batches ?? [];
  } catch (e: any) {
    error.value = e.message ?? 'Failed to load settlement batches';
  } finally {
    loading.value = false;
  }
}

function statusClass(s: string) {
  return {
    settled: 'bw-badge-success',
    pending: 'bw-badge-warning',
    failed:  'bw-badge-error',
  }[s] ?? 'bw-badge-neutral';
}

function netStyle(minor: number) {
  if (!minor) return '';
  return minor >= 0 ? 'color:var(--green)' : 'color:var(--red)';
}

function fmtPeriod(start: string, end: string) {
  if (!start && !end) return '—';
  const fmt = (s: string) => s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '';
  return start ? `${fmt(start)} → ${fmt(end)}` : fmt(end);
}

function fmtDate(s: string) { return s ? new Date(s).toLocaleString() : '—'; }

function vendorName(b: any) {
  return b.vendor_organizations?.trading_name || b.vendor_organizations?.legal_name || b.vendor_organization_id?.slice(0, 8) || '—';
}

function exportCsvRows() {
  exportCsv('settlement-batches', filteredBatches.value, [
    { key: 'id', header: 'Batch ID', value: (b) => b.id },
    { key: 'vendor', header: 'Vendor Org', value: vendorName },
    { key: 'period_start', header: 'Period Start', value: (b) => b.period_start },
    { key: 'period_end', header: 'Period End', value: (b) => b.period_end },
    { key: 'gross', header: 'Gross (₦)', value: (b) => (b.gross_amount_minor ?? 0) / 100 },
    { key: 'fee', header: 'Fee (₦)', value: (b) => (b.fee_minor ?? 0) / 100 },
    { key: 'net', header: 'Net (₦)', value: (b) => (b.net_amount_minor ?? 0) / 100 },
    { key: 'status', header: 'Status', value: (b) => b.status },
    { key: 'created_at', header: 'Created', value: (b) => b.created_at },
  ]);
}

function exportPdfDoc() {
  printPdf({
    title: 'Settlement Batches',
    subtitle: searchQ.value ? `Filtered by "${searchQ.value}"` : 'All vendor settlement batches',
    meta: [
      { label: 'Batches', value: String(filteredBatches.value.length) },
      { label: 'Total net', value: naira(filteredBatches.value.reduce((s, b) => s + Number(b.net_amount_minor ?? 0), 0)) },
    ],
    tables: [{
      title: 'Batches',
      columns: ['Vendor', 'Period', 'Gross', 'Fee', 'Net', 'Status'],
      rows: filteredBatches.value.map((b) => [
        vendorName(b), fmtPeriod(b.period_start, b.period_end), naira(b.gross_amount_minor), naira(b.fee_minor), naira(b.net_amount_minor), b.status,
      ]),
    }],
  });
}

onMounted(load);
</script>

<style scoped>
.bw-filter-bar { display: flex; gap: .75rem; margin-bottom: 1rem; flex-wrap: wrap; }
</style>
