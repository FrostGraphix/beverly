<template>
  <AppShell :title="t('refunds.title')">
    <section class="bw-kpi-grid bw-mobile-kpi-grid refund-kpis" :aria-label="t('refunds.summary')" :aria-busy="loading && !summaryLoaded">
      <article class="bw-kpi featured refund-kpi-total">
        <span class="bw-kpi-label">{{ t('refunds.totalRequests') }}</span>
        <strong class="bw-kpi-value">{{ summaryValue('total') }}</strong>
        <span class="bw-kpi-note">{{ t('refunds.allRefundRequests') }}</span>
      </article>
      <article class="bw-kpi warn-tone">
        <span class="bw-kpi-label">{{ t('refunds.pending') }}</span>
        <strong class="bw-kpi-value">{{ summaryValue('pending') }}</strong>
        <span class="bw-kpi-note">{{ t('refunds.awaitingApproval') }}</span>
      </article>
      <article class="bw-kpi info-tone">
        <span class="bw-kpi-label">{{ t('refunds.approved') }}</span>
        <strong class="bw-kpi-value">{{ summaryValue('approved') }}</strong>
        <span class="bw-kpi-note">{{ t('refunds.creditedRequests') }}</span>
      </article>
      <article class="bw-kpi success-tone">
        <span class="bw-kpi-label">{{ t('refunds.meterRefunds') }}</span>
        <strong class="bw-kpi-value">{{ summaryValue('meter_rejection') }}</strong>
        <span class="bw-kpi-note">{{ t('refunds.rejectedMeterCredits') }}</span>
      </article>
      <article class="bw-kpi danger-tone">
        <span class="bw-kpi-label">{{ t('refunds.rejected') }}</span>
        <strong class="bw-kpi-value">{{ summaryValue('rejected') }}</strong>
        <span class="bw-kpi-note">{{ t('refunds.declinedRequests') }}</span>
      </article>
      <article class="bw-kpi">
        <span class="bw-kpi-label">{{ t('refunds.expired') }}</span>
        <strong class="bw-kpi-value">{{ summaryValue('expired') }}</strong>
        <span class="bw-kpi-note">{{ t('refunds.reviewWindowElapsed') }}</span>
      </article>
    </section>

    <p class="refund-flow-note" role="note">
      {{ t('refunds.automaticNote') }}
    </p>

    <div class="bw-filter-bar">
      <button type="button" class="bw-btn bw-btn-sm" :disabled="loading" @click.prevent="load">{{ t('refunds.refresh') }}</button>
      <button type="button" class="bw-btn bw-btn-sm" :disabled="!refunds.length" @click.prevent="exportCsvRows">{{ t('refunds.exportPage') }}</button>
      <button type="button" class="bw-btn bw-btn-sm" :disabled="!refunds.length" @click.prevent="exportPdfDoc">{{ t('refunds.pdfPage') }}</button>
      <select v-model="statusFilter" class="bw-select bw-select-sm" :aria-label="t('refunds.filterStatus')" @change="reloadFirstPage">
        <option value="">{{ t('refunds.allStatuses') }}</option>
        <option value="pending">{{ t('refunds.pending') }}</option>
        <option value="approved">{{ t('refunds.approved') }}</option>
        <option value="rejected">{{ t('refunds.rejected') }}</option>
        <option value="expired">{{ t('refunds.expired') }}</option>
      </select>
      <select v-model="sourceFilter" class="bw-select bw-select-sm" :aria-label="t('refunds.filterSource')" @change="reloadFirstPage">
        <option value="">{{ t('refunds.allSources') }}</option>
        <option value="meter_order_rejection">{{ t('refunds.meterRejection') }}</option>
        <option value="dispute">{{ t('refunds.dispute') }}</option>
        <option value="manual">{{ t('refunds.manual') }}</option>
      </select>
    </div>

    <div v-if="loading" class="bw-card" :aria-label="t('refunds.loading')">
      <div v-for="n in 5" :key="n" class="bw-skeleton" style="margin: var(--s-2)"></div>
    </div>
    <div v-else-if="error" class="bw-error-banner refund-error" role="alert">
      <span>{{ error }}</span>
      <button class="bw-btn bw-btn-sm" @click="load">{{ t('refunds.tryAgain') }}</button>
    </div>

    <div v-else>
      <div v-if="successMessage" class="bw-success-banner refund-success" role="status">{{ successMessage }}</div>
      <div class="bw-table-wrapper">
        <table class="bw-table">
          <thead>
            <tr>
              <th>{{ t('refunds.wallet') }}</th>
              <th>{{ t('refunds.amount') }}</th>
              <th>{{ t('refunds.source') }}</th>
              <th>{{ t('refunds.reason') }}</th>
              <th>{{ t('refunds.requestedBy') }}</th>
              <th>{{ t('refunds.status') }}</th>
              <th>{{ t('refunds.created') }}</th>
              <th>{{ t('refunds.record') }}</th>
              <th class="refund-actions-col"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in pagedRefunds" :key="r.id">
              <td>
                <strong class="refund-owner">{{ walletOwnerLabel(r) }}</strong>
                <span class="bw-mono bw-text-sm">{{ shortId(r.wallet_id) }}</span>
              </td>
              <td>{{ naira(r.amount_minor) }}</td>
              <td>
                <span class="bw-badge bw-badge-neutral">{{ sourceLabel(r.source_type) }}</span>
                <span v-if="r.source_id" class="refund-source-id bw-mono">{{ shortId(r.source_id) }}</span>
              </td>
              <td>{{ r.reason?.replace(/_/g, ' ') || '—' }}</td>
              <td class="bw-text-sm">{{ requesterLabel(r) }}</td>
              <td><span :class="statusClass(r.status)" class="bw-badge">{{ statusLabel(r.status) }}</span></td>
              <td class="bw-text-sm">{{ fmtDate(r.created_at) }}</td>
              <td>
                <div class="receipt-actions">
                  <button class="bw-btn bw-btn-sm" @click="viewRefundReceipt(r)">{{ t('refunds.viewRecord') }}</button>
                  <button class="bw-btn bw-btn-sm" @click="printRefundReceipt(r)">{{ t('refunds.printRecord') }}</button>
                </div>
              </td>
              <td v-if="r.status === 'pending'" class="bw-action-cell refund-actions-col">
                <div class="refund-row-actions">
                  <button
                    class="bw-btn bw-btn-primary bw-btn-sm"
                    :disabled="isOwnRequest(r)"
                    :title="isOwnRequest(r) ? 'A different finance checker must approve this request.' : undefined"
                    @click="openApprove(r)"
                  >{{ t('refunds.approve') }}</button>
                  <button class="bw-btn bw-btn-danger bw-btn-sm" @click="openReject(r)">{{ t('refunds.reject') }}</button>
                </div>
                <MobileActionMenu label="Refund actions">
                  <button class="mobile-action-item primary" :disabled="isOwnRequest(r)" @click="openApprove(r)">{{ t('refunds.approve') }}</button>
                  <button class="mobile-action-item danger" @click="openReject(r)">{{ t('refunds.reject') }}</button>
                </MobileActionMenu>
                <span v-if="isOwnRequest(r)" class="refund-checker-note">{{ t('refunds.secondApprover') }}</span>
              </td>
              <td v-else></td>
            </tr>
            <tr v-if="!refunds.length">
              <td colspan="9" class="bw-empty">{{ emptyMessage }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards (≤640px) -->
      <div class="bw-t-cards">
        <div v-if="!refunds.length" class="bw-empty">{{ emptyMessage }}</div>
        <div v-for="r in pagedRefunds" :key="r.id" class="bw-tc">
          <div class="bw-tc-head">
            <span>{{ naira(r.amount_minor) }}</span>
            <span :class="statusClass(r.status)" class="bw-badge">{{ statusLabel(r.status) }}</span>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">{{ t('refunds.wallet') }}</span><span class="bw-tc-pair-val">{{ walletOwnerLabel(r) }} · {{ shortId(r.wallet_id) }}</span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">{{ t('refunds.source') }}</span><span class="bw-tc-pair-val">{{ sourceLabel(r.source_type) }}<template v-if="r.source_id"> · {{ shortId(r.source_id) }}</template></span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">{{ t('refunds.reason') }}</span><span class="bw-tc-pair-val">{{ r.reason?.replace(/_/g, ' ') }}</span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">{{ t('refunds.requestedBy') }}</span><span class="bw-tc-pair-val">{{ requesterLabel(r) }}</span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">{{ t('refunds.created') }}</span><span class="bw-tc-pair-val">{{ fmtDate(r.created_at) }}</span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">{{ t('refunds.record') }}</span><span class="receipt-actions"><button class="bw-btn bw-btn-sm" @click="viewRefundReceipt(r)">{{ t('refunds.view') }}</button><button class="bw-btn bw-btn-sm" @click="printRefundReceipt(r)">{{ t('refunds.print') }}</button></span></div>
          </div>
          <div v-if="r.status === 'pending'" class="bw-tc-foot">
            <MobileActionMenu label="Refund actions">
              <button class="mobile-action-item primary" :disabled="isOwnRequest(r)" @click="openApprove(r)">{{ t('refunds.approve') }}</button>
              <button class="mobile-action-item danger" @click="openReject(r)">{{ t('refunds.reject') }}</button>
            </MobileActionMenu>
            <span v-if="isOwnRequest(r)" class="refund-checker-note">{{ t('refunds.secondApprover') }}</span>
          </div>
        </div>
      </div>
      <WalletTablePagination
        v-model:page="currentPage"
        v-model:pageSize="pageSize"
        :total-items="totalRefunds"
        :item-label="t('refunds.requests')"
        :loading="loading"
        @change="load"
      />
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
      <label class="bw-label">{{ t('refunds.amountToCredit') }}</label>
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
      <label class="bw-label">{{ t('refunds.reasonRequired') }}</label>
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
import WalletTablePagination from '@beverly/tokens/WalletTablePagination.vue';
import { exportCsv, printPdf } from '../lib/export';
import { printReceipt, refundReceipt, viewReceipt } from '../lib/receipts';
import { useStaffAuthStore } from '../stores/auth';
import { getIntlLocale, useI18n } from '@beverly/tokens/i18n.js';

type RefundStatus = 'pending' | 'approved' | 'rejected' | 'expired';
type RefundSource = 'manual' | 'dispute' | 'meter_order_rejection';
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
  source_type?: RefundSource | null;
  source_id?: string | null;
  wallets?: { owner_type?: string | null; owner_id?: string | null } | null;
}
interface RefundSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
  meter_rejection: number;
}

const auth         = useStaffAuthStore();
const { t }        = useI18n();
const refunds      = ref<RefundRecord[]>([]);
const loading      = ref(false);
const error        = ref('');
const actionError  = ref('');
const successMessage = ref('');
const statusFilter = ref<RefundStatus | ''>('');
const sourceFilter = ref<RefundSource | ''>('');
const saving       = ref(false);
const summaryLoaded = ref(false);
const summary      = ref<RefundSummary>({ total: 0, pending: 0, approved: 0, rejected: 0, expired: 0, meter_rejection: 0 });
const currentPage  = ref(1);
const pageSize     = ref(10);
const totalRefunds = ref(0);
const pagedRefunds = computed(() => refunds.value);

const approving    = ref<RefundRecord | null>(null);
const rejecting    = ref<RefundRecord | null>(null);
const rejectReason = ref('');
const approveAmountNaira = ref('');
const approveAmountValid = computed(() => {
  if (!approving.value) return false;
  const minor = Math.round(parseFloat(approveAmountNaira.value || '0') * 100);
  return minor > 0 && minor <= approving.value.amount_minor;
});
const emptyMessage = computed(() => {
  if (sourceFilter.value === 'meter_order_rejection') return t('refunds.noMeterRefunds');
  if (statusFilter.value) return t('refunds.noStatusRefunds', { status: statusLabel(statusFilter.value).toLocaleLowerCase(getIntlLocale()) });
  return t('refunds.noRefunds');
});

async function load() {
  loading.value = true;
  error.value   = '';
  try {
    const params = new URLSearchParams();
    if (statusFilter.value) params.set('status', statusFilter.value);
    if (sourceFilter.value) params.set('source', sourceFilter.value);
    params.set('page', String(currentPage.value));
    params.set('page_size', String(pageSize.value));
    const query = params.size ? `?${params.toString()}` : '';
    const [res, summaryRes] = await Promise.all([
      api.get<{ refunds?: RefundRecord[]; total?: number }>(`/api/v1/admin/refunds${query}`),
      api.get<{ summary?: RefundSummary }>('/api/v1/admin/refunds/summary'),
    ]);
    refunds.value = res.refunds ?? [];
    totalRefunds.value = res.total ?? refunds.value.length;
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
    pending: t('refunds.pending'), approved: t('refunds.approved'), rejected: t('refunds.rejected'), expired: t('refunds.expired'),
  }[s] ?? s;
}

function statusClass(s: string) {
  return {
    pending: 'bw-badge-warning', approved: 'bw-badge-success', rejected: 'bw-badge-error', expired: 'bw-badge-neutral',
  }[s] ?? 'bw-badge-neutral';
}

function fmtDate(s: string) { return s ? new Date(s).toLocaleString(getIntlLocale()) : '—'; }

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
  if (refund.source_type === 'meter_order_rejection') return 'Automatic';
  return isOwnRequest(refund) ? 'You' : shortId(refund.requested_by_user_id);
}

function reloadFirstPage() {
  currentPage.value = 1;
  return load();
}

function sourceLabel(source?: RefundSource | null) {
  return {
    meter_order_rejection: t('refunds.meterRejection'),
    dispute: t('refunds.dispute'),
    manual: t('refunds.manual'),
  }[source ?? 'manual'];
}

function viewRefundReceipt(r: RefundRecord) { viewReceipt(refundReceipt(r)); }

function printRefundReceipt(r: RefundRecord) { printReceipt(refundReceipt(r)); }

function exportCsvRows() {
  exportCsv('refunds', refunds.value, [
    { key: 'id', header: 'Refund ID', value: (r) => r.id },
    { key: 'wallet_id', header: 'Wallet', value: (r) => r.wallet_id },
    { key: 'amount', header: 'Amount (₦)', value: (r) => (r.amount_minor ?? 0) / 100 },
    { key: 'source', header: 'Source', value: (r) => sourceLabel(r.source_type) },
    { key: 'source_id', header: 'Source Reference', value: (r) => r.source_id ?? '' },
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
      columns: ['Wallet', 'Amount', 'Source', 'Reason', 'Status', 'Created'],
      rows: refunds.value.map((r) => [
        r.wallet_id?.slice(0, 8) ?? '—', naira(r.amount_minor), sourceLabel(r.source_type), (r.reason ?? '').replace(/_/g, ' '), statusLabel(r.status), fmtDate(r.created_at),
      ]),
    }],
  });
}

onMounted(load);
</script>

<style scoped>
.bw-filter-bar { display: flex; gap: .75rem; margin-bottom: 1rem; flex-wrap: wrap; }
.refund-kpis {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: var(--s-4);
}
.refund-flow-note {
  background: var(--brand-glow);
  border: 1px solid oklch(70% 0.19 145 / 0.2);
  border-radius: var(--r-md);
  color: var(--text-muted);
  font-size: var(--t-sm);
  margin: 0 0 var(--s-4);
  padding: var(--s-3) var(--s-4);
}
.bw-tc-foot { display: flex; justify-content: flex-end; gap: .5rem; padding: var(--s-3) var(--s-4); border-top: 1px solid var(--border); }
.refund-row-actions { display: flex; gap: .5rem; justify-content: flex-end; }
.refund-actions-col { min-width: 150px; }
.receipt-actions { display: inline-flex; gap: 4px; white-space: nowrap; }
.refund-owner { display: block; font-size: var(--t-sm); }
.refund-source-id { display: block; font-size: var(--t-xs); margin-top: var(--s-1); }
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
  .refund-kpi-total { grid-column: auto; }
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


