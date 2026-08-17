<template>
  <AppShell title="Refunds">
    <section class="bw-kpi-grid bw-mobile-kpi-grid refund-kpis" aria-label="Refund summary" :aria-busy="loading && !summaryLoaded">
      <article class="bw-kpi featured refund-kpi-total">
        <span class="bw-kpi-label">Total requests</span>
        <strong class="bw-kpi-value">{{ summaryValue('total') }}</strong>
        <span class="bw-kpi-note">all refund requests</span>
      </article>
      <article class="bw-kpi warn-tone">
        <span class="bw-kpi-label">Pending</span>
        <strong class="bw-kpi-value">{{ summaryValue('pending') }}</strong>
        <span class="bw-kpi-note">awaiting approval</span>
      </article>
      <article class="bw-kpi info-tone">
        <span class="bw-kpi-label">Approved</span>
        <strong class="bw-kpi-value">{{ summaryValue('approved') }}</strong>
        <span class="bw-kpi-note">credited requests</span>
      </article>
      <article class="bw-kpi danger-tone">
        <span class="bw-kpi-label">Rejected</span>
        <strong class="bw-kpi-value">{{ summaryValue('rejected') }}</strong>
        <span class="bw-kpi-note">declined requests</span>
      </article>
      <article class="bw-kpi">
        <span class="bw-kpi-label">Expired</span>
        <strong class="bw-kpi-value">{{ summaryValue('expired') }}</strong>
        <span class="bw-kpi-note">review window elapsed</span>
      </article>
    </section>

    <div class="bw-filter-bar">
      <button type="button" class="bw-btn bw-btn-sm" :disabled="loading" @click.prevent="load">Refresh</button>
      <button type="button" class="bw-btn bw-btn-sm" :disabled="!refunds.length" @click.prevent="exportCsvRows">Export CSV</button>
      <button type="button" class="bw-btn bw-btn-sm" :disabled="!refunds.length" @click.prevent="exportPdfDoc">PDF</button>
      <select v-model="statusFilter" class="bw-select bw-select-sm" aria-label="Filter refunds by status" @change="load">
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
        <option value="expired">Expired</option>
      </select>
    </div>

    <div v-if="loading" class="bw-card" aria-label="Loading refunds">
      <div v-for="n in 5" :key="n" class="bw-skeleton" style="margin: var(--s-2)"></div>
    </div>
    <div v-else-if="error" class="bw-error-banner refund-error" role="alert">
      <span>{{ error }}</span>
      <button class="bw-btn bw-btn-sm" @click="load">Try again</button>
    </div>

    <div v-else>
      <div v-if="successMessage" class="bw-success-banner refund-success" role="status">{{ successMessage }}</div>
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
              <th>Record</th>
              <th class="refund-actions-col"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in refunds" :key="r.id">
              <td>
                <strong class="refund-owner">{{ walletOwnerLabel(r) }}</strong>
                <span class="bw-mono bw-text-sm">{{ shortId(r.wallet_id) }}</span>
              </td>
              <td>{{ naira(r.amount_minor) }}</td>
              <td>{{ r.reason?.replace(/_/g, ' ') || 'â€”' }}</td>
              <td class="bw-text-sm">{{ requesterLabel(r) }}</td>
              <td><span :class="statusClass(r.status)" class="bw-badge">{{ statusLabel(r.status) }}</span></td>
              <td class="bw-text-sm">{{ fmtDate(r.created_at) }}</td>
              <td>
                <div class="receipt-actions">
                  <button class="bw-btn bw-btn-sm" @click="viewRefundReceipt(r)">View record</button>
                  <button class="bw-btn bw-btn-sm" @click="printRefundReceipt(r)">Print record</button>
                </div>
              </td>
              <td v-if="r.status === 'pending'" class="bw-action-cell refund-actions-col">
                <div class="refund-row-actions">
                  <button
                    class="bw-btn bw-btn-primary bw-btn-sm"
                    :disabled="isOwnRequest(r)"
                    :title="isOwnRequest(r) ? 'A different finance checker must approve this request.' : undefined"
                    @click="openApprove(r)"
                  >Approve</button>
                  <button class="bw-btn bw-btn-danger bw-btn-sm" @click="openReject(r)">Reject</button>
                </div>
                <MobileActionMenu label="Refund actions">
                  <button class="mobile-action-item primary" :disabled="isOwnRequest(r)" @click="openApprove(r)">Approve</button>
                  <button class="mobile-action-item danger" @click="openReject(r)">Reject</button>
                </MobileActionMenu>
                <span v-if="isOwnRequest(r)" class="refund-checker-note">Second approver required</span>
              </td>
              <td v-else></td>
            </tr>
            <tr v-if="!refunds.length">
              <td colspan="8" class="bw-empty">{{ emptyMessage }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards (â‰¤640px) -->
      <div class="bw-t-cards">
        <div v-if="!refunds.length" class="bw-empty">{{ emptyMessage }}</div>
        <div v-for="r in refunds" :key="r.id" class="bw-tc">
          <div class="bw-tc-head">
            <span>{{ naira(r.amount_minor) }}</span>
            <span :class="statusClass(r.status)" class="bw-badge">{{ statusLabel(r.status) }}</span>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Wallet</span><span class="bw-tc-pair-val">{{ walletOwnerLabel(r) }} · {{ shortId(r.wallet_id) }}</span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Reason</span><span class="bw-tc-pair-val">{{ r.reason?.replace(/_/g, ' ') }}</span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Requested by</span><span class="bw-tc-pair-val">{{ requesterLabel(r) }}</span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Created</span><span class="bw-tc-pair-val">{{ fmtDate(r.created_at) }}</span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Record</span><span class="receipt-actions"><button class="bw-btn bw-btn-sm" @click="viewRefundReceipt(r)">View</button><button class="bw-btn bw-btn-sm" @click="printRefundReceipt(r)">Print</button></span></div>
          </div>
          <div v-if="r.status === 'pending'" class="bw-tc-foot">
            <MobileActionMenu label="Refund actions">
              <button class="mobile-action-item primary" :disabled="isOwnRequest(r)" @click="openApprove(r)">Approve</button>
              <button class="mobile-action-item danger" @click="openReject(r)">Reject</button>
            </MobileActionMenu>
            <span v-if="isOwnRequest(r)" class="refund-checker-note">Second approver required</span>
          </div>
        </div>
      </div>
    </div>

    <ConfirmDialog
      :open="Boolean(approving)"
      title="Approve refund?"
      :description="approving ? `Credit up to ${naira(approving.amount_minor)}. This cannot be undone.` : ''"
      confirm-label="Approve refund"
      tone="warn"
      :loading="saving"
      :disable-confirm="!approveAmountValid"
      @update:open="(open) => { if (!open) approving = null; }"
      @confirm="submitApprove"
    >
      <div v-if="actionError" class="bw-error-banner" role="alert">{{ actionError }}</div>
      <label class="bw-label">Amount to credit (â‚¦)</label>
      <input
        class="bw-input"
        type="number"
        min="0.01"
        :max="approving ? approving.amount_minor / 100 : undefined"
        step="0.01"
        v-model="approveAmountNaira"
      />
      <p class="bw-muted" style="font-size: var(--t-xs); margin-top: 6px">
        Defaults to the full requested amount. Reduce for a partial refund (e.g. energy value only, retaining the gateway fee).
      </p>
      <p v-if="!approveAmountValid" class="bw-error-banner" role="alert" style="margin-top: 6px">
        Enter an amount greater than zero and no more than the requested amount.
      </p>
    </ConfirmDialog>

    <ConfirmDialog
      :open="Boolean(rejecting)"
      title="Reject refund?"
      description="This request will be marked rejected."
      confirm-label="Reject refund"
      tone="danger"
      :loading="saving"
      :disable-confirm="!rejectReason.trim()"
      @update:open="(open) => { if (!open) rejecting = null; }"
      @confirm="submitReject"
    >
      <div v-if="actionError" class="bw-error-banner" role="alert">{{ actionError }}</div>
      <label class="bw-label">Reason *</label>
      <textarea v-model="rejectReason" class="bw-textarea" rows="3" placeholder="Reason for rejection..."></textarea>
    </ConfirmDialog>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { api, naira } from '../lib/api';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import MobileActionMenu from '../components/MobileActionMenu.vue';
import { exportCsv, printPdf } from '../lib/export';
import { printReceipt, refundReceipt, viewReceipt } from '../lib/receipts';
import { useStaffAuthStore } from '../stores/auth';

type RefundStatus = 'pending' | 'approved' | 'rejected' | 'expired';
interface RefundRecord {
  id: string;
  wallet_id: string;
  amount_minor: number;
  reason: string;
  requested_by_user_id: string | null;
  approved_by_user_id?: string | null;
  rejected_by_user_id?: string | null;
  status: RefundStatus;
  created_at: string;
  processed_at?: string | null;
  wallets?: { owner_type?: string | null; owner_id?: string | null } | null;
}
interface RefundSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
}

const auth         = useStaffAuthStore();
const refunds      = ref<RefundRecord[]>([]);
const loading      = ref(false);
const error        = ref('');
const actionError  = ref('');
const successMessage = ref('');
const statusFilter = ref<RefundStatus | ''>('pending');
const saving       = ref(false);
const summaryLoaded = ref(false);
const summary      = ref<RefundSummary>({ total: 0, pending: 0, approved: 0, rejected: 0, expired: 0 });

const approving    = ref<RefundRecord | null>(null);
const rejecting    = ref<RefundRecord | null>(null);
const rejectReason = ref('');
const approveAmountNaira = ref('');
const approveAmountValid = computed(() => {
  if (!approving.value) return false;
  const minor = Math.round(parseFloat(approveAmountNaira.value || '0') * 100);
  return minor > 0 && minor <= approving.value.amount_minor;
});
const emptyMessage = computed(() => statusFilter.value
  ? `No ${statusLabel(statusFilter.value).toLowerCase()} refund requests.`
  : 'No refund requests yet.');

async function load() {
  loading.value = true;
  error.value   = '';
  try {
    const params = statusFilter.value ? `?status=${statusFilter.value}` : '';
    const [res, summaryRes] = await Promise.all([
      api.get<{ refunds?: RefundRecord[] }>(`/api/v1/admin/refunds${params}`),
      api.get<{ summary?: RefundSummary }>('/api/v1/admin/refunds/summary'),
    ]);
    refunds.value = res.refunds ?? [];
    summary.value = summaryRes.summary ?? summary.value;
    summaryLoaded.value = Boolean(summaryRes.summary);
  } catch (e: any) {
    error.value = e.message ?? 'Failed to load refunds';
  } finally {
    loading.value = false;
  }
}

function openApprove(r: RefundRecord) {
  if (isOwnRequest(r)) return;
  actionError.value = '';
  approving.value = r;
  approveAmountNaira.value = (r.amount_minor / 100).toString();
}

async function submitApprove() {
  if (!approving.value || !approveAmountValid.value) return;
  saving.value = true;
  try {
    const amountMinor = Math.round(parseFloat(approveAmountNaira.value) * 100);
    const isPartial = amountMinor < approving.value.amount_minor;
    await api.post(`/api/v1/admin/refunds/${approving.value.id}/approve`, isPartial ? { amount_minor: amountMinor } : {});
    approving.value = null;
    await load();
    successMessage.value = isPartial ? `Partial refund of ${naira(amountMinor)} approved and wallet credited.` : 'Refund approved and wallet credited.';
  } catch (e: any) {
    actionError.value = e.message ?? 'Failed to approve refund';
  } finally {
    saving.value = false;
  }
}

function openReject(r: RefundRecord) {
  actionError.value = '';
  rejecting.value = r;
  rejectReason.value = '';
}

async function submitReject() {
  if (!rejecting.value || !rejectReason.value.trim()) return;
  saving.value = true;
  try {
    await api.post(`/api/v1/admin/refunds/${rejecting.value.id}/reject`, { reason: rejectReason.value.trim() });
    rejecting.value = null;
    await load();
    successMessage.value = 'Refund rejected.';
  } catch (e: any) {
    actionError.value = e.message ?? 'Failed to reject refund';
  } finally {
    saving.value = false;
  }
}

function statusLabel(s: string) {
  return {
    pending: 'Pending', approved: 'Approved', rejected: 'Rejected', expired: 'Expired',
  }[s] ?? s;
}

function statusClass(s: string) {
  return {
    pending: 'bw-badge-warning', approved: 'bw-badge-success', rejected: 'bw-badge-error', expired: 'bw-badge-neutral',
  }[s] ?? 'bw-badge-neutral';
}

function fmtDate(s: string) { return s ? new Date(s).toLocaleString() : 'â€”'; }

function summaryValue(key: keyof RefundSummary) {
  return summaryLoaded.value ? summary.value[key] : '—';
}

function shortId(value?: string | null) {
  return value ? `${value.slice(0, 8)}…` : '—';
}

function walletOwnerLabel(refund: RefundRecord) {
  return refund.wallets?.owner_type === 'vendor'
    ? 'Vendor wallet'
    : refund.wallets?.owner_type === 'customer'
      ? 'Customer wallet'
      : 'Wallet';
}

function isOwnRequest(refund: RefundRecord) {
  return Boolean(auth.user?.id && refund.requested_by_user_id === auth.user.id);
}

function requesterLabel(refund: RefundRecord) {
  return isOwnRequest(refund) ? 'You' : shortId(refund.requested_by_user_id);
}

function viewRefundReceipt(r: RefundRecord) { viewReceipt(refundReceipt(r)); }

function printRefundReceipt(r: RefundRecord) { printReceipt(refundReceipt(r)); }

function exportCsvRows() {
  exportCsv('refunds', refunds.value, [
    { key: 'id', header: 'Refund ID', value: (r) => r.id },
    { key: 'wallet_id', header: 'Wallet', value: (r) => r.wallet_id },
    { key: 'amount', header: 'Amount (â‚¦)', value: (r) => (r.amount_minor ?? 0) / 100 },
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
        r.wallet_id?.slice(0, 8) ?? 'â€”', naira(r.amount_minor), (r.reason ?? '').replace(/_/g, ' '), statusLabel(r.status), fmtDate(r.created_at),
      ]),
    }],
  });
}

onMounted(load);
</script>

<style scoped>
.bw-filter-bar { display: flex; gap: .75rem; margin-bottom: 1rem; flex-wrap: wrap; }
.refund-kpis {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-bottom: var(--s-4);
}
.bw-tc-foot { display: flex; justify-content: flex-end; gap: .5rem; padding: var(--s-3) var(--s-4); border-top: 1px solid var(--border); }
.refund-row-actions { display: flex; gap: .5rem; justify-content: flex-end; }
.refund-actions-col { min-width: 150px; }
.receipt-actions { display: inline-flex; gap: 4px; white-space: nowrap; }
.refund-owner { display: block; font-size: var(--t-sm); }
.refund-checker-note { display: block; color: var(--text-muted); font-size: var(--t-xs); margin-top: var(--s-2); }
.refund-error { align-items: center; display: flex; justify-content: space-between; gap: var(--s-3); }
.refund-success {
  background: var(--brand-glow);
  border: 1px solid oklch(70% 0.19 145 / 0.28);
  border-radius: var(--r-md);
  color: var(--brand-on-surface);
  margin-bottom: var(--s-3);
  padding: var(--s-3) var(--s-4);
}

@media (max-width: 1100px) {
  .refund-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 720px) {
  .refund-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .refund-kpis .bw-kpi {
    gap: var(--s-2);
    min-height: 132px;
    padding: var(--s-4);
  }
  .refund-kpis .bw-kpi-value { font-size: clamp(1.25rem, 7vw, 1.75rem); }
  .refund-kpi-total { grid-column: 1 / -1; }
  .refund-error { align-items: stretch; flex-direction: column; }
  .refund-actions-col {
    min-width: 72px;
    position: sticky;
    right: 0;
    background: var(--glass-bg-strong);
    backdrop-filter: blur(16px) saturate(150%);
    -webkit-backdrop-filter: blur(16px) saturate(150%);
    z-index: 3;
  }

  .refund-row-actions {
    display: none;
  }
}

@media (max-width: 390px) {
  .refund-kpis { grid-template-columns: 1fr; }
  .refund-kpi-total { grid-column: auto; }
}
</style>


