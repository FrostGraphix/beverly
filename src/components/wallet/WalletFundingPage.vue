<template>
  <section class="ops-page" aria-label="Wallet Funding">
    <header class="ops-head">
      <div class="ops-head-text">
        <h1>Funding</h1>
        <p>Approve or reject vendor wallet funding requests</p>
      </div>
      <div class="ops-head-actions">
        <BaseButton :loading="loading" :disabled="loading" @click="load">Refresh</BaseButton>
      </div>
    </header>

    <div class="kpi-strip">
      <div class="kpi-cell">
        <span class="kpi-label">Total Requests</span>
        <span class="kpi-value">{{ summary.total ?? '-' }}</span>
      </div>
      <div class="kpi-cell tone-warn">
        <span class="kpi-label">Pending Review</span>
        <span class="kpi-value">{{ summary.pendingReview ?? '-' }}</span>
      </div>
      <div class="kpi-cell tone-info">
        <span class="kpi-label">Proof Uploaded</span>
        <span class="kpi-value">{{ summary.proofUploaded ?? '-' }}</span>
      </div>
      <div class="kpi-cell tone-good">
        <span class="kpi-label">Approved</span>
        <span class="kpi-value">{{ summary.approved ?? '-' }}</span>
      </div>
      <div class="kpi-cell tone-good">
        <span class="kpi-label">Total Approved</span>
        <span class="kpi-value kpi-value--sm">{{ formatMoney(summary.totalApprovedMinor) }}</span>
      </div>
      <div class="kpi-cell tone-danger">
        <span class="kpi-label">Rejected</span>
        <span class="kpi-value">{{ summary.rejected ?? '-' }}</span>
      </div>
    </div>

    <div class="ops-toolbar">
      <BaseSelect v-model="filterStatus" class="ops-select" aria-label="Filter by status" @change="load">
        <option value="">All Statuses</option>
        <option value="initiated">Initiated</option>
        <option value="proof_uploaded">Proof Uploaded</option>
        <option value="under_review">Under Review</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
        <option value="expired">Expired</option>
      </BaseSelect>
      <BaseInput v-model="search" class="ops-search" type="search" placeholder="Search organization ID..." aria-label="Search funding requests" />
      <ExportToolbar :rows="filteredRows" :columns="exportColumns" title="Funding Requests Report" filename="beverly-funding" :disabled="!filteredRows.length" />
    </div>

    <div v-if="error" class="ops-error" role="alert">{{ error }} <BaseButton size="sm" @click="load">Retry</BaseButton></div>
    <div v-if="actionSuccess" class="ops-success" role="status">{{ actionSuccess }}</div>

    <div v-if="initialLoading" class="ops-loading" role="status" :aria-busy="initialLoading" aria-live="polite">
      <div v-for="n in 5" :key="n" class="skeleton-row-strip"></div>
    </div>

    <div v-else-if="!filteredRows.length && !refreshing" class="ops-empty">No funding requests found.</div>

    <div v-else class="ops-table-wrap">
      <table class="ops-table" aria-label="Funding requests">
        <thead>
          <tr>
            <th>Ref Code</th>
            <th>Organization</th>
            <th>Requested</th>
            <th>Verified</th>
            <th>Status</th>
            <th>Requested By</th>
            <th>Expires</th>
            <th>Created</th>
            <th class="action-column bw-align-center" style="text-align: center">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="refreshing" class="ops-refresh-row" aria-live="polite">
            <td colspan="9"><span class="ops-refresh-spinner" aria-hidden="true"></span><span>Refreshing…</span></td>
          </tr>
          <tr v-for="row in paginatedRows" :key="row.id" :class="{ 'row-selected': selected?.id === row.id }" role="button" tabindex="0" @click="selected = row" @keydown.enter.prevent="selected = row" @keydown.space.prevent="selected = row">
            <td><code class="mono-id">{{ row.referenceCode || shortId(row.id) }}</code></td>
            <td>{{ row.organizationId || '-' }}</td>
            <td>{{ formatMoney(row.amountMinor) }}</td>
            <td>{{ row.verifiedAmountMinor ? formatMoney(row.verifiedAmountMinor) : '-' }}</td>
            <td><span :class="['status-pill', statusTone(row.status)]">{{ statusLabel(row.status) }}</span></td>
            <td>{{ row.requestedBy || '-' }}</td>
            <td>{{ row.expiresAt ? formatDate(row.expiresAt) : '-' }}</td>
            <td>{{ formatDate(row.createdAt) }}</td>
            <td class="action-cell action-column bw-align-center" style="text-align: center" @click.stop>
              <WalletRowActions
                v-if="buildFundingPageRowActions(row).length"
                :items="buildFundingPageRowActions(row)"
                label="Funding actions"
                align="center"
              />
              <span v-else class="bw-muted">-</span>
            </td>
          </tr>
        </tbody>
      </table>

      <WalletTablePagination
        v-model:page="page"
        v-model:pageSize="pageSize"
        :total-items="filteredRows.length"
        item-label="funding requests"
      />
    </div>

    <!-- Detail drawer -->
    <aside v-if="selected" class="ops-drawer" aria-label="Funding request detail">
      <div class="drawer-head">
        <strong>{{ selected.referenceCode || shortId(selected.id) }}</strong>
        <BaseButton size="sm" variant="ghost" @click="selected = null">x</BaseButton>
      </div>
      <dl class="drawer-fields">
        <dt>Status</dt><dd><span :class="['status-pill', statusTone(selected.status)]">{{ statusLabel(selected.status) }}</span></dd>
        <dt>Organization</dt><dd>{{ selected.organizationId }}</dd>
        <dt>Wallet ID</dt><dd><code class="mono-id">{{ shortId(selected.walletId) }}</code></dd>
        <dt>Requested Amount</dt><dd>{{ formatMoney(selected.amountMinor) }}</dd>
        <dt>Verified Amount</dt><dd>{{ selected.verifiedAmountMinor ? formatMoney(selected.verifiedAmountMinor) : '-' }}</dd>
        <dt>Requested By</dt><dd>{{ selected.requestedBy }}</dd>
        <dt>Reviewed By</dt><dd>{{ selected.reviewedBy || '-' }}</dd>
        <dt>Review Note</dt><dd>{{ selected.reviewerNote || '-' }}</dd>
        <dt>Expires</dt><dd>{{ selected.expiresAt ? formatDate(selected.expiresAt) : '-' }}</dd>
        <dt>Created</dt><dd>{{ formatDate(selected.createdAt) }}</dd>
      </dl>
      <div v-if="canApprove(selected)" class="drawer-actions">
        <BaseButton variant="primary" style="flex:1;" @click="openApprove(selected)">Approve</BaseButton>
        <BaseButton class="btn-danger-sm" style="flex:1;" @click="openReject(selected)">Reject</BaseButton>
      </div>
    </aside>

    <BaseConfirmDialog
      :open="approveModal.open"
      title="Approve funding?"
      :description="`Credit ${formatMoney(approveModal.row?.amountMinor)} to this wallet?`"
      confirm-label="Approve funding"
      :loading="submitting"
      @cancel="approveModal.open = false"
      @confirm="submitApprove"
    >
      <label>Verified Amount (NGN)<BaseInput v-model.number="approveModal.verifiedNgn" class="ops-input" type="number" min="0" step="0.01" /></label>
      <label>Review Note<textarea v-model="approveModal.note" class="ops-textarea" rows="3"></textarea></label>
    </BaseConfirmDialog>

    <BaseConfirmDialog
      :open="rejectModal.open"
      title="Reject funding?"
      :description="`Reject request ${rejectModal.row?.referenceCode || ''}?`"
      confirm-label="Reject funding"
      :loading="submitting"
      :disabled="!rejectModal.note.trim()"
      @cancel="rejectModal.open = false"
      @confirm="submitReject"
    >
      <label>Rejection Reason<textarea v-model="rejectModal.note" class="ops-textarea" rows="3"></textarea></label>
    </BaseConfirmDialog>
  </section>
</template>

<script>
import BaseButton from "../base/BaseButton.vue";
import BaseConfirmDialog from "../base/BaseConfirmDialog.vue";
import BaseInput from "../base/BaseInput.vue";
import BaseSelect from "../base/BaseSelect.vue";
import ExportToolbar from "../base/ExportToolbar.vue";
import WalletRowActions from "@beverly/tokens/WalletRowActions.vue";
import WalletTablePagination from "@beverly/tokens/WalletTablePagination.vue";
import { postApi } from "../../services/api.js";

function formatMoney(amountMinor = 0) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 })
    .format(Number(amountMinor || 0) / 100);
}

export default {
  name: "WalletFundingPage",
  components: { BaseButton, BaseConfirmDialog, BaseInput, BaseSelect, ExportToolbar, WalletRowActions, WalletTablePagination },
  data() {
    return {
      rows: [],
      summary: {},
      filterStatus: "",
      search: "",
      page: 1,
      pageSize: 10,
      selected: null,
      loading: false,
      initialLoading: true,
      refreshing: false,
      submitting: false,
      error: "",
      actionSuccess: "",
      approveModal: { open: false, row: null, verifiedNgn: 0, note: "" },
      rejectModal: { open: false, row: null, note: "" }
    };
  },
  computed: {
    filteredRows() {
      const q = this.search.toLowerCase();
      return this.rows.filter(r =>
        !q ||
        (r.organizationId || "").toLowerCase().includes(q) ||
        (r.referenceCode || "").toLowerCase().includes(q) ||
        (r.id || "").toLowerCase().includes(q)
      );
    },
    paginatedRows() {
      const start = (this.page - 1) * this.pageSize;
      return this.filteredRows.slice(start, start + this.pageSize);
    },
    exportColumns() {
      return [
        { key: "referenceCode", label: "Ref Code" },
        { key: "organizationId", label: "Organization" },
        { key: "amountMinor", label: "Requested", value: r => formatMoney(r.amountMinor) },
        { key: "verifiedAmountMinor", label: "Verified", value: r => r.verifiedAmountMinor ? formatMoney(r.verifiedAmountMinor) : "-" },
        { key: "status", label: "Status" },
        { key: "requestedBy", label: "Requested By" },
        { key: "expiresAt", label: "Expires", value: r => r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : "" },
        { key: "createdAt", label: "Created", value: r => r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "" }
      ];
    }
  },
  mounted() { this.load(); },
  methods: {
    async load() {
      if (this.initialLoading) {
        // First paint: show full skeleton
      } else {
        this.refreshing = true;
      }
      this.loading = true;
      this.error = "";
      this.actionSuccess = "";
      try {
        const [listRes, _] = await Promise.all([
          postApi("/api/wallet/funding/list", { status: this.filterStatus || undefined, limit: 200 }),
          Promise.resolve()
        ]);
        const raw = listRes.data;
        const rawRows = Array.isArray(raw?.rows) ? raw.rows : (Array.isArray(raw) ? raw : []);
        this.rows = rawRows;
        // Compute summary locally
        this.summary = {
          total: rawRows.length,
          pendingReview: rawRows.filter(r => r.status === "under_review").length,
          proofUploaded: rawRows.filter(r => r.status === "proof_uploaded").length,
          approved: rawRows.filter(r => r.status === "approved").length,
          rejected: rawRows.filter(r => r.status === "rejected").length,
          totalApprovedMinor: rawRows.filter(r => r.status === "approved").reduce((s, r) => s + Number(r.verifiedAmountMinor || r.amountMinor || 0), 0)
        };
      } catch (e) {
        this.error = e?.message || "Failed to load funding requests";
      } finally {
        this.loading = false;
        this.initialLoading = false;
        this.refreshing = false;
      }
    },
    canApprove(row) {
      return ["initiated", "proof_uploaded", "under_review"].includes(row?.status);
    },
    openApprove(row) {
      this.approveModal = { open: true, row, verifiedNgn: Number(row.amountMinor || 0) / 100, note: "" };
    },
    openReject(row) {
      this.rejectModal = { open: true, row, note: "" };
    },
    async submitApprove() {
      this.submitting = true;
      try {
        await postApi("/api/wallet/funding/approve", {
          fundingRequestId: this.approveModal.row.id,
          verifiedAmountMinor: Math.round(Number(this.approveModal.verifiedNgn || 0) * 100),
          actorId: "finance-checker",
          reviewerNote: this.approveModal.note
        });
        this.approveModal.open = false;
        this.selected = null;
        this.actionSuccess = "Funding approved and ledger credited.";
        await this.load();
      } catch (e) {
        this.error = e?.message || "Approve failed";
      } finally {
        this.submitting = false;
      }
    },
    async submitReject() {
      this.submitting = true;
      try {
        await postApi("/api/wallet/funding/reject", {
          fundingRequestId: this.rejectModal.row.id,
          actorId: "finance-checker",
          reviewerNote: this.rejectModal.note
        });
        this.rejectModal.open = false;
        this.selected = null;
        this.actionSuccess = "Funding request rejected.";
        await this.load();
      } catch (e) {
        this.error = e?.message || "Reject failed";
      } finally {
        this.submitting = false;
      }
    },
    buildFundingPageRowActions(row) {
      const actions = [];
      if (this.canApprove(row)) {
        actions.push({ label: 'Approve Funding', icon: 'approve', action: () => this.openApprove(row) });
        actions.push({ label: 'Reject Funding', icon: 'reject', action: () => this.openReject(row) });
      }
      return actions;
    },
    formatMoney,
    shortId: (id) => String(id || "").slice(0, 8).toUpperCase(),
    formatDate(iso) { return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-"; },
    statusLabel(s) {
      const map = { initiated: "Initiated", proof_uploaded: "Proof Uploaded", under_review: "Under Review", approved: "Approved", rejected: "Rejected", expired: "Expired", cancelled: "Cancelled" };
      return map[s] || s;
    },
    statusTone(s) {
      if (s === "approved") return "good";
      if (s === "rejected") return "danger";
      if (s === "under_review") return "info";
      if (s === "proof_uploaded") return "warn";
      if (s === "expired") return "neutral";
      return "neutral";
    }
  }
};
</script>

<style scoped>
.ops-page { display: flex; flex-direction: column; gap: 20px; padding: 24px; min-height: 100%; }
.ops-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.ops-head-text h1 { font-size: 18px; font-weight: 700; margin: 0 0 4px; color: var(--text-strong); }
.ops-head-text p { font-size: 12px; color: var(--text-muted); margin: 0; }
.ops-head-actions { display: flex; gap: 8px; }

.kpi-strip { display: flex; gap: 1px; background: var(--border-color, #e2e8f0); border-radius: 12px; overflow: hidden; flex-wrap: wrap; }
.kpi-cell { flex: 1; min-width: 100px; background: var(--bg-card); padding: 14px 20px; display: flex; flex-direction: column; gap: 4px; }
.kpi-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); }
.kpi-value { font-size: 18px; font-weight: 800; color: var(--text-strong); }
.kpi-value--sm { font-size: 14px; }
.tone-warn .kpi-value { color: var(--bev-color-amber-500); }
.tone-danger .kpi-value { color: var(--bev-color-red-500); }
.tone-good .kpi-value { color: var(--bev-color-green-600); }
.tone-info .kpi-value { color: var(--bev-color-blue-500); }

.ops-toolbar { display: flex; gap: 12px; flex-wrap: wrap; }
.ops-select { height: 36px; border: 1px solid var(--border-color); border-radius: 6px; padding: 0 10px; background: var(--bg-card); color: var(--text-main); font-size: 13px; }
.ops-search { height: 36px; border: 1px solid var(--border-color); border-radius: 6px; padding: 0 12px; background: var(--bg-card); color: var(--text-main); font-size: 13px; min-width: 220px; flex: 1; }
.ops-select:focus, .ops-search:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }

.ops-error { background: var(--bev-color-red-50); border: 1px solid var(--bev-color-red-100); color: var(--bev-color-red-600); border-radius: 8px; padding: 12px 16px; display: flex; align-items: center; gap: 12px; font-size: 13px; }
.ops-success { background: var(--bev-color-green-50); border: 1px solid var(--bev-color-green-100); color: var(--bev-color-green-700); border-radius: 8px; padding: 12px 16px; font-size: 13px; }
.ops-empty { padding: 48px; text-align: center; color: var(--text-muted); font-size: 14px; }
.ops-loading { display: flex; flex-direction: column; gap: 8px; }
.skeleton-row-strip { height: 44px; background: var(--bg-card); border-radius: 6px; position: relative; overflow: hidden; }
.skeleton-row-strip::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent 0%, var(--bg-page) 50%, transparent 100%); animation: skeleton-sweep 1.5s ease-in-out infinite; }
@keyframes skeleton-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
.ops-refresh-row td { padding: 8px 16px; color: var(--text-muted); font-size: 12px; display: flex; align-items: center; gap: 8px; }
.ops-refresh-spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: bev-button-spin 0.7s linear infinite; flex-shrink: 0; }

.ops-table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid var(--border-color); }
.ops-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ops-table thead th { background: var(--bg-page); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); padding: 10px 16px; text-align: left; border-bottom: 1px solid var(--border-color); white-space: nowrap; }
.ops-table tbody tr { border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background .15s; }
.ops-table tbody tr:hover, .ops-table tbody tr.row-selected { background: var(--primary-light); }
.ops-table td { padding: 11px 16px; color: var(--text-main); vertical-align: middle; white-space: nowrap; }
.action-cell { display: flex; gap: 6px; }

.mono-id { font-family: var(--bev-font-mono, monospace); font-size: 11px; background: var(--bg-page); padding: 2px 6px; border-radius: 4px; }
.status-pill { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.status-pill.good { background: var(--bev-color-green-100); color: var(--bev-color-green-700); }
.status-pill.warn { background: var(--bev-color-amber-100); color: #92400e; }
.status-pill.danger { background: var(--bev-color-red-100); color: var(--bev-color-red-600); }
.status-pill.info { background: var(--bev-color-blue-50); color: #0369a1; }
.status-pill.neutral { background: var(--bev-color-slate-100); color: var(--bev-color-slate-700); }
.btn-danger-sm { color: var(--bev-color-red-600) !important; }

.ops-drawer { position: fixed; top: 0; right: 0; width: 360px; max-width: 100vw; height: 100vh; background: var(--bg-card); border-left: 1px solid var(--border-color); box-shadow: var(--bev-shadow-xl); padding: 24px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; z-index: 200; }
.drawer-head { display: flex; justify-content: space-between; align-items: center; }
.drawer-fields { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 13px; }
.drawer-fields dt { color: var(--text-muted); font-weight: 700; font-size: 11px; text-transform: uppercase; padding-top: 2px; }
.drawer-fields dd { color: var(--text-main); word-break: break-all; }
.drawer-actions { display: flex; gap: 8px; margin-top: auto; }

.ops-textarea { width: 100%; border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; background: var(--bg-page); color: var(--text-main); font-size: 13px; resize: vertical; font-family: inherit; }
.ops-textarea:focus { outline: none; border-color: var(--primary); }
.ops-input { display: block; width: 100%; height: 36px; border: 1px solid var(--border-color); border-radius: 6px; padding: 0 12px; background: var(--bg-page); color: var(--text-main); font-size: 13px; margin-top: 4px; }
.ops-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }

.ops-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 400; display: flex; align-items: center; justify-content: center; }
.ops-modal { background: var(--bg-card); border-radius: 16px; padding: 28px; width: 440px; max-width: calc(100vw - 32px); display: flex; flex-direction: column; gap: 16px; }
.ops-modal h2 { font-size: 16px; font-weight: 700; color: var(--text-strong); margin: 0; }
.modal-sub { font-size: 13px; color: var(--text-muted); margin: 0; }
.ops-modal label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 8px; border-top: 1px solid var(--border-color); }

@media (max-width: 768px) {
  .ops-page { padding: 16px; }
  .ops-drawer { width: 100vw; }
}
</style>
