<template>
  <section class="ops-page" aria-label="Disputes">
    <header class="ops-head">
      <div class="ops-head-text">
        <h1>Disputes</h1>
        <p>Review and resolve vend disputes</p>
      </div>
      <div class="ops-head-actions">
        <BaseButton @click="load">Refresh</BaseButton>
        <BaseButton variant="primary" @click="openCreate">Open Dispute</BaseButton>
      </div>
    </header>

    <div class="kpi-strip">
      <div class="kpi-cell">
        <span class="kpi-label">Total</span>
        <span class="kpi-value">{{ summary.total ?? '—' }}</span>
      </div>
      <div class="kpi-cell tone-warn">
        <span class="kpi-label">Open</span>
        <span class="kpi-value">{{ summary.open ?? '—' }}</span>
      </div>
      <div class="kpi-cell tone-info">
        <span class="kpi-label">Under Review</span>
        <span class="kpi-value">{{ summary.underReview ?? '—' }}</span>
      </div>
      <div class="kpi-cell tone-danger">
        <span class="kpi-label">Escalated</span>
        <span class="kpi-value">{{ summary.escalated ?? '—' }}</span>
      </div>
      <div class="kpi-cell tone-good">
        <span class="kpi-label">Resolved</span>
        <span class="kpi-value">{{ (summary.resolvedApproved ?? 0) + (summary.resolvedRejected ?? 0) }}</span>
      </div>
    </div>

    <div class="ops-toolbar">
      <BaseSelect v-model="filterStatus" class="ops-select" aria-label="Filter by status" @change="load">
        <option value="">All Statuses</option>
        <option value="open">Open</option>
        <option value="under_review">Under Review</option>
        <option value="escalated">Escalated</option>
        <option value="resolved_approved">Resolved — Approved</option>
        <option value="resolved_rejected">Resolved — Rejected</option>
        <option value="withdrawn">Withdrawn</option>
      </BaseSelect>
      <BaseInput v-model="search" class="ops-search" type="search" placeholder="Search organization or ID…" aria-label="Search disputes" />
      <ExportToolbar :rows="filteredRows" :columns="exportColumns" title="Disputes Report" filename="beverly-disputes" :disabled="!filteredRows.length" />
    </div>

    <div v-if="error" class="ops-error" role="alert">{{ error }} <BaseButton size="sm" @click="load">Retry</BaseButton></div>

    <div v-if="loading" class="ops-loading" aria-live="polite">
      <div v-for="n in 5" :key="n" class="skeleton-row-strip"></div>
    </div>

    <div v-else-if="!filteredRows.length" class="ops-empty">No disputes found.</div>

    <div v-else class="ops-table-wrap">
      <table class="ops-table" aria-label="Disputes table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Type</th>
            <th>Organization</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in filteredRows" :key="row.id" :class="{ 'row-selected': selected?.id === row.id }" @click="selected = row">
            <td><code class="mono-id">{{ shortId(row.id) }}</code></td>
            <td>{{ disputeTypeLabel(row.disputeType) }}</td>
            <td>{{ row.organizationId || '—' }}</td>
            <td>{{ formatMoney(row.amountMinor) }}</td>
            <td><span :class="['status-pill', statusTone(row.status)]">{{ statusLabel(row.status) }}</span></td>
            <td>{{ formatDate(row.createdAt) }}</td>
            <td class="action-cell">
              <BaseButton v-if="row.status === 'open'" size="sm" @click.stop="setStatus(row, 'under_review')">Review</BaseButton>
              <BaseButton v-if="row.status === 'under_review'" size="sm" variant="primary" @click.stop="openResolve(row, 'resolved_approved')">Approve</BaseButton>
              <BaseButton v-if="row.status === 'under_review'" size="sm" class="btn-danger-sm" @click.stop="openResolve(row, 'resolved_rejected')">Reject</BaseButton>
              <BaseButton v-if="['open','under_review'].includes(row.status)" size="sm" @click.stop="setStatus(row, 'escalated')">Escalate</BaseButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Detail drawer -->
    <aside v-if="selected" class="ops-drawer" aria-label="Dispute detail">
      <div class="drawer-head">
        <strong>Dispute {{ shortId(selected.id) }}</strong>
        <BaseButton size="sm" variant="ghost" @click="selected = null">✕</BaseButton>
      </div>
      <dl class="drawer-fields">
        <dt>Type</dt><dd>{{ disputeTypeLabel(selected.disputeType) }}</dd>
        <dt>Status</dt><dd><span :class="['status-pill', statusTone(selected.status)]">{{ statusLabel(selected.status) }}</span></dd>
        <dt>Organization</dt><dd>{{ selected.organizationId }}</dd>
        <dt>Purchase Order</dt><dd>{{ selected.purchaseOrderId || '—' }}</dd>
        <dt>Amount</dt><dd>{{ formatMoney(selected.amountMinor) }}</dd>
        <dt>Description</dt><dd>{{ selected.description || '—' }}</dd>
        <dt>Resolution</dt><dd>{{ selected.resolutionNote || '—' }}</dd>
        <dt>Opened by</dt><dd>{{ selected.actorId }}</dd>
        <dt>Created</dt><dd>{{ formatDate(selected.createdAt) }}</dd>
      </dl>
      <div class="drawer-note-area">
        <textarea v-model="noteText" class="ops-textarea" placeholder="Add a note…" rows="3"></textarea>
        <BaseButton size="sm" :disabled="!noteText.trim()" @click="submitNote">Add Note</BaseButton>
      </div>
    </aside>

    <!-- Create modal -->
    <div v-if="createOpen" class="ops-modal-bg" @click.self="createOpen = false">
      <div class="ops-modal" role="dialog" aria-label="Open dispute">
        <h2>Open Dispute</h2>
        <label>Organization ID<BaseInput v-model="createForm.organizationId" class="ops-input" /></label>
        <label>Purchase Order ID<BaseInput v-model="createForm.purchaseOrderId" class="ops-input" /></label>
        <label>Type
          <BaseSelect v-model="createForm.disputeType" class="ops-select">
            <option value="vend_failure">Vend Failure</option>
            <option value="token_not_received">Token Not Received</option>
            <option value="overcharge">Overcharge</option>
            <option value="underdelivery">Underdelivery</option>
            <option value="double_charge">Double Charge</option>
            <option value="other">Other</option>
          </BaseSelect>
        </label>
        <label>Amount (NGN)<BaseInput v-model.number="createForm.amountNgn" class="ops-input" type="number" min="0" step="0.01" /></label>
        <label>Description<textarea v-model="createForm.description" class="ops-textarea" rows="3"></textarea></label>
        <div class="modal-actions">
          <BaseButton @click="createOpen = false">Cancel</BaseButton>
          <BaseButton variant="primary" :disabled="submitting" @click="submitCreate">Open</BaseButton>
        </div>
      </div>
    </div>

    <!-- Resolve modal -->
    <div v-if="resolveModal.open" class="ops-modal-bg" @click.self="resolveModal.open = false">
      <div class="ops-modal" role="dialog" aria-label="Resolve dispute">
        <h2>{{ resolveModal.nextStatus === 'resolved_approved' ? 'Approve' : 'Reject' }} Dispute</h2>
        <p>Dispute {{ shortId(resolveModal.row?.id) }}</p>
        <label>Resolution Note<textarea v-model="resolveModal.note" class="ops-textarea" rows="3"></textarea></label>
        <div class="modal-actions">
          <BaseButton @click="resolveModal.open = false">Cancel</BaseButton>
          <BaseButton :variant="resolveModal.nextStatus === 'resolved_approved' ? 'primary' : 'danger'" :disabled="submitting" @click="submitResolve">Confirm</BaseButton>
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
import { listDisputes, openDispute, updateDisputeStatus, addDisputeNote, disputeSummary, formatMoney } from "../../services/wallet-disputes-service.mjs";

export default {
  name: "DisputesPage",
  components: { BaseButton, BaseInput, BaseSelect, ExportToolbar },
  data() {
    return {
      rows: [],
      summary: {},
      filterStatus: "",
      search: "",
      selected: null,
      noteText: "",
      loading: false,
      error: "",
      submitting: false,
      createOpen: false,
      createForm: { organizationId: "", purchaseOrderId: "", disputeType: "vend_failure", amountNgn: 0, description: "" },
      resolveModal: { open: false, row: null, nextStatus: "", note: "" }
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
        { key: "id", label: "ID", value: r => (r.id || "").slice(0, 8) },
        { key: "disputeType", label: "Type" },
        { key: "organizationId", label: "Organization" },
        { key: "amountMinor", label: "Amount", value: r => formatMoney(r.amountMinor) },
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
          listDisputes({ status: this.filterStatus || undefined }),
          disputeSummary()
        ]);
        this.rows = Array.isArray(data?.rows) ? data.rows : (Array.isArray(data) ? data : []);
        this.summary = sum || {};
      } catch (e) {
        this.error = e?.message || "Failed to load disputes";
      } finally {
        this.loading = false;
      }
    },
    async setStatus(row, status) {
      this.submitting = true;
      try {
        await updateDisputeStatus({ disputeId: row.id, status, resolutionNote: "", actorId: "staff" });
        await this.load();
      } catch (e) {
        this.error = e?.message || "Action failed";
      } finally {
        this.submitting = false;
      }
    },
    openResolve(row, nextStatus) {
      this.resolveModal = { open: true, row, nextStatus, note: "" };
    },
    async submitResolve() {
      this.submitting = true;
      try {
        await updateDisputeStatus({
          disputeId: this.resolveModal.row.id,
          status: this.resolveModal.nextStatus,
          resolutionNote: this.resolveModal.note,
          actorId: "staff"
        });
        this.resolveModal.open = false;
        this.selected = null;
        await this.load();
      } catch (e) {
        this.error = e?.message || "Resolve failed";
      } finally {
        this.submitting = false;
      }
    },
    async submitNote() {
      if (!this.noteText.trim() || !this.selected) return;
      this.submitting = true;
      try {
        await addDisputeNote({ disputeId: this.selected.id, note: this.noteText, actorId: "staff" });
        this.noteText = "";
      } catch (e) {
        this.error = e?.message || "Note failed";
      } finally {
        this.submitting = false;
      }
    },
    openCreate() {
      this.createForm = { organizationId: "", purchaseOrderId: "", disputeType: "vend_failure", amountNgn: 0, description: "" };
      this.createOpen = true;
    },
    async submitCreate() {
      this.submitting = true;
      try {
        await openDispute({
          ...this.createForm,
          amountMinor: Math.round(Number(this.createForm.amountNgn || 0) * 100),
          actorId: "staff"
        });
        this.createOpen = false;
        await this.load();
      } catch (e) {
        this.error = e?.message || "Create failed";
      } finally {
        this.submitting = false;
      }
    },
    formatMoney,
    shortId(id) { return String(id || "").slice(0, 8).toUpperCase(); },
    formatDate(iso) { return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"; },
    disputeTypeLabel(t) {
      const map = { vend_failure: "Vend Failure", token_not_received: "Token Missing", overcharge: "Overcharge", underdelivery: "Underdelivery", double_charge: "Double Charge", other: "Other" };
      return map[t] || t;
    },
    statusLabel(s) {
      const map = { open: "Open", under_review: "Under Review", resolved_approved: "Resolved ✓", resolved_rejected: "Resolved ✗", escalated: "Escalated", withdrawn: "Withdrawn" };
      return map[s] || s;
    },
    statusTone(s) {
      if (s === "open") return "warn";
      if (s === "under_review") return "info";
      if (s === "resolved_approved") return "good";
      if (s === "escalated") return "danger";
      if (s === "resolved_rejected") return "neutral";
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

.kpi-strip { display: flex; gap: 1px; background: var(--border-color, #e2e8f0); border-radius: var(--bev-radius-lg, 12px); overflow: hidden; }
.kpi-cell { flex: 1; background: var(--bg-card); padding: 14px 20px; display: flex; flex-direction: column; gap: 4px; }
.kpi-label { font-size: var(--bev-font-size-xs, 11px); font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); }
.kpi-value { font-size: var(--bev-font-size-2xl, 18px); font-weight: 800; color: var(--text-strong); }
.tone-warn .kpi-value { color: var(--bev-color-amber-500, #f59e0b); }
.tone-danger .kpi-value { color: var(--bev-color-red-500, #ef4444); }
.tone-good .kpi-value { color: var(--bev-color-green-600, #059669); }
.tone-info .kpi-value { color: var(--bev-color-blue-500, #0ea5e9); }

.ops-toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.ops-select { height: 36px; border: 1px solid var(--border-color); border-radius: var(--bev-radius-sm, 6px); padding: 0 10px; background: var(--bg-card); color: var(--text-main); font-size: var(--bev-font-size-md, 13px); }
.ops-search { height: 36px; border: 1px solid var(--border-color); border-radius: var(--bev-radius-sm, 6px); padding: 0 12px; background: var(--bg-card); color: var(--text-main); font-size: var(--bev-font-size-md, 13px); min-width: 220px; flex: 1; }
.ops-select:focus, .ops-search:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }

.ops-error { background: var(--bev-color-red-50, #fef2f2); border: 1px solid var(--bev-color-red-100, #fee2e2); color: var(--bev-color-red-600, #dc2626); border-radius: var(--bev-radius-md, 8px); padding: 12px 16px; display: flex; align-items: center; gap: 12px; font-size: 13px; }
.ops-empty { padding: 48px; text-align: center; color: var(--text-muted); font-size: 14px; }
.ops-loading { display: flex; flex-direction: column; gap: 8px; }
.skeleton-row-strip { height: 44px; background: linear-gradient(90deg, var(--bg-card) 25%, var(--bg-page) 50%, var(--bg-card) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: var(--bev-radius-sm, 6px); }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.ops-table-wrap { overflow-x: auto; border-radius: var(--bev-radius-lg, 12px); border: 1px solid var(--border-color); }
.ops-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ops-table thead th { background: var(--bg-page); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); padding: 10px 16px; text-align: left; border-bottom: 1px solid var(--border-color); }
.ops-table tbody tr { border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background .15s; }
.ops-table tbody tr:hover, .ops-table tbody tr.row-selected { background: var(--primary-light, #eff6ff); }
.ops-table td { padding: 11px 16px; color: var(--text-main); vertical-align: middle; }
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
.drawer-note-area { display: flex; flex-direction: column; gap: 8px; margin-top: auto; }

.ops-textarea { width: 100%; border: 1px solid var(--border-color); border-radius: var(--bev-radius-sm); padding: 10px; background: var(--bg-page); color: var(--text-main); font-size: 13px; resize: vertical; font-family: inherit; }
.ops-textarea:focus { outline: none; border-color: var(--primary); }
.ops-input { display: block; width: 100%; height: 36px; border: 1px solid var(--border-color); border-radius: var(--bev-radius-sm); padding: 0 12px; background: var(--bg-page); color: var(--text-main); font-size: 13px; margin-top: 4px; }
.ops-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }

.ops-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 400; display: flex; align-items: center; justify-content: center; }
.ops-modal { background: var(--bg-card); border-radius: var(--bev-radius-xl); padding: 28px; width: 440px; max-width: calc(100vw - 32px); display: flex; flex-direction: column; gap: 16px; }
.ops-modal h2 { font-size: 16px; font-weight: 700; color: var(--text-strong); margin: 0; }
.ops-modal label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 8px; border-top: 1px solid var(--border-color); }

@media (max-width: 768px) {
  .ops-page { padding: 16px; }
  .kpi-strip { flex-wrap: wrap; }
  .kpi-cell { flex: 1 1 calc(50% - 1px); }
  .ops-drawer { width: 100vw; }
  .ops-table thead { display: none; }
  .ops-table tbody tr { display: flex; flex-direction: column; padding: 12px 16px; gap: 6px; }
  .ops-table td { padding: 0; border: none; }
  .action-cell { padding-top: 8px !important; }
}
</style>
