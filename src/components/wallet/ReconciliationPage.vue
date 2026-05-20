<template>
  <section class="ops-page" aria-label="Reconciliation">
    <header class="ops-head">
      <div class="ops-head-text">
        <h1>Reconciliation</h1>
        <p>Financial reconciliation between ledger and deliveries</p>
      </div>
      <div class="ops-head-actions">
        <BaseButton @click="load">Refresh</BaseButton>
        <BaseButton variant="primary" :disabled="running" @click="runRecon">Run Reconciliation</BaseButton>
        <ExportToolbar :rows="reconciliationExportRows" :columns="exportColumns" title="Reconciliation Report" filename="beverly-reconciliation" :disabled="!Object.keys(summary).length" />
      </div>
    </header>

    <div v-if="error" class="ops-error" role="alert">{{ error }}</div>
    <div v-if="runResult" :class="['ops-run-result', runResult.status === 'balanced' ? 'run-balanced' : 'run-mismatch']" role="status">
      <strong>{{ runResult.status === 'balanced' ? '✓ Balanced' : `⚠ ${runResult.mismatchCount} mismatch(es) found` }}</strong>
      <span>Run ID: {{ shortId(runResult.id) }} · {{ formatDate(runResult.createdAt) }}</span>
    </div>

    <div v-if="loading" class="ops-loading">
      <div v-for="n in 6" :key="n" class="skeleton-kpi"></div>
    </div>

    <template v-else>
      <div class="kpi-grid">
        <div class="kpi-card">
          <span class="kpi-label">Funding Requests</span>
          <span class="kpi-value">{{ summary.fundingRequests ?? '—' }}</span>
        </div>
        <div class="kpi-card tone-warn">
          <span class="kpi-label">Pending Funding</span>
          <span class="kpi-value">{{ summary.pendingFunding ?? '—' }}</span>
        </div>
        <div class="kpi-card tone-good">
          <span class="kpi-label">Approved Funding</span>
          <span class="kpi-value kpi-value--sm">{{ formatMoney(summary.approvedFundingMinor) }}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Purchase Orders</span>
          <span class="kpi-value">{{ summary.purchaseOrders ?? '—' }}</span>
        </div>
        <div class="kpi-card tone-good">
          <span class="kpi-label">Delivered Value</span>
          <span class="kpi-value kpi-value--sm">{{ formatMoney(summary.deliveredPurchaseMinor) }}</span>
        </div>
        <div class="kpi-card tone-danger">
          <span class="kpi-label">Failed Purchases</span>
          <span class="kpi-value">{{ summary.failedPurchases ?? '—' }}</span>
        </div>
        <div class="kpi-card tone-warn">
          <span class="kpi-label">Pending Deliveries</span>
          <span class="kpi-value">{{ summary.pendingDeliveries ?? '—' }}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Manual Credit Requests</span>
          <span class="kpi-value">{{ summary.manualCreditRequests ?? '—' }}</span>
        </div>
        <div class="kpi-card tone-info">
          <span class="kpi-label">Pending Manual Credits</span>
          <span class="kpi-value">{{ summary.pendingManualCredits ?? '—' }}</span>
        </div>
      </div>

      <div class="recon-health-panel">
        <div class="health-header">
          <h2>Balance Health</h2>
          <span :class="['health-badge', balanceHealthTone]">{{ balanceHealthLabel }}</span>
        </div>
        <div class="health-row">
          <span class="health-label">Total Approved Funding</span>
          <span class="health-value">{{ formatMoney(summary.approvedFundingMinor) }}</span>
        </div>
        <div class="health-row">
          <span class="health-label">Total Delivered Purchases</span>
          <span class="health-value">{{ formatMoney(summary.deliveredPurchaseMinor) }}</span>
        </div>
        <div class="health-divider"></div>
        <div class="health-row health-row--net">
          <span class="health-label">Net Balance</span>
          <span :class="['health-value', netMinor >= 0 ? 'tone-good' : 'tone-danger']">{{ formatMoney(netMinor) }}</span>
        </div>
      </div>

      <div class="recon-actions-panel">
        <h2>Quick Actions</h2>
        <div class="recon-action-grid">
          <a href="#/wallet/funding" class="recon-action-card">
            <span class="recon-action-icon">💰</span>
            <span class="recon-action-label">Review Funding Queue</span>
            <span class="recon-action-count" v-if="summary.pendingFunding">{{ summary.pendingFunding }} pending</span>
          </a>
          <a href="#/wallet/vending-monitor" class="recon-action-card">
            <span class="recon-action-icon">📡</span>
            <span class="recon-action-label">Vending Monitor</span>
            <span class="recon-action-count" v-if="summary.pendingDeliveries">{{ summary.pendingDeliveries }} pending</span>
          </a>
          <a href="#/wallet/settlement" class="recon-action-card">
            <span class="recon-action-icon">📋</span>
            <span class="recon-action-label">Settlement Batches</span>
          </a>
          <a href="#/wallet/disputes" class="recon-action-card">
            <span class="recon-action-icon">⚖️</span>
            <span class="recon-action-label">Open Disputes</span>
          </a>
        </div>
      </div>
    </template>
  </section>
</template>

<script>
import BaseButton from "../base/BaseButton.vue";
import ExportToolbar from "../base/ExportToolbar.vue";
import { postApi } from "../../services/api.js";

function formatMoney(amountMinor = 0) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 })
    .format(Number(amountMinor || 0) / 100);
}

export default {
  name: "ReconciliationPage",
  components: { BaseButton, ExportToolbar },
  data() {
    return {
      summary: {},
      runResult: null,
      loading: false,
      running: false,
      error: ""
    };
  },
  computed: {
    netMinor() {
      return Number(this.summary.approvedFundingMinor || 0) - Number(this.summary.deliveredPurchaseMinor || 0);
    },
    balanceHealthTone() {
      if (this.summary.failedPurchases > 0 || this.summary.pendingDeliveries > 0) return "warn";
      if (this.netMinor < 0) return "danger";
      return "good";
    },
    balanceHealthLabel() {
      if (this.netMinor < 0) return "Deficit";
      if (this.summary.failedPurchases > 0) return "Needs Review";
      if (this.summary.pendingDeliveries > 0) return "Pending Deliveries";
      return "Balanced";
    },
    reconciliationExportRows() {
      return Object.keys(this.summary).length ? [this.summary] : [];
    },
    exportColumns() {
      return [
        { key: "fundingRequests", label: "Funding Requests" },
        { key: "pendingFunding", label: "Pending Funding" },
        { key: "approvedFundingMinor", label: "Approved Funding", value: r => formatMoney(r.approvedFundingMinor) },
        { key: "purchaseOrders", label: "Purchase Orders" },
        { key: "deliveredPurchaseMinor", label: "Delivered Value", value: r => formatMoney(r.deliveredPurchaseMinor) },
        { key: "failedPurchases", label: "Failed Purchases" },
        { key: "pendingDeliveries", label: "Pending Deliveries" },
        { key: "manualCreditRequests", label: "Manual Credits" }
      ];
    }
  },
  mounted() { this.load(); },
  methods: {
    async load() {
      this.loading = true;
      this.error = "";
      try {
        const res = await postApi("/api/wallet/reconciliation/report", {});
        this.summary = res.data || {};
      } catch (e) {
        this.error = e?.message || "Failed to load reconciliation data";
      } finally {
        this.loading = false;
      }
    },
    async runRecon() {
      this.running = true;
      this.error = "";
      this.runResult = null;
      try {
        const res = await postApi("/api/wallet/reconciliation/run", {});
        this.runResult = res.data || null;
        await this.load();
      } catch (e) {
        this.error = e?.message || "Reconciliation run failed";
      } finally {
        this.running = false;
      }
    },
    formatMoney,
    shortId: (id) => String(id || "").slice(0, 8).toUpperCase(),
    formatDate(iso) { return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"; }
  }
};
</script>

<style scoped>
.ops-page { display: flex; flex-direction: column; gap: 24px; padding: 24px; min-height: 100%; }
.ops-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.ops-head-text h1 { font-size: 18px; font-weight: 700; margin: 0 0 4px; color: var(--text-strong); }
.ops-head-text p { font-size: 12px; color: var(--text-muted); margin: 0; }
.ops-head-actions { display: flex; gap: 8px; }

.ops-error { background: var(--bev-color-red-50); border: 1px solid var(--bev-color-red-100); color: var(--bev-color-red-600); border-radius: 8px; padding: 12px 16px; font-size: 13px; }
.ops-run-result { border-radius: 8px; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; gap: 16px; font-size: 13px; }
.run-balanced { background: var(--bev-color-green-50); border: 1px solid var(--bev-color-green-100); color: var(--bev-color-green-700); }
.run-mismatch { background: var(--bev-color-amber-50); border: 1px solid var(--bev-color-amber-100); color: #92400e; }
.run-mismatch strong, .run-balanced strong { font-size: 14px; }

.ops-loading { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.skeleton-kpi { height: 80px; background: linear-gradient(90deg, var(--bg-card) 25%, var(--bg-page) 50%, var(--bg-card) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 12px; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.kpi-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px 20px; display: flex; flex-direction: column; gap: 6px; }
.kpi-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); }
.kpi-value { font-size: 22px; font-weight: 800; color: var(--text-strong); }
.kpi-value--sm { font-size: 16px; }
.tone-warn .kpi-value { color: var(--bev-color-amber-500); }
.tone-danger .kpi-value { color: var(--bev-color-red-500); }
.tone-good .kpi-value { color: var(--bev-color-green-600); }
.tone-info .kpi-value { color: var(--bev-color-blue-500); }

.recon-health-panel { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px 24px; display: flex; flex-direction: column; gap: 12px; }
.health-header { display: flex; justify-content: space-between; align-items: center; }
.health-header h2 { font-size: 14px; font-weight: 700; color: var(--text-strong); margin: 0; }
.health-badge { padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
.health-badge.good { background: var(--bev-color-green-100); color: var(--bev-color-green-700); }
.health-badge.warn { background: var(--bev-color-amber-100); color: #92400e; }
.health-badge.danger { background: var(--bev-color-red-100); color: var(--bev-color-red-600); }
.health-row { display: flex; justify-content: space-between; font-size: 13px; padding: 6px 0; }
.health-row--net { font-weight: 700; }
.health-label { color: var(--text-muted); }
.health-value { font-weight: 600; color: var(--text-main); }
.health-divider { border-top: 1px solid var(--border-color); margin: 4px 0; }
.tone-good { color: var(--bev-color-green-600) !important; }
.tone-danger { color: var(--bev-color-red-500) !important; }

.recon-actions-panel { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px 24px; }
.recon-actions-panel h2 { font-size: 14px; font-weight: 700; color: var(--text-strong); margin: 0 0 16px; }
.recon-action-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.recon-action-card { display: flex; flex-direction: column; gap: 6px; padding: 16px; background: var(--bg-page); border: 1px solid var(--border-color); border-radius: 10px; text-decoration: none; transition: border-color .15s, box-shadow .15s; }
.recon-action-card:hover { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }
.recon-action-icon { font-size: 22px; }
.recon-action-label { font-size: 13px; font-weight: 700; color: var(--text-strong); }
.recon-action-count { font-size: 11px; color: var(--bev-color-amber-500); font-weight: 700; }

@media (max-width: 900px) {
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .recon-action-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  .ops-page { padding: 16px; }
  .kpi-grid { grid-template-columns: 1fr 1fr; }
}
</style>
