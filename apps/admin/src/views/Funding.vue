<script setup lang="ts">
/**
 * Funding approvals queue (super-admin / finance-checker).
 *
 * - GET  /api/v1/admin/funding/pending
 * - POST /api/v1/admin/funding/:id/approve
 * - POST /api/v1/admin/funding/:id/reject  body: { reason }
 *
 * UX rules:
 *   • Every action triggers an in-app ConfirmDialog (no native confirm/alert).
 *   • Approve and reject are guarded against double-click via per-row busyId.
 *   • Banner errors surface backend `code` and `message` distinctly.
 *   • Maker-checker is enforced server-side; UI explains the rule and shows
 *     the submitter so the reviewer can see they are not approving their own.
 */
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import MobileActionMenu from '../components/MobileActionMenu.vue';
import { api, naira, shortDate, ApiError } from '../lib/api';
import { useStaffAuthStore } from '../stores/auth';
import { fundingReceipt, printReceipt, viewReceipt } from '../lib/receipts';

const router = useRouter();
const auth = useStaffAuthStore();

interface FundingRequest {
    id: string;
    vendor_organization_id: string;
    amount_minor: number;
    channel: 'bank_transfer' | 'paystack' | 'manual';
    status: string;
    proof_file_path: string | null;
    proof_view_url?: string | null;
    submitted_by: string;
    created_at: string;
    vendor_organizations?: {
        legal_name?: string | null;
        trading_name?: string | null;
        contact_email?: string | null;
        contact_phone?: string | null;
    } | null;
}

interface FundingApprovalResponse {
    receipt?: {
        ledgerEntryId: string;
        creditedAmountMinor: number;
        availableBalanceMinor: number;
    };
}

const items = ref<FundingRequest[]>([]);
const loading = ref(false);
const repairing = ref(false);
const busyId = ref<string | null>(null);
const banner = ref<{ tone: 'success' | 'error'; text: string } | null>(null);
const canApproveFunding = computed(() => auth.hasPermission('wallet.funding.approve'));
const pendingAmountMinor = computed(() => items.value.reduce((total, item) => total + item.amount_minor, 0));
const pendingVendorCount = computed(() => new Set(items.value.map((item) => item.vendor_organization_id)).size);
const proofCount = computed(() => items.value.filter((item) => item.proof_view_url || item.proof_file_path).length);

// ─ Approve modal ──────────────────────────────────────────────
const approveOpen = ref(false);
const approveTarget = ref<FundingRequest | null>(null);

function askApprove(f: FundingRequest) {
    if (!canApproveFunding.value) return;
    approveTarget.value = f;
    approveOpen.value = true;
}

async function doApprove() {
    if (!approveTarget.value) return;
    const f = approveTarget.value;
    busyId.value = f.id;
    banner.value = null;
    try {
        const result = await api.post<FundingApprovalResponse>(`/api/v1/admin/funding/${f.id}/approve`, {});
        approveOpen.value = false;
        approveTarget.value = null;
        const balance = result.receipt?.availableBalanceMinor;
        banner.value = {
            tone: 'success',
            text: balance !== undefined
                ? `Approved ${naira(f.amount_minor)}. Vendor balance is now ${naira(balance)}.`
                : `Approved ${naira(f.amount_minor)}. The vendor wallet has been credited.`,
        };
        await load();
    } catch (e: any) {
        const msg = e instanceof ApiError ? `${e.message} (${e.code})` : e?.message ?? 'Approve failed.';
        banner.value = { tone: 'error', text: msg };
        approveOpen.value = false;
    } finally {
        busyId.value = null;
    }
}

// ─ Reject modal ───────────────────────────────────────────────
const rejectOpen = ref(false);
const rejectTarget = ref<FundingRequest | null>(null);
const rejectReason = ref('');

function askReject(f: FundingRequest) {
    if (!canApproveFunding.value) return;
    rejectTarget.value = f;
    rejectReason.value = '';
    rejectOpen.value = true;
}

const rejectDisabled = computed(() => rejectReason.value.trim().length < 4);

async function doReject() {
    if (!rejectTarget.value || rejectDisabled.value) return;
    const f = rejectTarget.value;
    busyId.value = f.id;
    banner.value = null;
    try {
        await api.post(`/api/v1/admin/funding/${f.id}/reject`, { reason: rejectReason.value.trim() });
        rejectOpen.value = false;
        rejectTarget.value = null;
        rejectReason.value = '';
        banner.value = { tone: 'success', text: 'Funding request rejected. Vendor will see the reason in their wallet history.' };
        await load();
    } catch (e: any) {
        const msg = e instanceof ApiError ? `${e.message} (${e.code})` : e?.message ?? 'Reject failed.';
        banner.value = { tone: 'error', text: msg };
        rejectOpen.value = false;
    } finally {
        busyId.value = null;
    }
}

// ─ List ──────────────────────────────────────────────────────
async function load() {
    loading.value = true;
    try {
        const r = await api.get<{ funding: FundingRequest[] }>('/api/v1/admin/funding/pending');
        items.value = r.funding ?? [];
    } catch (e: any) {
        banner.value = { tone: 'error', text: e?.message ?? 'Could not load queue.' };
    } finally { loading.value = false; }
}

async function repairApprovedCredits() {
    if (!canApproveFunding.value) return;
    repairing.value = true;
    banner.value = null;
    try {
        const result = await api.post<{
            checked: number;
            repaired: number;
            missingLedger: number;
            staleWallet: number;
        }>('/api/v1/admin/funding/reconcile-approved', {});
        banner.value = {
            tone: 'success',
            text: result.repaired
                ? `Repaired ${result.repaired} approved funding credits. Vendors can refresh their wallets now.`
                : `Checked ${result.checked} approved funding credits. No repairs needed.`,
        };
        await load();
    } catch (e: any) {
        const msg = e instanceof ApiError ? `${e.message} (${e.code})` : e?.message ?? 'Funding repair failed.';
        banner.value = { tone: 'error', text: msg };
    } finally {
        repairing.value = false;
    }
}

// ── Payments held for review ────────────────────────────────────────────────
// The gateway confirmed these but the reconciler could not apply them, so the
// money is real and unapplied. Retrying re-runs verification and fulfillment;
// the ledger key makes it safe even if the payment did partly apply.
interface HeldPayment {
    id: string;
    reference: string;
    actorType: string;
    purpose: string;
    amountMinor: number;
    blockedReason: string | null;
    verifiedAmountMinor: number | null;
    attempts: number;
    createdAt: string;
}

const heldPayments = ref<HeldPayment[]>([]);
const heldLoading = ref(false);
const retryingId = ref<string | null>(null);

async function loadHeldPayments() {
    heldLoading.value = true;
    try {
        const r = await api.get<{ payments: HeldPayment[] }>('/api/v1/admin/payments/requires-review?limit=50&purpose=wallet_funding');
        heldPayments.value = r.payments ?? [];
    } catch {
        // The approvals queue must still render if this panel fails.
    } finally {
        heldLoading.value = false;
    }
}

async function retryHeldPayment(payment: HeldPayment) {
    if (!canApproveFunding.value || retryingId.value) return;
    retryingId.value = payment.id;
    banner.value = null;
    try {
        const result = await api.post<{ status: string; fulfillmentStatus: string; reason?: string }>(
            `/api/v1/admin/payments/${payment.id}/retry-fulfillment`, {},
        );
        const applied = ['fulfilled', 'already_fulfilled'].includes(result.fulfillmentStatus);
        banner.value = applied
            ? { tone: 'success', text: `Payment ${payment.reference} applied. Wallet updated.` }
            : { tone: 'error', text: `Payment ${payment.reference} still held: ${result.reason ?? result.fulfillmentStatus}.` };
        await Promise.all([load(), loadHeldPayments()]);
    } catch (e: any) {
        const msg = e instanceof ApiError ? `${e.message} (${e.code})` : e?.message ?? 'Retry failed.';
        banner.value = { tone: 'error', text: msg };
    } finally {
        retryingId.value = null;
    }
}

function blockedReasonLabel(reason: string | null): string {
    if (!reason) return 'Unknown';
    return ({
        payment_amount_mismatch: 'Amount verification mismatch',
        payment_overpaid: 'Paid more than a fee can explain',
        payment_currency_mismatch: 'Wrong currency',
        payment_reference_mismatch: 'Reference mismatch',
        wallet_inactive: 'Wallet inactive',
        wallet_frozen: 'Wallet frozen',
        funding_request_rejected: 'Funding request already rejected',
        funding_request_expired: 'Funding request expired',
        meter_order_cancelled: 'Meter order cancelled',
    } as Record<string, string>)[reason] ?? reason;
}

function channelBadge(c: string) {
    return ({ paystack: 'info', bank_transfer: 'neutral', manual: 'warn' } as Record<string, string>)[c] ?? 'neutral';
}

function statusBadge(s: string) {
    return ({
        proof_uploaded: 'warn', under_review: 'warn', approved: 'success', rejected: 'danger',
    } as Record<string, string>)[s] ?? 'neutral';
}

function vendorName(f: FundingRequest) {
    return f.vendor_organizations?.trading_name
        || f.vendor_organizations?.legal_name
        || `Vendor #${f.vendor_organization_id.slice(0, 8)}`;
}

function vendorEmail(f: FundingRequest) {
    return f.vendor_organizations?.contact_email || 'No email on file';
}

function viewFundingReceipt(f: FundingRequest) {
    viewReceipt(fundingReceipt(f));
}

function printFundingReceipt(f: FundingRequest) {
    printReceipt(fundingReceipt(f));
}

onMounted(() => {
    void load();
    void loadHeldPayments();
});
</script>

<template>
  <AppShell title="Funding Approvals">

    <!-- Banner -->
    <transition name="banner">
      <div v-if="banner" :class="['fund-banner', banner.tone]" role="status">
        {{ banner.text }}
        <button class="fund-banner-x" @click="banner = null" aria-label="Dismiss">×</button>
      </div>
    </transition>

    <section class="bw-kpi-grid bw-mobile-kpi-grid funding-kpis" aria-label="Funding approval summary">
      <article class="bw-kpi featured">
        <span class="bw-kpi-label">Pending requests</span>
        <strong class="bw-kpi-value">{{ items.length }}</strong>
        <span class="bw-kpi-note">awaiting review</span>
      </article>
      <article class="bw-kpi">
        <span class="bw-kpi-label">Pending value</span>
        <strong class="bw-kpi-value funding-money">{{ naira(pendingAmountMinor) }}</strong>
        <span class="bw-kpi-note">requested funding</span>
      </article>
      <article class="bw-kpi info-tone">
        <span class="bw-kpi-label">Vendors</span>
        <strong class="bw-kpi-value">{{ pendingVendorCount }}</strong>
        <span class="bw-kpi-note">unique organizations</span>
      </article>
      <article class="bw-kpi warn-tone">
        <span class="bw-kpi-label">Proof supplied</span>
        <strong class="bw-kpi-value">{{ proofCount }}</strong>
        <span class="bw-kpi-note">requests with evidence</span>
      </article>
    </section>

    <!-- Payments held for review -->
    <div v-if="heldPayments.length" class="bw-card held-card" style="padding: 0">
      <div class="bw-table-head-bar">
        <div>
          <h2 class="bw-h2" style="margin: 0">Payments held for review</h2>
          <p class="bw-muted fund-sub">
            Confirmed at Paystack but not applied. The money is real — resolve the reason, then retry.
          </p>
        </div>
        <span class="bw-spacer"></span>
        <button class="bw-btn sm" :disabled="heldLoading" @click="loadHeldPayments">
          {{ heldLoading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
      <div class="bw-t-wrap">
        <table class="bw-table fund-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Purpose</th>
              <th class="bw-num">Requested</th>
              <th class="bw-num">Paid</th>
              <th>Reason held</th>
              <th class="bw-actions-col">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in heldPayments" :key="p.id">
              <td class="bw-mono">{{ p.reference }}</td>
              <td>{{ p.purpose }} <span class="bw-muted">· {{ p.actorType }}</span></td>
              <td class="bw-num funding-money">{{ naira(p.amountMinor) }}</td>
              <td class="bw-num funding-money">
                {{ p.verifiedAmountMinor === null ? '—' : naira(p.verifiedAmountMinor) }}
              </td>
              <td><span class="bw-badge warn">{{ blockedReasonLabel(p.blockedReason) }}</span></td>
              <td class="bw-actions-col">
                <button
                  v-if="canApproveFunding"
                  class="bw-btn sm primary"
                  :disabled="retryingId !== null"
                  @click="retryHeldPayment(p)"
                >
                  {{ retryingId === p.id ? 'Retrying…' : 'Retry' }}
                </button>
                <span v-else class="bw-muted">No permission</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Queue -->
    <div class="bw-card" style="padding: 0">
      <div class="bw-table-head-bar">
        <div>
          <h2 class="bw-h2" style="margin: 0">Funding queue</h2>
          <p class="bw-muted fund-sub">
            Maker-checker · approver must differ from submitter. Backend enforces this server-side.
          </p>
        </div>
        <span class="bw-spacer"></span>
        <button v-if="canApproveFunding" class="bw-btn sm" :disabled="repairing || loading" @click="repairApprovedCredits">
          {{ repairing ? 'Repairing…' : 'Repair approved credits' }}
        </button>
        <button class="bw-btn sm" :disabled="loading" @click="load">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
        <button class="bw-btn sm" @click="router.push('/funding/history')">
          View History
        </button>
      </div>

      <!-- Desktop table -->
      <div class="bw-t-wrap">
        <table class="bw-table fund-table">
          <thead>
            <tr>
              <th>Submitted</th>
              <th>Vendor</th>
              <th>Channel</th>
              <th>Proof</th>
              <th style="text-align:right">Amount</th>
              <th>Status</th>
              <th>Receipt</th>
              <th v-if="canApproveFunding" class="actions-col"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in items" :key="f.id" :class="{ 'row-busy': busyId === f.id }">
              <td class="bw-mono bw-muted">{{ shortDate(f.created_at) }}</td>
              <td>
                <strong>{{ vendorName(f) }}</strong>
                <div class="vendor-email">{{ vendorEmail(f) }}</div>
              </td>
              <td><span :class="['bw-badge', channelBadge(f.channel)]">{{ f.channel }}</span></td>
              <td>
                <a v-if="f.proof_view_url" :href="f.proof_view_url" target="_blank" rel="noopener" class="proof-link">view</a>
                <span v-else-if="f.proof_file_path" class="bw-muted bw-mono" style="font-size: var(--t-xs)">stored</span>
                <span v-else class="bw-muted">—</span>
              </td>
              <td class="bw-money" style="text-align: right">{{ naira(f.amount_minor) }}</td>
              <td><span :class="['bw-badge', statusBadge(f.status)]">{{ f.status }}</span></td>
              <td>
                <div class="receipt-actions">
                  <button class="bw-btn sm" @click="viewFundingReceipt(f)">View</button>
                  <button class="bw-btn sm" @click="printFundingReceipt(f)">Print</button>
                </div>
              </td>
              <td v-if="canApproveFunding" class="actions-col">
                <div class="action-cluster">
                  <button class="bw-btn sm primary" :disabled="busyId === f.id" @click="askApprove(f)">
                    Approve
                  </button>
                  <button class="bw-btn sm danger" :disabled="busyId === f.id" @click="askReject(f)">
                    Reject
                  </button>
                </div>
                <MobileActionMenu label="Funding actions">
                  <button class="mobile-action-item primary" :disabled="busyId === f.id" @click="askApprove(f)">Approve</button>
                  <button class="mobile-action-item danger" :disabled="busyId === f.id" @click="askReject(f)">Reject</button>
                </MobileActionMenu>
              </td>
            </tr>
            <tr v-if="!items.length && !loading">
              <td :colspan="canApproveFunding ? 8 : 7" class="bw-muted" style="text-align: center; padding: var(--s-6)">Queue clear.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="bw-t-cards fund-cards">
        <div v-for="f in items" :key="f.id" class="fund-card" :class="{ 'row-busy': busyId === f.id }">
          <div class="fc-head">
            <div>
              <div class="fc-amount">{{ naira(f.amount_minor) }}</div>
              <div class="fc-meta">{{ vendorName(f) }}</div>
              <div class="fc-email">{{ vendorEmail(f) }}</div>
            </div>
            <span :class="['bw-badge', statusBadge(f.status)]">{{ f.status }}</span>
          </div>
          <div class="fc-row">
            <span class="fc-label">Channel</span>
            <span :class="['bw-badge', channelBadge(f.channel)]">{{ f.channel }}</span>
          </div>
          <div class="fc-row">
            <span class="fc-label">Proof</span>
            <a v-if="f.proof_view_url" :href="f.proof_view_url" target="_blank" rel="noopener" class="proof-link">view</a>
            <span v-else-if="f.proof_file_path" class="bw-muted bw-mono" style="font-size: var(--t-xs)">stored</span>
            <span v-else class="bw-muted">—</span>
          </div>
          <div class="fc-actions">
            <button class="bw-btn sm" @click="viewFundingReceipt(f)">View</button>
            <button class="bw-btn sm" @click="printFundingReceipt(f)">Print</button>
            <MobileActionMenu v-if="canApproveFunding" label="Funding actions">
              <button class="mobile-action-item primary" :disabled="busyId === f.id" @click="askApprove(f)">Approve</button>
              <button class="mobile-action-item danger" :disabled="busyId === f.id" @click="askReject(f)">Reject</button>
            </MobileActionMenu>
          </div>
        </div>
        <div v-if="!items.length && !loading" class="bw-muted empty-card">Queue clear.</div>
      </div>
    </div>

    <!-- Approve confirm -->
    <ConfirmDialog
      v-model:open="approveOpen"
      title="Approve funding"
      :description="approveTarget
        ? `Credit ${naira(approveTarget.amount_minor)} to ${vendorName(approveTarget)} (${vendorEmail(approveTarget)}) via ${approveTarget.channel}. This writes one immutable ledger entry and cannot be undone.`
        : ''"
      confirm-label="Approve & credit wallet"
      tone="brand"
      :loading="busyId !== null"
      @confirm="doApprove"
    />

    <!-- Reject confirm with reason input -->
    <ConfirmDialog
      v-model:open="rejectOpen"
      title="Reject funding"
      :description="rejectTarget
        ? `${naira(rejectTarget.amount_minor)} · ${rejectTarget.channel}. The vendor will see the reason below in their wallet history.`
        : ''"
      confirm-label="Reject request"
      cancel-label="Keep open"
      tone="danger"
      :loading="busyId !== null"
      :disable-confirm="rejectDisabled"
      @confirm="doReject"
    >
      <label class="cd-input-label">Reason (visible to vendor) *</label>
      <textarea
        v-model="rejectReason"
        rows="3"
        class="cd-input"
        placeholder="e.g. Proof receipt doesn't match the stated amount."
      />
      <p class="cd-input-hint">Minimum 4 characters. Be specific so the vendor can resubmit correctly.</p>
    </ConfirmDialog>

  </AppShell>
</template>

<style scoped>
.funding-kpis { margin-bottom: var(--s-3); }
.funding-money { font-size: clamp(var(--t-xl), 2.5vw, var(--t-3xl)); overflow-wrap: anywhere; }
.fund-sub { font-size: var(--t-xs); margin: 2px 0 0; }

/* Banner */
.fund-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-4);
  border-radius: var(--r-md);
  margin-bottom: var(--s-3);
  font-size: var(--t-sm);
  border: 1px solid;
}
.fund-banner.success {
  background: oklch(from var(--brand) l c h / 0.08);
  border-color: oklch(from var(--brand) l c h / 0.30);
  color: var(--brand);
}
.fund-banner.error {
  background: oklch(from var(--danger) l c h / 0.08);
  border-color: oklch(from var(--danger) l c h / 0.30);
  color: var(--danger);
}
.fund-banner-x {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 2px 8px;
  border-radius: 50%;
  opacity: 0.7;
}
.fund-banner-x:hover { opacity: 1; background: oklch(0% 0 0 / 0.10); }

.banner-enter-active, .banner-leave-active { transition: all 0.20s var(--ease-out); }
.banner-enter-from { opacity: 0; transform: translateY(-4px); }
.banner-leave-to { opacity: 0; }

/* Table */
.fund-table .actions-col { min-width: 200px; }
.proof-link {
  color: var(--brand);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-decoration: underline;
}
.vendor-email,
.fc-email {
  margin-top: 2px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
}
.action-cluster {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
  flex-wrap: nowrap;
}
.receipt-actions {
  display: inline-flex;
  gap: 4px;
  white-space: nowrap;
}
.row-busy { opacity: 0.55; pointer-events: none; }

/* Mobile cards (shown by .bw-t-cards at <=640px from wallet.css) */
.fund-cards { padding: var(--s-3); }
.fund-card {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: var(--s-4);
  margin-bottom: var(--s-2);
}
.fund-card:last-child { margin-bottom: 0; }
.fc-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: var(--s-3);
  gap: var(--s-2);
}
.fc-amount {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: var(--t-lg);
  color: var(--text);
}
.fc-meta {
  font-size: var(--t-xs);
  color: var(--text-muted);
  margin-top: 2px;
}
.fc-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  font-size: var(--t-sm);
  border-top: 1px dashed var(--border);
}
.fc-label { color: var(--text-muted); }
.fc-actions {
  display: flex;
  gap: var(--s-2);
  justify-content: flex-end;
  margin-top: var(--s-3);
}
.fc-actions .bw-btn {
  flex: 1;
  justify-content: center;
  min-height: 40px;
}

@media (max-width: 720px) {
  .fund-table .actions-col {
    min-width: 72px;
    position: sticky;
    right: 0;
    background: var(--glass-bg-strong);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    z-index: 3;
  }

  .action-cluster {
    display: none;
  }
}
.empty-card { text-align: center; padding: var(--s-6); }

/* ConfirmDialog body slot styles */
:deep(.cd-body) .cd-input-label {
  display: block;
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 6px;
}
:deep(.cd-body) .cd-input {
  width: 100%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 10px 12px;
  color: var(--text);
  font-size: var(--t-sm);
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
}
:deep(.cd-body) .cd-input:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-glow);
}
:deep(.cd-body) .cd-input-hint {
  font-size: var(--t-xs);
  color: var(--text-muted);
  margin: 6px 0 0;
}
</style>
