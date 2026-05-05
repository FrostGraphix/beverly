<template>
  <div class="consumption-view">
    <div class="view-intro">
      <h3 class="view-title">Consumption Analysis</h3>
      <p class="view-sub">Meter-derived usage and coverage confidence.</p>
    </div>

    <div class="consumption-callouts">
      <article class="consumption-callout">
        <span class="consumption-callout-label">Consumed Energy</span>
        <strong class="consumption-callout-value">{{ formatKwh(kpiData.consumedKwh) }}</strong>
      </article>
      <article class="consumption-callout">
        <span class="consumption-callout-label">Avg Daily Consumption</span>
        <strong class="consumption-callout-value">{{ formatKwh(kpiData.avgDailyConsumedKwh) }}</strong>
      </article>
      <article class="consumption-callout">
        <span class="consumption-callout-label">Coverage</span>
        <strong class="consumption-callout-value">{{ coverageText }}</strong>
      </article>
    </div>

    <div v-if="showConsumptionEmpty" class="eih-no-data eih-no-data--blue">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
      <span>No meter readings were captured for this period.</span>
    </div>

    <div class="eih-charts-row">
      <StationBarChart
        :data="chartData.consumption.stationBar"
        :dateRange="dateRangeLabel"
        :loading="loadingConsumption"
        mode="consumption"
      />
      <TemporalLineChart
        :dateRange="dateRangeLabel"
        :granularity="granularity"
        :loading="loadingConsumption"
        mode="consumption"
        :periodLabel="periodLabel"
        :series="chartData.consumption.temporal"
      />
    </div>

    <StationSummaryGrid
      :activeStation="activeStation"
      :accountCounts="accountCounts"
      :consumptionStations="chartData.consumption.stationBar"
      :ledger="suspectLedger"
      :salesStations="chartData.sales.stationBar"
      @select-station="$emit('select-station', $event)"
    />
  </div>
</template>

<script>
import StationBarChart from "./StationBarChart.vue";
import StationSummaryGrid from "./StationSummaryGrid.vue";
import TemporalLineChart from "./TemporalLineChart.vue";

export default {
  name: "SiteConsumptionConsumptionView",
  emits: ["select-station"],
  components: { StationBarChart, StationSummaryGrid, TemporalLineChart },
  props: {
    activeStation: { type: String, default: null },
    accountCounts: { type: Object, default: () => ({}) },
    chartData: { type: Object, required: true },
    dateRangeLabel: { type: String, required: true },
    granularity: { type: String, default: "daily" },
    kpiData: { type: Object, default: () => ({}) },
    loadingConsumption: { type: Boolean, default: false },
    periodLabel: { type: String, default: "Period" },
    showConsumptionEmpty: { type: Boolean, default: false },
    suspectLedger: { type: Array, default: () => [] },
  },
  computed: {
    coverageText() {
      const matched = Number(this.kpiData.matchedMeters) || 0;
      const unmatched = Number(this.kpiData.unmatchedMeters) || 0;
      return `${matched} matched / ${unmatched} unmatched`;
    },
  },
  methods: {
    formatKwh(value) {
      return `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh`;
    },
  },
};
</script>

<style scoped>
.consumption-view {
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

.consumption-callouts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 900px) {
  .consumption-callouts {
    grid-template-columns: 1fr;
  }
}

.consumption-callout {
  padding: 14px 16px;
  border-radius: var(--radius-md);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.consumption-callout-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--text-muted);
}

.consumption-callout-value {
  font-size: 18px;
  font-weight: 700;
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

.eih-no-data--blue {
  background: rgba(54, 163, 247, 0.06);
  border: 1px dashed rgba(54, 163, 247, 0.28);
  color: #2563eb;
}
</style>
