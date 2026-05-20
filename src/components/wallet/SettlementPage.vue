<template>
  <section class="ops-page" aria-label="Settlement">
    <header class="ops-head">
      <div class="ops-head-text">
        <h1>Settlement</h1>
        <p>Generate and settle financial batches</p>
      </div>
      <div class="ops-head-actions">
        <BaseButton @click="load">Refresh</BaseButton>
        <BaseButton variant="primary" :disabled="submitting" @click="runGenerate">Generate Batch</BaseButton>
      </div>
    </header>

    <div class="kpi-strip">
      <div class="kpi-cell">
        <span class="kpi-label">Total Batches</span>
        <span class="kpi-value">{{ summary.totalBatches ?? '—' }}</span>
      </div>
      <div class="kpi-cell tone-warn">
        <span class="kpi-label">Pending</span>
        <span class="kpi-value">{{ summary.pendingBatches ?? '—' }}</span>
      </div>
      <div class="kpi-cell tone-good">
        <span class="kpi-label">Settled</span>
        <span class="kpi-value">{{ summary.settledBatches ?? '—' }}</span>
      </div>
      <div class="kpi-cell tone-danger">
        <span class="kpi-label">Failed</span>
        <span class="kpi-value">{{ summary.failedBatches ?? '—' }}</span>
      </div>
      <div class="kpi-cell tone-good">
        <span class="kpi-label">Total Settled</span>
        <span class="kpi-value kpi-value--sm">{{ formatMoney(summary.totalSettledMinor) }}</span>
      </div>
      <div class="kpi-cell tone-info">
        <span class="kpi-label">Total Funding</span>
        <span class="kpi-value kpi-value--sm">{{ formatMoney(summary.totalFundingMinor) }}</span>
      </div>
    </div>

    <div class="ops-toolbar">
      <BaseSelect v-model="filterStatus" class="ops-select" aria-label="Filter by status" @change="load">
        <option value="">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="processing">Processing</option>
        <option value="settled">Settled</option>
        <option value="failed">Failed</option>
        <option value="cancelled">Cancelled</option>
      </BaseSelect>
      <ExportToolbar :rows="rows" :columns="exportColumns" title="Settlement Report" filename="beverly-settlement" :disabled="!rows.length" />
    </div>

    <div v-if="actionError" class="ops-error" role="alert">{{ actionError }}</div>
    <div v-if="actionSuccess" class="ops-success" role="status">{{ actionSuccess }}</div>

    <div v-if="loading" class="ops-loading">
      <div v-for="n in 4" :key="n" class="skeleton-row-strip"></div>
    </div>

    <div v-else-if="!rows.length" class="ops-empty">No settlement batches found. Generate the first batch.</div>

    <div v-else class="ops-table-wrap">
      <table class="ops-table" aria-label="Settlement batches">
        <thead>
          <tr>
            <th>Batch Ref</th>
            <th>Status</th>
            <th>Purchases</th>
            <th>Funding</th>
            <th>Net</th>
            <th>Orders</th>
            <th>Period</th>
            <th>Settled At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id" :class="{ 'row-selected': selected?.id === row.id }" @click="selected = row">
            <td><code class="mono-id">{{ row.batchRef }}</code></td>
            <td><span :class="['status-pill', statusTone(row.status)]">{{ statusLabel(row.status) }}</span></td>
            <td>{{ formatMoney(row.totalPurchaseMinor) }}</td>
            <td>{{ formatMoney(row.totalFundingMinor) }}</td>
            <td :class="row.netMinor >= 0 ? 'tone-good' : 'tone-danger'">{{ formatMoney(row.netMinor) }}</td>
            <td>{{ row.purchaseCount }}</td>
            <td class="period-cell">{{ formatDate(row.periodEnd) }}</td>
            <td>{{ row.settledAt ? formatDate(row.settledAt) : '—' }}</td>
            <td class="action-cell">
              <BaseButton v-if="row.status === 'pending'" size="sm" variant="primary" :disabled="submitting" @click.stop="runSettle(row)">Settle</BaseButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Batch detail drawer -->
    <aside v-if="selected" class="ops-drawer" aria-label="Batch detail">
      <div class="drawer-head">
        <strong>{{ selected.batchRef }}</strong>
        <BaseButton size="sm" variant="ghost" @click="selected = null">✕</BaseButton>
      </div>
      <dl class="drawer-fields">
        <dt>Status</dt><dd><span :class="['status-pill', statusTone(selected.status)]">{{ statusLabel(selected.status) }}</span></dd>
        <dt>Total Purchase</dt><dd>{{ formatMoney(selected.totalPurchaseMinor) }}</dd>
        <dt>Total Funding</dt><dd>{{ formatMoney(selected.totalFundingMinor) }}</dd>
        <dt>Total Refund</dt><dd>{{ formatMoney(selected.totalRefundMinor) }}</dd>
        <dt>Net</dt><dd :class="selected.netMinor >= 0 ? 'tone-good' : 'tone-danger'">{{ formatMoney(selected.netMinor) }}</dd>
        <dt>Purchase Orders</dt><dd>{{ selected.purchaseCount }}</dd>
        <dt>Funding Items</dt><dd>{{ selected.fundingCount }}</dd>
        <dt>Initiated By</dt><dd>{{ selected.initiatedBy }}</dd>
        <dt>Settled By</dt><dd>{{ selected.settledBy || '—' }}</dd>
        <dt>Created</dt><dd>{{ formatDate(selected.createdAt) }}</dd>
        <dt>Settled At</dt><dd>{{ selected.settledAt ? formatDate(selected.settledAt) : '—' }}</dd>
      </dl>
      <div v-if="selected.status === 'pending'" style="margin-top: auto;">
        <BaseButton variant="primary" style="width:100%;" :disabled="submitting" @click="runSettle(selected)">Settle This Batch</BaseButton>
      </div>
    </aside>
  </section>
</template>

<script>
import BaseButton from "../base/BaseButton.vue";
import BaseSelect from "../base/BaseSelect.vue";
import ExportToolbar from "../base/ExportToolbar.vue";
import { listSettlementBatches, generateSettlementBatch, settleSettlementBatch, settlementSummary, formatMoney } from "../../services/wallet-settlement-service.mjs";

export default {
  name: "SettlementPage",
  components: { BaseButton, BaseSelect, ExportToolbar },
  data() {
    return {
      rows: [],
      summary: {},
      filterStatus: "",
      selected: null,
      loading: false,
      submitting: false,
      actionError: "",
      actionSuccess: ""
    };
  },
  computed: {
    exportColumns() {
      return [
        { key: "batchRef", label: "Batch Ref" },
        { key: "status", label: "Status" },
        { key: "totalPurchaseMinor", label: "Purchases", value: r => formatMoney(r.totalPurchaseMinor) },
        { key: "totalFundingMinor", label: "Funding", value: r => formatMoney(r.totalFundingMinor) },
        { key: "netMinor", label: "Net", value: r => formatMoney(r.netMinor) },
        { key: "purchaseCount", label: "Orders" },
        { key: "periodEnd", label: "Period", value: r => r.periodEnd ? new Date(r.periodEnd).toLocaleDateString() : "" },
        { key: "settledAt", label: "Settled", value: r => r.settledAt ? new Date(r.settledAt).toLocaleDateString() : "" }
      ];
    }
  },
  mounted() { this.load(); },
  methods: {
    async load() {
      this.loading = true;
      this.actionError = "";
      this.actionSuccess = "";
      try {
        const [data, sum] = await Promise.all([
          listSettlementBatches({ status: this.filterStatus || undefined }),
          settlementSummary()
        ]);
        this.rows = Array.isArray(data?.rows) ? data.rows : (Array.isArray(data) ? data : []);
        this.summary = sum || {};
      } catch (e) {
        this.actionError = e?.message || "Failed to load settlements";
      } finally {
        this.loading = false;
      }
    },
    async runGenerate() {
      this.submitting = true;
      this.actionError = "";
      this.actionSuccess = "";
      try {
        const batch = await generateSettlementBatch({ initiatedBy: "staff" });
        this.actionSuccess = `Batch ${batch?.batchRef} generated.`;
        await this.load();
      } catch (e) {
        this.actionError = e?.message || "Generate failed";
      } finally {
        this.submitting = false;
      }
    },
    async runSettle(batch) {
      this.submitting = true;
      this.actionError = "";
      this.actionSuccess = "";
      try {
        await settleSettlementBatch({ batchId: batch.id, actorId: "staff" });
        this.actionSuccess = `Batch ${batch.batchRef} settled.`;
        this.selected = null;
        await this.load();
      } catch (e) {
        this.actionError = e?.message || "Settle failed";
      } finally {
        this.submitting = false;
      }
    },
    formatMoney,
    formatDate(iso) { return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"; },
    statusLabel(s) {
      const map = { pending: "Pending", processing: "Processing", settled: "Settled", failed: "Failed", cancelled: "Cancelled" };
      return map[s] || s;
    },
    statusTone(s) {
      if (s === "settled") return "good";
      if (s === "failed") return "danger";
      if (s === "pending") return "warn";
      if (s === "processing") return "info";
      return "neutral";
    },
    shortId: (id) => String(id || "").slice(0, 8).toUpperCase()
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
.kpi-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); }
.kpi-value { font-size: 18px; font-weight: 800; color: var(--text-strong); }
.kpi-value--sm { font-size: 14px; }
.tone-warn .kpi-value { color: var(--bev-color-amber-500, #f59e0b); }
.tone-danger .kpi-value { color: var(--bev-color-red-500, #ef4444); }
.tone-good .kpi-value { color: var(--bev-color-green-600, #059669); }
.tone-info .kpi-value { color: var(--bev-color-blue-500, #0ea5e9); }

.ops-toolbar { display: flex; gap: 12px; }
.ops-select { height: 36px; border: 1px solid var(--border-color); border-radius: var(--bev-radius-sm, 6px); padding: 0 10px; background: var(--bg-card); color: var(--text-main); font-size: 13px; }
.ops-select:focus { outline: none; border-color: var(--primary); }

.ops-error { background: var(--bev-color-red-50); border: 1px solid var(--bev-color-red-100); color: var(--bev-color-red-600); border-radius: 8px; padding: 12px 16px; font-size: 13px; }
.ops-success { background: var(--bev-color-green-50); border: 1px solid var(--bev-color-green-100); color: var(--bev-color-green-700); border-radius: 8px; padding: 12px 16px; font-size: 13px; }
.ops-empty { padding: 48px; text-align: center; color: var(--text-muted); font-size: 14px; }
.ops-loading { display: flex; flex-direction: column; gap: 8px; }
.skeleton-row-strip { height: 44px; background: linear-gradient(90deg, var(--bg-card) 25%, var(--bg-page) 50%, var(--bg-card) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 6px; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.ops-table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid var(--border-color); }
.ops-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ops-table thead th { background: var(--bg-page); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); padding: 10px 16px; text-align: left; border-bottom: 1px solid var(--border-color); white-space: nowrap; }
.ops-table tbody tr { border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background .15s; }
.ops-table tbody tr:hover, .ops-table tbody tr.row-selected { background: var(--primary-light, #eff6ff); }
.ops-table td { padding: 11px 16px; color: var(--text-main); vertical-align: middle; white-space: nowrap; }
.action-cell { display: flex; gap: 6px; }
.period-cell { max-width: 120px; overflow: hidden; text-overflow: ellipsis; }

.mono-id { font-family: var(--bev-font-mono, monospace); font-size: 11px; background: var(--bg-page); padding: 2px 6px; border-radius: 4px; }
.status-pill { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.status-pill.good { background: var(--bev-color-green-100); color: var(--bev-color-green-700); }
.status-pill.warn { background: var(--bev-color-amber-100); color: #92400e; }
.status-pill.danger { background: var(--bev-color-red-100); color: var(--bev-color-red-600); }
.status-pill.info { background: var(--bev-color-blue-50); color: #0369a1; }
.status-pill.neutral { background: var(--bev-color-slate-100); color: var(--bev-color-slate-700); }
.tone-good { color: var(--bev-color-green-600); font-weight: 700; }
.tone-danger { color: var(--bev-color-red-500); font-weight: 700; }

.ops-drawer { position: fixed; top: 0; right: 0; width: 360px; max-width: 100vw; height: 100vh; background: var(--bg-card); border-left: 1px solid var(--border-color); box-shadow: var(--bev-shadow-xl); padding: 24px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; z-index: 200; }
.drawer-head { display: flex; justify-content: space-between; align-items: center; }
.drawer-fields { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 13px; }
.drawer-fields dt { color: var(--text-muted); font-weight: 700; font-size: 11px; text-transform: uppercase; padding-top: 2px; }
.drawer-fields dd { color: var(--text-main); word-break: break-all; }

@media (max-width: 768px) {
  .ops-page { padding: 16px; }
  .ops-drawer { width: 100vw; }
}
</style>
