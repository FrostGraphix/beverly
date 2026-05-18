<template>
  <div class="bw-page">
    <div class="bw-page-header">
      <h1 class="bw-page-title">Refunds</h1>
    </div>

    <div class="bw-filter-bar">
      <select v-model="statusFilter" class="bw-select bw-select-sm" @change="load">
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
        <option value="expired">Expired</option>
      </select>
    </div>

    <div v-if="loading" class="bw-loading">Loading…</div>
    <div v-else-if="error" class="bw-error-banner">{{ error }}</div>

    <div v-else class="bw-table-wrapper">
      <table class="bw-table">
        <thead>
          <tr>
            <th>Wallet</th>
            <th>Amount</th>
            <th>Reason</th>
            <th>Requested By</th>
            <th>Status</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in refunds" :key="r.id">
            <td class="bw-mono bw-text-sm">{{ r.wallet_id?.slice(0, 8) }}…</td>
            <td>₦{{ fmtAmount(r.amount_minor) }}</td>
            <td>{{ r.reason }}</td>
            <td class="bw-text-sm">{{ r.requested_by_user_id?.slice(0, 8) }}…</td>
            <td><span :class="statusClass(r.status)" class="bw-badge">{{ r.status }}</span></td>
            <td class="bw-text-sm">{{ fmtDate(r.created_at) }}</td>
            <td v-if="r.status === 'pending'" class="bw-action-cell">
              <button class="bw-btn bw-btn-success bw-btn-sm" @click="approve(r)">Approve</button>
              <button class="bw-btn bw-btn-danger bw-btn-sm" @click="openReject(r)">Reject</button>
            </td>
            <td v-else></td>
          </tr>
          <tr v-if="!refunds.length">
            <td colspan="7" class="bw-empty">No refunds found.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Reject modal -->
    <div v-if="rejecting" class="bw-modal-backdrop" @click.self="rejecting = null">
      <div class="bw-modal">
        <div class="bw-modal-header">
          <h2>Reject Refund</h2>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="rejecting = null">✕</button>
        </div>
        <div class="bw-modal-body">
          <label class="bw-label">Reason *</label>
          <textarea v-model="rejectReason" class="bw-textarea" rows="3" placeholder="Reason for rejection…"></textarea>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="rejecting = null">Cancel</button>
          <button class="bw-btn bw-btn-danger" :disabled="saving || !rejectReason" @click="submitReject">
            {{ saving ? 'Rejecting…' : 'Reject' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../lib/api';

const refunds      = ref<any[]>([]);
const loading      = ref(false);
const error        = ref('');
const statusFilter = ref('pending');
const saving       = ref(false);
const rejecting    = ref<any>(null);
const rejectReason = ref('');

async function load() {
  loading.value = true;
  error.value   = '';
  try {
    const params = statusFilter.value ? `?status=${statusFilter.value}` : '';
    const res = await api.get(`/api/v1/admin/refunds${params}`);
    refunds.value = res.refunds ?? [];
  } catch (e: any) {
    error.value = e.message ?? 'Failed to load refunds';
  } finally {
    loading.value = false;
  }
}

async function approve(r: any) {
  saving.value = true;
  try {
    await api.post(`/api/v1/admin/refunds/${r.id}/approve`, {});
    await load();
  } catch (e: any) {
    error.value = e.message ?? 'Failed to approve refund';
  } finally {
    saving.value = false;
  }
}

function openReject(r: any) {
  rejecting.value  = r;
  rejectReason.value = '';
}

async function submitReject() {
  if (!rejecting.value || !rejectReason.value) return;
  saving.value = true;
  try {
    await api.post(`/api/v1/admin/refunds/${rejecting.value.id}/reject`, { reason: rejectReason.value });
    await load();
    rejecting.value = null;
  } catch (e: any) {
    error.value = e.message ?? 'Failed to reject refund';
  } finally {
    saving.value = false;
  }
}

function statusClass(s: string) {
  return { pending: 'bw-badge-warning', approved: 'bw-badge-success', rejected: 'bw-badge-error', expired: 'bw-badge-neutral' }[s] ?? 'bw-badge-neutral';
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
.bw-action-cell { display: flex; gap: .5rem; }
.bw-textarea { width: 100%; }
</style>
