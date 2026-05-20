<template>
  <AppShell title="Refunds">
    <template #topbar-end>
      <button class="bw-btn bw-btn-sm" :disabled="!refunds.length" @click="exportCsvRows">CSV</button>
      <button class="bw-btn bw-btn-sm" :disabled="!refunds.length" @click="exportPdfDoc" style="margin-left:6px">PDF</button>
    </template>

    <div class="bw-filter-bar">
      <select v-model="statusFilter" class="bw-select bw-select-sm" @change="load">
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
      </select>
    </div>

    <div v-if="loading" class="bw-loading">Loading…</div>
    <div v-else-if="error" class="bw-error-banner">{{ error }}</div>

    <div v-else>
      <div class="bw-table-wrapper">
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
              <td class="bw-mono bw-text-sm">{{ r.wallet_id?.slice(0, 8) || '—' }}…</td>
              <td>{{ naira(r.amount_minor) }}</td>
              <td>{{ r.reason?.replace(/_/g, ' ') || '—' }}</td>
              <td class="bw-text-sm bw-mono">{{ r.requested_by_user_id?.slice(0, 8) || '—' }}</td>
              <td><span :class="statusClass(r.status)" class="bw-badge">{{ statusLabel(r.status) }}</span></td>
              <td class="bw-text-sm">{{ fmtDate(r.created_at) }}</td>
              <td v-if="r.status === 'pending'" class="bw-action-cell">
                <button class="bw-btn bw-btn-primary bw-btn-sm" @click="openApprove(r)">Approve</button>
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

      <!-- Mobile cards (≤640px) -->
      <div class="bw-t-cards">
        <div v-if="!refunds.length" class="bw-empty">No refunds found.</div>
        <div v-for="r in refunds" :key="r.id" class="bw-tc">
          <div class="bw-tc-head">
            <span>{{ naira(r.amount_minor) }}</span>
            <span :class="statusClass(r.status)" class="bw-badge">{{ statusLabel(r.status) }}</span>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Reason</span><span class="bw-tc-pair-val">{{ r.reason?.replace(/_/g, ' ') }}</span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Created</span><span class="bw-tc-pair-val">{{ fmtDate(r.created_at) }}</span></div>
          </div>
          <div v-if="r.status === 'pending'" class="bw-tc-foot">
            <button class="bw-btn bw-btn-primary bw-btn-sm" @click="openApprove(r)">Approve</button>
            <button class="bw-btn bw-btn-danger bw-btn-sm" @click="openReject(r)">Reject</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Approve modal -->
    <div v-if="approving" class="bw-modal-backdrop" @click.self="approving = null">
      <div class="bw-modal">
        <div class="bw-modal-header">
          <h2>Approve Refund</h2>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="approving = null">✕</button>
        </div>
        <div class="bw-modal-body">
          <p class="bw-text-sm bw-text-muted">Amount: <strong>{{ naira(approving.amount_minor) }}</strong></p>
          <p class="bw-text-sm bw-text-muted">Reason: {{ approving.reason?.replace(/_/g, ' ') }}</p>
          <p class="bw-text-sm" style="margin-top:.5rem">Approving will credit this amount to the wallet immediately. This cannot be undone.</p>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="approving = null">Cancel</button>
          <button class="bw-btn bw-btn-primary" :disabled="saving" @click="submitApprove">
            {{ saving ? 'Approving…' : 'Confirm Approve' }}
          </button>
        </div>
      </div>
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
  </AppShell>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api, naira } from '../lib/api';
import AppShell from '../components/AppShell.vue';
import { exportCsv, printPdf } from '../lib/export';

const refunds      = ref<any[]>([]);
const loading      = ref(false);
const error        = ref('');
const statusFilter = ref('pending');
const saving       = ref(false);

const approving    = ref<any>(null);
const rejecting    = ref<any>(null);
const rejectReason = ref('');

async function load() {
  loading.value = true;
  error.value   = '';
  try {
    const params = statusFilter.value ? `?status=${statusFilter.value}` : '';
    const res = await api.get<{ refunds?: any[] }>(`/api/v1/admin/refunds${params}`);
    refunds.value = res.refunds ?? [];
  } catch (e: any) {
    error.value = e.message ?? 'Failed to load refunds';
  } finally {
    loading.value = false;
  }
}

function openApprove(r: any) { approving.value = r; }

async function submitApprove() {
  if (!approving.value) return;
  saving.value = true;
  try {
    await api.post(`/api/v1/admin/refunds/${approving.value.id}/approve`, {});
    approving.value = null;
    await load();
  } catch (e: any) {
    error.value = e.message ?? 'Failed to approve refund';
  } finally {
    saving.value = false;
  }
}

function openReject(r: any) { rejecting.value = r; rejectReason.value = ''; }

async function submitReject() {
  if (!rejecting.value || !rejectReason.value) return;
  saving.value = true;
  try {
    await api.post(`/api/v1/admin/refunds/${rejecting.value.id}/reject`, { reason: rejectReason.value });
    rejecting.value = null;
    await load();
  } catch (e: any) {
    error.value = e.message ?? 'Failed to reject refund';
  } finally {
    saving.value = false;
  }
}

function statusLabel(s: string) {
  return {
    pending: 'Pending', approved: 'Approved', rejected: 'Rejected',
  }[s] ?? s;
}

function statusClass(s: string) {
  return {
    pending: 'bw-badge-warning', approved: 'bw-badge-success', rejected: 'bw-badge-error',
  }[s] ?? 'bw-badge-neutral';
}

function fmtDate(s: string) { return s ? new Date(s).toLocaleString() : '—'; }

function exportCsvRows() {
  exportCsv('refunds', refunds.value, [
    { key: 'id', header: 'Refund ID', value: (r) => r.id },
    { key: 'wallet_id', header: 'Wallet', value: (r) => r.wallet_id },
    { key: 'amount', header: 'Amount (₦)', value: (r) => (r.amount_minor ?? 0) / 100 },
    { key: 'reason', header: 'Reason', value: (r) => r.reason },
    { key: 'status', header: 'Status', value: (r) => statusLabel(r.status) },
    { key: 'requested_by', header: 'Requested By', value: (r) => r.requested_by_user_id ?? '' },
    { key: 'created_at', header: 'Created', value: (r) => r.created_at },
  ]);
}

function exportPdfDoc() {
  printPdf({
    title: 'Refunds',
    subtitle: statusFilter.value ? `Status: ${statusLabel(statusFilter.value)}` : 'All refund requests',
    meta: [
      { label: 'Requests', value: String(refunds.value.length) },
      { label: 'Total amount', value: naira(refunds.value.reduce((s, r) => s + Number(r.amount_minor ?? 0), 0)) },
    ],
    tables: [{
      title: 'Refund requests',
      columns: ['Wallet', 'Amount', 'Reason', 'Status', 'Created'],
      rows: refunds.value.map((r) => [
        r.wallet_id?.slice(0, 8) ?? '—', naira(r.amount_minor), (r.reason ?? '').replace(/_/g, ' '), statusLabel(r.status), fmtDate(r.created_at),
      ]),
    }],
  });
}

onMounted(load);
</script>

<style scoped>
.bw-filter-bar { display: flex; gap: .75rem; margin-bottom: 1rem; flex-wrap: wrap; }
.bw-tc-foot { display: flex; gap: .5rem; padding: var(--s-3) var(--s-4); border-top: 1px solid var(--border); }
</style>
