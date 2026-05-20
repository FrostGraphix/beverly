<template>
  <section class="ops-page" aria-label="Refunds">
    <header class="ops-head">
      <div class="ops-head-text">
        <h1>Refunds</h1>
        <p>Manage refund requests and approvals</p>
      </div>
      <div class="ops-head-actions">
        <BaseButton @click="load">Refresh</BaseButton>
      </div>
    </header>

    <div class="kpi-strip">
      <div class="kpi-cell">
        <span class="kpi-label">Total</span>
        <span class="kpi-value">{{ summary.total ?? '—' }}</span>
      </div>
      <div class="kpi-cell tone-warn">
        <span class="kpi-label">Requested</span>
        <span class="kpi-value">{{ summary.requested ?? '—' }}</span>
      </div>
      <div class="kpi-cell tone-info">
        <span class="kpi-label">Under Review</span>
        <span class="kpi-value">{{ summary.underReview ?? '—' }}</span>
      </div>
      <div class="kpi-cell tone-good">
        <span class="kpi-label">Completed</span>
        <span class="kpi-value">{{ summary.completed ?? '—' }}</span>
      </div>
      <div class="kpi-cell tone-good">
        <span class="kpi-label">Total Refunded</span>
        <span class="kpi-value kpi-value--sm">{{ formatMoney(summary.completedAmountMinor) }}</span>
      </div>
      <div class="kpi-cell tone-danger">
        <span class="kpi-label">Rejected</span>
        <span class="kpi-value">{{ summary.rejected ?? '—' }}</span>
      </div>
    </div>

    <div class="ops-toolbar">
      <BaseSelect v-model="filterStatus" class="ops-select" aria-label="Filter by status" @change="load">
        <option value="">All Statuses</option>
        <option value="requested">Requested</option>
        <option value="under_review">Under Review</option>
        <option value="approved">Approved</option>
        <option value="processing">Processing</option>
        <option value="completed">Completed</option>
        <option value="rejected">Rejected</option>
      </BaseSelect>
      <BaseInput v-model="search" class="ops-search" type="search" placeholder="Search org or order ID…" aria-label="Search refunds" />
      <ExportToolbar :rows="filteredRows" :columns="exportColumns" title="Refunds Report" filename="beverly-refunds" :disabled="!filteredRows.length" />
    </div>

    <div v-if="error" class="ops-error" role="alert">{{ error }} <BaseButton size="sm" @click="load">Retry</BaseButton></div>

    <div v-if="loading" class="ops-loading">
      <div v-for="n in 5" :key="n" class="skeleton-row-strip"></div>
    </div>

    <div v-else-if="!filteredRows.length" class="ops-empty">No refunds found.</div>

    <div v-else class="ops-table-wrap">
      <table class="ops-table" aria-label="Refunds table">
        <thead>
          <tr>
            <th>Refund ID</th>
            <th>Purchase Order</th>
            <th>Organization</th>
            <th>Requested</th>
            <th>Approved</th>
            <th>Reason</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in filteredRows" :key="row.id" :class="{ 'row-selected': selected?.id === row.id }" @click="selected = row">
            <td><code class="mono-id">{{ shortId(row.id) }}</code></td>
            <td><code class="mono-id">{{ shortId(row.purchaseOrderId) }}</code></td>
            <td>{{ row.organizationId || '—' }}</td>
            <td>{{ formatMoney(row.amountMinor) }}</td>
            <td>{{ row.approvedAmountMinor ? formatMoney(row.approvedAmountMinor) : '—' }}</td>
            <td>{{ reasonLabel(row.reason) }}</td>
            <td><span :class="['status-pill', statusTone(row.status)]">{{ statusLabel(row.status) }}</span></td>
            <td>{{ formatDate(row.createdAt) }}</td>
            <td class="action-cell">
              <BaseButton v-if="row.status === 'requested'" size="sm" @click.stop="openApprove(row)">Approve</BaseButton>
              <BaseButton v-if="['requested','under_review'].includes(row.status)" size="sm" class="btn-danger-sm" @click.stop="openReject(row)">Reject</BaseButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Detail drawer -->
    <aside v-if="selected" class="ops-drawer" aria-label="Refund detail">
      <div class="drawer-head">
        <strong>Refund {{ shortId(selected.id) }}</strong>
        <BaseButton size="sm" variant="ghost" @click="selected = null">✕</BaseButton>
      </div>
      <dl class="drawer-fields">
        <dt>Status</dt><dd><span :class="['status-pill', statusTone(selected.status)]">{{ statusLabel(selected.status) }}</span></dd>
        <dt>Organization</dt><dd>{{ selected.organizationId }}</dd>
        <dt>Purchase Order</dt><dd>{{ selected.purchaseOrderId }}</dd>
        <dt>Requested Amount</dt><dd>{{ formatMoney(selected.amountMinor) }}</dd>
        <dt>Approved Amount</dt><dd>{{ selected.approvedAmountMinor ? formatMoney(selected.approvedAmountMinor) : '—' }}</dd>
        <dt>Reason</dt><dd>{{ reasonLabel(selected.reason) }}</dd>
        <dt>Requested By</dt><dd>{{ selected.requestedBy }}</dd>
        <dt>Reviewed By</dt><dd>{{ selected.reviewedBy || '—' }}</dd>
        <dt>Review Note</dt><dd>{{ selected.reviewerNote || '—' }}</dd>
        <dt>Created</dt><dd>{{ formatDate(selected.createdAt) }}</dd>
      </dl>
    </aside>

    <!-- Approve modal -->
    <div v-if="approveModal.open" class="ops-modal-bg" @click.self="approveModal.open = false">
      <div class="ops-modal" role="dialog" aria-label="Approve refund">
        <h2>Approve Refund</h2>
        <p class="modal-sub">Refund {{ shortId(approveModal.row?.id) }} · Requested {{ formatMoney(approveModal.row?.amountMinor) }}</p>
        <label>Approved Amount (NGN)<BaseInput v-model.number="approveModal.approvedNgn" class="ops-input" type="number" min="0" step="0.01" /></label>
        <label>Review Note<textarea v-model="approveModal.note" class="ops-textarea" rows="3"></textarea></label>
        <div class="modal-actions">
          <BaseButton @click="approveModal.open = false">Cancel</BaseButton>
          <BaseButton variant="primary" :disabled="submitting" @click="submitApprove">Approve</BaseButton>
        </div>
      </div>
    </div>

    <!-- Reject modal -->
    <div v-if="rejectModal.open" class="ops-modal-bg" @click.self="rejectModal.open = false">
      <div class="ops-modal" role="dialog" aria-label="Reject refund">
        <h2>Reject Refund</h2>
        <p class="modal-sub">Refund {{ shortId(rejectModal.row?.id) }}</p>
        <label>Rejection Reason<textarea v-model="rejectModal.note" class="ops-textarea" rows="3"></textarea></label>
        <div class="modal-actions">
          <BaseButton @click="rejectModal.open = false">Cancel</BaseButton>
          <BaseButton variant="danger" :disabled="submitting" @click="submitReject">Reject</BaseButton>
        </div>
      </div>
    </div>
  </section>
</template>

<script>
import BaseButton from "../base/BaseButton.vue";
import BaseInput from "../base/BaseInput.vue";
import BaseSelect from "../base/BaseSelect.vue";
import ExportToolbar from "../base/ExportToolbar.vue";
import { listRefunds, approveRefund, rejectRefund, refundSummary, formatMoney } from "../../services/wallet-refunds-service.mjs";

export default {
  name: "RefundsPage",
  components: { BaseButton, BaseInput, BaseSelect, ExportToolbar },
  data() {
    return {
      rows: [],
      summary: {},
      filterStatus: "",
      search: "",
      selected: null,
      loading: false,
      error: "",
      submitting: false,
      approveModal: { open: false, row: null, approvedNgn: 0, note: "" },
      rejectModal: { open: false, row: null, note: "" }
    };
  },
  computed: {
    filteredRows() {
      const q = this.search.toLowerCase();
      return this.rows.filter(r =>
        !q ||
        (r.organizationId || "").toLowerCase().includes(q) ||
        (r.id || "").toLowerCase().includes(q) ||
        (r.purchaseOrderId || "").toLowerCase().includes(q)
      );
    },
    exportColumns() {
      return [
        { key: "id", label: "ID", value: r => (r.id || "").slice(0, 8).toUpperCase() },
        { key: "purchaseOrderId", label: "Purchase Order", value: r => (r.purchaseOrderId || "").slice(0, 8) },
        { key: "organizationId", label: "Organization" },
        { key: "amountMinor", label: "Requested", value: r => formatMoney(r.amountMinor) },
        { key: "approvedAmountMinor", label: "Approved", value: r => r.approvedAmountMinor ? formatMoney(r.approvedAmountMinor) : "—" },
        { key: "reason", label: "Reason" },
        { key: "status", label: "Status" },
        { key: "createdAt", label: "Created", value: r => r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "" }
      ];
    }
  },
  mounted() { this.load(); },
  methods: {
    async load() {
      this.loading = true;
      this.error = "";
      try {
        const [data, sum] = await Promise.all([
          listRefunds({ status: this.filterStatus || undefined }),
          refundSummary()
        ]);
        this.rows = Array.isArray(data?.rows) ? data.rows : (Array.isArray(data) ? data : []);
        this.summary = sum || {};
      } catch (e) {
        this.error = e?.message || "Failed to load refunds";
      } finally {
        this.loading = false;
      }
    },
    openApprove(row) {
      this.approveModal = { open: true, row, approvedNgn: Number(row.amountMinor || 0) / 100, note: "" };
    },
    openReject(row) {
      this.rejectModal = { open: true, row, note: "" };
    },
    async submitApprove() {
      this.submitting = true;
      try {
        await approveRefund({
          refundId: this.approveModal.row.id,
          approvedAmountMinor: Math.round(Number(this.approveModal.approvedNgn || 0) * 100),
          actorId: "staff",
          reviewerNote: this.approveModal.note
        });
        this.approveModal.open = false;
        this.selected = null;
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
        await rejectRefund({ refundId: this.rejectModal.row.id, actorId: "staff", reviewerNote: this.rejectModal.note });
        this.rejectModal.open = false;
        this.selected = null;
        await this.load();
      } catch (e) {
        this.error = e?.message || "Reject failed";
      } finally {
        this.submitting = false;
      }
    },
    formatMoney,
    shortId(id) { return String(id || "").slice(0, 8).toUpperCase(); },
    formatDate(iso) { return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"; },
    reasonLabel(r) {
      const map = { vend_failure: "Vend Failure", overcharge: "Overcharge", duplicate: "Duplicate", service_unavailable: "Service Down", customer_request: "Customer Request", system_error: "System Error" };
      return map[r] || r;
    },
    statusLabel(s) {
      const map = { requested: "Requested", under_review: "Under Review", approved: "Approved", processing: "Processing", completed: "Completed", rejected: "Rejected", cancelled: "Cancelled" };
      return map[s] || s;
    },
    statusTone(s) {
      if (["completed", "approved"].includes(s)) return "good";
      if (["requested"].includes(s)) return "warn";
      if (["under_review", "processing"].includes(s)) return "info";
      if (["rejected"].includes(s)) return "danger";
      return "neutral";
    }
  }
};
</script>

<style scoped>
.ops-page { display: flex; flex-direction: column; gap: 20px; padding: 24px; min-height: 100%; }
.ops-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.ops-head-text h1 { font-size: var(--bev-font-size-2xl, 18px); font-weight: 700; margin: 0 0 4px; color: var(--text-strong); }
.ops-head-text p { font-size: var(--bev-font-size-sm, 12px); color: var(--text-muted); margin: 0; }
.ops-head-actions { display: flex; gap: 8px; }

.kpi-strip { display: flex; gap: 1px; background: var(--border-color, #e2e8f0); border-radius: var(--bev-radius-lg, 12px); overflow: hidden; flex-wrap: wrap; }
.kpi-cell { flex: 1; min-width: 100px; background: var(--bg-card); padding: 14px 20px; display: flex; flex-direction: column; gap: 4px; }
.kpi-label { font-size: var(--bev-font-size-xs, 11px); font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); }
.kpi-value { font-size: var(--bev-font-size-2xl, 18px); font-weight: 800; color: var(--text-strong); }
.kpi-value--sm { font-size: var(--bev-font-size-lg, 14px); }
.tone-warn .kpi-value { color: var(--bev-color-amber-500, #f59e0b); }
.tone-danger .kpi-value { color: var(--bev-color-red-500, #ef4444); }
.tone-good .kpi-value { color: var(--bev-color-green-600, #059669); }
.tone-info .kpi-value { color: var(--bev-color-blue-500, #0ea5e9); }

.ops-toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.ops-select { height: 36px; border: 1px solid var(--border-color); border-radius: var(--bev-radius-sm, 6px); padding: 0 10px; background: var(--bg-card); color: var(--text-main); font-size: 13px; }
.ops-search { height: 36px; border: 1px solid var(--border-color); border-radius: var(--bev-radius-sm, 6px); padding: 0 12px; background: var(--bg-card); color: var(--text-main); font-size: 13px; min-width: 220px; flex: 1; }
.ops-select:focus, .ops-search:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }

.ops-error { background: var(--bev-color-red-50); border: 1px solid var(--bev-color-red-100); color: var(--bev-color-red-600); border-radius: var(--bev-radius-md, 8px); padding: 12px 16px; display: flex; align-items: center; gap: 12px; font-size: 13px; }
.ops-empty { padding: 48px; text-align: center; color: var(--text-muted); font-size: 14px; }
.ops-loading { display: flex; flex-direction: column; gap: 8px; }
.skeleton-row-strip { height: 44px; background: linear-gradient(90deg, var(--bg-card) 25%, var(--bg-page) 50%, var(--bg-card) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: var(--bev-radius-sm, 6px); }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.ops-table-wrap { overflow-x: auto; border-radius: var(--bev-radius-lg, 12px); border: 1px solid var(--border-color); }
.ops-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ops-table thead th { background: var(--bg-page); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); padding: 10px 16px; text-align: left; border-bottom: 1px solid var(--border-color); white-space: nowrap; }
.ops-table tbody tr { border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background .15s; }
.ops-table tbody tr:hover, .ops-table tbody tr.row-selected { background: var(--primary-light, #eff6ff); }
.ops-table td { padding: 11px 16px; color: var(--text-main); vertical-align: middle; white-space: nowrap; }
.action-cell { display: flex; gap: 6px; flex-wrap: wrap; }

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

.ops-textarea { width: 100%; border: 1px solid var(--border-color); border-radius: var(--bev-radius-sm); padding: 10px; background: var(--bg-page); color: var(--text-main); font-size: 13px; resize: vertical; font-family: inherit; }
.ops-textarea:focus { outline: none; border-color: var(--primary); }
.ops-input { display: block; width: 100%; height: 36px; border: 1px solid var(--border-color); border-radius: var(--bev-radius-sm); padding: 0 12px; background: var(--bg-page); color: var(--text-main); font-size: 13px; margin-top: 4px; }
.ops-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }

.ops-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 400; display: flex; align-items: center; justify-content: center; }
.ops-modal { background: var(--bg-card); border-radius: var(--bev-radius-xl); padding: 28px; width: 440px; max-width: calc(100vw - 32px); display: flex; flex-direction: column; gap: 16px; }
.ops-modal h2 { font-size: 16px; font-weight: 700; color: var(--text-strong); margin: 0; }
.modal-sub { font-size: 13px; color: var(--text-muted); margin: 0; }
.ops-modal label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 8px; border-top: 1px solid var(--border-color); }

@media (max-width: 768px) {
  .ops-page { padding: 16px; }
  .ops-drawer { width: 100vw; }
}
</style>
