<template>
  <div class="overview-view">
    <KpiCardGrid :kpi="kpiData" :loading="loadingSales" />

    <div class="insight-banner">
      <span class="insight-banner-label">Key insight</span>
      <strong class="insight-banner-text">{{ insightText }}</strong>
    </div>

    <div v-if="showSalesEmpty" class="eih-no-data eih-no-data--amber">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
      <span>No sales were recorded for this period.</span>
    </div>

    <div v-if="showConsumptionEmpty" class="eih-no-data eih-no-data--blue">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
      <span>No meter readings were captured for this period.</span>
    </div>

    <StationSummaryGrid
      :activeStation="activeStation"
      :accountCounts="accountCounts"
      :consumptionStations="chartData.consumption.stationBar"
      :ledger="suspectLedger"
      :salesStations="chartData.sales.stationBar"
      @select-station="$emit('select-station', $event)"
    />

    <div class="eih-charts-row">
      <TemporalLineChart
        :dateRange="dateRangeLabel"
        :granularity="granularity"
        :loading="loadingSales"
        mode="sales"
        :periodLabel="periodLabel"
        :series="chartData.sales.temporal"
        class="chart-half"
      />
      <TemporalLineChart
        :dateRange="dateRangeLabel"
        :granularity="granularity"
        :loading="loadingConsumption"
        mode="consumption"
        :periodLabel="periodLabel"
        :series="chartData.consumption.temporal"
        class="chart-half"
      />
    </div>
  </div>
</template>

<script>
import KpiCardGrid from "./KpiCardGrid.vue";
import StationSummaryGrid from "./StationSummaryGrid.vue";
import TemporalLineChart from "./TemporalLineChart.vue";

export default {
  name: "SiteConsumptionOverviewView",
  emits: ["select-station"],
  components: { KpiCardGrid, StationSummaryGrid, TemporalLineChart },
  props: {
    activeStation: { type: String, default: null },
    accountCounts: { type: Object, default: () => ({}) },
    chartData: { type: Object, required: true },
    dateRangeLabel: { type: String, required: true },
    granularity: { type: String, default: "daily" },
    insightText: { type: String, required: true },
    kpiData: { type: Object, default: () => ({}) },
    loadingConsumption: { type: Boolean, default: false },
    loadingSales: { type: Boolean, default: false },
    periodLabel: { type: String, default: "Period" },
    showConsumptionEmpty: { type: Boolean, default: false },
    showSalesEmpty: { type: Boolean, default: false },
    suspectLedger: { type: Array, default: () => [] },
  },
};
</script>

<style scoped>
.overview-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.insight-banner {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 18px;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, rgba(54,163,247,.08), rgba(244,81,108,.05));
  border: 1px solid rgba(54,163,247,.18);
}

.insight-banner-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--text-muted);
}

.insight-banner-text {
  font-size: 14px;
  line-height: 1.45;
  color: var(--text-strong);
}

.eih-charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 1100px) {
  .eih-charts-row {
    grid-template-columns: 1fr;
  }
}

.eih-no-data {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
}

.eih-no-data svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.eih-no-data--amber {
  background: rgba(255, 184, 34, 0.06);
  border: 1px dashed rgba(255, 184, 34, 0.3);
  color: #b8860b;
}

.eih-no-data--blue {
  background: var(--primary-light);
  border: 1px dashed var(--border-mid);
  color: var(--primary);
}
</style>
