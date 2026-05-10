<template>
  <transition name="drawer-slide">
    <div v-if="customer" class="drawer-overlay" @click.self="$emit('close')">
      <div class="drawer-panel" role="dialog" aria-label="Customer Detail">
        <!-- ── Header ──────────────────────────────────────────────── -->
        <div class="drawer-head" :data-print-date="printDateLabel">
          <div class="drawer-head-info">
            <div class="drawer-avatar">{{ initials }}</div>
            <div>
              <div class="drawer-name">{{ customer.customerName }}</div>
              <div class="drawer-meta">
                <span class="station-pill">{{ customer.stationId }}</span>
                <span class="tariff-pill">{{ customer.tariffId }}</span>
                <span>Meter: {{ customer.meterId }}</span>
              </div>
            </div>
          </div>
          <BaseIconButton class="drawer-close" @click="$emit('close')" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </BaseIconButton>
        </div>

        <!-- ── Risk Banner ─────────────────────────────────────────── -->
        <div :class="['risk-banner', customer.riskTier.cls]">
          <span class="risk-score-label">Risk Score</span>
          <span class="risk-score-num">{{ customer.riskScore }}</span>
          <span class="risk-tier-label">{{ customer.riskTier.label }}</span>
          <div class="risk-signals">
            <span title="Consumption after recharge">D: {{ customer.riskSignals.divergence }}</span>
            <span title="Tamper events">T: {{ customer.riskSignals.tamper }}</span>
            <span title="Flatline after tamper">F: {{ customer.riskSignals.flatline }}</span>
            <span title="Revenue shortfall">G: {{ customer.riskSignals.gap }}</span>
          </div>
        </div>

        <!-- ── KPI Row ─────────────────────────────────────────────── -->
        <div class="drawer-kpi-row">
          <div class="drawer-kpi">
            <span class="drawer-kpi-v">{{ (customer.totalConsumed || 0).toLocaleString(undefined, { maximumFractionDigits: 1 }) }}</span>
            <span class="drawer-kpi-l">kWh Consumed</span>
          </div>
          <div class="drawer-kpi">
            <span class="drawer-kpi-v">N{{ (customer.totalPaid || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) }}</span>
            <span class="drawer-kpi-l">Total Paid</span>
          </div>
          <div class="drawer-kpi" :class="customer.shortfallGap > 0 ? 'danger' : 'success'">
            <span class="drawer-kpi-v">N{{ (customer.shortfallGap || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) }}</span>
            <span class="drawer-kpi-l">Revenue Shortfall</span>
          </div>
          <div class="drawer-kpi">
            <span class="drawer-kpi-v">{{ customer.rechargeCount || 0 }}</span>
            <span class="drawer-kpi-l">Recharges</span>
          </div>
        </div>

        <!-- ── Tabs ───────────────────────────────────────────────── -->
        <div class="drawer-tabs">
          <BaseButton v-for="t in tabs" :key="t.key" :class="['drawer-tab', activeTab === t.key ? 'active' : '']" @click="activeTab = t.key">{{ t.label }}</BaseButton>
        </div>

        <div class="drawer-body">
          <!-- Daily Consumption Chart -->
          <div v-if="activeTab === 'chart'" class="drawer-chart-wrap">
            <div v-if="!customer.deltas.length" class="drawer-empty">No daily meter data for this period</div>
            <div v-else ref="deltaChart" class="drawer-chart"></div>
          </div>

          <!-- Recharge History Table -->
          <div v-if="activeTab === 'recharge'" class="drawer-recharge">
            <div v-if="!rechargeHistory.length" class="drawer-empty">No recharge records for this period</div>
            <template v-else>
              <!-- Token usage summary -->
              <div class="token-usage-summary">
                <span class="token-stat token-stat--used">✓ {{ tokenStats.used }} used</span>
                <span class="token-stat token-stat--unused">⚠ {{ tokenStats.unused }} unused</span>
                <span class="token-stat">{{ rechargeHistory.length }} total</span>
              </div>
              <table class="recharge-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>kWh</th>
                  <th>Paid (N)</th>
                    <th>Token</th>
                    <th>Status</th>
                    <th>Tariff</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in rechargeHistory" :key="r.receiptId || r.token">
                    <td>{{ (r.createDate || "").substring(0, 10) }}</td>
                    <td>{{ Number(r.totalUnit || 0).toFixed(2) }}</td>
                    <td>{{ Number(r.totalPaid || 0).toLocaleString() }}</td>
                    <td class="mono">{{ r.token || "—" }}</td>
                    <td>
                      <span :class="['vend-badge', r.vend ? 'vend-badge--used' : 'vend-badge--unused']">
                        {{ r.vend ? 'Used' : 'Unused' }}
                      </span>
                    </td>
                    <td><span class="tariff-pill">{{ r.tariffId }}</span></td>
                  </tr>
                </tbody>
              </table>
            </template>
          </div>

          <!-- Monthly Summary -->
          <div v-if="activeTab === 'monthly'" class="drawer-monthly">
            <div v-if="!Object.keys(monthlySummary).length" class="drawer-empty">No data</div>
            <table v-else class="recharge-table">
              <thead>
                <tr><th>Month</th><th>kWh</th><th>Paid (N)</th><th>Recharges</th><th>Avg N</th></tr>
              </thead>
              <tbody>
                <tr v-for="(row, period) in monthlySummary" :key="period">
                  <td>{{ period }}</td>
                  <td>{{ row.totalUnits.toFixed(2) }}</td>
                  <td>{{ row.totalPaid.toLocaleString() }}</td>
                  <td>{{ row.count }}</td>
                  <td>{{ row.avgPaid.toLocaleString() }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ── Actions Footer ─────────────────────────────────────── -->
        <div class="drawer-footer">
          <BaseButton class="footer-btn footer-btn--outline" @click="exportPdf">Export PDF</BaseButton>
          <BaseButton class="footer-btn footer-btn--danger" variant="danger" @click="$emit('relay-control', customer)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64A9 9 0 0 1 20.77 14"/><path d="M6.16 6.16a9 9 0 1 0 12.68 12.68"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
            Remote Control
          </BaseButton>
        </div>
      </div>
    </div>
  </transition>
</template>

<script>
import { buildCustomerRechargeHistory } from "../../services/consumption-aggregator.mjs";
import { loadECharts } from "../../services/echarts-loader.mjs";
import BaseButton from "../base/BaseButton.vue";
import BaseIconButton from "../base/BaseIconButton.vue";

export default {
  name: "CustomerDrawer",
  components: { BaseButton, BaseIconButton },
  props: {
    customer: { type: Object, default: null }
  },
  data() {
    return { activeTab: "chart" };
  },
  computed: {
    printDateLabel() {
      return `Printed ${new Date().toLocaleDateString()}`;
    },
    tabs() {
      return [
        { key: "chart",   label: "Daily Chart" },
        { key: "recharge", label: "Recharge History" },
        { key: "monthly",  label: "Monthly Summary" },
      ];
    },
    initials() {
      if (!this.customer) return "?";
      return String(this.customer.customerName || this.customer.customerId || "?")
        .split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
    },
    rechargeHistory() {
      if (!this.customer?.recharges) return [];
      return [...this.customer.recharges].sort((a, b) =>
        String(b.createDate).localeCompare(String(a.createDate))
      );
    },
    /** Token usage stats: tokens generated vs actually vended to meter */
    tokenStats() {
      const all = this.rechargeHistory;
      const used = all.filter(r => r.vend).length;
      return { used, unused: all.length - used };
    },
    monthlySummary() {
      if (!this.customer?.recharges) return {};
      return buildCustomerRechargeHistory(this.customer.recharges, "monthly");
    }
  },
  watch: {
    customer(val) {
      if (val) {
        this.activeTab = "chart";
        this.$nextTick(this.renderDeltaChart);
      }
    },
    activeTab(val) {
      if (val === "chart") this.$nextTick(this.renderDeltaChart);
    }
  },
  mounted() {
    this._resizeHandler = () => { if (this._chart) this._chart.resize(); };
    window.addEventListener("resize", this._resizeHandler);
  },
  methods: {
    async renderDeltaChart() {
      await this.$nextTick();
      if (!this.customer?.deltas?.length || !this.$refs.deltaChart) return;

      // T3.1: Use async loader instead of window.echarts to fix race condition
      let echarts;
      try { echarts = await loadECharts(); } catch (e) { console.warn("[CustomerDrawer] ECharts load failed:", e); return; }
      if (!this.$refs.deltaChart) return; // guard: component may have been destroyed while awaiting

      if (this._chart) { this._chart.dispose(); this._chart = null; }

      const deltas   = this.customer.deltas;
      const dates    = deltas.map(d => d.date);
      const kwhs     = deltas.map(d => d.delta);

      // Mark recharge dates with vertical line markers
      const rechargeSet = new Set((this.customer.recharges || []).map(r => String(r.createDate || "").substring(0, 10)));
      const markPoints  = deltas
        .filter(d => rechargeSet.has(d.date))
        .map(d => ({ xAxis: d.date, yAxis: d.delta, symbol: "pin", symbolSize: 18, itemStyle: { color: "#34bfa3" }, label: { show: false } }));

      this._chart = echarts.init(this.$refs.deltaChart);
      this._chart.setOption({
        tooltip: {
          trigger: "axis",
          formatter: (params) => {
            const p    = params[0];
            const date = p.axisValue;
            const kwh  = p.value;
            const isRecharge = rechargeSet.has(date);
            return `<b>${date}</b><br/>${kwh.toFixed(3)} kWh${isRecharge ? '<br/><span style="color:#34bfa3">● Recharge day</span>' : ""}`;
          }
        },
        grid: { left: 48, right: 16, top: 24, bottom: 40 },
        xAxis: {
          type: "category", data: dates, boundaryGap: false,
          axisLabel: { fontSize: 10, color: "#9ca3af", rotate: dates.length > 20 ? 35 : 0 },
          axisLine: { lineStyle: { color: "#e5e7eb" } },
        },
        yAxis: {
          type: "value",
          axisLabel: { fontSize: 10, color: "#9ca3af", formatter: v => `${v} kWh` },
          splitLine: { lineStyle: { color: "#f3f4f6" } },
        },
        series: [{
          type: "line", data: kwhs, smooth: true, symbol: "circle", symbolSize: 5,
          lineStyle: { color: "#10b981", width: 2.5 },
          itemStyle: { color: "#10b981" },
          areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(16, 185, 129, 0.31)" }, { offset: 1, color: "rgba(16, 185, 129, 0.02)" }] } },
          markPoint: { data: markPoints },
        }],
      });
    },
    exportPdf() {
      window.print && window.print();
    }
  },
  beforeDestroy() {
    // T5.1: Guard resize handler removal
    if (this._resizeHandler) window.removeEventListener("resize", this._resizeHandler);
    if (this._chart) { this._chart.dispose(); this._chart = null; }
  }
};
</script>

<style scoped>
.drawer-overlay {
  position: fixed; inset: 0; background: var(--bg-overlay); z-index: 2100;
  display: flex; justify-content: flex-end;
  backdrop-filter: blur(10px);
}

.drawer-panel {
  width: min(560px, 96vw); max-width: 96vw; background: var(--bg-glass);
  height: 100vh; overflow-y: auto;
  display: flex; flex-direction: column;
  border-left: 1px solid var(--border-mid);
  box-shadow: var(--shadow-xl), var(--shadow-glow-sm);
  backdrop-filter: blur(22px);
}

.drawer-slide-enter-active, .drawer-slide-leave-active { transition: transform 0.28s cubic-bezier(.4,0,.2,1); }
.drawer-slide-enter { transform: translateX(100%); }
.drawer-slide-leave-to { transform: translateX(100%); }

.drawer-head { display: flex; align-items: center; justify-content: space-between; padding: 20px 20px 16px; border-bottom: 1px solid var(--border-mid); background: linear-gradient(135deg, var(--primary-light), var(--bg-card)); }
.drawer-head-info { display: flex; align-items: center; gap: 12px; }
.drawer-avatar { width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), var(--theme-color)); color: var(--text-inverse); font-weight: 800; font-size: 15px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: var(--shadow-glow-sm); }
.drawer-name { font-size: 14px; font-weight: 700; color: var(--text-strong); margin-bottom: 4px; }
.drawer-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted); flex-wrap: wrap; }
.drawer-close { background: none; border: 1px solid var(--border-color); border-radius: var(--radius-md); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text-muted); }
.drawer-close svg { width: 16px; height: 16px; }
.drawer-close:hover { border-color: var(--danger); color: var(--danger); background: var(--danger-bg); }
.station-pill, .tariff-pill { padding: 1px 7px; border-radius: 4px; font-size: 10px; font-weight: 700; background: var(--primary-light); color: var(--primary); }
.tariff-pill { background: var(--warning-bg); color: var(--warning); }
.risk-banner { display: flex; align-items: center; gap: 10px; padding: 10px 18px; font-size: 12px; }
.risk-banner.risk-low { background: var(--success-bg); color: var(--success); }
.risk-banner.risk-medium { background: var(--warning-bg); color: var(--warning); }
.risk-banner.risk-high { background: var(--danger-bg); color: var(--danger); }
.risk-banner.risk-critical { background: var(--danger-bg); color: var(--danger); }
.risk-score-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.7; }
.risk-score-num { font-size: 24px; font-weight: 800; line-height: 1; }
.risk-tier-label { font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
.risk-signals { margin-left: auto; display: flex; gap: 8px; font-size: 11px; font-weight: 600; opacity: 0.8; }
.drawer-kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; border-bottom: 1px solid var(--border-color); background: var(--bg-card); }
.drawer-kpi { padding: 12px 14px; border-right: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 3px; }
.drawer-kpi:last-child { border-right: none; }
.drawer-kpi-v { font-size: 16px; font-weight: 700; color: var(--text-strong); }
.drawer-kpi-l { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.drawer-kpi.danger .drawer-kpi-v { color: var(--danger); }
.drawer-kpi.success .drawer-kpi-v { color: var(--success); }
.drawer-tabs { display: flex; border-bottom: 1px solid var(--border-color); background: var(--bg-card); }
.drawer-tab { flex: 1; min-height: 42px; padding: 10px; font-size: 12px; font-family: var(--font-family); border: none; background: transparent; cursor: pointer; color: var(--text-muted); border-bottom: 2px solid transparent; transition: all 0.15s; font-weight: 700; }
.drawer-tab.active { color: var(--primary); border-bottom-color: var(--primary); font-weight: 600; }
.drawer-tab:hover:not(.active) { color: var(--text-main); background: var(--primary-light); }
.drawer-body { flex: 1; overflow-y: auto; padding: 16px; }
.drawer-chart-wrap { height: 280px; }
.drawer-chart { height: 100%; }
.drawer-empty { text-align: center; color: var(--text-muted); font-size: 13px; padding: 40px 0; }
.recharge-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; box-shadow: var(--shadow-sm); font-variant-numeric: tabular-nums; }
.recharge-table th { height: 38px; padding: 9px 10px; text-align: left; font-size: 11px; color: var(--text-muted); border-bottom: 1px solid var(--border-mid); background: linear-gradient(180deg, rgba(240,253,244,.95), rgba(255,255,255,.95)); text-transform: uppercase; letter-spacing: 0; }
.recharge-table td { padding: 10px; border-bottom: 1px solid rgba(209,250,229,.72); color: var(--text-main); vertical-align: middle; }
.recharge-table tr:last-child td { border-bottom: 0; }
.recharge-table tr:hover { background: rgba(236,253,245,.68); box-shadow: inset 3px 0 0 var(--primary); }
.mono { font-family: "Courier New", monospace; font-size: 11px; color: var(--text-muted); word-break: break-all; }

/* Token usage badges */
.token-usage-summary { display: flex; gap: 10px; align-items: center; padding: 8px 0 12px; font-size: 12px; }
.token-stat { color: var(--text-muted); font-weight: 500; }
.token-stat--used { color: var(--success); font-weight: 700; }
.token-stat--unused { color: var(--warning); font-weight: 700; }
.vend-badge { padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; letter-spacing: 0.03em; }
.vend-badge--used { background: var(--success-bg); color: var(--success); }
.vend-badge--unused { background: var(--warning-bg); color: var(--warning); }

.drawer-footer { display: flex; gap: 10px; padding: 14px 18px; border-top: 1px solid var(--border-color); background: var(--bg-card); }
.footer-btn { flex: 1; min-height: 42px; padding: 9px 0; border-radius: var(--radius-md); font-size: 12px; font-family: var(--font-family); cursor: pointer; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.15s; }
.footer-btn svg { width: 14px; height: 14px; }
.footer-btn--outline { background: transparent; border: 1px solid var(--border-color); color: var(--text-main); }
.footer-btn--outline:hover { border-color: var(--primary); color: var(--primary); }
.footer-btn--danger { background: var(--danger); border: none; color: var(--text-inverse); }
.footer-btn--danger:hover { background: color-mix(in srgb, var(--danger) 84%, #000); }

/* T4.2: Print-friendly drawer export */
@media print {
  body > * { display: none !important; }
  .drawer-overlay,
  .drawer-panel { display: block !important; position: static !important; width: 100% !important; box-shadow: none !important; max-width: 100% !important; height: auto !important; overflow: visible !important; }
  .drawer-overlay { background: none !important; }
  .drawer-footer { display: none !important; }
  .drawer-close { display: none !important; }
  .drawer-head::after { content: attr(data-print-date); display: block; font-size: 10px; color: #999; margin-top: 4px; }
}
</style>
