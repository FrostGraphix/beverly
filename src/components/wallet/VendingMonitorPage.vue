<template>
  <section class="ops-page" aria-label="Vending Monitor">
    <header class="ops-head">
      <div class="ops-head-text">
        <h1>Vending Monitor</h1>
        <p>Real-time vend order status and delivery tracking</p>
      </div>
      <div class="ops-head-actions">
        <span v-if="autoRefresh" class="refresh-indicator">
          <span class="refresh-dot"></span>Live
        </span>
        <BaseButton :variant="autoRefresh ? 'primary' : 'secondary'" @click="toggleAutoRefresh">
          {{ autoRefresh ? 'Pause' : 'Resume' }} Auto-Refresh
        </BaseButton>
        <BaseButton @click="load">Refresh</BaseButton>
      </div>
    </header>

    <div class="kpi-strip">
      <div class="kpi-cell">
        <span class="kpi-label">Total Orders</span>
        <span class="kpi-value">{{ summary.total ?? '—' }}</span>
      </div>
      <div class="kpi-cell tone-info">
        <span class="kpi-label">Active</span>
        <span class="kpi-value">{{ summary.active ?? '—' }}</span>
      </div>
      <div class="kpi-cell tone-good">
        <span class="kpi-label">Delivered</span>
        <span class="kpi-value">{{ summary.delivered ?? '—' }}</span>
      </div>
      <div class="kpi-cell tone-danger">
        <span class="kpi-label">Failed</span>
        <span class="kpi-value">{{ summary.failed ?? '—' }}</span>
      </div>
      <div class="kpi-cell tone-warn">
        <span class="kpi-label">Pending Review</span>
        <span class="kpi-value">{{ summary.pendingReview ?? '—' }}</span>
      </div>
      <div class="kpi-cell">
        <span class="kpi-label">Today Revenue</span>
        <span class="kpi-value kpi-value--sm">{{ formatMoney(summary.todayRevenueMinor) }}</span>
      </div>
      <div class="kpi-cell">
        <span class="kpi-label">Today Orders</span>
        <span class="kpi-value">{{ summary.todayTotal ?? '—' }}</span>
      </div>
    </div>

    <div class="ops-toolbar">
      <BaseSelect v-model="filterStatus" class="ops-select" aria-label="Filter by status" @change="load">
        <option value="">All Statuses</option>
        <option value="created">Created</option>
        <option value="hold_active">Hold Active</option>
        <option value="dispatching">Dispatching</option>
        <option value="delivered">Delivered</option>
        <option value="delivery_pending_review">Pending Review</option>
        <option value="failed">Failed</option>
        <option value="reversed">Reversed</option>
      </BaseSelect>
      <BaseInput v-model="search" class="ops-search" type="search" placeholder="Search meter, customer…" aria-label="Search vend orders" />
      <ExportToolbar :rows="filteredRows" :columns="exportColumns" title="Vending Monitor Report" filename="beverly-vending-monitor" :disabled="!filteredRows.length" />
      <span class="last-updated">Updated {{ lastUpdated }}</span>
    </div>

    <div v-if="error" class="ops-error" role="alert">{{ error }} <BaseButton size="sm" @click="load">Retry</BaseButton></div>

    <div v-if="loading && !rows.length" class="ops-loading">
      <div v-for="n in 6" :key="n" class="skeleton-row-strip"></div>
    </div>

    <div v-else-if="!filteredRows.length" class="ops-empty">No vend orders found.</div>

    <div v-else class="ops-table-wrap">
      <table class="ops-table" aria-label="Vend orders">
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Mode</th>
            <th>Meter</th>
            <th>Customer</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Organization</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in filteredRows" :key="row.id" :class="{ 'row-selected': selected?.id === row.id }" @click="selected = row">
            <td><code class="mono-id">{{ shortId(row.id) }}</code></td>
            <td><span class="mode-badge">{{ row.mode || '—' }}</span></td>
            <td>{{ row.targetMeter || '—' }}</td>
            <td>{{ row.customerName || '—' }}</td>
            <td>{{ formatMoney(row.amountMinor) }}</td>
            <td><span :class="['status-pill', statusTone(row.status)]">{{ statusLabel(row.status) }}</span></td>
            <td>{{ row.organizationId || '—' }}</td>
            <td>{{ formatDate(row.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Detail drawer -->
    <aside v-if="selected" class="ops-drawer" aria-label="Vend order detail">
      <div class="drawer-head">
        <strong>Order {{ shortId(selected.id) }}</strong>
        <BaseButton size="sm" variant="ghost" @click="selected = null">✕</BaseButton>
      </div>
      <div :class="['status-banner', statusTone(selected.status)]">
        {{ statusLabel(selected.status) }}
      </div>
      <dl class="drawer-fields">
        <dt>Mode</dt><dd>{{ selected.mode || '—' }}</dd>
        <dt>Target Meter</dt><dd>{{ selected.targetMeter || '—' }}</dd>
        <dt>Customer</dt><dd>{{ selected.customerName || '—' }}</dd>
        <dt>Amount</dt><dd>{{ formatMoney(selected.amountMinor) }}</dd>
        <dt>Organization</dt><dd>{{ selected.organizationId || '—' }}</dd>
        <dt>Actor</dt><dd>{{ selected.actorId || '—' }}</dd>
        <dt>Receipt</dt><dd><code class="mono-id">{{ selected.receiptNumber || '—' }}</code></dd>
        <dt>Hold ID</dt><dd><code class="mono-id">{{ shortId(selected.holdId) }}</code></dd>
        <dt>Created</dt><dd>{{ formatDate(selected.createdAt) }}</dd>
        <dt>Updated</dt><dd>{{ formatDate(selected.updatedAt) }}</dd>
      </dl>
    </aside>
  </section>
</template>

<script>
import BaseButton from "../base/BaseButton.vue";
import BaseInput from "../base/BaseInput.vue";
import BaseSelect from "../base/BaseSelect.vue";
import ExportToolbar from "../base/ExportToolbar.vue";
import { vendMonitorSummary, listVendOrders, formatMoney, vendStatusLabel, vendStatusTone } from "../../services/wallet-vending-monitor-service.mjs";

const REFRESH_INTERVAL_MS = 30000;

export default {
  name: "VendingMonitorPage",
  components: { BaseButton, BaseInput, BaseSelect, ExportToolbar },
  data() {
    return {
      rows: [],
      total: 0,
      summary: {},
      filterStatus: "",
      search: "",
      selected: null,
      loading: false,
      error: "",
      autoRefresh: true,
      lastUpdated: "—",
      refreshTimer: null
    };
  },
  computed: {
    filteredRows() {
      const q = this.search.toLowerCase();
      return this.rows.filter(r =>
        !q ||
        (r.targetMeter || "").toLowerCase().includes(q) ||
        (r.customerName || "").toLowerCase().includes(q) ||
        (r.id || "").toLowerCase().includes(q) ||
        (r.organizationId || "").toLowerCase().includes(q)
      );
    },
    exportColumns() {
      return [
        { key: "id", label: "Order ID", value: r => (r.id || "").slice(0, 8).toUpperCase() },
        { key: "mode", label: "Mode" },
        { key: "targetMeter", label: "Meter" },
        { key: "customerName", label: "Customer" },
        { key: "amountMinor", label: "Amount", value: r => formatMoney(r.amountMinor) },
        { key: "status", label: "Status", value: r => vendStatusLabel(r.status) },
        { key: "organizationId", label: "Organization" },
        { key: "createdAt", label: "Created", value: r => r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "" }
      ];
    }
  },
  mounted() {
    this.load();
    this.scheduleRefresh();
  },
  beforeUnmount() {
    this.clearRefresh();
  },
  methods: {
    async load() {
      this.loading = true;
      this.error = "";
      try {
        const [ordersData, sum] = await Promise.all([
          listVendOrders({ status: this.filterStatus || undefined }),
          vendMonitorSummary()
        ]);
        this.rows = Array.isArray(ordersData?.rows) ? ordersData.rows : [];
        this.total = ordersData?.total || this.rows.length;
        this.summary = sum || {};
        this.lastUpdated = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      } catch (e) {
        this.error = e?.message || "Failed to load vend orders";
      } finally {
        this.loading = false;
      }
    },
    scheduleRefresh() {
      this.clearRefresh();
      if (this.autoRefresh) {
        this.refreshTimer = setInterval(() => this.load(), REFRESH_INTERVAL_MS);
      }
    },
    clearRefresh() {
      if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
    },
    toggleAutoRefresh() {
      this.autoRefresh = !this.autoRefresh;
      this.scheduleRefresh();
    },
    formatMoney,
    statusLabel: vendStatusLabel,
    statusTone: vendStatusTone,
    shortId: (id) => String(id || "").slice(0, 8).toUpperCase(),
    formatDate(iso) { return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"; }
  }
};
</script>

<style scoped>
.ops-page { display: flex; flex-direction: column; gap: 20px; padding: 24px; min-height: 100%; }
.ops-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.ops-head-text h1 { font-size: 18px; font-weight: 700; margin: 0 0 4px; color: var(--text-strong); }
.ops-head-text p { font-size: 12px; color: var(--text-muted); margin: 0; }
.ops-head-actions { display: flex; gap: 8px; align-items: center; }

.refresh-indicator { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--bev-color-green-600); }
.refresh-dot { width: 8px; height: 8px; background: var(--bev-color-green-500); border-radius: 50%; animation: pulse 2s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .5; transform: scale(.7); } }

.kpi-strip { display: flex; gap: 1px; background: var(--border-color, #e2e8f0); border-radius: 12px; overflow: hidden; flex-wrap: wrap; }
.kpi-cell { flex: 1; min-width: 90px; background: var(--bg-card); padding: 12px 16px; display: flex; flex-direction: column; gap: 4px; }
.kpi-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); }
.kpi-value { font-size: 20px; font-weight: 800; color: var(--text-strong); }
.kpi-value--sm { font-size: 14px; }
.tone-warn .kpi-value { color: var(--bev-color-amber-500); }
.tone-danger .kpi-value { color: var(--bev-color-red-500); }
.tone-good .kpi-value { color: var(--bev-color-green-600); }
.tone-info .kpi-value { color: var(--bev-color-blue-500); }

.ops-toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.ops-select { height: 36px; border: 1px solid var(--border-color); border-radius: 6px; padding: 0 10px; background: var(--bg-card); color: var(--text-main); font-size: 13px; }
.ops-search { height: 36px; border: 1px solid var(--border-color); border-radius: 6px; padding: 0 12px; background: var(--bg-card); color: var(--text-main); font-size: 13px; min-width: 200px; flex: 1; }
.ops-select:focus, .ops-search:focus { outline: none; border-color: var(--primary); }
.last-updated { font-size: 11px; color: var(--text-muted); white-space: nowrap; margin-left: auto; }

.ops-error { background: var(--bev-color-red-50); border: 1px solid var(--bev-color-red-100); color: var(--bev-color-red-600); border-radius: 8px; padding: 12px 16px; display: flex; align-items: center; gap: 12px; font-size: 13px; }
.ops-empty { padding: 48px; text-align: center; color: var(--text-muted); font-size: 14px; }
.ops-loading { display: flex; flex-direction: column; gap: 8px; }
.skeleton-row-strip { height: 44px; background: linear-gradient(90deg, var(--bg-card) 25%, var(--bg-page) 50%, var(--bg-card) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 6px; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.ops-table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid var(--border-color); }
.ops-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ops-table thead th { background: var(--bg-page); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); padding: 10px 16px; text-align: left; border-bottom: 1px solid var(--border-color); white-space: nowrap; }
.ops-table tbody tr { border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background .15s; }
.ops-table tbody tr:hover, .ops-table tbody tr.row-selected { background: var(--primary-light); }
.ops-table td { padding: 11px 16px; color: var(--text-main); vertical-align: middle; white-space: nowrap; }

.mono-id { font-family: var(--bev-font-mono, monospace); font-size: 11px; background: var(--bg-page); padding: 2px 6px; border-radius: 4px; }
.mode-badge { font-size: 11px; font-weight: 700; text-transform: uppercase; background: var(--bg-page); padding: 3px 8px; border-radius: 4px; color: var(--text-muted); }

.status-pill { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.status-pill.good { background: var(--bev-color-green-100); color: var(--bev-color-green-700); }
.status-pill.warn { background: var(--bev-color-amber-100); color: #92400e; }
.status-pill.danger { background: var(--bev-color-red-100); color: var(--bev-color-red-600); }
.status-pill.info { background: var(--bev-color-blue-50); color: #0369a1; }
.status-pill.neutral { background: var(--bev-color-slate-100); color: var(--bev-color-slate-700); }

.ops-drawer { position: fixed; top: 0; right: 0; width: 360px; max-width: 100vw; height: 100vh; background: var(--bg-card); border-left: 1px solid var(--border-color); box-shadow: var(--bev-shadow-xl); padding: 24px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; z-index: 200; }
.drawer-head { display: flex; justify-content: space-between; align-items: center; }
.status-banner { padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; text-align: center; }
.status-banner.good { background: var(--bev-color-green-100); color: var(--bev-color-green-700); }
.status-banner.warn { background: var(--bev-color-amber-100); color: #92400e; }
.status-banner.danger { background: var(--bev-color-red-100); color: var(--bev-color-red-600); }
.status-banner.info { background: var(--bev-color-blue-50); color: #0369a1; }
.status-banner.neutral { background: var(--bev-color-slate-100); color: var(--bev-color-slate-700); }
.drawer-fields { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 13px; }
.drawer-fields dt { color: var(--text-muted); font-weight: 700; font-size: 11px; text-transform: uppercase; padding-top: 2px; }
.drawer-fields dd { color: var(--text-main); word-break: break-all; }

@media (max-width: 768px) {
  .ops-page { padding: 16px; }
  .kpi-strip { flex-wrap: wrap; }
  .kpi-cell { flex: 1 1 calc(50% - 1px); }
  .ops-drawer { width: 100vw; }
}
</style>
