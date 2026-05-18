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
            <tr v-for="r in runs" :key="r.id" :class="r.mismatch_amount_minor > 0 ? 'row-alert' : ''">
              <td class="bw-mono bw-text-sm">{{ r.period_date }}</td>
              <td>{{ r.db_transaction_count }}</td>
              <td>₦{{ fmtAmount(r.db_total_minor) }}</td>
              <td>₦{{ fmtAmount(r.gateway_total_minor) }}</td>
              <td :style="r.mismatch_amount_minor > 0 ? 'color:var(--red);font-weight:600' : ''">
                {{ r.mismatch_amount_minor > 0 ? '₦' + fmtAmount(r.mismatch_amount_minor) : '—' }}
              </td>
              <td><span :class="statusClass(r.status)" class="bw-badge">{{ r.status }}</span></td>
              <td class="bw-text-sm" style="color:var(--text-muted)">{{ r.notes ?? '—' }}</td>
            </tr>
            <tr v-if="!runs.length">
              <td colspan="7" class="bw-empty">No reconciliation runs yet.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards (≤640px) -->
      <div class="bw-t-cards">
        <div v-if="!runs.length" class="bw-empty">No reconciliation runs yet.</div>
        <div v-for="r in runs" :key="r.id" class="bw-tc" :class="r.mismatch_amount_minor > 0 ? 'row-alert' : ''">
          <div class="bw-tc-head">
            <span class="bw-mono" style="font-size:var(--t-sm)">{{ r.period_date }}</span>
            <span :class="statusClass(r.status)" class="bw-badge">{{ r.status }}</span>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">DB Total</span><span class="bw-tc-pair-val">₦{{ fmtAmount(r.db_total_minor) }}</span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">GW Total</span><span class="bw-tc-pair-val">₦{{ fmtAmount(r.gateway_total_minor) }}</span></div>
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Mismatch</span>
              <span class="bw-tc-pair-val" :style="r.mismatch_amount_minor > 0 ? 'color:var(--red)' : ''">
                {{ r.mismatch_amount_minor > 0 ? '₦' + fmtAmount(r.mismatch_amount_minor) : '—' }}
              </span>
            </div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Txns</span><span class="bw-tc-pair-val">{{ r.db_transaction_count }}</span></div>
          </div>
        </div>
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
    const res = await api.get<{ runs?: any[] }>('/api/v1/admin/reconciliation');
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
.row-alert { background: oklch(from var(--red) l c h / 0.07); }
</style>
