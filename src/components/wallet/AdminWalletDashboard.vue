<template>
  <section class="page-stack">
    <div class="kpi-grid kpi-grid--six">
      <WalletKpiCard
        v-for="card in dashboardKpis"
        :key="card.id"
        :label="card.label"
        :value="card.value"
        :tone="card.tone"
        :note="card.note"
        :active="activeDashboardKpi === card.id"
        :metric="card.metric"
        :action="card.action"
        @select="selectDashboardKpi(card.id)"
      />
    </div>
    <article class="panel kpi-drilldown" aria-live="polite">
      <div>
        <span :class="['status-pill', activeDashboardKpiDetail.tone]">{{ activeDashboardKpiDetail.label }}</span>
        <h2>{{ activeDashboardKpiDetail.headline }}</h2>
        <p>{{ activeDashboardKpiDetail.insight }}</p>
      </div>
      <div class="drilldown-meter">
        <span>Signal</span>
        <b>{{ activeDashboardKpiDetail.signal }}</b>
        <small>{{ activeDashboardKpiDetail.window }}</small>
      </div>
      <a class="primary-button" :href="activeDashboardKpiDetail.hash">{{ activeDashboardKpiDetail.action }}</a>
    </article>
    <div class="dashboard-grid">
      <article class="panel trend-panel">
        <div class="panel-head">
          <h2>{{ activeDashboardKpiDetail.chartTitle }}</h2>
          <BaseSelect v-model="chartMode" class="mini-select"><option>Daily</option><option>Weekly</option></BaseSelect>
        </div>
        <EChartPanel :option="walletTrendOption" />
      </article>
      <article class="panel operational-queues-panel">
        <div class="panel-head">
          <div>
            <h2>Operational Queues</h2>
            <p>Awaiting staff action</p>
          </div>
          <a href="#/wallet/admin/funding-credits">View all</a>
        </div>
        <a v-for="queue in operationalQueues" :key="queue.label" :href="queue.hash" :class="['queue-card', queue.tone]">
          <span class="queue-icon">{{ queue.icon }}</span>
          <span>
            <strong>{{ queue.label }}</strong>
            <small>{{ queue.copy }}</small>
          </span>
          <b>{{ queue.countLabel }}</b>
        </a>
      </article>
      <article class="panel alerts-panel">
        <div class="panel-head"><h2>Alerts</h2><a href="#/wallet/admin/exceptions">View all</a></div>
        <div v-for="alert in walletAlerts" :key="alert.title" :class="['alert-row', alert.tone]">
          <strong>{{ alert.title }}</strong>
          <span>{{ alert.copy }}</span>
          <small>{{ alert.time }}</small>
        </div>
      </article>
    </div>
    <div class="operations-grid">
      <article class="panel live-pulse-panel">
        <div class="panel-head">
          <div>
            <h2>Live Pulse <span class="status-pill good">Live</span></h2>
            <p>Last 60 seconds</p>
          </div>
        </div>
        <div v-for="pulse in livePulse" :key="pulse.time + pulse.vendor" class="pulse-row">
          <code>{{ pulse.time }}</code>
          <span :class="['activity-type-pill', pulse.tone]">{{ pulse.type }}</span>
          <strong>{{ pulse.vendor }}</strong>
          <span>{{ pulse.detail }}</span>
          <b>{{ pulse.amount }}</b>
        </div>
      </article>
      <article class="panel top-vendors-panel">
        <div class="panel-head">
          <div><h2>Top Vendors · 7D</h2><p>By vending volume</p></div>
        </div>
        <div v-for="vendor in topVendors" :key="vendor.name" class="top-vendor-row">
          <span>{{ vendor.rank }}</span>
          <div>
            <strong>{{ vendor.name }} <em>{{ vendor.delta }}</em></strong>
            <i><b :style="{ width: vendor.width }"></b></i>
          </div>
          <div><strong>{{ vendor.amount }}</strong><small>{{ vendor.tx }} tx</small></div>
        </div>
      </article>
      <article class="panel attention-panel">
        <div class="panel-head">
          <div><h2>Needs Attention</h2><p>Critical & high-priority items</p></div>
          <span class="status-pill danger">5 active</span>
        </div>
        <div v-for="item in attentionItems" :key="item.title" :class="['attention-row', item.tone]">
          <div><strong>{{ item.title }}</strong><small>{{ item.copy }}</small></div>
          <a :href="item.hash">{{ item.action }}</a>
        </div>
      </article>
    </div>
    <article class="panel recent-activity-panel">
      <div class="panel-head">
        <div>
          <h2>Recent Activity</h2>
          <p>All wallet actions in the last hour · auto-refresh</p>
        </div>
        <BaseButton class="quiet-button" @click="showActivityFilters = !showActivityFilters">Filters</BaseButton>
      </div>
      <div class="activity-toolbar">
        <div class="activity-tabs" role="tablist" aria-label="Recent activity types">
          <BaseButton
            v-for="tab in recentActivityTabs"
            :key="tab.id"
            :class="['activity-tab', activeActivityType === tab.id ? 'active' : '']"
            @click="selectActivityTab(tab.id)"
          >
            {{ tab.label }} <b>{{ tab.count }}</b>
          </BaseButton>
        </div>
        <div :class="['activity-filters', showActivityFilters ? 'open' : '']">
          <BaseSelect v-model="activityStationFilter" class="mini-select" @change="recentActivityPage = 1">
            <option value="">All Stations</option>
            <option v-for="station in activityStations" :key="station">{{ station }}</option>
          </BaseSelect>
          <BaseSelect v-model="activityDateFilter" class="mini-select" @change="recentActivityPage = 1">
            <option>Today</option><option>Last 7 Days</option><option>This Month</option>
          </BaseSelect>
        </div>
      </div>
      <div class="activity-table-wrap">
        <table class="activity-table">
          <thead>
            <tr>
              <th>Reference</th><th>Vendor</th><th>Type</th><th>Customer / Meter</th>
              <th>Station</th><th>Amount</th><th>Units</th><th>Status</th><th>Time</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in pagedRecentActivities" :key="row.reference" @click="openAudit(row)">
              <td><code>{{ row.reference }}</code></td>
              <td>
                <div class="activity-vendor">
                  <span>{{ row.vendorInitials }}</span>
                  <strong>{{ row.vendor }}</strong>
                  <small>{{ row.vendorCode }} · {{ row.tier }}</small>
                </div>
              </td>
              <td><span :class="['activity-type-pill', row.typeTone]">{{ row.type }}</span></td>
              <td>{{ row.customer || "—" }}</td>
              <td>{{ row.station || "—" }}</td>
              <td><strong>{{ row.amount }}</strong></td>
              <td>{{ row.units || "—" }}</td>
              <td><span :class="['status-pill', row.statusTone]">{{ row.status }}</span></td>
              <td>{{ row.time }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="activity-footer">
        <span>Showing <b>{{ pagedRecentActivities.length }}</b> of <b>{{ filteredRecentActivities.length }}</b> activities</span>
        <div class="activity-pages">
          <BaseButton class="page-chip" :disabled="recentActivityPage === 1" @click="recentActivityPage -= 1">&#8249;</BaseButton>
          <BaseButton
            v-for="page in recentActivityPages"
            :key="page"
            :class="['page-chip', recentActivityPage === page ? 'active' : '']"
            @click="recentActivityPage = page"
          >{{ page }}</BaseButton>
          <BaseButton class="page-chip" :disabled="recentActivityPage === recentActivityPageCount" @click="recentActivityPage += 1">&#8250;</BaseButton>
        </div>
      </div>
    </article>
  </section>
</template>

<script>
import BaseButton from "../base/BaseButton.vue";
import BaseSelect from "../base/BaseSelect.vue";
import EChartPanel from "../EChartPanel.vue";
import WalletKpiCard from "./WalletKpiCard.vue";
import { createBarOption, dashboardSeries } from "../../services/dashboard-chart-options.mjs";
import { loadDynamicStationOptions, tableSiteOptions } from "../../services/table-service.js";

export default {
  name: "AdminWalletDashboard",
  components: { BaseButton, BaseSelect, EChartPanel, WalletKpiCard },
  props: {
    query: { type: String, default: "" }
  },
  emits: ["audit"],
  mounted() {
    loadDynamicStationOptions(undefined, true).catch(() => null);
  },
  data() {
    return {
      chartMode: "Daily",
      activeDashboardKpi: "purchases",
      activeActivityType: "all",
      activityStationFilter: "",
      activityDateFilter: "Today",
      showActivityFilters: false,
      recentActivityPage: 1,
      recentActivityPageSize: 8,
      recentActivities: [
        { reference: "#PO-99842", vendor: "Sahara Power", vendorInitials: "SP", vendorCode: "VND-0042", tier: "Tier 2", type: "Token Buy", kind: "purchases", typeTone: "good", customer: "Cust 8842 · MTR-44120", station: "TUNGA", amount: "NGN 5,000", units: "14.3 kWh", status: "Delivered", statusTone: "good", time: "14:38" },
        { reference: "#FR-12044", vendor: "Nasarawa Retail", vendorInitials: "NR", vendorCode: "VND-0118", tier: "Tier 1", type: "Funding", kind: "funding", typeTone: "info", customer: "", station: "", amount: "NGN 250,000", units: "", status: "Pending Review", statusTone: "warn", time: "14:38" },
        { reference: "#PO-99841", vendor: "Lokoja Vending", vendorInitials: "LV", vendorCode: "VND-0019", tier: "Tier 3", type: "Token Buy", kind: "purchases", typeTone: "good", customer: "Cust 2014 · MTR-77291", station: "UMAISHA", amount: "NGN 12,500", units: "35.7 kWh", status: "Delivered", statusTone: "good", time: "14:38" },
        { reference: "#PO-99839", vendor: "Greenline Power", vendorInitials: "GP", vendorCode: "VND-0067", tier: "Tier 2", type: "Remote Send", kind: "purchases", typeTone: "good", customer: "Cust 5538 · MTR-30418", station: "OGUFA", amount: "NGN 3,200", units: "9.1 kWh", status: "Dispatching", statusTone: "info", time: "14:38" },
        { reference: "#PO-99836", vendor: "Beverly Direct", vendorInitials: "BD", vendorCode: "VND-0211", tier: "Tier 1", type: "Token Buy", kind: "failed", typeTone: "good", customer: "Cust 0091 · MTR-91102", station: "KYAKALE", amount: "NGN 8,000", units: "22.9 kWh", status: "Failed", statusTone: "danger", time: "14:38" },
        { reference: "#RV-00128", vendor: "Sahara Power", vendorInitials: "SP", vendorCode: "VND-0042", tier: "Tier 2", type: "Reversal", kind: "reversals", typeTone: "warn", customer: "Ref #PO-99427", station: "TUNGA", amount: "NGN 4,500", units: "", status: "Processed", statusTone: "good", time: "14:38" },
        { reference: "#PO-99834", vendor: "Energy Hub Abuja", vendorInitials: "EH", vendorCode: "VND-0083", tier: "Tier 3", type: "Token Buy", kind: "purchases", typeTone: "good", customer: "Cust 4421 · MTR-58804", station: "MUSHA", amount: "NGN 7,800", units: "22.3 kWh", status: "Delivered", statusTone: "good", time: "14:37" },
        { reference: "#PO-99832", vendor: "Lokoja Vending", vendorInitials: "LV", vendorCode: "VND-0019", tier: "Tier 3", type: "Token Buy", kind: "purchases", typeTone: "good", customer: "Cust 1196 · MTR-77443", station: "UMAISHA", amount: "NGN 2,500", units: "7.1 kWh", status: "Delivered", statusTone: "good", time: "14:37" },
        { reference: "#DP-00073", vendor: "Metro Vending", vendorInitials: "MV", vendorCode: "VND-0881", tier: "Tier 2", type: "Dispute", kind: "disputes", typeTone: "danger", customer: "Cust 5510 · MTR-12003", station: "KARU", amount: "NGN 6,000", units: "", status: "Open", statusTone: "danger", time: "14:36" },
        { reference: "#PO-99830", vendor: "Central Vend", vendorInitials: "CV", vendorCode: "VND-0104", tier: "Tier 1", type: "Token Buy", kind: "purchases", typeTone: "good", customer: "Cust 7751 · MTR-30114", station: "TUNGA", amount: "NGN 10,000", units: "28.6 kWh", status: "Delivered", statusTone: "good", time: "14:35" }
      ]
    };
  },
  computed: {
    dashboardKpis() {
      return [
        { id: "vendors", label: "Total Vendors", value: "1,248", tone: "good", note: "+12.4% vs last week", metric: "142 verified this week", action: "Open vendor map", hash: "#/wallet/admin/vendors", headline: "Vendor growth is healthy.", insight: "Verified vendors are compounding faster than pending reviews. Keep the review queue below 200 to protect onboarding speed.", signal: "94%", window: "7 day activation", chartTitle: "Vendor Activation Trend", series: [18, 24, 31, 36, 44, 51, 59, 66, 74, 83] },
        { id: "wallets", label: "Active Wallets", value: "98,765", tone: "good", note: "+8.7% this month", metric: "4 frozen escapes", action: "Inspect wallets", hash: "#/wallet/admin/all-wallets", headline: "Wallet coverage is strong.", insight: "Active wallets are expanding while freezes contract. The next move is reducing dormant float drift.", signal: "98K", window: "Live wallets", chartTitle: "Active Wallet Trend", series: [28, 34, 38, 43, 49, 55, 61, 67, 73, 79] },
        { id: "funding", label: "Pending Funding", value: "NGN 3.84M", tone: "warn", note: "253 approval items", metric: "87 manual credits", action: "Clear queue", hash: "#/wallet/admin/funding-credits", headline: "Funding queue needs action.", insight: "Pending value is concentrated in bank-transfer proof checks. Prioritize large approvals first.", signal: "253", window: "Approval items", chartTitle: "Funding Approval Load", series: [35, 29, 41, 55, 49, 62, 58, 71, 76, 69] },
        { id: "purchases", label: "Today's Purchases", value: "NGN 12.74M", tone: "good", note: "47 successful vends", metric: "20-digit + remote", action: "Monitor vends", hash: "#/wallet/admin/purchase-monitor", headline: "Vending volume is moving.", insight: "Purchase value is strong and delivery completion remains clean. Watch remote-send latency during peak hours.", signal: "47", window: "Successful vends", chartTitle: "Purchase Velocity Trend", series: [22, 31, 26, 49, 42, 56, 47, 44, 54, 68] },
        { id: "frozen", label: "Frozen Wallets", value: "312", tone: "info", note: "4.1% reduction", metric: "80 frozen vendors", action: "Review freezes", hash: "#/wallet/admin/all-wallets", headline: "Freeze posture is improving.", insight: "Frozen exposure is dropping. Keep reviewing stale freezes so safe vendors return to revenue faster.", signal: "-4.1%", window: "Weekly reduction", chartTitle: "Frozen Wallet Reduction", series: [79, 74, 72, 68, 64, 59, 55, 50, 47, 43] },
        { id: "failed", label: "Failed Transactions", value: "1,274", tone: "danger", note: "needs review", metric: "23 disputes linked", action: "Triage failures", hash: "#/wallet/admin/exceptions", headline: "Failures need triage.", insight: "Failure volume is elevated enough to treat as an operations lane, not a passive alert.", signal: "1,274", window: "Open failures", chartTitle: "Failure Pressure Trend", series: [16, 19, 22, 28, 31, 37, 44, 42, 49, 56] }
      ];
    },
    activeDashboardKpiDetail() { return this.dashboardKpis.find(c => c.id === this.activeDashboardKpi) || this.dashboardKpis[0]; },
    trendPoints() {
      if (this.chartMode === "Daily") return this.activeDashboardKpiDetail.series;
      return this.activeDashboardKpiDetail.series.filter((_, i) => i % 2 === 0).map((p, i) => p + i * 4);
    },
    trendLabels() {
      return this.chartMode === "Daily"
        ? ["May 15", "May 16", "May 17", "May 18", "May 19", "May 20", "May 21", "May 22", "May 23", "May 24"]
        : ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6"];
    },
    walletChartTheme() {
      return { primary: "var(--primary)", primaryDeep: "var(--primary-deep)", primaryLight: "var(--primary-light)", success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)", textMuted: "var(--text-muted)", textFaint: "var(--text-faint)", border: "var(--border-color)", surface: "var(--bg-card)", tooltip: "var(--bg-card)", tooltipText: "var(--text-strong)" };
    },
    walletTrendOption() { return createBarOption(dashboardSeries(this.trendLabels, this.trendPoints), this.activeDashboardKpiDetail.chartTitle, this.walletChartTheme); },
    operationalQueues() {
      return [
        { label: "Funding Approvals", count: 23, countLabel: "23", tone: "warn", icon: "$", copy: "3 over SLA · oldest 6h 12m", hash: "#/wallet/admin/funding-credits" },
        { label: "Vendor Verifications", count: 7, countLabel: "07", tone: "info", icon: "✓", copy: "7 pending · 2 need docs", hash: "#/wallet/admin/verification" },
        { label: "Exceptions", count: 5, countLabel: "05", tone: "danger", icon: "!", copy: "5 active · 1 critical", hash: "#/wallet/admin/exceptions" },
        { label: "Reversal Requests", count: 2, countLabel: "02", tone: "good", icon: "↻", copy: "2 ready to process", hash: "#/wallet/admin/reversals" },
        { label: "Open Disputes", count: 5, countLabel: "05", tone: "warn", icon: "⌕", copy: "4 vendor · 1 customer", hash: "#/wallet/admin/disputes" }
      ];
    },
    walletAlerts() {
      return [
        { title: "High failure rate detected", copy: "1,274 failures in selected period.", time: "10m ago", tone: "danger" },
        { title: "KYC verification pending", copy: "132 vendors awaiting verification.", time: "25m ago", tone: "warn" },
        { title: "Large pending funding", copy: "NGN 3.84M awaiting approval.", time: "35m ago", tone: "good" },
        { title: "Settlement window open", copy: "May 2026 settlement is active.", time: "1h ago", tone: "info" }
      ];
    },
    livePulse() {
      return [
        { time: "14:29:39", type: "Fund", tone: "info", vendor: "Greenline", detail: "bank transfer", amount: "NGN 1,000,000" },
        { time: "14:29:37", type: "Buy", tone: "good", vendor: "Beverly Direct", detail: "Cust 4846 · token", amount: "NGN 9,000" },
        { time: "14:29:34", type: "Fund", tone: "info", vendor: "Greenline", detail: "bank transfer", amount: "NGN 100,000" },
        { time: "14:29:32", type: "Buy", tone: "good", vendor: "Nasarawa Retail", detail: "Cust 1292 · remote", amount: "NGN 9,000" },
        { time: "14:29:30", type: "Buy", tone: "good", vendor: "Sahara Power", detail: "Cust 7843 · TUNGA", amount: "NGN 800" },
        { time: "14:29:25", type: "Buy", tone: "good", vendor: "Nasarawa Retail", detail: "Cust 7966", amount: "NGN 2,000" },
        { time: "14:29:18", type: "Fund", tone: "info", vendor: "Beverly Direct", detail: "bank transfer", amount: "NGN 250,000" }
      ];
    },
    topVendors() {
      return [
        { rank: "01", name: "Sahara Power Co.", delta: "+18%", amount: "NGN 18.4M", tx: "1,204", width: "98%" },
        { rank: "02", name: "Lokoja Vending Hub", delta: "+12%", amount: "NGN 15.5M", tx: "987", width: "82%" },
        { rank: "03", name: "Energy Hub Abuja", delta: "+9%", amount: "NGN 12.3M", tx: "812", width: "66%" },
        { rank: "04", name: "Greenline Power Ltd.", delta: "+6%", amount: "NGN 9.6M", tx: "645", width: "52%" },
        { rank: "05", name: "Nasarawa Retail", delta: "+4%", amount: "NGN 7.6M", tx: "510", width: "41%" },
        { rank: "06", name: "Beverly Direct", delta: "+2%", amount: "NGN 6.1M", tx: "402", width: "33%" }
      ];
    },
    attentionItems() {
      return [
        { title: "Wallet held — anomalous velocity", copy: "Beverly Direct (Kogi) · 42 tx in 5 min · risk 91", action: "Review", tone: "danger", hash: "#/wallet/admin/exceptions" },
        { title: "Stuck remote-send · 3 tokens", copy: "KYAKALE meter cluster · pending 2h 14m", action: "Retry", tone: "warn", hash: "#/wallet/admin/purchase-monitor" },
        { title: "Ledger drift on 02:00 batch", copy: "Energy Hub Abuja · +NGN 12,420 unreconciled", action: "Trace", tone: "warn", hash: "#/wallet/admin/reversals" },
        { title: "Funding proof flagged", copy: "Nasarawa Retail · duplicate hash · NGN 180K", action: "Open", tone: "info", hash: "#/wallet/admin/funding-credits" },
        { title: "Customer dispute escalated", copy: "#DSP-3318 · token not received · 24h old", action: "Open", tone: "info", hash: "#/wallet/admin/disputes" }
      ];
    },
    recentActivityTabs() {
      const count = (kind) => (kind === "all" ? this.recentActivities : this.recentActivities.filter(r => r.kind === kind)).length;
      return [
        { id: "all", label: "All", count: count("all") },
        { id: "purchases", label: "Purchases", count: count("purchases") },
        { id: "funding", label: "Funding", count: count("funding") },
        { id: "reversals", label: "Reversals", count: count("reversals") },
        { id: "disputes", label: "Disputes", count: count("disputes") },
        { id: "failed", label: "Failed", count: count("failed") }
      ];
    },
    activityStations() {
      const activitySet = this.recentActivities.map((r) => r.station).filter(Boolean);
      const dynamicSet = tableSiteOptions.map((s) => s.value).filter(Boolean);
      return Array.from(new Set([...activitySet, ...dynamicSet])).sort();
    },
    filteredRecentActivities() {
      return this.recentActivities.filter(row => {
        const matchesType = this.activeActivityType === "all" || row.kind === this.activeActivityType;
        const matchesStation = !this.activityStationFilter || row.station === this.activityStationFilter;
        const q = this.query;
        const matchesQuery = !q || JSON.stringify(row).toLowerCase().includes(q);
        return matchesType && matchesStation && matchesQuery;
      });
    },
    recentActivityPageCount() { return Math.max(1, Math.ceil(this.filteredRecentActivities.length / this.recentActivityPageSize)); },
    recentActivityPages() { return Array.from({ length: this.recentActivityPageCount }, (_, i) => i + 1).slice(0, 5); },
    pagedRecentActivities() {
      const safePage = Math.min(this.recentActivityPage, this.recentActivityPageCount);
      const start = (safePage - 1) * this.recentActivityPageSize;
      return this.filteredRecentActivities.slice(start, start + this.recentActivityPageSize);
    }
  },
  methods: {
    selectActivityTab(id) { this.activeActivityType = id; this.recentActivityPage = 1; },
    selectDashboardKpi(id) {
      this.activeDashboardKpi = id;
      const activityMap = { purchases: "purchases", funding: "funding", failed: "failed" };
      this.activeActivityType = activityMap[id] || "all";
      this.recentActivityPage = 1;
      const card = this.activeDashboardKpiDetail;
      this.$emit("audit", { time: "13 May 10:29:00", actor: "admin", role: "super-admin", event: `dashboard_kpi_${id}_focused`, target: card.label, ip: "local" });
    },
    openAudit(row) {
      this.$emit("audit", { time: "13 May 10:39:00", actor: "admin", role: "super-admin", event: "viewed_record", target: row.reference || row.id || row.ref, ip: "local" });
    }
  }
};
</script>
