<template>
  <section class="station-summary-card">
    <div class="station-summary-head">
      <div>
        <h3 class="station-summary-title">Station Health</h3>
        <p class="station-summary-sub">Sales, consumption, and risk by station.</p>
      </div>
    </div>

    <div v-if="!rows.length" class="station-summary-empty">No station summary available.</div>

    <div v-else class="station-summary-grid">
      <article
        v-for="row in rows"
        :key="row.stationId"
        :class="['station-summary-item', activeStation === row.stationId ? 'station-summary-item--active' : '']"
      >
        <div class="station-summary-item-head">
          <span class="station-name">{{ row.stationId }}</span>
          <span :class="['confidence-badge', `confidence-badge--${row.confidence}`]">{{ row.confidenceLabel }}</span>
        </div>

        <div class="station-metrics">
          <div class="station-metric">
            <span class="station-metric-label">Sold</span>
            <strong class="station-metric-value">{{ formatKwh(row.soldKwh) }}</strong>
          </div>
          <div class="station-metric">
            <span class="station-metric-label">Consumed</span>
            <strong class="station-metric-value">{{ formatKwh(row.consumedKwh) }}</strong>
          </div>
          <div class="station-metric">
            <span class="station-metric-label">Shortfall</span>
            <strong class="station-metric-value station-metric-value--warm">{{ formatNaira(row.shortfall) }}</strong>
          </div>
          <div class="station-metric">
            <span class="station-metric-label">Risk</span>
            <strong class="station-metric-value">{{ row.riskCount }}</strong>
          </div>
        </div>

        <div class="station-foot">
          <span>{{ row.accountCount }} accounts</span>
          <span>{{ row.matchedMeters }}/{{ row.totalMeters }} matched</span>
        </div>

        <div class="station-actions">
          <button class="station-action" type="button" @click="$emit('select-station', { stationId: row.stationId, view: 'consumption' })">
            Open Consumption
          </button>
          <button class="station-action station-action--danger" type="button" @click="$emit('select-station', { stationId: row.stationId, view: 'fraud' })">
            Open Fraud
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<script>
export default {
  name: "StationSummaryGrid",
  emits: ["select-station"],
  props: {
    activeStation: { type: String, default: null },
    salesStations: { type: Array, default: () => [] },
    consumptionStations: { type: Array, default: () => [] },
    ledger: { type: Array, default: () => [] },
    accountCounts: { type: Object, default: () => ({}) },
  },
  computed: {
    rows() {
      const salesMap = new Map(this.salesStations.map((row) => [row.station, row]));
      const consumptionMap = new Map(this.consumptionStations.map((row) => [row.station, row]));
      const stationIds = new Set([
        ...salesMap.keys(),
        ...consumptionMap.keys(),
        ...Object.keys(this.accountCounts || {}),
      ]);

      return [...stationIds].map((stationId) => {
        const sales = salesMap.get(stationId) || {};
        const consumption = consumptionMap.get(stationId) || {};
        const stationLedger = this.ledger.filter((row) => row.stationId === stationId);
        const shortfall = stationLedger.reduce((sum, row) => sum + (Number(row.shortfallGap) || 0), 0);
        const matchedMeters = stationLedger.filter((row) => (Number(row.totalConsumed) || 0) > 0).length;
        const totalMeters = consumption.meterCount || stationLedger.length || 0;
        const matchRatio = totalMeters > 0 ? matchedMeters / totalMeters : 1;
        const confidence = matchRatio >= 0.85 ? "high" : matchRatio >= 0.5 ? "medium" : "low";

        return {
          stationId,
          soldKwh: Number(sales.totalKwh) || 0,
          consumedKwh: Number(consumption.totalKwh) || 0,
          shortfall: Number(shortfall.toFixed(2)) || 0,
          riskCount: stationLedger.filter((row) => row.riskScore >= 70).length,
          accountCount: this.accountCounts[stationId] || 0,
          matchedMeters,
          totalMeters,
          confidence,
          confidenceLabel: confidence === "high" ? "High confidence" : confidence === "medium" ? "Medium confidence" : "Low confidence",
        };
      }).sort((left, right) => right.shortfall - left.shortfall || right.consumedKwh - left.consumedKwh);
    },
  },
  methods: {
    formatKwh(value) {
      return `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh`;
    },
    formatNaira(value) {
      return `N${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    },
  },
};
</script>

<style scoped>
.station-summary-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.station-summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.station-summary-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-strong);
}

.station-summary-sub {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--text-muted);
}

.station-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 1200px) {
  .station-summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 700px) {
  .station-summary-grid {
    grid-template-columns: 1fr;
  }
}

.station-summary-item {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.01));
}

.station-summary-item--active {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px rgba(var(--primary-rgb, 59, 130, 246), 0.2);
}

.station-summary-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.station-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-strong);
}

.confidence-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
}

.confidence-badge--high {
  background: rgba(52,191,163,.12);
  color: #34bfa3;
}

.confidence-badge--medium {
  background: rgba(255,184,34,.12);
  color: #d48c00;
}

.confidence-badge--low {
  background: rgba(244,81,108,.12);
  color: #f4516c;
}

.station-metrics {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.station-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.station-metric-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--text-muted);
}

.station-metric-value {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-strong);
}

.station-metric-value--warm {
  color: #f4516c;
}

.station-foot {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 11px;
  color: var(--text-muted);
}

.station-actions {
  display: flex;
  gap: 8px;
}

.station-action {
  flex: 1;
  height: 30px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-main);
  color: var(--text-main);
  font-size: 11px;
  font-family: var(--font-family);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.station-action:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.station-action--danger:hover {
  border-color: #f4516c;
  color: #f4516c;
}

.station-summary-empty {
  font-size: 12px;
  color: var(--text-muted);
}
</style>
