<template>
  <div class="scc">

    <!-- ═══════════════════════════════════════════════════════ HERO ═══ -->
    <header class="scc-hero">
      <div class="scc-hero-glow" />
      <div class="scc-hero-inner">
        <div class="scc-hero-left">
          <div class="scc-hero-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M3 3v18h18" /><path d="M7 14l3-4 3 3 5-7" />
            </svg>
          </div>
          <div>
            <div class="scc-hero-eyebrow">Energy Intelligence</div>
            <h1 class="scc-hero-title">Station Consumption</h1>
            <p class="scc-hero-sub">Compare station demand, meter activity, and load trends.</p>
          </div>
        </div>
        <div class="scc-hero-badges">
          <span v-if="dataSource === 'aggregated'" class="scc-badge scc-badge--fast" title="Queries use pre-computed aggregate tables">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            Aggregated
          </span>
          <span v-else-if="dataSource === 'raw-fallback'" class="scc-badge scc-badge--slow" title="Queries scan raw meter-reading rows (migration not yet applied)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Raw scan
          </span>
          <span v-if="lastAggRefresh" class="scc-badge scc-badge--info" :title="'Aggregates rebuilt at ' + lastAggRefresh">
            ✓ Rebuilt {{ lastAggRefresh }}
          </span>
        </div>
        <div class="scc-hero-actions">
          <button class="scc-hbtn scc-hbtn--ghost" :disabled="refreshingAgg" @click="refreshAggregates"
            :title="lastAggRefresh ? 'Aggregates rebuilt at ' + lastAggRefresh : 'Trigger aggregate refresh now'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" :class="{ 'scc-spin': refreshingAgg }">
              <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
              <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
            </svg>
            {{ refreshingAgg ? 'Rebuilding…' : 'Rebuild' }}
          </button>
          <button class="scc-hbtn scc-hbtn--ghost" :disabled="!data || loading" @click="exportCsv" title="Export as CSV">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export
          </button>
          <button class="scc-hbtn scc-hbtn--primary" :disabled="loading" @click="load">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" :class="{ 'scc-spin': loading }">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            {{ loading ? 'Loading…' : 'Refresh' }}
          </button>
        </div>
      </div>
    </header>

    <!-- ══════════════════════════════════════════════════ CONTROLS ═══ -->
    <div class="scc-controls-wrap">

      <!-- Row 1: Date range picker -->
      <div class="scc-ctrl-row">
        <div class="scc-ctrl-label">Date range</div>
        <div class="scc-ctrl-body">
          <div class="scc-daterange">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="scc-cal-icon"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <input v-model="from" type="date" class="scc-date" aria-label="Start date" @change="onCustomDate" />
            <span class="scc-date-sep" aria-hidden="true">&rarr;</span>
            <input v-model="to" type="date" class="scc-date" aria-label="End date" @change="onCustomDate" />
          </div>
        </div>
      </div>

      <div class="scc-ctrl-divider" />

      <!-- Row 2: View options — granularity + station (fully independent) -->
      <div class="scc-ctrl-row">
        <div class="scc-ctrl-label">View</div>
        <div class="scc-ctrl-body">
          <!-- Granularity -->
          <div class="scc-seg">
            <button v-for="g in GRANS" :key="g.key"
              :class="['scc-seg-btn', granularity === g.key && 'scc-seg-btn--active']"
              @click="setGranularity(g.key)">{{ g.label }}</button>
          </div>

          <!-- Station filter -->
          <div class="scc-select-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="scc-select-icon"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
            <select v-model="stationFilter" class="scc-select" aria-label="Station" @change="load">
              <option value="">All stations</option>
              <option v-for="s in STATIONS" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
        </div>
      </div>

    </div>

    <!-- Alerts -->
    <div v-if="error" class="scc-alert scc-alert--err">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>{{ error }}</span>
      <button type="button" :disabled="loading" @click="load">Retry</button>
    </div>
    <div v-else-if="rangeNote" class="scc-alert scc-alert--info">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      {{ rangeNote }}
    </div>

    <!-- ════════════════════════════════════════════════ KPI CARDS ═══ -->
    <div class="scc-kpis">
      <div v-for="k in kpiCards" :key="k.label" class="scc-kpi" :class="k.accent && `scc-kpi--${k.accent}`">
        <div class="scc-kpi-head">
          <span class="scc-kpi-label">{{ k.label }}</span>
          <span v-if="k.icon" class="scc-kpi-icon" v-html="k.icon" />
        </div>
        <strong class="scc-kpi-value">{{ k.value }}</strong>
        <small v-if="k.money" :class="['scc-kpi-money', k.moneyUnavailable && 'scc-kpi-money--unavailable']">{{ k.money }}</small>
        <small v-if="k.sub" :class="['scc-kpi-sub', k.tone && `scc-tone--${k.tone}`]">{{ k.sub }}</small>
        <div v-if="loading" class="scc-shimmer" />
      </div>
    </div>

    <div v-if="data" class="scc-valuation" role="status" aria-live="polite">
      <div>
        <strong>Tariff valuation coverage</strong>
        <span>{{ fmt(consumptionValue.pricedKwh) }} of {{ fmt(consumptionValue.totalKwh) }} kWh matched to dated tariffs</span>
      </div>
      <div class="scc-valuation-metrics">
        <span>{{ fmt(consumptionValue.coveragePct, 2) }}% covered</span>
        <span v-if="consumptionValue.unpricedKwh > 0">{{ fmt(consumptionValue.unpricedKwh) }} kWh unpriced</span>
        <span>{{ fmtNgn(consumptionValue.valueNgn) }} valued</span>
        <b :class="consumptionValue.complete ? 'scc-valuation-ok' : 'scc-valuation-warn'">
          {{ consumptionValue.complete ? 'Complete' : 'Partial history' }}
        </b>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════ CHARTS ═══ -->
    <!-- Trend full-width -->
    <div class="scc-card scc-card--trend">
      <div class="scc-card-head">
        <div class="scc-card-head-left">
          <span class="scc-bullet" />
          <strong>Consumption Trend</strong>
          <span class="scc-card-badge">{{ granularityLabel }} · kWh</span>
        </div>
        <span class="scc-card-meta">{{ data?.temporal?.labels?.length || 0 }} periods</span>
      </div>
      <div class="scc-chart scc-chart--tall">
        <EChartPanel v-if="hasTemporal" :option="trendOption" />
        <div v-else class="scc-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3v18h18"/><path d="M7 14l3-4 3 3 5-7" stroke-dasharray="3 2" opacity=".4"/></svg>
          <p>{{ loading ? 'Computing trend…' : 'No consumption in this range.' }}</p>
        </div>
      </div>
    </div>

    <!-- Station share + Seasonality side-by-side -->
    <div class="scc-row-2">
      <div class="scc-card scc-card--share">
        <div class="scc-card-head">
          <div class="scc-card-head-left">
            <span class="scc-bullet" />
            <strong>Station Load Share</strong>
            <span class="scc-card-badge">kWh total</span>
          </div>
        </div>
        <div class="scc-chart scc-chart--share">
          <EChartPanel v-if="hasStations" :option="shareOption" />
          <div v-else class="scc-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9" stroke-dasharray="3 2" opacity=".4"/></svg>
            <p>{{ loading ? 'Loading…' : 'No data.' }}</p>
          </div>
        </div>
      </div>

      <div :class="['scc-card', !hasSeasonality && 'scc-card--seasonality-empty']">
        <div class="scc-card-head">
          <div class="scc-card-head-left">
            <span class="scc-bullet" />
            <strong>Weekly Load Profile</strong>
            <span class="scc-card-badge">avg kWh / day-of-week</span>
          </div>
        </div>
        <div :class="['scc-chart', !hasSeasonality && 'scc-chart--empty-state']">
          <EChartPanel v-if="hasSeasonality" :option="seasonalityOption" />
          <div v-else class="scc-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="10" width="4" height="11" rx="1" opacity=".3"/><rect x="10" y="6" width="4" height="15" rx="1" opacity=".3"/><rect x="17" y="3" width="4" height="18" rx="1" opacity=".3"/></svg>
            <p>{{ loading ? 'Loading…' : 'No load profile data for this range.' }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════ LEAGUE TABLE ═══ -->
    <div class="scc-card scc-card--league">
      <div class="scc-card-head">
        <div class="scc-card-head-left">
          <span class="scc-bullet" />
          <strong>Station League Table</strong>
          <span class="scc-card-badge">{{ leagueRows.length }} stations</span>
        </div>
        <span class="scc-card-meta">vs prior {{ data?.range?.periodDays || 0 }}-day window</span>
      </div>
      <div class="scc-table-wrap scc-table-wrap--league">
        <table class="scc-table scc-table--league">
          <thead>
            <tr>
              <th class="scc-th-rank">#</th>
              <th>Station</th>
              <th class="scc-num">Meter Read</th>
              <th class="scc-num">Delta kWh</th>
              <th class="scc-num">Share</th>
              <th class="scc-num">Meters</th>
              <th class="scc-num">Active</th>
              <th class="scc-num">Avg / Meter</th>
              <th class="scc-num">Avg Daily</th>
              <th>Peak Day</th>
              <th class="scc-num">Growth</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(s, i) in leagueRows" :key="s.station" class="scc-tr">
              <td class="scc-rank">{{ i + 1 }}</td>
              <td>
                <div class="scc-station-cell">
                  <span class="scc-dot" :style="{ background: colorFor(s.station) }" />
                  <strong>{{ s.station }}</strong>
                </div>
              </td>
              <td class="scc-num scc-bold">{{ fmt(s.latestOdometerKwh || 0) }}</td>
              <td class="scc-num">{{ fmt(s.totalKwh) }}</td>
              <td class="scc-num">
                <div class="scc-share-wrap">
                  <div class="scc-share-track">
                    <div class="scc-share-fill" :style="{ width: s.share + '%', background: colorFor(s.station) }" />
                  </div>
                  <span>{{ s.share }}%</span>
                </div>
              </td>
              <td class="scc-num">{{ fmt(s.meterCount, 0) }}</td>
              <td class="scc-num">
                <span :class="s.activeMeterCount === 0 ? 'scc-tone--dim' : ''">{{ fmt(s.activeMeterCount, 0) }}</span>
              </td>
              <td class="scc-num">{{ fmt(s.avgPerMeter) }}</td>
              <td class="scc-num">{{ fmt(s.avgDailyKwh) }}</td>
              <td class="scc-peak">
                <span v-if="s.peakDay.date">{{ s.peakDay.date }} <span class="scc-muted">· {{ fmt(s.peakDay.kwh) }} kWh</span></span>
                <span v-else class="scc-muted">—</span>
              </td>
              <td class="scc-num">
                <span :class="['scc-growth', growthClass(s.growthPct)]">{{ growthLabel(s.growthPct) }}</span>
              </td>
            </tr>
            <tr v-if="!leagueRows.length">
              <td colspan="11" class="scc-empty-cell">{{ loading ? 'Loading stations…' : 'No stations in this range.' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════ TOP METERS ═══ -->
    <div class="scc-card scc-card--top-meters">
      <div class="scc-card-head">
        <div class="scc-card-head-left">
          <span class="scc-bullet" />
          <strong>Top Consumers</strong>
          <span class="scc-card-badge">{{ topMeters.length }} meters</span>
        </div>
        <div class="scc-top-meta">
          <span class="scc-card-meta">click a row to deep-dive</span>
          <span class="scc-card-meta">Page {{ topMetersPage }} / {{ topMetersTotalPages }}</span>
        </div>
      </div>
      <div class="scc-table-wrap">
        <table class="scc-table scc-table--topmeters">
          <thead>
            <tr>
              <th class="scc-th-rank">#</th>
              <th>Meter ID</th>
              <th>Customer</th>
              <th>Station</th>
              <th class="scc-num">Total kWh</th>
              <th class="scc-num">Active Periods</th>
              <th class="scc-num">Avg / Period</th>
              <th class="scc-th-action" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="(m, i) in pagedTopMeters" :key="m.meterId + m.station"
              class="scc-tr scc-tr--click" tabindex="0" @click="openMeter(m.meterId, m.station)"
              @keydown.enter="openMeter(m.meterId, m.station)">
              <td class="scc-rank">{{ ((topMetersPage - 1) * topMetersPageSize) + i + 1 }}</td>
              <td class="scc-mono">{{ m.meterId }}</td>
              <td class="scc-customer">{{ m.customerName || '—' }}</td>
              <td>
                <div class="scc-station-cell">
                  <span class="scc-dot scc-dot--sm" :style="{ background: colorFor(m.station) }" />
                  {{ m.station }}
                </div>
              </td>
              <td class="scc-num scc-bold">{{ fmt(m.totalKwh) }}</td>
              <td class="scc-num">{{ fmt(m.activeDays, 0) }}</td>
              <td class="scc-num">{{ fmt(m.avgDailyKwh) }}</td>
              <td class="scc-num"><span class="scc-arrow">›</span></td>
            </tr>
            <tr v-if="!pagedTopMeters.length">
              <td colspan="8" class="scc-empty-cell">{{ loading ? 'Loading meters…' : 'No meters in this range.' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="topMeters.length > topMetersPageSize" class="scc-pagination">
        <button class="scc-page-btn" :disabled="topMetersPage <= 1" @click="goTopMetersPage(topMetersPage - 1)">Prev</button>
        <span class="scc-page-info">{{ topMetersPageStart }}-{{ topMetersPageEnd }} of {{ topMeters.length }}</span>
        <button class="scc-page-btn" :disabled="topMetersPage >= topMetersTotalPages" @click="goTopMetersPage(topMetersPage + 1)">Next</button>
      </div>
    </div>

    <!-- ════════════════════════════════════════ METER SEARCH BAR ═══ -->
    <div class="scc-searchbar">
      <svg class="scc-searchbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
      </svg>
      <input v-model="meterQuery" class="scc-searchbar-input"
        placeholder="Enter a meter ID for per-meter consumption + recharge analysis…"
        @keyup.enter="analyzeMeter" />
      <button class="scc-hbtn scc-hbtn--primary scc-hbtn--sm"
        :disabled="!meterQuery.trim() || meterLoading" @click="analyzeMeter">
        {{ meterLoading ? 'Analyzing…' : 'Analyze meter' }}
      </button>
    </div>

    <!-- ═══════════════════════════════════════ METER ANALYSIS DRAWER ═══ -->
    <transition name="scc-drawer-anim">
      <div v-if="drawerOpen" class="scc-drawer-scrim" @click.self="closeMeter">
        <aside class="scc-drawer">

          <!-- Drawer header -->
          <div class="scc-drawer-header">
            <div class="scc-drawer-header-info">
              <span class="scc-drawer-eyebrow">Meter analysis</span>
              <h2 class="scc-drawer-title">{{ meterData ? meterData.meterId : meterQuery }}</h2>
              <p class="scc-drawer-meta" v-if="meterData">
                <span class="scc-dot" :style="{ background: colorFor(meterData.station) }" />
                {{ meterData.station || '—' }} ·
                {{ meterData.customerName || 'Unknown customer' }} ·
                {{ from }} → {{ to }}
              </p>
            </div>
            <button class="scc-drawer-close" @click="closeMeter" aria-label="Close drawer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div v-if="meterError" class="scc-alert scc-alert--err">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {{ meterError }}
          </div>

          <div v-if="meterLoading" class="scc-drawer-loading">
            <div class="scc-spinner" /><span>Loading meter data…</span>
          </div>

          <template v-if="meterData && !meterLoading">
            <!-- Meter KPIs -->
            <div class="scc-kpis scc-kpis--sm">
              <div v-for="k in meterKpis" :key="k.label" class="scc-kpi">
                <span class="scc-kpi-label">{{ k.label }}</span>
                <strong class="scc-kpi-value">{{ k.value }}</strong>
                <small v-if="k.sub" :class="['scc-kpi-sub', k.tone && `scc-tone--${k.tone}`]">{{ k.sub }}</small>
              </div>
            </div>

            <!-- Combined chart -->
            <div class="scc-card">
              <div class="scc-card-head">
                <div class="scc-card-head-left">
                  <span class="scc-bullet" />
                  <strong>Consumption, Balance &amp; Recharges</strong>
                </div>
                <span class="scc-card-meta">daily kWh · balance kWh · recharge events</span>
              </div>
              <div class="scc-chart scc-chart--tall">
                <EChartPanel v-if="meterData.series.length" :option="meterChartOption" />
                <div v-else class="scc-empty"><p>No readings in this range.</p></div>
              </div>
            </div>

            <!-- Recharge + Consumption logs -->
            <div class="scc-row-2">
              <div class="scc-card">
                <div class="scc-card-head">
                  <div class="scc-card-head-left">
                    <span class="scc-bullet" />
                    <strong>Recharge Log</strong>
                    <span class="scc-card-badge">{{ rechargeRows.length }} recharges</span>
                  </div>
                </div>
                <div class="scc-table-wrap scc-table-wrap--scroll">
                  <table class="scc-table scc-table--drawer-recharges">
                    <thead>
                      <tr><th>Date</th><th class="scc-num">Units</th><th class="scc-num">Paid</th><th class="scc-num">Vend</th><th>Token</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="(r, i) in rechargeRows" :key="r.receiptId || i" class="scc-tr">
                        <td>{{ r.date }}</td>
                        <td class="scc-num scc-bold">{{ fmt(r.units) }}</td>
                        <td class="scc-num">₦{{ fmt(r.paid) }}</td>
                        <td class="scc-num">{{ fmt(r.vend) }}</td>
                        <td class="scc-mono scc-token">{{ r.token || '—' }}</td>
                      </tr>
                      <tr v-if="!rechargeRows.length">
                        <td colspan="5" class="scc-empty-cell">{{ rechargeLoading ? 'Loading recharges…' : 'No recharges in range.' }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div class="scc-card">
                <div class="scc-card-head">
                  <div class="scc-card-head-left">
                    <span class="scc-bullet" />
                    <strong>Consumption Log</strong>
                    <span class="scc-card-badge">{{ meterData.series.length }} days</span>
                  </div>
                </div>
                <div class="scc-table-wrap scc-table-wrap--scroll">
                  <table class="scc-table scc-table--drawer-consumption">
                    <thead>
                      <tr><th>Date</th><th class="scc-num">Reading</th><th class="scc-num">Used kWh</th><th class="scc-num">Balance</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in consumptionRowsDesc" :key="row.date" class="scc-tr">
                        <td>{{ row.date }}</td>
                        <td class="scc-num scc-muted">{{ row.total1 < 0 ? '—' : fmt(row.total1) }}</td>
                        <td class="scc-num scc-bold">{{ fmt(row.delta) }}</td>
                        <td class="scc-num">{{ row.remain1 == null ? '—' : fmt(row.remain1) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div class="scc-drawer-footer">
              <button class="scc-hbtn scc-hbtn--outline" @click="exportMeterCsv">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export meter CSV
              </button>
            </div>
          </template>
        </aside>
      </div>
    </transition>

  </div>
</template>

<script>
import EChartPanel from "./EChartPanel.vue";
import {
  fetchStationConsumptionAnalytics,
  fetchMeterConsumptionAnalysis,
  fetchTokenRecords,
  triggerMeterAggregateRefresh,
} from "../services/consumption-service.mjs";

import { fetchStations, stationsSync } from "../services/station-registry.mjs";

const PALETTE = ["#059669", "#2563eb", "#f59e0b", "#8b5cf6", "#ef4444", "#0ea5e9", "#ec4899"];

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(base, n) { const d = new Date(base); d.setDate(d.getDate() + n); return d; }

export default {
  name: "StationConsumptionPage",
  components: { EChartPanel },
  props: {
    route: { type: Object, default: () => ({}) },
    hash: { type: String, default: "" },
    roleId: { type: String, default: "" },
  },
  data() {
    const today = new Date();
    return {
      GRANS: [
        { key: "daily",   label: "Daily" },
        { key: "weekly",  label: "Weekly" },
        { key: "monthly", label: "Monthly" },
      ],
      // Seeded from the last known estate for first paint, then replaced with
      // the discovered list on mount — a station onboarded today appears in
      // this dropdown today, with no redeploy.
      STATIONS: stationsSync(),
      granularity: "daily",
      stationFilter: "",
      from: fmtDate(addDays(today, -29)),
      to: fmtDate(today),
      loading: false,
      error: "",
      rangeNote: "",
      data: null,
      reqId: 0,
      // aggregate rebuild
      refreshingAgg: false,
      lastAggRefresh: "",
      // per-meter drawer
      meterQuery: "",
      drawerOpen: false,
      meterLoading: false,
      rechargeLoading: false,
      meterError: "",
      meterData: null,
      rechargeData: { rows: [], totals: { count: 0, purchasedKwh: 0, totalPaid: 0, avgPaid: 0, lastDate: null }, byDate: {} },
      meterReqId: 0,
      topMetersPage: 1,
      topMetersPageSize: 10,
      themeTick: 0,
      themeObserver: null,
    };
  },

  computed: {
    granularityLabel() {
      // Reflect the granularity the server actually used (it may coarsen wide ranges).
      const effective = (this.data && this.data.range && this.data.range.granularity) || this.granularity;
      return (this.GRANS.find((g) => g.key === effective) || {}).label || "Daily";
    },
    dataSource() {
      return this.data && this.data.totals ? (this.data.totals.source || "") : "";
    },
    hasTemporal() {
      return !!(this.data && this.data.temporal && this.data.temporal.labels.length);
    },
    hasStations() {
      return !!(this.data && this.data.stations && this.data.stations.length);
    },
    hasSeasonality() {
      return !!(this.data && this.data.seasonality && Array.isArray(this.data.seasonality.values) && this.data.seasonality.values.length === 7);
    },
    leagueRows() { return this.data?.stations || []; },
    topMeters()  { return this.data?.topMeters || []; },
    topMetersTotalPages() {
      return Math.max(1, Math.ceil(this.topMeters.length / this.topMetersPageSize));
    },
    pagedTopMeters() {
      const start = (this.topMetersPage - 1) * this.topMetersPageSize;
      return this.topMeters.slice(start, start + this.topMetersPageSize);
    },
    topMetersPageStart() {
      if (!this.topMeters.length) return 0;
      return (this.topMetersPage - 1) * this.topMetersPageSize + 1;
    },
    topMetersPageEnd() {
      return Math.min(this.topMetersPage * this.topMetersPageSize, this.topMeters.length);
    },

    consumptionValue() {
      const consumedKwh = Number(this.data?.totals?.consumedKwh) || 0;
      const valuation = this.data?.valuation || {};
      const hasUnpriced = valuation.unpricedKwh !== undefined && valuation.unpricedKwh !== null;
      const hasTotal = valuation.totalKwh !== undefined && valuation.totalKwh !== null;
      return {
        valueNgn: Number(valuation.valueNgn) || 0,
        pricedKwh: Number(valuation.pricedKwh) || 0,
        unpricedKwh: hasUnpriced ? Number(valuation.unpricedKwh) || 0 : consumedKwh,
        totalKwh: hasTotal ? Number(valuation.totalKwh) || 0 : consumedKwh,
        coveragePct: Number(valuation.coveragePct) || 0,
        complete: valuation.complete === true,
      };
    },

    kpiCards() {
      const t = this.data?.totals || null;
      const top = this.data?.stations?.[0];
      const customerCount = Number(t?.customerCount) || 0;
      const stationCount = Number(t?.stationCount) || 0;
      return [
        { label: "Meter Read Total",   value: t ? `${this.fmt(t.latestOdometerKwh)} kWh` : "—", sub: t ? `${this.fmt(t.metersWithLatest, 0)} latest meter reads` : "",       tone: "", accent: "primary" },
        { label: "Delta Consumption",  value: t ? `${this.fmt(t.consumedKwh)} kWh` : "—", money: t ? this.moneyEquivalent() : "", moneyUnavailable: !this.consumptionValue.complete, sub: t ? this.growthLabel(t.growthPct) + " vs prior" : "", tone: t ? this.growthTone(t.growthPct) : "", accent: "" },
        { label: "Active Meters",      value: t ? this.fmt(t.activeMeterCount, 0) : "—",         sub: t ? `of ${this.fmt(t.meterCount, 0)} seen` : "",                        tone: "", accent: "" },
        { label: "Avg / Customer",     value: t && customerCount ? `${this.fmt(t.consumedKwh / customerCount)} kWh` : "—", money: t && customerCount ? this.moneyEquivalent(customerCount) : "", moneyUnavailable: !this.consumptionValue.complete, sub: customerCount ? `${this.fmt(customerCount, 0)} customers` : "No customers", tone: "", accent: "" },
        { label: "Avg / Station",      value: t && stationCount ? `${this.fmt(t.consumedKwh / stationCount)} kWh` : "—", money: t && stationCount ? this.moneyEquivalent(stationCount) : "", moneyUnavailable: !this.consumptionValue.complete, sub: stationCount ? `${this.fmt(stationCount, 0)} reporting stations` : "No stations", tone: "", accent: "" },
        { label: "Avg / Meter",        value: t ? `${this.fmt(t.avgPerMeter)} kWh` : "—", money: t && t.meterCount ? this.moneyEquivalent(t.meterCount) : "", moneyUnavailable: !this.consumptionValue.complete, sub: "in period", tone: "", accent: "" },
        { label: "Avg Daily Load",     value: t ? `${this.fmt(t.avgDailyKwh)} kWh` : "—", money: t && t.readingDays ? this.moneyEquivalent(t.readingDays) : "", moneyUnavailable: !this.consumptionValue.complete, sub: t ? `${t.readingDays} reading periods` : "", tone: "", accent: "" },
        { label: "Top Station",        value: top ? top.station : "—",                      sub: top ? `${top.share}% of total load` : "",                               tone: "", accent: "" },
        { label: "Stations Reporting", value: t ? this.fmt(t.stationCount, 0) : "—",        sub: t ? `${t.readingDays} period${t.readingDays !== 1 ? "s" : ""} of data` : "", tone: "", accent: "" },
      ];
    },

    trendOption() {
      if (!this.data || !this.data.temporal) return {};
      const c = this.themeColors();
      const t = this.data.temporal;
      const keys = Object.keys(t.seriesByStation || {});
      const multi = keys.length > 1;
      const series = multi
        ? keys.map((k) => ({
            name: k, type: "line", smooth: 0.28, showSymbol: false, sampling: "lttb", clip: true,
            areaStyle: { opacity: 0.12 }, lineStyle: { width: 1.8 },
            itemStyle: { color: this.colorFor(k) },
            data: t.seriesByStation[k],
          }))
        : [{
            name: "kWh", type: "line", smooth: 0.28, showSymbol: false, sampling: "lttb", clip: true,
            areaStyle: { opacity: 0.22, color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: c.primary }, { offset: 1, color: "transparent" }] } },
            lineStyle: { width: 2.5, color: c.primary },
            itemStyle: { color: c.primary },
            data: t.kwhSeries || [],
          }];
      return {
        color: PALETTE,
        tooltip: { trigger: "axis", backgroundColor: c.tooltipBg, borderColor: "transparent", textStyle: { color: c.tooltipText, fontSize: 12 }, axisPointer: { type: "cross", label: { show: false } } },
        legend: multi ? { bottom: 2, left: 0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: c.muted, fontSize: 10.5 }, type: "scroll" } : undefined,
        grid: { left: 4, right: 8, top: 18, bottom: multi ? 44 : 24, containLabel: true },
        xAxis: { type: "category", boundaryGap: false, data: t.labels || [], axisLine: { lineStyle: { color: c.border } }, axisLabel: { color: c.faint, fontSize: 10, hideOverlap: true, margin: 10 }, axisTick: { show: false } },
        yAxis: { type: "value", min: 0, scale: true, splitNumber: 4, splitLine: { lineStyle: { color: c.grid, type: "dashed" } }, axisLabel: { color: c.faint, fontSize: 10, margin: 8 } },
        series,
      };
    },

    shareOption() {
      if (!this.data || !this.data.stations) return {};
      const c = this.themeColors();
      const rows = this.data.stations
        .filter((s) => s.totalKwh > 0)
        .slice(0, 6)
        .reverse();
      return {
        color: PALETTE,
        tooltip: { trigger: "axis", backgroundColor: c.tooltipBg, borderColor: "transparent", textStyle: { color: c.tooltipText, fontSize: 12 }, axisPointer: { type: "shadow" }, formatter: (p) => `${p[0].name}<br/>${p[0].value.toFixed(1)} kWh · ${((rows.find((r) => r.station === p[0].name) || {}).share || 0)}%` },
        grid: { left: 12, right: 58, top: 10, bottom: 10, containLabel: true },
        xAxis: { type: "value", axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: c.grid, type: "dashed" } }, axisLabel: { color: c.faint, fontSize: 10 } },
        yAxis: { type: "category", data: rows.map((s) => s.station), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: c.muted, fontSize: 10.5, width: 72, overflow: "truncate" } },
        series: [{
          name: "kWh total", type: "bar", barMaxWidth: 16, barMinHeight: 8, barCategoryGap: "36%", borderRadius: [0, 8, 8, 0], clip: true,
          label: { show: true, position: "right", distance: 6, color: c.muted, fontSize: 10, formatter: (p) => { const share = ((rows.find((r) => r.station === p.name) || {}).share || 0); return share < 1 ? "" : `${share.toFixed(1)}%`; } },
          data: rows.map((s) => ({ name: s.station, value: parseFloat(s.totalKwh.toFixed(1)), itemStyle: { color: this.colorFor(s.station) } })),
        }],
      };
    },

    legacySharePieOption() {
      if (!this.data || !this.data.stations) return {};
      const c = this.themeColors();
      const rows = this.data.stations
        .filter((s) => s.totalKwh > 0)
        .slice(0, 6)
        .reverse();
      return {
        color: PALETTE,
        tooltip: { trigger: "item", backgroundColor: c.tooltipBg, borderColor: "transparent", textStyle: { color: c.tooltipText, fontSize: 12 }, formatter: (p) => `${p.name}<br/>${p.value.toFixed(1)} kWh · ${p.percent}%` },
        legend: { orient: "horizontal", type: "scroll", left: 0, right: 0, bottom: 0, itemWidth: 9, itemHeight: 9, textStyle: { color: c.muted, fontSize: 10.5 }, formatter: (n) => `${n}  ${((rows.find((r) => r.station === n) || {}).share || 0)}%` },
        series: [{
          type: "pie", radius: ["38%", "64%"], center: ["50%", "42%"],
          padAngle: 2, itemStyle: { borderRadius: 4 },
          label: { show: false },
          data: rows.map((s) => ({ name: s.station, value: parseFloat(s.totalKwh.toFixed(1)), itemStyle: { color: this.colorFor(s.station) } })),
        }],
      };
    },

    seasonalityOption() {
      if (!this.data || !this.data.seasonality) return {};
      const c = this.themeColors();
      const s = this.data.seasonality;
      const max = Math.max(...s.values, 1);
      return {
        tooltip: { trigger: "axis", backgroundColor: c.tooltipBg, borderColor: "transparent", textStyle: { color: c.tooltipText }, formatter: (p) => `${p[0].name}: ${p[0].value.toFixed(2)} kWh avg` },
        grid: { left: 6, right: 8, top: 12, bottom: 24, containLabel: true },
        xAxis: { type: "category", data: s.labels, axisLine: { lineStyle: { color: c.border } }, axisLabel: { color: c.faint, fontSize: 10, hideOverlap: true, margin: 8 }, axisTick: { show: false } },
        yAxis: { type: "value", min: 0, scale: true, splitNumber: 3, splitLine: { lineStyle: { color: c.grid, type: "dashed" } }, axisLabel: { color: c.faint, fontSize: 10, margin: 8 } },
        series: [{
          type: "bar", barMaxWidth: 28, borderRadius: [6, 6, 0, 0], clip: true,
          data: s.values.map((v, i) => ({ value: parseFloat(v.toFixed(3)), itemStyle: { color: v === max ? c.primary : `${c.primary}99` } })),
        }],
      };
    },

    meterKpis() {
      if (!this.meterData) return [];
      const t = this.meterData.totals || {};
      const r = this.rechargeData.totals || {};
      return [
        { label: "Consumed",      value: `${this.fmt(t.consumedKwh)} kWh` },
        { label: "Purchased",     value: `${this.fmt(r.purchasedKwh)} kWh` },
        { label: "Net Efficiency", value: t.consumedKwh > 0 && r.purchasedKwh > 0 ? `${this.fmt((t.consumedKwh / r.purchasedKwh) * 100, 1)}%` : "—", sub: "consumed ÷ purchased" },
        { label: "Recharges",     value: this.fmt(r.count, 0),                  sub: r.lastDate ? `last ${r.lastDate}` : "" },
        { label: "Total Paid",    value: `₦${this.fmt(r.totalPaid)}`,            sub: r.count ? `avg ₦${this.fmt(r.avgPaid)} / recharge` : "" },
        { label: "Latest Balance", value: t.latestRemain == null ? "—" : `${this.fmt(t.latestRemain)} kWh` },
      ];
    },

    rechargeRows() { return this.rechargeData.rows; },

    consumptionRowsDesc() {
      if (!this.meterData || !this.meterData.series) return [];
      return this.meterData.series.slice().reverse();
    },

    meterChartOption() {
      if (!this.meterData || !this.meterData.series.length) return {};
      const c = this.themeColors();
      const series = this.meterData.series;
      const labels = series.map((r) => r.date);
      const deltaData = series.map((r) => parseFloat((r.delta || 0).toFixed(3)));
      const balanceData = series.map((r) => r.remain1 == null ? null : parseFloat(r.remain1.toFixed(3)));
      const rechargeByDate = this.rechargeData.byDate || {};
      const rechargeData = labels.map((d) => (rechargeByDate[d] ? parseFloat(rechargeByDate[d].units.toFixed(4)) : null));
      const hasBalance = balanceData.some((v) => v != null);
      const hasRecharges = rechargeData.some((v) => v != null);
      return {
        color: [c.primary, "#2563eb", "#f59e0b"],
        tooltip: { trigger: "axis", backgroundColor: c.tooltipBg, borderColor: "transparent", textStyle: { color: c.tooltipText, fontSize: 11.5 } },
        legend: { bottom: 4, itemWidth: 10, itemHeight: 10, textStyle: { color: c.muted, fontSize: 11 } },
        grid: { left: 6, right: hasBalance ? 40 : 10, top: 16, bottom: 38, containLabel: true },
        xAxis: { type: "category", data: labels, axisLine: { lineStyle: { color: c.border } }, axisLabel: { color: c.faint, fontSize: 9.5, rotate: labels.length > 45 ? 45 : 0 }, axisTick: { show: false } },
        yAxis: [
          { type: "value", name: "kWh", splitLine: { lineStyle: { color: c.grid, type: "dashed" } }, axisLabel: { color: c.faint, fontSize: 10 } },
          ...(hasBalance ? [{ type: "value", name: "Balance", splitLine: { show: false }, axisLabel: { color: c.faint, fontSize: 10 } }] : []),
        ],
        series: [
          { name: "Consumed kWh", type: "bar", barMaxWidth: 12, borderRadius: [3, 3, 0, 0], itemStyle: { color: c.primary }, data: deltaData },
          ...(hasBalance ? [{ name: "Balance", type: "line", yAxisIndex: 1, smooth: true, showSymbol: false, lineStyle: { width: 2, color: "#2563eb" }, itemStyle: { color: "#2563eb" }, data: balanceData }] : []),
          ...(hasRecharges ? [{ name: "Recharge kWh", type: "scatter", symbolSize: 10, itemStyle: { color: "#f59e0b" }, data: rechargeData.map((v, i) => v != null ? [i, v] : null).filter(Boolean) }] : []),
        ],
      };
    },
  },

  mounted() {
    // Refresh the estate before/alongside the first load so a newly onboarded
    // station is selectable without a redeploy.
    fetchStations()
      .then((stations) => { if (stations.length) this.STATIONS = stations; })
      .catch(() => { /* registry unreachable — keep the seeded list */ });
    this.load();
    this.themeObserver = new MutationObserver(() => { this.themeTick++; });
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  },
  beforeUnmount() { if (this.themeObserver) this.themeObserver.disconnect(); },

  methods: {
    themeColors() {
      /* eslint-disable-next-line no-unused-expressions */
      this.themeTick;
      const fallback = {
        text: "#1e293b", muted: "#64748b", faint: "#94a3b8", border: "#e2e8f0",
        grid: "#f1f5f9", primary: "#059669", tooltipBg: "rgba(15,23,42,0.94)", tooltipText: "#f8fafc",
      };
      if (typeof window === "undefined") return fallback;
      const cs = getComputedStyle(document.documentElement);
      const get = (n, fb) => (cs.getPropertyValue(n) || "").trim() || fb;
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      return {
        text:       get("--text-main",   fallback.text),
        muted:      get("--text-muted",  fallback.muted),
        faint:      get("--text-faint",  fallback.faint),
        border:     get("--border-color",fallback.border),
        grid:       isDark ? "rgba(148,163,184,0.14)" : "#f1f5f9",
        primary:    get("--primary",     fallback.primary),
        tooltipBg:  isDark ? "rgba(2,6,23,0.95)" : "rgba(15,23,42,0.94)",
        tooltipText:"#f8fafc",
      };
    },

    colorFor(station) {
      const idx = STATIONS.indexOf(String(station || "").toUpperCase());
      return PALETTE[(idx >= 0 ? idx : STATIONS.length) % PALETTE.length];
    },

    fmt(value, decimals = 2) {
      const n = Number(value);
      if (!Number.isFinite(n)) return "—";
      return n.toLocaleString("en-NG", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    },

    fmtNgn(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return "—";
      return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(n);
    },

    moneyEquivalent(divisor = 1) {
      if (!this.consumptionValue.complete) return "Tariff value unavailable";
      return `${this.fmtNgn(this.consumptionValue.valueNgn / Math.max(1, Number(divisor) || 1))} equivalent`;
    },

    growthLabel(pct) {
      if (pct == null) return "New";
      if (pct === 0) return "Flat";
      return (pct > 0 ? "▲ " : "▼ ") + Math.abs(pct).toFixed(1) + "%";
    },
    growthClass(pct) {
      if (pct == null) return "scc-tone--dim";
      if (pct > 0)  return "scc-tone--up";
      if (pct < 0)  return "scc-tone--down";
      return "scc-tone--dim";
    },
    growthTone(pct) {
      if (pct == null || pct === 0) return "neutral";
      return pct > 0 ? "up" : "down";
    },

    setGranularity(key) {
      // Granularity only changes granularity — period/dates stay exactly as they are.
      if (this.granularity === key) return;
      this.granularity = key;
      this.load();
    },

    onCustomDate() {
      if (!this.from || !this.to) {
        this.error = "Pick a valid date range (from ≤ to).";
        return;
      }
      if (this.from > this.to) this.to = this.from;
      this.load();
    },

    async refreshAggregates() {
      this.refreshingAgg = true;
      this.error = "";
      try {
        const stationIds = this.stationFilter ? [this.stationFilter] : this.STATIONS;
        await triggerMeterAggregateRefresh(stationIds);
        this.lastAggRefresh = new Date().toLocaleTimeString();
        await this.load();
      } catch (err) {
        this.error = (err && err.message) || "Aggregate refresh failed.";
      } finally {
        this.refreshingAgg = false;
      }
    },

    async load() {
      if (!this.from || !this.to) return;
      const myReq = ++this.reqId;
      this.loading = true; this.error = ""; this.rangeNote = "";
      try {
        const data = await fetchStationConsumptionAnalytics({
          stationId: this.stationFilter || null,
          from: this.from, to: this.to,
          granularity: this.granularity, topMeters: 25,
        });
        if (myReq !== this.reqId) return;
        this.data = data;
        this.topMetersPage = 1;
        if (!data || !data.totals || !data.totals.sourceRows) {
          this.rangeNote = "No meter readings stored for this range yet. Aggregates may still be building.";
        } else if (data.range && data.range.granularityCoarsened) {
          const reqLabel = (this.GRANS.find((g) => g.key === data.range.requestedGranularity) || {}).label || "Daily";
          const effLabel = (this.GRANS.find((g) => g.key === data.range.granularity) || {}).label || "Monthly";
          this.rangeNote = `${reqLabel} view auto-switched to ${effLabel} for this wide range (keeps the query fast and the chart readable).`;
        }
      } catch (err) {
        if (myReq !== this.reqId) return;
        const message = err && err.message ? err.message : "";
        this.error = /fetch failed|statement timeout|timed out/i.test(message)
          ? "Station analytics is temporarily unavailable."
          : message || "Failed to load station consumption analytics.";
        this.data = null;
      } finally {
        if (myReq === this.reqId) this.loading = false;
      }
    },

    exportCsv() {
      if (!this.data) return;
      const esc = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const lines = [];
      lines.push(`Station Consumption,${this.from} to ${this.to},${this.granularityLabel}${this.stationFilter ? "," + this.stationFilter : ""},Source: ${this.dataSource || "unknown"}`);
      lines.push("");
      lines.push(["Rank","Station","Meter Read kWh","Delta kWh","Share %","Meters","Active Meters","Avg per Meter","Avg Daily kWh","Peak Day","Peak kWh","Growth %"].join(","));
      this.data.stations.forEach((s, i) => lines.push([
        i + 1, s.station, s.latestOdometerKwh || 0, s.totalKwh, s.share, s.meterCount, s.activeMeterCount,
        s.avgPerMeter, s.avgDailyKwh, s.peakDay.date || "", s.peakDay.kwh || 0,
        s.growthPct == null ? "new" : s.growthPct,
      ].map(esc).join(",")));
      lines.push("");
      lines.push(["Top Meter Rank","Meter","Customer","Station","Total kWh","Active Periods","Avg / Period"].join(","));
      this.data.topMeters.forEach((m, i) => lines.push([
        i + 1, m.meterId, m.customerName || "", m.station, m.totalKwh, m.activeDays, m.avgDailyKwh,
      ].map(esc).join(",")));
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `station-consumption_${this.from}_${this.to}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    round2(v) { return Math.round((Number(v) || 0) * 100) / 100; },
    goTopMetersPage(page) {
      const next = Math.min(this.topMetersTotalPages, Math.max(1, page));
      this.topMetersPage = next;
    },

    analyzeMeter() {
      const id = this.meterQuery.trim();
      if (id) this.openMeter(id, null);
    },
    closeMeter() { this.drawerOpen = false; },

    async openMeter(meterId, station) {
      this.meterQuery = meterId;
      this.drawerOpen = true;
      this.meterError = "";
      this.meterLoading = true;
      this.meterData = null;
      this.rechargeData = { rows: [], totals: { count: 0, purchasedKwh: 0, totalPaid: 0, avgPaid: 0, lastDate: null }, byDate: {} };
      const myReq = ++this.meterReqId;
      try {
        const data = await fetchMeterConsumptionAnalysis({ meterId, stationId: station || null, from: this.from, to: this.to });
        if (myReq !== this.meterReqId) return;
        this.meterData = data;
        if (!data || !data.series || !data.series.length) {
          this.meterError = "No meter readings stored for this meter in this range.";
        }
        this.loadMeterRecharge(meterId, (data && data.station) || station || null, myReq);
      } catch (err) {
        if (myReq !== this.meterReqId) return;
        this.meterError = err && err.message ? err.message : "Failed to load meter analysis.";
      } finally {
        if (myReq === this.meterReqId) this.meterLoading = false;
      }
    },

    async loadMeterRecharge(meterId, station, myReq) {
      this.rechargeLoading = true;
      try {
        const records = await fetchTokenRecords(this.from, this.to, station || null, `meter:${meterId}`);
        if (myReq !== this.meterReqId) return;
        const target = String(meterId).toUpperCase();
        const matched = (records || []).filter((r) => String(r.meterId || r.customerId || "").toUpperCase() === target);
        const rows = [];
        const byDate = {};
        let purchasedKwh = 0; let totalPaid = 0; let lastDate = null;
        for (const r of matched) {
          const date = String(r.createDate || "").substring(0, 10);
          const units = Number(r.totalUnit) || 0;
          const paid  = Number(r.totalPaid) || 0;
          purchasedKwh += units; totalPaid += paid;
          if (!lastDate || date > lastDate) lastDate = date;
          rows.push({ date, units, paid, vend: Number(r.vend) || 0, token: r.token || "", receiptId: r.receiptId || "" });
          if (!byDate[date]) byDate[date] = { units: 0, paid: 0, count: 0 };
          byDate[date].units += units; byDate[date].paid += paid; byDate[date].count++;
        }
        rows.sort((a, b) => (a.date < b.date ? 1 : -1));
        this.rechargeData = {
          rows, byDate,
          totals: { count: rows.length, purchasedKwh: this.round2(purchasedKwh), totalPaid: this.round2(totalPaid), avgPaid: rows.length ? this.round2(totalPaid / rows.length) : 0, lastDate },
        };
      } catch {
        if (myReq === this.meterReqId) this.rechargeData = { rows: [], byDate: {}, totals: { count: 0, purchasedKwh: 0, totalPaid: 0, avgPaid: 0, lastDate: null } };
      } finally {
        if (myReq === this.meterReqId) this.rechargeLoading = false;
      }
    },

    exportMeterCsv() {
      if (!this.meterData) return;
      const esc = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const t = this.meterData.totals; const r = this.rechargeData.totals;
      const lines = [];
      lines.push(`Meter Analysis,${this.meterData.meterId},${this.meterData.station || ""},${this.meterData.customerName || ""}`);
      lines.push(`Range,${this.from},${this.to}`);
      lines.push(`Consumed kWh,${t.consumedKwh},Purchased kWh,${r.purchasedKwh},Total Paid,${r.totalPaid},Current Balance,${t.latestRemain == null ? "" : t.latestRemain}`);
      lines.push("");
      lines.push("Recharge Date,Units,Paid,Vend,Token,Receipt");
      this.rechargeData.rows.forEach((row) => lines.push([row.date, row.units, row.paid, row.vend, row.token, row.receiptId].map(esc).join(",")));
      lines.push("");
      lines.push("Reading Date,Meter Reading (total1),Used kWh,Balance (remain1)");
      this.meterData.series.forEach((row) => lines.push([row.date, row.total1, row.delta, row.remain1 == null ? "" : row.remain1].map(esc).join(",")));
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `meter_${this.meterData.meterId}_${this.from}_${this.to}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  },
};
</script>

<style scoped>
/* ─── Design tokens ───────────────────────────────────────────────────────── */
.scc {
  --_soft:   color-mix(in srgb, var(--text-main)    5%, transparent);
  --_softer: color-mix(in srgb, var(--text-main)    3%, transparent);
  --_line:   color-mix(in srgb, var(--border-color) 70%, transparent);
  --_track:  color-mix(in srgb, var(--text-main)   10%, transparent);
  --_radius: var(--radius-md, 12px);

  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 2px;
  color: var(--text-main);
}

/* ─── Hero ────────────────────────────────────────────────────────────────── */
.scc-hero {
  position: relative;
  overflow: hidden;
  border-radius: var(--_radius);
  background: linear-gradient(135deg, var(--primary-deep, #065f46) 0%, var(--primary, #059669) 100%);
  color: #fff;
}
.scc-hero-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(58% 130% at 95% -8%, rgba(255,255,255,0.22), transparent 56%),
              radial-gradient(30% 60% at 10% 110%, rgba(0,0,0,0.18), transparent 60%);
  pointer-events: none;
}
.scc-hero-inner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  flex-wrap: wrap;
}
.scc-hero-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 220px;
}
.scc-hero-icon {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 11px;
  background: rgba(255,255,255,0.18);
  backdrop-filter: blur(4px);
}
.scc-hero-icon svg { width: 21px; height: 21px; }
.scc-hero-eyebrow {
  font-size: 9.5px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: rgba(255,255,255,0.7);
  display: block;
  margin-bottom: 1px;
}
.scc-hero-title {
  margin: 0;
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.025em;
  line-height: 1.1;
}
.scc-hero-sub {
  margin: 3px 0 0;
  font-size: 11.5px;
  color: rgba(255,255,255,0.78);
  line-height: 1.4;
}
.scc-hero-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}
.scc-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
}
.scc-badge svg { width: 11px; height: 11px; }
.scc-badge--fast  { background: rgba(255,255,255,0.18); color: #fff; border: 1px solid rgba(255,255,255,0.28); }
.scc-badge--slow  { background: rgba(245,158,11,0.22); color: #fde68a; border: 1px solid rgba(245,158,11,0.4); }
.scc-badge--info  { background: rgba(255,255,255,0.14); color: rgba(255,255,255,0.9); border: 1px solid rgba(255,255,255,0.22); }

.scc-hero-actions {
  display: flex;
  gap: 7px;
  align-items: center;
  flex-wrap: wrap;
}

/* Hero buttons */
.scc-hbtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 13px;
  border-radius: 9px;
  border: none;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all .14s;
  line-height: 1;
}
.scc-hbtn svg { width: 13px; height: 13px; flex-shrink: 0; }
.scc-hbtn--primary { background: #fff; color: var(--primary-deep, #065f46); }
.scc-hbtn--primary:hover:not(:disabled) { box-shadow: 0 4px 16px rgba(0,0,0,0.22); transform: translateY(-1px); }
.scc-hbtn--ghost   { background: rgba(255,255,255,0.16); color: #fff; }
.scc-hbtn--ghost:hover:not(:disabled)   { background: rgba(255,255,255,0.28); }
.scc-hbtn--outline { background: transparent; color: var(--primary); border: 1.5px solid var(--primary); }
.scc-hbtn--outline:hover:not(:disabled) { background: color-mix(in srgb, var(--primary) 10%, transparent); }
.scc-hbtn--sm { padding: 6px 11px; font-size: 11.5px; }
.scc-hbtn:disabled { opacity: .5; cursor: default; }

/* ─── Controls ────────────────────────────────────────────────────────────── */
.scc-controls-wrap {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--_radius);
  box-shadow: var(--shadow-xs, 0 1px 3px rgba(0,0,0,.04));
  overflow: hidden;
}
/* Each row: label + body */
.scc-ctrl-row {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0;
}
.scc-ctrl-label {
  width: 90px;
  min-width: 90px;
  font-size: 9.5px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--text-faint);
  padding: 10px 14px;
  border-right: 1px solid var(--border-color);
  background: var(--_softer);
  align-self: stretch;
  display: flex;
  align-items: center;
}
.scc-ctrl-body {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  flex: 1;
  flex-wrap: nowrap;
  min-width: 0;
}
.scc-ctrl-divider {
  height: 1px;
  background: var(--border-color);
}

/* Date range */
.scc-daterange { display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; width: 100%; }
.scc-cal-icon  { width: 13px; height: 13px; color: var(--text-faint); flex-shrink: 0; }
.scc-date-sep  { font-size: 11px; color: var(--text-faint); font-weight: 700; line-height: 1; }
.scc-date {
  padding: 5px 8px;
  border-radius: 8px;
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-main);
  font-size: 11.5px;
  transition: border-color .13s;
  min-width: 0;
  flex: 1 1 0;
}
.scc-date:focus { outline: none; border-color: var(--primary); }

/* Granularity segment */
.scc-seg {
  display: inline-flex;
  background: var(--_soft);
  border-radius: 8px;
  padding: 2px;
  gap: 1px;
  flex-shrink: 0;
}
.scc-seg-btn {
  padding: 5px 11px;
  border: none;
  background: transparent;
  border-radius: 7px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  transition: all .13s;
  line-height: 1;
}
.scc-seg-btn--active { background: var(--bg-card); color: var(--primary); box-shadow: 0 1px 3px rgba(0,0,0,.1); }
.scc-seg-btn:hover:not(.scc-seg-btn--active) { color: var(--text-main); }

/* Station select */
.scc-select-wrap {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 170px;
  flex: 1 1 auto;
}
.scc-select-icon {
  position: absolute;
  left: 9px;
  width: 13px;
  height: 13px;
  color: var(--text-faint);
  pointer-events: none;
}
.scc-select {
  padding: 5px 9px 5px 27px;
  border-radius: 8px;
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-main);
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color .13s;
  width: 100%;
}
.scc-select:focus { outline: none; border-color: var(--primary); }

/* ─── Alerts ──────────────────────────────────────────────────────────────── */
.scc-alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 13px;
  border-radius: 10px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.4;
}
.scc-alert svg { width: 15px; height: 15px; flex-shrink: 0; margin-top: 1px; }
.scc-alert span { flex: 1; min-width: 0; }
.scc-alert button {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.scc-alert button:disabled { opacity: .5; cursor: default; }
.scc-alert--err  { background: var(--danger-bg, #fef2f2); border: 1px solid color-mix(in srgb, var(--danger, #ef4444) 30%, transparent); color: var(--danger, #dc2626); }
.scc-alert--info { background: color-mix(in srgb, var(--primary) 9%, var(--bg-card)); border: 1px solid color-mix(in srgb, var(--primary) 28%, transparent); color: var(--primary); }

/* ─── KPI cards ───────────────────────────────────────────────────────────── */
.scc-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 9px;
}
.scc-kpis--sm {
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 7px;
}
.scc-kpi {
  position: relative;
  overflow: hidden;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 11px;
  padding: 10px 13px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  box-shadow: var(--shadow-xs, 0 1px 2px rgba(15,23,42,.04));
  transition: box-shadow .15s;
}
.scc-kpi:hover { box-shadow: 0 3px 12px rgba(0,0,0,.08); }
.scc-kpi--primary { border-color: color-mix(in srgb, var(--primary) 35%, transparent); }
.scc-kpi-head { display: flex; justify-content: space-between; align-items: center; }
.scc-kpi-label { font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: var(--text-faint); }
.scc-kpi-value { font-size: 18px; font-weight: 800; color: var(--text-main); letter-spacing: -0.025em; line-height: 1.1; }
.scc-kpi-money { font-size: 10.5px; color: var(--primary); font-weight: 800; letter-spacing: -.01em; }
.scc-kpi-money--unavailable { color: var(--text-faint); font-weight: 600; }
.scc-kpi-sub   { font-size: 10.5px; color: var(--text-muted); font-weight: 600; }
.scc-valuation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 13px;
  border: 1px solid var(--border-color);
  border-radius: 11px;
  background: var(--bg-card);
  color: var(--text-main);
  font-size: 11px;
}
.scc-valuation > div { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.scc-valuation strong { font-size: 11.5px; }
.scc-valuation span { color: var(--text-muted); }
.scc-valuation-metrics b { padding: 3px 8px; border-radius: 999px; font-size: 10px; }
.scc-valuation-ok { color: var(--primary); background: color-mix(in srgb, var(--primary) 10%, transparent); }
.scc-valuation-warn { color: var(--danger, #dc2626); background: var(--danger-bg, #fef2f2); }
.scc-tone--up      { color: var(--success, #059669); }
.scc-tone--down    { color: var(--danger,  #ef4444); }
.scc-tone--neutral { color: var(--text-faint); }
.scc-tone--dim     { color: var(--text-faint); }
.scc-shimmer {
  position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--text-main) 9%, transparent) 50%, transparent 100%);
  transform: translateX(-100%);
  animation: scc-sh 1.4s infinite;
}
@keyframes scc-sh { to { transform: translateX(100%); } }
.scc-spin { animation: scc-rot 0.9s linear infinite; }
@keyframes scc-rot { to { transform: rotate(360deg); } }

/* ─── Card ────────────────────────────────────────────────────────────────── */
.scc-card {
  position: relative;
  z-index: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--_radius);
  padding: 13px 15px;
  box-shadow: var(--shadow-xs, 0 1px 2px rgba(15,23,42,.04));
  overflow: hidden;
  min-width: 0;
}
.scc-card--trend {
  min-height: 0;
}
.scc-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 8px;
}
.scc-card-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.scc-card-head-left strong { font-size: 13.5px; color: var(--text-main); font-weight: 700; }
.scc-card-badge {
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--_soft);
  color: var(--text-faint);
  font-size: 10.5px;
  font-weight: 600;
}
.scc-card-meta { font-size: 10.5px; color: var(--text-faint); font-weight: 600; white-space: nowrap; }
.scc-bullet { display: inline-block; width: 7px; height: 7px; border-radius: 2px; background: var(--primary); flex-shrink: 0; }
.scc-top-meta { display: flex; align-items: center; gap: 10px; }

/* ─── Charts ──────────────────────────────────────────────────────────────── */
.scc-chart      {
  position: relative;
  height: 200px;
  overflow: hidden;
  min-width: 0;
}
.scc-chart--tall { height: 240px; }
.scc-card--trend .scc-chart--tall {
  height: 240px;
  min-height: 240px;
}
.scc-card--seasonality-empty {
  min-height: 220px;
}
.scc-chart--empty-state {
  height: 160px;
}
.scc-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: stretch;
}
.scc-row-2 > .scc-card {
  min-height: 300px;
  display: flex;
  flex-direction: column;
}
.scc-row-2 > .scc-card .scc-chart {
  flex: 1 1 auto;
  min-height: 240px;
  height: 100%;
}
.scc-chart :deep(.echart-panel),
.scc-chart :deep(.echart-canvas) {
  width: 100%;
  height: 100% !important;
  min-height: 0 !important;
  max-height: 100%;
  overflow: hidden;
}
.scc-chart :deep(.echart-canvas > div),
.scc-chart :deep(.echart-canvas canvas) {
  max-height: 100% !important;
}
.scc-chart :deep(.dashboard-svg-chart svg) {
  overflow: hidden;
}
.scc-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  min-height: 80px;
  color: var(--text-faint);
  font-size: 12px;
}
.scc-empty svg { width: 32px; height: 32px; opacity: .4; }

/* ─── Tables ──────────────────────────────────────────────────────────────── */
.scc-table-wrap { overflow-x: auto; }
.scc-table-wrap--league { -webkit-overflow-scrolling: touch; }
.scc-table-wrap--scroll { max-height: 270px; overflow-y: auto; }
.scc-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.scc-table--topmeters {
  width: 100%;
  table-layout: fixed;
}
.scc-table--topmeters th:nth-child(1),
.scc-table--topmeters td:nth-child(1) { width: 36px; text-align: center; }
.scc-table--topmeters th:nth-child(2),
.scc-table--topmeters td:nth-child(2) { width: 90px; }
.scc-table--topmeters th:nth-child(3),
.scc-table--topmeters td:nth-child(3) { width: 160px; overflow: hidden; text-overflow: ellipsis; }
.scc-table--topmeters th:nth-child(4),
.scc-table--topmeters td:nth-child(4) { width: 110px; }
.scc-table--topmeters th:nth-child(5),
.scc-table--topmeters td:nth-child(5) { width: 100px; text-align: right; }
.scc-table--topmeters th:nth-child(6),
.scc-table--topmeters td:nth-child(6) { width: 110px; text-align: right; }
.scc-table--topmeters th:nth-child(7),
.scc-table--topmeters td:nth-child(7) { width: 100px; text-align: right; }
.scc-table--topmeters th:nth-child(8),
.scc-table--topmeters td:nth-child(8) { width: 28px; text-align: center; }

.scc-table--league {
  width: 100%;
  min-width: 1020px;
  table-layout: fixed;
}
.scc-table--league th:nth-child(1),
.scc-table--league td:nth-child(1) { width: 36px; text-align: center; }
.scc-table--league th:nth-child(2),
.scc-table--league td:nth-child(2) { width: 120px; }
.scc-table--league th:nth-child(3),
.scc-table--league td:nth-child(3) { width: 110px; text-align: right; }
.scc-table--league th:nth-child(4),
.scc-table--league td:nth-child(4) { width: 95px; text-align: right; }
.scc-table--league th:nth-child(5),
.scc-table--league td:nth-child(5) { width: 110px; text-align: right; }
.scc-table--league th:nth-child(6),
.scc-table--league td:nth-child(6) { width: 70px; text-align: right; }
.scc-table--league th:nth-child(7),
.scc-table--league td:nth-child(7) { width: 70px; text-align: right; }
.scc-table--league th:nth-child(8),
.scc-table--league td:nth-child(8) { width: 95px; text-align: right; }
.scc-table--league th:nth-child(9),
.scc-table--league td:nth-child(9) { width: 95px; text-align: right; }
.scc-table--league th:nth-child(10),
.scc-table--league td:nth-child(10) { width: 130px; }
.scc-table--league th:nth-child(11),
.scc-table--league td:nth-child(11) { width: 80px; text-align: right; }

.scc-table--drawer-recharges {
  width: 100%;
  table-layout: fixed;
}
.scc-table--drawer-recharges th:nth-child(1),
.scc-table--drawer-recharges td:nth-child(1) { width: 90px; }
.scc-table--drawer-recharges th:nth-child(2),
.scc-table--drawer-recharges td:nth-child(2) { width: 70px; text-align: right; }
.scc-table--drawer-recharges th:nth-child(3),
.scc-table--drawer-recharges td:nth-child(3) { width: 80px; text-align: right; }
.scc-table--drawer-recharges th:nth-child(4),
.scc-table--drawer-recharges td:nth-child(4) { width: 70px; text-align: right; }
.scc-table--drawer-recharges th:nth-child(5),
.scc-table--drawer-recharges td:nth-child(5) { width: 130px; }

.scc-table--drawer-consumption {
  width: 100%;
  table-layout: fixed;
}
.scc-table--drawer-consumption th:nth-child(1),
.scc-table--drawer-consumption td:nth-child(1) { width: 90px; }
.scc-table--drawer-consumption th:nth-child(2),
.scc-table--drawer-consumption td:nth-child(2) { width: 90px; text-align: right; }
.scc-table--drawer-consumption th:nth-child(3),
.scc-table--drawer-consumption td:nth-child(3) { width: 80px; text-align: right; }
.scc-table--drawer-consumption th:nth-child(4),
.scc-table--drawer-consumption td:nth-child(4) { width: 80px; text-align: right; }
.scc-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  text-align: left;
  padding: 6px 9px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: var(--text-muted);
  background: var(--bg-card);
  border-bottom: 1.5px solid var(--border-color);
  white-space: nowrap;
}
.scc-table td {
  padding: 7px 9px;
  border-bottom: 1px solid var(--_line);
  color: var(--text-muted);
  white-space: nowrap;
  vertical-align: middle;
  font-variant-numeric: tabular-nums;
}
.scc-tr:last-child td { border-bottom: none; }
.scc-tr:hover td { background: var(--_softer); }
.scc-tr--click { cursor: pointer; }
.scc-tr--click:hover td { background: color-mix(in srgb, var(--primary) 8%, transparent); }
.scc-tr--click:focus-visible td { outline: 2px solid var(--primary); outline-offset: -2px; }

.scc-th-rank  { width: 36px; text-align: center; }
.scc-th-action { width: 24px; }
.scc-num      { text-align: right; font-variant-numeric: tabular-nums; }
.scc-bold     { font-weight: 700; color: var(--text-main); }
.scc-rank     { color: var(--text-faint); font-weight: 700; text-align: center; }
.scc-muted    { color: var(--text-faint); font-size: 10.5px; }
.scc-mono     { font-family: var(--bev-font-mono); font-size: 11.5px; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
.scc-token    { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scc-customer { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scc-peak     { font-size: 11.5px; }
.scc-arrow    { color: var(--text-faint); font-size: 16px; font-weight: 700; }
.scc-tr--click:hover .scc-arrow { color: var(--primary); }
.scc-empty-cell { text-align: center; padding: 20px; color: var(--text-faint); font-size: 12px; }
.scc-pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.scc-page-info { font-size: 10.5px; color: var(--text-faint); font-weight: 600; }
.scc-page-btn {
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-main);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.scc-page-btn:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.scc-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}
.scc-dot--sm { width: 7px; height: 7px; }
.scc-station-cell { display: flex; align-items: center; gap: 7px; font-weight: 600; color: var(--text-main); }

/* Share bar */
.scc-share-wrap { display: flex; align-items: center; gap: 7px; justify-content: flex-end; }
.scc-share-track { width: 52px; height: 5px; border-radius: 3px; background: var(--_track); overflow: hidden; flex-shrink: 0; }
.scc-share-fill  { height: 100%; border-radius: 3px; }

/* Growth */
.scc-growth { font-weight: 700; font-size: 11.5px; }

/* ─── Meter search bar ────────────────────────────────────────────────────── */
.scc-searchbar {
  display: flex;
  align-items: center;
  gap: 9px;
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: 12px;
  padding: 8px 13px;
  box-shadow: var(--shadow-xs, 0 1px 2px rgba(0,0,0,.04));
  transition: border-color .15s;
}
.scc-searchbar:focus-within { border-color: var(--primary); }
.scc-searchbar-icon { width: 15px; height: 15px; color: var(--text-faint); flex-shrink: 0; }
.scc-searchbar-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 12.5px;
  color: var(--text-main);
  background: transparent;
  min-width: 0;
}
.scc-searchbar-input::placeholder { color: var(--text-faint); }

/* In searchbar, primary button uses primary color */
.scc-searchbar .scc-hbtn--primary {
  background: var(--primary);
  color: #fff;
  box-shadow: none;
}
.scc-searchbar .scc-hbtn--primary:hover:not(:disabled) {
  background: var(--primary-deep, #065f46);
  transform: none;
  box-shadow: 0 2px 8px rgba(0,0,0,.18);
}

/* ─── Drawer ──────────────────────────────────────────────────────────────── */
.scc-drawer-scrim {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(2,6,23,0.52);
  display: flex;
  justify-content: flex-end;
}
.scc-drawer {
  width: min(940px, 100%);
  height: 100%;
  overflow-y: auto;
  background: var(--bg-page);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: -10px 0 48px rgba(0,0,0,0.3);
}
.scc-drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}
.scc-drawer-header-info { flex: 1; min-width: 0; }
.scc-drawer-eyebrow { font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .1em; color: var(--primary); display: block; margin-bottom: 2px; }
.scc-drawer-title { margin: 0 0 3px; font-size: 20px; font-weight: 800; color: var(--text-main); font-family: var(--bev-font-mono); letter-spacing: -0.01em; }
.scc-drawer-meta { margin: 0; font-size: 11.5px; color: var(--text-muted); display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.scc-drawer-close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-muted);
  border-radius: 9px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all .13s;
}
.scc-drawer-close:hover { background: var(--_track); color: var(--text-main); }
.scc-drawer-close svg { width: 14px; height: 14px; }
.scc-drawer-loading { display: flex; align-items: center; gap: 10px; padding: 28px 16px; color: var(--text-faint); font-size: 13px; }
.scc-drawer-footer { display: flex; justify-content: flex-end; padding-top: 4px; }

/* Spinner */
.scc-spinner {
  width: 18px; height: 18px;
  border: 2.5px solid var(--_track);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: scc-rot .8s linear infinite;
  flex-shrink: 0;
}

/* ─── Drawer slide-in animation ───────────────────────────────────────────── */
.scc-drawer-anim-enter-active { animation: scc-slide-in .22s cubic-bezier(.25,.46,.45,.94) both; }
.scc-drawer-anim-leave-active { animation: scc-slide-in .18s cubic-bezier(.55,.06,.68,.19) reverse both; }
@keyframes scc-slide-in {
  from { opacity: 0; transform: translateX(32px); }
  to   { opacity: 1; transform: translateX(0);    }
}

/* ─── Responsive ──────────────────────────────────────────────────────────── */
@media (max-width: 1024px) {
  .scc-row-2 { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  .scc-ctrl-label { display: none; }
  .scc-ctrl-row { flex-direction: column; align-items: stretch; }
  .scc-ctrl-body {
    padding: 8px 10px;
    gap: 10px;
    flex-wrap: wrap;
  }
  .scc-seg {
    width: 100%;
    justify-content: space-between;
  }
  .scc-seg-btn {
    flex: 1 1 0;
    text-align: center;
  }
  .scc-select-wrap {
    width: 100%;
    min-width: 0;
  }
  .scc-select {
    min-width: 0;
  }
  .scc-hero-badges { display: none; }
  .scc-kpis { grid-template-columns: repeat(2, 1fr); }
  .scc-kpi-value { font-size: 16px; }
  .scc-chart--tall { height: 190px; }
  .scc-card--trend { min-height: 0; }
  .scc-card--trend .scc-chart--tall {
    height: 200px;
    min-height: 200px;
  }
  .scc-card--share { min-height: 280px; }
  .scc-card--share .scc-chart--share { min-height: 220px; }
  .scc-card--seasonality-empty { min-height: 200px; }
  .scc-chart--empty-state { height: 140px; }
  .scc-top-meta {
    width: 100%;
    justify-content: space-between;
  }
  .scc-pagination {
    justify-content: space-between;
  }
  .scc-card--league .scc-card-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }
  .scc-table--league { min-width: 720px; }
  .scc-table--league th:nth-child(6),
  .scc-table--league th:nth-child(7),
  .scc-table--league th:nth-child(8),
  .scc-table--league th:nth-child(9),
  .scc-table--league th:nth-child(10),
  .scc-table--league td:nth-child(6),
  .scc-table--league td:nth-child(7),
  .scc-table--league td:nth-child(8),
  .scc-table--league td:nth-child(9),
  .scc-table--league td:nth-child(10) {
    display: none;
  }
}
@media (max-width: 400px) {
  .scc-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .scc-kpi { min-width: 0; }
  .scc-kpi-value { font-size: 14px; overflow-wrap: anywhere; }
  .scc-hero-actions .scc-hbtn:not(.scc-hbtn--primary) { display: none; }
  .scc-daterange { gap: 4px; }
  .scc-date-sep { font-size: 10px; }
}
</style>
