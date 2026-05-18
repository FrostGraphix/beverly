<template>
  <div class="kpi-panel-grid">
    <section
      v-for="panel in panels"
      :key="panel.key"
      class="kpi-panel"
    >
      <div class="kpi-panel-head">
        <h3 class="kpi-panel-title">{{ panel.title }}</h3>
        <span class="kpi-panel-sub">{{ panel.sub }}</span>
      </div>

      <div class="kpi-panel-metrics">
        <article
          v-for="metric in panel.metrics"
          :key="metric.key"
          class="kpi-metric"
        >
          <span class="kpi-metric-label">{{ metric.label }}</span>
          <strong class="kpi-metric-value">
            <span v-if="loading || metric.loading" class="kpi-shimmer"></span>
            <template v-else>{{ formatValue(metric) }}</template>
          </strong>
          <span v-if="!loading && !metric.loading && metric.note" class="kpi-metric-note">{{ metric.note }}</span>
        </article>
      </div>
    </section>
  </div>
</template>

<script>
export default {
  name: "KpiCardGrid",
  props: {
    kpi: { type: Object, default: () => ({}) },
    loading: { type: Boolean, default: false },
  },
  computed: {
    panels() {
      const kpi = this.kpi || {};
      const priorSoldChange = this.pct(kpi.purchasedKwh, kpi.priorPurchasedKwh);
      const priorRevenueChange = this.pct(kpi.totalRevenue, kpi.priorRevenue);
      const netGapSub = kpi.netRevenueGap == null
        ? "Expected minus collected"
        : (kpi.netRevenueGap >= 0
          ? `Net shortfall: N${Number(kpi.netRevenueGap).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
          : `Net credit: N${Math.abs(Number(kpi.netRevenueGap)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);

      return [
        {
          key: "sales",
          title: "Sales",
          sub: "Token record truth",
          metrics: [
            {
              key: "purchasedKwh",
              label: "Units Sold",
              value: kpi.purchasedKwh,
              format: "kwh",
              note: this.changeText(priorSoldChange),
            },
            {
              key: "totalRevenue",
              label: "Revenue",
              value: kpi.totalRevenue,
              format: "naira",
              note: this.changeText(priorRevenueChange),
            },
            {
              key: "rechargeCount",
              label: "Recharges",
              value: kpi.rechargeCount,
              format: "count",
              note: `${Number(kpi.periodDays || 0).toLocaleString()} days`,
            },
            {
              key: "avgSoldKwhPerRecharge",
              label: "Avg Units / Recharge",
              value: kpi.avgSoldKwhPerRecharge,
              format: "kwh",
            },
          ],
        },
        {
          key: "consumption",
          title: "Consumption",
          sub: "Meter-derived truth",
          metrics: [
            {
              key: "consumedKwh",
              label: "Consumed Energy",
              value: kpi.consumedKwh,
              format: "kwh",
              loading: kpi.consumedKwh == null,
            },
            {
              key: "avgDailyConsumedKwh",
              label: "Avg Daily Consumption",
              value: kpi.avgDailyConsumedKwh,
              format: "kwh",
              loading: kpi.avgDailyConsumedKwh == null,
            },
            {
              key: "matchedMeters",
              label: "Matched Meters",
              value: kpi.matchedMeters,
              format: "count",
              loading: kpi.matchedMeters == null,
            },
            {
              key: "unmatchedMeters",
              label: "Unmatched Meters",
              value: kpi.unmatchedMeters,
              format: "count",
              loading: kpi.unmatchedMeters == null,
            },
          ],
        },
        {
          key: "loss",
          title: "Loss Risk",
          sub: "Analyst attention",
          metrics: [
            {
              key: "revenueShortfall",
              label: "Revenue Shortfall",
              value: kpi.revenueShortfall,
              format: "naira",
              loading: kpi.revenueShortfall == null,
              note: netGapSub,
            },
            {
              key: "creditBalance",
              label: "Credit Balance",
              value: kpi.creditBalance,
              format: "naira",
              loading: kpi.creditBalance == null,
            },
            {
              key: "highRiskCount",
              label: "High-Risk Accounts",
              value: kpi.highRiskCount,
              format: "count",
              loading: kpi.highRiskCount == null,
            },
            {
              key: "confidence",
              label: "Coverage Confidence",
              value: this.confidenceLabel(kpi),
              format: "text",
              loading: kpi.matchedMeters == null,
              note: this.confidenceNote(kpi),
            },
          ],
        },
      ];
    },
  },
  methods: {
    pct(current, prior) {
      if (prior == null || prior === 0 || current == null) return null;
      return ((current - prior) / prior) * 100;
    },
    changeText(changePct) {
      if (changePct == null) return "";
      return `${changePct >= 0 ? "Up" : "Down"} ${Math.abs(changePct).toFixed(1)}%`;
    },
    confidenceLabel(kpi) {
      const matched = Number(kpi.matchedMeters) || 0;
      const unmatched = Number(kpi.unmatchedMeters) || 0;
      const total = matched + unmatched;
      const ratio = total > 0 ? matched / total : 1;
      if (ratio >= 0.85) return "High";
      if (ratio >= 0.5) return "Medium";
      return "Low";
    },
    confidenceNote(kpi) {
      const matched = Number(kpi.matchedMeters) || 0;
      const unmatched = Number(kpi.unmatchedMeters) || 0;
      return `${matched} matched / ${unmatched} unmatched`;
    },
    formatValue(metric) {
      if (metric.value == null) return "-";
      if (metric.format === "kwh") {
        return `${Number(metric.value).toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh`;
      }
      if (metric.format === "naira") {
        return `N${Number(metric.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
      }
      if (metric.format === "count") {
        return Number(metric.value).toLocaleString();
      }
      return String(metric.value);
    },
  },
};
</script>

<style scoped>
.kpi-panel-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

@media (max-width: 1200px) {
  .kpi-panel-grid {
    grid-template-columns: 1fr;
  }
}

.kpi-panel {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.kpi-panel-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.kpi-panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-strong);
}

.kpi-panel-sub {
  font-size: 11px;
  color: var(--text-muted);
}

.kpi-panel-metrics {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.kpi-metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--border-color);
}

.kpi-metric-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.kpi-metric-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-strong);
  line-height: 1.2;
}

.kpi-metric-note {
  font-size: 11px;
  color: var(--text-muted);
}

.kpi-shimmer {
  display: inline-block;
  width: 90px;
  height: 18px;
  border-radius: 4px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -200% 0;
  }
}

@media (max-width: 520px) {
  .kpi-panel {
    padding: 14px;
    border-radius: var(--radius-lg);
  }

  .kpi-panel-metrics {
    grid-template-columns: 1fr;
  }

  .kpi-metric {
    min-height: 72px;
  }

  .kpi-metric-value {
    font-size: 20px;
    overflow-wrap: anywhere;
  }
}
</style>
