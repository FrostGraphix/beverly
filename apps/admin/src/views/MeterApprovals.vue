<template>
  <AppShell title="Meter Approvals">
    <header class="meter-page-intro">
      <div class="meter-intro-copy">
        <p class="bw-page-sub">Ownership review</p>
        <p class="bw-muted meter-page-copy">
          Verify the customer against the meter registry before enabling token purchases.
        </p>
      </div>
      <button
        class="bw-icon-btn meter-refresh-button"
        type="button"
        aria-label="Refresh queue"
        title="Refresh queue"
        :aria-busy="loading"
        :disabled="loading"
        @click="load"
      >
        <span :class="{ 'is-spinning': loading }" aria-hidden="true">↻</span>
      </button>
    </header>

    <section class="bw-kpi-grid bw-mobile-kpi-grid meter-kpis" aria-label="Meter link summary">
      <button
        v-for="item in kpiOptions"
        :key="item.value"
        type="button"
        :class="['bw-kpi', 'meter-kpi', item.tone, { active: statusFilter === item.value }]"
        :aria-pressed="statusFilter === item.value"
        @click="selectStatus(item.value)"
      >
        <span class="bw-kpi-label">{{ item.label }}</span>
        <strong class="bw-kpi-value">{{ item.value === 'all' ? allCount : item.value === 'rejected' ? counts.rejectedHistory : counts[item.value] }}</strong>
        <span class="bw-kpi-note">{{ item.note }}</span>
      </button>
    </section>

    <form class="bw-filter-bar meter-filter-bar" role="search" @submit.prevent="applySearch">
      <label class="meter-search">
        <span class="sr-only">Search meter links</span>
        <input
          v-model="searchInput"
          class="bw-input"
          type="search"
          autocomplete="off"
          placeholder="Search meter number, nickname or registered name"
          @input="queueSearch"
        />
      </label>
      <select v-model="statusFilter" class="bw-select bw-select-sm" aria-label="Filter meter links by status" @change="applyFilter">
        <option v-for="item in kpiOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
      </select>
      <button v-if="hasActiveFilters" type="button" class="bw-btn bw-btn-ghost bw-btn-sm" @click="clearFilters">Clear filters</button>
    </form>

    <p class="meter-results" aria-live="polite">
      {{ loading ? 'Updating queue…' : resultSummary }}
    </p>

    <div v-if="successMessage" class="bw-success-banner" role="status">
      <span>{{ successMessage }}</span>
      <button type="button" class="banner-dismiss" aria-label="Dismiss message" @click="successMessage = ''">×</button>
    </div>

    <div v-if="loading" class="bw-card meter-loading" aria-label="Loading meter links" aria-busy="true">
      <div v-for="n in 5" :key="n" class="bw-skeleton"></div>
    </div>
    <div v-else-if="error" class="bw-error-banner" role="alert">
      <div>
        <strong>Meter approvals unavailable</strong>
        <p>{{ error }}</p>
      </div>
      <button class="bw-btn bw-btn-sm" @click="load">Try again</button>
    </div>

    <template v-else>
      <section class="bw-card flush meter-queue" :data-view="viewMode" aria-labelledby="meter-queue-title">
        <header class="bw-table-head-bar meter-queue-head">
          <div>
            <h2 id="meter-queue-title" class="bw-h2">Customer meter links</h2>
            <p>Review claims or remove an existing wallet association.</p>
          </div>
          <span class="bw-spacer"></span>
          <WalletDataViewSwitch v-model="viewMode" :modes="['list', 'table']" label="Meter link display view" />
        </header>
      <div v-show="viewMode === 'table'" class="bw-t-wrap meter-table-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>Customer claim</th>
              <th>Meter record</th>
              <th>Service</th>
              <th>Submitted</th>
              <th>Status</th>
              <th class="meter-actions-col"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="meter in meters" :key="meter.id">
              <td>
                <strong>{{ meter.customers?.full_name || 'Unnamed customer' }}</strong>
                <span class="bw-mono bw-text-sm meter-secondary">{{ meter.customers?.phone || meter.customers?.email || '—' }}</span>
              </td>
              <td>
                <strong class="bw-mono">{{ meter.meter_id }}</strong>
                <span class="bw-text-sm meter-secondary">Registered to: {{ meter.meter_name || 'Unavailable' }}</span>
              </td>
              <td>
                <span>{{ phaseLabel(meter.meter_type) }}</span>
                <span class="bw-mono bw-text-sm meter-secondary">{{ meter.station_id || 'No station' }}</span>
              </td>
              <td class="bw-text-sm">{{ fmtDate(meter.created_at) }}</td>
              <td><span :class="['bw-badge', statusClass(meter.status)]">{{ statusLabel(meter.status) }}</span></td>
              <td class="bw-action-cell meter-actions-col">
                <div v-if="meter.status === 'pending'" class="meter-row-actions">
                  <button class="bw-btn bw-btn-primary bw-btn-sm" :disabled="saving" @click="openApprove(meter)">Review & approve</button>
                  <button class="bw-btn bw-btn-danger bw-btn-sm" :disabled="saving" @click="openReject(meter)">Reject</button>
                  <button class="bw-btn bw-btn-sm" :disabled="saving" @click="openUnlink(meter)">Unlink</button>
                </div>
                <button v-else class="bw-btn bw-btn-danger bw-btn-sm" :disabled="saving" @click="openUnlink(meter)">Unlink</button>
              </td>
            </tr>
            <tr v-if="!meters.length">
              <td colspan="6" class="bw-empty">{{ emptyMessage }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-show="viewMode === 'list'" class="bw-t-cards meter-card-list">
        <article v-for="meter in meters" :key="meter.id" class="bw-card meter-card">
          <div class="meter-card-head">
            <div>
              <span class="meter-card-kicker">Meter claim</span>
              <strong class="bw-mono">{{ meter.meter_id }}</strong>
            </div>
            <span :class="['bw-badge', statusClass(meter.status)]">{{ statusLabel(meter.status) }}</span>
          </div>
          <div class="identity-comparison">
            <div>
              <span>Customer claim</span>
              <strong>{{ meter.customers?.full_name || 'Unnamed customer' }}</strong>
            </div>
            <div>
              <span>Meter registry</span>
              <strong>{{ meter.meter_name || 'Unavailable' }}</strong>
            </div>
          </div>
          <div :class="['identity-signal', namesMatch(meter) ? 'is-match' : 'is-review']">
            <span>{{ namesMatch(meter) ? 'Names match' : 'Names differ — verify evidence' }}</span>
            <span>{{ phaseLabel(meter.meter_type) }} · {{ meter.station_id || 'No station' }}</span>
          </div>
          <p class="meter-submitted">Submitted {{ fmtDate(meter.created_at) }}</p>
          <div v-if="meter.status === 'pending'" class="meter-card-actions">
            <button class="bw-btn bw-btn-primary bw-btn-sm" :disabled="saving" @click="openApprove(meter)">Review claim</button>
            <button class="bw-btn bw-btn-danger bw-btn-sm" :disabled="saving" @click="openReject(meter)">Reject</button>
            <button class="bw-btn bw-btn-sm meter-unlink-button" :disabled="saving" @click="openUnlink(meter)">Unlink</button>
          </div>
          <div v-else class="meter-card-actions meter-card-actions-single">
            <button class="bw-btn bw-btn-danger bw-btn-sm" :disabled="saving" @click="openUnlink(meter)">Unlink from customer</button>
          </div>
        </article>
        <div v-if="!meters.length" class="bw-card bw-empty">{{ emptyMessage }}</div>
      </div>
      </section>

      <nav v-if="total > pageSize" class="meter-pagination" aria-label="Meter approval pages">
        <span>Showing {{ pageStart }}–{{ pageEnd }} of {{ total }}</span>
        <div>
          <button class="bw-btn bw-btn-sm" :disabled="offset === 0" @click="previousPage">Previous</button>
          <button class="bw-btn bw-btn-sm" :disabled="offset + pageSize >= total" @click="nextPage">Next</button>
        </div>
      </nav>
    </template>

    <ConfirmDialog
      :open="Boolean(approving)"
      title="Approve this meter link?"
      description="Approval immediately enables this customer to purchase tokens for the meter."
      confirm-label="Approve meter"
      cancel-label="Keep pending"
      :loading="saving"
      :disable-confirm="!ownershipConfirmed || approvalNote.trim().length < 3"
      @update:open="closeApprove"
      @confirm="submitApprove"
    >
      <div v-if="actionError" class="bw-error-banner" role="alert">{{ actionError }}</div>
      <div v-if="approving" class="review-summary">
        <div class="review-identity">
          <div><span>Customer claim</span><strong>{{ approving.customers?.full_name || 'Unnamed customer' }}</strong></div>
          <div><span>Meter registry</span><strong>{{ approving.meter_name || 'Unavailable' }}</strong></div>
        </div>
        <div :class="['identity-signal', namesMatch(approving) ? 'is-match' : 'is-review']">
          <strong>{{ namesMatch(approving) ? 'Names match' : 'Names differ' }}</strong>
          <span>{{ namesMatch(approving) ? 'Confirm the supporting record.' : 'Ownership evidence is required before approval.' }}</span>
        </div>
        <div class="review-meta">
          <span class="bw-mono">{{ approving.meter_id }}</span>
          <span>{{ phaseLabel(approving.meter_type) }} · {{ approving.station_id || 'No station' }}</span>
        </div>
      </div>
      <label class="ownership-check">
        <input v-model="ownershipConfirmed" type="checkbox" />
        <span>I verified the customer claim against the available meter record and supporting ownership evidence.</span>
      </label>
      <label class="bw-label" for="approval-note">Verification note *</label>
      <textarea id="approval-note" v-model="approvalNote" class="bw-textarea" rows="3" maxlength="500" placeholder="Record what was checked (minimum 3 characters)"></textarea>
    </ConfirmDialog>

    <ConfirmDialog
      :open="Boolean(unlinking)"
      title="Unlink meter from customer?"
      description="Token purchases for this meter stop immediately. Wallet balances and purchase history are preserved."
      confirm-label="Unlink meter"
      cancel-label="Keep linked"
      tone="danger"
      :loading="saving"
      :disable-confirm="unlinkReason.trim().length < 10"
      @update:open="closeUnlink"
      @confirm="submitUnlink"
    >
      <div v-if="actionError" class="bw-error-banner" role="alert">{{ actionError }}</div>
      <div v-if="unlinking" class="unlink-summary">
        <div><span>Customer</span><strong>{{ unlinking.customers?.full_name || 'Unnamed customer' }}</strong></div>
        <div><span>Meter</span><strong class="bw-mono">{{ unlinking.meter_id }}</strong></div>
        <div><span>Current access</span><strong>{{ statusLabel(unlinking.status) }}</strong></div>
        <div><span>Station</span><strong>{{ unlinking.station_id || 'Unavailable' }}</strong></div>
      </div>
      <div class="unlink-impact" role="note">
        <strong>This removes the association only.</strong>
        <span>The meter, customer wallet, ledger, and completed purchases remain intact.</span>
      </div>
      <div class="field-heading">
        <label class="bw-label" for="unlink-reason">Reason *</label>
        <span>{{ unlinkReason.trim().length }}/500</span>
      </div>
      <textarea id="unlink-reason" v-model="unlinkReason" class="bw-textarea" rows="3" minlength="10" maxlength="500" placeholder="Explain why this meter is being unlinked"></textarea>
      <p class="field-help">Minimum 10 characters. The customer receives this reason.</p>
    </ConfirmDialog>

    <ConfirmDialog
      :open="Boolean(rejecting)"
      title="Reject meter link?"
      description="The customer will be notified and cannot purchase tokens for this meter."
      confirm-label="Reject meter"
      cancel-label="Keep pending"
      tone="danger"
      :loading="saving"
      :disable-confirm="rejectReason.trim().length < 10"
      @update:open="closeReject"
      @confirm="submitReject"
    >
      <div v-if="actionError" class="bw-error-banner" role="alert">{{ actionError }}</div>
      <div v-if="rejecting" class="reject-target">
        <span>Rejecting meter</span>
        <strong class="bw-mono">{{ rejecting.meter_id }}</strong>
        <span>{{ rejecting.customers?.full_name || 'Unnamed customer' }}</span>
      </div>
      <div class="field-heading">
        <label class="bw-label" for="reject-reason">Reason *</label>
        <span>{{ rejectReason.trim().length }}/500</span>
      </div>
      <textarea id="reject-reason" v-model="rejectReason" class="bw-textarea" rows="3" minlength="10" maxlength="500" placeholder="Explain what the customer should correct"></textarea>
      <p class="field-help">Minimum 10 characters. This reason is sent to the customer.</p>
    </ConfirmDialog>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { api } from '../lib/api';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import WalletDataViewSwitch from '@beverly/tokens/WalletDataViewSwitch.vue';

type MeterStatus = 'pending' | 'approved' | 'rejected';
type MeterStatusFilter = MeterStatus | 'all';
interface CustomerMeterRecord {
  id: string;
  customer_id: string;
  meter_id: string;
  meter_type: 'single_phase' | 'three_phase' | null;
  station_id: string | null;
  tariff_id: string | null;
  nickname: string | null;
  meter_name: string | null;
  status: MeterStatus;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  customers?: { full_name: string | null; phone: string | null; email: string | null } | null;
}
interface MeterApprovalResponse {
  meters: CustomerMeterRecord[];
  total: number;
  counts: Record<MeterStatus, number> & { rejectedHistory: number };
  limit: number;
  offset: number;
}

const kpiOptions: Array<{ value: MeterStatusFilter; label: string; note: string; tone: string }> = [
  { value: 'all', label: 'All links', note: 'customer associations', tone: 'info-tone' },
  { value: 'pending', label: 'Pending', note: 'awaiting review', tone: 'warn-tone' },
  { value: 'approved', label: 'Approved', note: 'purchase enabled', tone: 'featured' },
  { value: 'rejected', label: 'Rejected', note: 'lifetime decisions', tone: 'danger-tone' },
];
const meters = ref<CustomerMeterRecord[]>([]);
const counts = ref<MeterApprovalResponse['counts']>({ pending: 0, approved: 0, rejected: 0, rejectedHistory: 0 });
const total = ref(0);
const pageSize = 25;
const offset = ref(0);
const loading = ref(false);
const error = ref('');
const actionError = ref('');
const successMessage = ref('');
const statusFilter = ref<MeterStatusFilter>('pending');
const viewMode = ref<'list' | 'table'>(
  typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'list' : 'table',
);
const searchInput = ref('');
const appliedSearch = ref('');
const saving = ref(false);
const approving = ref<CustomerMeterRecord | null>(null);
const approvalNote = ref('');
const ownershipConfirmed = ref(false);
const rejecting = ref<CustomerMeterRecord | null>(null);
const rejectReason = ref('');
const unlinking = ref<CustomerMeterRecord | null>(null);
const unlinkReason = ref('');
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let requestSequence = 0;

const emptyMessage = computed(() => {
  const scope = statusFilter.value === 'all' ? '' : `${statusLabel(statusFilter.value).toLowerCase()} `;
  return appliedSearch.value ? `No ${scope}meter links match “${appliedSearch.value}”.` : `No ${scope}meter links.`;
});
const resultSummary = computed(() => statusFilter.value === 'all'
  ? `${total.value} customer ${total.value === 1 ? 'link' : 'links'}`
  : `${total.value} ${statusLabel(statusFilter.value).toLowerCase()} ${total.value === 1 ? 'claim' : 'claims'}`);
const pageStart = computed(() => total.value ? offset.value + 1 : 0);
const pageEnd = computed(() => Math.min(offset.value + pageSize, total.value));
const allCount = computed(() => counts.value.pending + counts.value.approved + counts.value.rejected);
const hasActiveFilters = computed(() => statusFilter.value !== 'all' || Boolean(searchInput.value.trim()));

async function load() {
  const sequence = ++requestSequence;
  loading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams({
      status: statusFilter.value,
      limit: String(pageSize),
      offset: String(offset.value),
    });
    if (appliedSearch.value) params.set('q', appliedSearch.value);
    const response = await api.get<MeterApprovalResponse>(`/api/v1/admin/customer-meters?${params}`);
    if (sequence !== requestSequence) return;
    meters.value = response.meters ?? [];
    counts.value = response.counts ?? { pending: 0, approved: 0, rejected: 0, rejectedHistory: 0 };
    total.value = response.total ?? 0;
  } catch (cause: unknown) {
    if (sequence !== requestSequence) return;
    error.value = cause instanceof Error ? cause.message : 'Failed to load meter links.';
    meters.value = [];
    total.value = 0;
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

function selectStatus(status: MeterStatusFilter) {
  statusFilter.value = status;
  applyFilter();
}

function applyFilter() {
  offset.value = 0;
  successMessage.value = '';
  void load();
}

function queueSearch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    appliedSearch.value = searchInput.value.trim();
    offset.value = 0;
    void load();
  }, 300);
}

function applySearch() {
  if (searchTimer) clearTimeout(searchTimer);
  appliedSearch.value = searchInput.value.trim();
  offset.value = 0;
  void load();
}

function clearFilters() {
  if (searchTimer) clearTimeout(searchTimer);
  searchInput.value = '';
  appliedSearch.value = '';
  statusFilter.value = 'all';
  offset.value = 0;
  void load();
}

function previousPage() {
  offset.value = Math.max(0, offset.value - pageSize);
  void load();
}

function nextPage() {
  if (offset.value + pageSize >= total.value) return;
  offset.value += pageSize;
  void load();
}

function openApprove(meter: CustomerMeterRecord) {
  actionError.value = '';
  approvalNote.value = '';
  ownershipConfirmed.value = false;
  approving.value = meter;
}

function closeApprove(open: boolean) {
  if (!open && !saving.value) approving.value = null;
}

async function submitApprove() {
  if (!approving.value || !ownershipConfirmed.value || approvalNote.value.trim().length < 3) return;
  saving.value = true;
  actionError.value = '';
  const meterId = approving.value.meter_id;
  try {
    await api.post(`/api/v1/admin/customer-meters/${approving.value.id}/approve`, { note: approvalNote.value.trim() });
    approving.value = null;
    await load();
    successMessage.value = `Meter ${meterId} approved. The customer has been notified.`;
  } catch (cause: unknown) {
    actionError.value = actionFailureMessage(cause, 'approve');
  } finally {
    saving.value = false;
  }
}

function openReject(meter: CustomerMeterRecord) {
  actionError.value = '';
  rejecting.value = meter;
  rejectReason.value = '';
}

function closeReject(open: boolean) {
  if (!open && !saving.value) rejecting.value = null;
}

async function submitReject() {
  if (!rejecting.value || rejectReason.value.trim().length < 10) return;
  saving.value = true;
  actionError.value = '';
  const meterId = rejecting.value.meter_id;
  try {
    await api.post(`/api/v1/admin/customer-meters/${rejecting.value.id}/reject`, { reason: rejectReason.value.trim() });
    rejecting.value = null;
    await load();
    successMessage.value = `Meter ${meterId} rejected. The customer has been notified.`;
  } catch (cause: unknown) {
    actionError.value = actionFailureMessage(cause, 'reject');
  } finally {
    saving.value = false;
  }
}

function openUnlink(meter: CustomerMeterRecord) {
  actionError.value = '';
  unlinkReason.value = '';
  unlinking.value = meter;
}

function closeUnlink(open: boolean) {
  if (!open && !saving.value) unlinking.value = null;
}

async function submitUnlink() {
  if (!unlinking.value || unlinkReason.value.trim().length < 10) return;
  saving.value = true;
  actionError.value = '';
  const meterId = unlinking.value.meter_id;
  try {
    await api.post(`/api/v1/admin/customer-meters/${unlinking.value.id}/unlink`, { reason: unlinkReason.value.trim() });
    unlinking.value = null;
    await load();
    successMessage.value = `Meter ${meterId} unlinked. Purchase access was removed and the customer was notified.`;
  } catch (cause: unknown) {
    actionError.value = actionFailureMessage(cause, 'unlink');
  } finally {
    saving.value = false;
  }
}

function statusLabel(status: string) {
  return { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }[status] ?? status;
}

function statusClass(status: string) {
  return { pending: 'bw-badge-warning', approved: 'bw-badge-success', rejected: 'bw-badge-error' }[status] ?? 'bw-badge-neutral';
}

function phaseLabel(type: CustomerMeterRecord['meter_type']) {
  if (type === 'three_phase') return 'Three phase';
  if (type === 'single_phase') return 'Single phase';
  return 'Phase unavailable';
}

function namesMatch(meter: CustomerMeterRecord) {
  const normalize = (value: string | null | undefined) => (value ?? '').toLocaleLowerCase('en-NG').replace(/[^a-z0-9]/g, '');
  const claimant = normalize(meter.customers?.full_name);
  const registered = normalize(meter.meter_name);
  return Boolean(claimant && registered && claimant === registered);
}

function actionFailureMessage(cause: unknown, action: 'approve' | 'reject' | 'unlink') {
  const fallback = `We couldn't ${action} this meter link. Please try again.`;
  if (!(cause instanceof Error)) return fallback;
  if (/mutation route is not enabled|route_policy_missing/i.test(cause.message)) {
    return 'The review service is temporarily unavailable. Refresh the queue and try again.';
  }
  return cause.message || fallback;
}

function fmtDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

onMounted(load);
onBeforeUnmount(() => { if (searchTimer) clearTimeout(searchTimer); });
</script>

<style scoped>
.meter-page-intro { display:flex; align-items:center; justify-content:space-between; gap:var(--s-4); margin-bottom:var(--s-4); }
.meter-intro-copy { min-width:0; }
.meter-page-copy { max-width:64ch; margin:var(--s-1) 0 0; line-height:1.45; }
.meter-refresh-button { flex:0 0 auto; font-size:var(--t-xl); }
.meter-refresh-button span { display:block; line-height:1; }
.meter-refresh-button .is-spinning { animation:meter-refresh-spin .8s linear infinite; }
@keyframes meter-refresh-spin { to { transform:rotate(360deg); } }
.meter-stat-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:var(--s-3); margin-bottom:var(--s-4); }
.meter-stat-card { display:flex; align-items:center; justify-content:space-between; gap:var(--s-3); min-height:64px; padding:var(--s-3) var(--s-4); border:1px solid var(--border); border-radius:var(--r-lg); background:var(--surface-1); color:var(--text); text-align:left; cursor:pointer; }
.meter-stat-card span { color:var(--text-muted); font-size:var(--t-sm); }
.meter-stat-card strong { font-size:var(--t-2xl); }
.meter-stat-card.active { border-color:var(--brand); box-shadow:0 0 0 2px var(--brand-glow); }
.meter-kpis { margin-bottom:var(--s-4); }
.meter-kpi { width:100%; min-height:118px; text-align:left; color:var(--text); cursor:pointer; }
.meter-kpi.active { border-color:var(--brand); box-shadow:0 0 0 2px var(--brand-glow), var(--glass-shadow-card); }
.meter-kpi:focus-visible { outline:2px solid var(--brand); outline-offset:2px; }
.meter-filter-bar { display:flex; align-items:center; gap:var(--s-3); margin-bottom:var(--s-4); }
.meter-results { margin:calc(var(--s-3) * -1) 0 var(--s-3); color:var(--text-muted); font-size:var(--t-xs); }
.meter-search { flex:1; max-width:34rem; }
.meter-search .bw-input { width:100%; }
.bw-success-banner { display:flex; align-items:center; justify-content:space-between; gap:var(--s-3); margin-bottom:var(--s-4); padding:var(--s-3) var(--s-4); border:1px solid var(--success); border-radius:var(--r-md); background:color-mix(in srgb,var(--success) 12%,var(--surface-1)); color:var(--text); }
.banner-dismiss { border:0; background:transparent; color:var(--text-muted); font-size:var(--t-xl); cursor:pointer; }
.meter-loading { display:grid; gap:var(--s-3); }
.meter-loading .bw-skeleton { min-height:46px; }
.bw-error-banner { display:flex; align-items:center; justify-content:space-between; gap:var(--s-4); }
.bw-error-banner p { margin:var(--s-1) 0 0; }
.meter-table-wrap { overflow:auto; }
.meter-queue { overflow:hidden; }
.meter-queue-head { padding:var(--s-3) var(--s-4); border-bottom:1px solid var(--border); }
.meter-queue-head h2 { margin:0; }
.meter-queue-head p { margin:var(--s-1) 0 0; color:var(--text-muted); font-size:var(--t-xs); }
.meter-secondary { display:block; margin-top:var(--s-1); color:var(--text-muted); }
.meter-row-actions { display:flex; justify-content:flex-end; gap:var(--s-2); }
.meter-actions-col { min-width:220px; text-align:right; }
.meter-card-list { display:none; }
.meter-card { display:grid; gap:var(--s-3); }
.meter-card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:var(--s-3); }
.meter-card-head > div { display:grid; gap:2px; }
.meter-card-kicker { color:var(--text-muted); font-size:var(--t-xs); text-transform:uppercase; letter-spacing:.08em; }
.identity-comparison, .review-identity { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:var(--s-2); }
.identity-comparison > div, .review-identity > div { min-width:0; padding:var(--s-3); border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface-2); }
.identity-comparison span, .review-identity span { display:block; margin-bottom:var(--s-1); color:var(--text-muted); font-size:var(--t-xs); }
.identity-comparison strong, .review-identity strong { display:block; overflow-wrap:anywhere; }
.identity-signal { display:flex; align-items:center; justify-content:space-between; gap:var(--s-2); padding:var(--s-2) var(--s-3); border-radius:var(--r-md); font-size:var(--t-xs); }
.identity-signal.is-review { border:1px solid var(--warn); background:color-mix(in srgb,var(--warn) 10%,var(--surface-1)); }
.identity-signal.is-match { border:1px solid var(--success); background:color-mix(in srgb,var(--success) 10%,var(--surface-1)); }
.meter-submitted { margin:0; color:var(--text-muted); font-size:var(--t-xs); }
.meter-card-actions { display:grid; grid-template-columns:1fr auto auto; gap:var(--s-2); }
.meter-card-actions-single { grid-template-columns:1fr; }
.meter-pagination { display:flex; align-items:center; justify-content:space-between; gap:var(--s-3); margin-top:var(--s-4); color:var(--text-muted); font-size:var(--t-sm); }
.meter-pagination div { display:flex; gap:var(--s-2); }
.review-summary { display:grid; gap:var(--s-2); margin-bottom:var(--s-3); }
.review-summary .identity-signal { align-items:flex-start; flex-direction:column; }
.review-meta { display:flex; align-items:center; justify-content:space-between; gap:var(--s-2); color:var(--text-muted); font-size:var(--t-xs); }
.ownership-check { display:flex; align-items:flex-start; gap:var(--s-2); margin-bottom:var(--s-4); color:var(--text); font-size:var(--t-sm); line-height:1.5; }
.ownership-check input { margin-top:3px; }
.reject-target { display:grid; grid-template-columns:1fr auto; gap:var(--s-1) var(--s-3); margin-bottom:var(--s-3); padding:var(--s-3); border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface-2); }
.reject-target > span:first-child { color:var(--text-muted); font-size:var(--t-xs); }
.reject-target > span:last-child { grid-column:1 / -1; color:var(--text-muted); font-size:var(--t-sm); }
.field-heading { display:flex; align-items:center; justify-content:space-between; gap:var(--s-2); }
.field-heading > span, .field-help { color:var(--text-muted); font-size:var(--t-xs); }
.field-help { margin:var(--s-1) 0 0; }
.unlink-summary { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:var(--s-2); }
.unlink-summary > div { padding:var(--s-2); border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface-2); }
.unlink-summary span { display:block; margin-bottom:var(--s-1); color:var(--text-muted); font-size:var(--t-xs); }
.unlink-impact { display:grid; gap:var(--s-1); margin:var(--s-3) 0; padding:var(--s-3); border-left:3px solid var(--warn); background:color-mix(in srgb,var(--warn) 8%,var(--surface-1)); font-size:var(--t-sm); }
.unlink-impact span { color:var(--text-muted); }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
@media (max-width: 760px) {
  .meter-page-intro { align-items:flex-end; margin-bottom:var(--s-3); }
  .meter-page-intro .bw-page-sub { margin:0; }
  .meter-page-intro > .bw-btn { flex:0 0 auto; }
  .meter-page-copy { font-size:var(--t-xs); }
  .meter-kpis { margin-bottom:var(--s-3); }
  .meter-kpis > .meter-kpi { min-height:104px; padding:var(--s-3) !important; }
  .meter-kpis .bw-kpi-label { font-size:var(--t-xs) !important; }
  .meter-kpis .bw-kpi-value { font-size:var(--t-2xl) !important; }
  .meter-stat-card { min-height:46px; padding:var(--s-2); border-radius:var(--r-md); }
  .meter-stat-card span { font-size:var(--t-xs); }
  .meter-stat-card strong { font-size:var(--t-lg); }
  .meter-filter-bar { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:stretch; margin-bottom:var(--s-3); }
  .meter-search { max-width:none; }
  .meter-search { grid-column:1 / -1; }
  .meter-results { margin:calc(var(--s-2) * -1) 0 var(--s-2); }
  .meter-queue[data-view="list"] .meter-table-wrap { display:none; }
  .meter-queue[data-view="list"] .meter-card-list { display:grid; gap:var(--s-3); }
  .meter-queue[data-view="table"] .meter-table-wrap { display:block; }
  .meter-queue[data-view="table"] .meter-card-list { display:none; }
  .meter-card { padding:var(--s-3); }
  .meter-submitted { display:none; }
  .identity-comparison, .review-identity { grid-template-columns:1fr 1fr; }
  .identity-comparison > div, .review-identity > div { padding:var(--s-2); }
  .identity-signal { align-items:flex-start; flex-direction:column; }
  .meter-card-actions .bw-btn { min-height:44px; }
  .meter-card-actions { grid-template-columns:1fr auto; }
  .meter-unlink-button { grid-column:1 / -1; }
  .meter-queue-head { grid-template-columns:minmax(0,1fr) auto; }
  .meter-queue-head > div:first-child { grid-column:auto; }
  .unlink-summary { grid-template-columns:1fr 1fr; }
  .meter-pagination { align-items:stretch; flex-direction:column; }
  .meter-pagination div { display:grid; grid-template-columns:1fr 1fr; }
  .ownership-check { margin-bottom:var(--s-3); }
}
</style>
