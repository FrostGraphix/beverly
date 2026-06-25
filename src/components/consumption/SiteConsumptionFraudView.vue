<template>
  <div class="fraud-view">
    <div class="view-intro">
      <h3 class="view-title">Loss Risk</h3>
      <p class="view-sub">Commercial shortfall, credits, and flagged accounts.</p>
    </div>

    <div class="fraud-callouts">
      <article class="fraud-callout fraud-callout--danger">
        <span class="fraud-callout-label">Revenue Shortfall</span>
        <strong class="fraud-callout-value">{{ formatMoney(kpiData.revenueShortfall) }}</strong>
      </article>
      <article class="fraud-callout fraud-callout--neutral">
        <span class="fraud-callout-label">Credit Balance</span>
        <strong class="fraud-callout-value">{{ formatMoney(kpiData.creditBalance) }}</strong>
      </article>
      <article class="fraud-callout fraud-callout--warn">
        <span class="fraud-callout-label">High-Risk Accounts</span>
        <strong class="fraud-callout-value">{{ formatCount(kpiData.highRiskCount) }}</strong>
      </article>
    </div>

    <StationSummaryGrid
      :activeStation="activeStation"
      :accountCounts="accountCounts"
      :consumptionStations="chartData.consumption.stationBar"
      :ledger="suspectLedger"
      :salesStations="chartData.sales.stationBar"
      @select-station="$emit('select-station', $event)"
    />

    <div class="fraud-chart-row">
      <StationBarChart
        :data="chartData.sales.stationBar"
        :dateRange="dateRangeLabel"
        :loading="loadingLedger"
        mode="sales"
      />
    </div>

    <SuspectLedger
      :ledger="suspectLedger"
      :loadedCount="ledgerProgress.loaded"
      :loading="loadingLedger"
      :progressLabel="ledgerProgress.label"
      :title="'Risk Investigation'"
      :totalCount="ledgerProgress.total"
      @select="$emit('select', $event)"
    />
  </div>
</template>

<script>
import StationBarChart from "./StationBarChart.vue";
import StationSummaryGrid from "./StationSummaryGrid.vue";
import SuspectLedger from "./SuspectLedger.vue";

export default {
  name: "SiteConsumptionFraudView",
  components: { StationBarChart, StationSummaryGrid, SuspectLedger },
  emits: ["select"],
  props: {
    activeStation: { type: String, default: null },
    accountCounts: { type: Object, default: () => ({}) },
    chartData: { type: Object, required: true },
    dateRangeLabel: { type: String, required: true },
    kpiData: { type: Object, default: () => ({}) },
    ledgerProgress: { type: Object, default: () => ({ loaded: 0, total: 0, label: "" }) },
    loadingLedger: { type: Boolean, default: false },
    suspectLedger: { type: Array, default: () => [] },
  },
  methods: {
    formatCount(value) {
      return Number(value || 0).toLocaleString();
    },
    formatMoney(value) {
      return `N${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    },
  },
};
</script>

<style scoped>
.fraud-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.view-intro {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.view-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-strong);
}

.view-sub {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.fraud-callouts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 900px) {
  .fraud-callouts {
    grid-template-columns: 1fr;
  }
}

.fraud-callout {
  padding: 14px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fraud-callout--danger {
  background: rgba(244, 81, 108, 0.05);
  border-color: rgba(244, 81, 108, 0.18);
}

.fraud-callout--neutral {
  background: rgba(54, 163, 247, 0.05);
  border-color: rgba(54, 163, 247, 0.18);
}

.fraud-callout--warn {
  background: rgba(255, 184, 34, 0.06);
  border-color: rgba(255, 184, 34, 0.2);
}

.fraud-callout-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--text-muted);
}

.fraud-callout-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-strong);
}

.fraud-chart-row {
  display: grid;
  grid-template-columns: 1fr;
}
</style>
