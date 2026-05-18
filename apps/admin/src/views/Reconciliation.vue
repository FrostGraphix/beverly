<template>
  <div class="bw-page">
    <div class="bw-page-header">
      <h1 class="bw-page-title">Reconciliation</h1>
    </div>

    <div v-if="loading" class="bw-loading">Loading…</div>
    <div v-else-if="error" class="bw-error-banner">{{ error }}</div>

    <div v-else>
      <div class="bw-table-wrapper">
        <table class="bw-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>DB Txns</th>
              <th>DB Total</th>
              <th>GW Total</th>
              <th>Mismatch</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in runs" :key="r.id" :class="r.mismatch_amount_minor > 0 ? 'bw-row-alert' : ''">
              <td class="bw-mono bw-text-sm">{{ r.period_date }}</td>
              <td>{{ r.db_transaction_count }}</td>
              <td>₦{{ fmtAmount(r.db_total_minor) }}</td>
              <td>₦{{ fmtAmount(r.gateway_total_minor) }}</td>
              <td :class="r.mismatch_amount_minor > 0 ? 'bw-text-error bw-font-semibold' : ''">
                {{ r.mismatch_amount_minor > 0 ? '₦' + fmtAmount(r.mismatch_amount_minor) : '—' }}
              </td>
              <td><span :class="statusClass(r.status)" class="bw-badge">{{ r.status }}</span></td>
              <td class="bw-text-sm bw-text-muted">{{ r.notes ?? '—' }}</td>
            </tr>
            <tr v-if="!runs.length">
              <td colspan="7" class="bw-empty">No reconciliation runs yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../lib/api';

const runs    = ref<any[]>([]);
const loading = ref(false);
const error   = ref('');

async function load() {
  loading.value = true;
  error.value   = '';
  try {
    const res = await api.get('/api/v1/admin/reconciliation');
    runs.value = res.runs ?? [];
  } catch (e: any) {
    error.value = e.message ?? 'Failed to load reconciliation runs';
  } finally {
    loading.value = false;
  }
}

function statusClass(s: string) {
  return { ok: 'bw-badge-success', mismatch: 'bw-badge-error', pending: 'bw-badge-warning' }[s] ?? 'bw-badge-neutral';
}

function fmtAmount(minor: number) {
  return (minor / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

onMounted(load);
</script>

<style scoped>
.bw-row-alert { background: var(--bw-error-50); }
</style>
