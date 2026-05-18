<template>
  <div class="bw-page">
    <div class="bw-page-header">
      <h1 class="bw-page-title">Settlement Batches</h1>
    </div>

    <div class="bw-filter-bar">
      <input v-model="vendorFilter" class="bw-input bw-input-sm" placeholder="Vendor ID…" @keyup.enter="load" />
      <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="load">Search</button>
    </div>

    <div v-if="loading" class="bw-loading">Loading…</div>
    <div v-else-if="error" class="bw-error-banner">{{ error }}</div>

    <div v-else class="bw-table-wrapper">
      <table class="bw-table">
        <thead>
          <tr>
            <th>Period</th>
            <th>Vendor</th>
            <th>Gross Sales</th>
            <th>Platform Fee</th>
            <th>Net Payable</th>
            <th>Txns</th>
            <th>Status</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in batches" :key="b.id">
            <td class="bw-mono bw-text-sm">{{ b.period_date }}</td>
            <td class="bw-mono bw-text-sm">{{ b.vendor_organization_id?.slice(0, 8) }}…</td>
            <td>₦{{ fmtAmount(b.gross_sales_minor) }}</td>
            <td>₦{{ fmtAmount(b.platform_fee_minor) }}</td>
            <td class="bw-font-semibold">₦{{ fmtAmount(b.net_payable_minor) }}</td>
            <td>{{ b.transaction_count }}</td>
            <td><span :class="statusClass(b.status)" class="bw-badge">{{ b.status }}</span></td>
            <td class="bw-text-sm">{{ fmtDate(b.created_at) }}</td>
          </tr>
          <tr v-if="!batches.length">
            <td colspan="8" class="bw-empty">No settlement batches found.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../lib/api';

const batches      = ref<any[]>([]);
const loading      = ref(false);
const error        = ref('');
const vendorFilter = ref('');

async function load() {
  loading.value = true;
  error.value   = '';
  try {
    const params = vendorFilter.value ? `?vendor_id=${encodeURIComponent(vendorFilter.value)}` : '';
    const res = await api.get(`/api/v1/admin/settlement${params}`);
    batches.value = res.batches ?? [];
  } catch (e: any) {
    error.value = e.message ?? 'Failed to load settlement batches';
  } finally {
    loading.value = false;
  }
}

function statusClass(s: string) {
  return { pending: 'bw-badge-warning', processing: 'bw-badge-brand', settled: 'bw-badge-success', failed: 'bw-badge-error' }[s] ?? 'bw-badge-neutral';
}

function fmtAmount(minor: number) {
  return (minor / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

function fmtDate(s: string) {
  return s ? new Date(s).toLocaleString() : '—';
}

onMounted(load);
</script>

<style scoped>
.bw-filter-bar { display: flex; gap: .75rem; margin-bottom: 1rem; }
</style>
