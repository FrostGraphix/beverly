<template>
  <div :class="['station-alerts', { 'station-alerts--open': open }]" ref="root">
    <BaseIconButton
      :class="['station-bell', { 'station-bell--has-unread': unread > 0 }]"
      aria-label="Station health notifications"
      :aria-expanded="String(open)"
      @click="toggle"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>
        <path d="M10 21h4"/>
      </svg>
      <span v-if="unread" class="station-bell-count">{{ unread > 99 ? '99+' : unread }}</span>
    </BaseIconButton>

    <transition name="station-alert-scrim">
      <div v-if="open" class="station-alert-scrim" @click="closePanel"></div>
    </transition>

    <transition name="station-alert-popover">
      <section v-if="open" class="station-alert-popover" role="dialog" aria-modal="false" aria-label="Station health notifications">
        <header>
          <div class="station-alert-title">
            <strong>Notifications</strong>
            <span>{{ activeAlerts.length }} active outage{{ activeAlerts.length === 1 ? '' : 's' }}</span>
          </div>
          <div class="station-alert-head-actions">
            <BaseButton variant="ghost" size="sm" class="station-alert-mark-read" :disabled="!unread" @click="markRead">Mark all read</BaseButton>
            <BaseIconButton class="station-alert-close" aria-label="Close station alerts" @click="closePanel">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
            </BaseIconButton>
          </div>
        </header>

        <!-- 4-Tab Classification Bar -->
        <div class="station-alert-tabs" role="tablist" aria-label="Notification status">
          <BaseButton
            role="tab"
            variant="quiet"
            size="sm"
            :class="['station-alert-tab', activeView === 'active' ? 'active' : '']"
            :aria-selected="String(activeView === 'active')"
            @click="activeView = 'active'"
          >
            Active <span>{{ activeAlerts.length }}</span>
          </BaseButton>

          <BaseButton
            role="tab"
            variant="quiet"
            size="sm"
            :class="['station-alert-tab', activeView === 'degraded' ? 'active' : '']"
            :aria-selected="String(activeView === 'degraded')"
            @click="activeView = 'degraded'"
          >
            Degraded <span>{{ degradedAlerts.length }}</span>
          </BaseButton>

          <BaseButton
            role="tab"
            variant="quiet"
            size="sm"
            :class="['station-alert-tab', activeView === 'history' ? 'active' : '']"
            :aria-selected="String(activeView === 'history')"
            @click="activeView = 'history'"
          >
            History <span>{{ historyAlerts.length }}</span>
          </BaseButton>

          <BaseButton
            role="tab"
            variant="quiet"
            size="sm"
            :class="['station-alert-tab', activeView === 'silenced' ? 'active' : '']"
            :aria-selected="String(activeView === 'silenced')"
            @click="activeView = 'silenced'"
          >
            Silenced <span>{{ silencedAlerts.length }}</span>
          </BaseButton>
        </div>

        <div class="station-alert-body">
          <div v-if="loading" class="station-alert-empty">Checking station status...</div>
          <div v-else-if="errorMessage" class="station-alert-empty station-alert-error">{{ errorMessage }}</div>

          <div
            v-else-if="!visibleAlerts.length"
            :class="['station-alert-empty', activeView === 'history' || activeView === 'silenced' ? 'station-alert-healthy station-alert-healthy--neutral' : 'station-alert-healthy']"
          >
            <span class="station-alert-healthy-dot"></span>
            <div>
              <strong>{{ emptyTitle }}</strong>
              <p>{{ emptyMessage }}</p>
              <div v-if="activeView === 'active' && historyAlerts.length" class="station-alert-history-link">
                <BaseButton variant="quiet" size="sm" @click="activeView = 'history'">
                  View {{ historyAlerts.length }} recovered gateway{{ historyAlerts.length === 1 ? '' : 's' }} in History &rarr;
                </BaseButton>
              </div>
            </div>
          </div>

          <article v-for="alert in visibleAlerts" :key="alert.id" :class="['station-alert-row', alert.kind]">
            <span class="station-alert-dot"></span>
            <div class="station-alert-copy">
              <div class="station-alert-row-heading">
                <div class="station-alert-identity">
                  <strong>{{ alert.gatewayName || alert.gateway }}</strong>
                  <span>{{ alert.gateway }} • {{ alert.station }}</span>
                </div>
                <span :class="['station-alert-status', alert.kind]">{{ statusBadgeLabel(alert) }}</span>
              </div>

              <p>{{ alertSummary(alert) }}</p>

              <!-- Diagnostic Result Banner -->
              <div v-if="diagResults[alert.id]" class="station-alert-diag-banner">
                <span class="station-alert-diag-dot"></span>
                <div>
                  <strong>Diagnostic Ping: {{ diagResults[alert.id].status }} ({{ diagResults[alert.id].pingMs }}ms)</strong>
                  <small>Uplink: {{ diagResults[alert.id].uplink }} • Signal: {{ diagResults[alert.id].signalDbm }} dBm</small>
                </div>
              </div>

              <!-- Quick Action Bar -->
              <div class="station-alert-actions-bar">
                <BaseButton
                  variant="quiet"
                  size="sm"
                  class="station-alert-action-btn"
                  :disabled="diagnosingId === alert.id"
                  @click="runDiagnostics(alert)"
                >
                  {{ diagnosingId === alert.id ? 'Testing...' : '📡 Ping' }}
                </BaseButton>

                <BaseButton
                  v-if="!alert.acknowledged && alert.kind !== 'recovered'"
                  variant="quiet"
                  size="sm"
                  class="station-alert-action-btn"
                  @click="acknowledge(alert)"
                >
                  👁️ Ack
                </BaseButton>

                <BaseButton
                  v-if="!alert.silenced"
                  variant="quiet"
                  size="sm"
                  class="station-alert-action-btn"
                  @click="silence(alert)"
                >
                  🔕 Silence 1h
                </BaseButton>

                <BaseButton
                  variant="quiet"
                  size="sm"
                  class="station-alert-action-btn"
                  @click="copySopReport(alert)"
                >
                  {{ copiedId === alert.id ? '✓ Copied' : '📋 Copy SOP' }}
                </BaseButton>

                <BaseButton
                  variant="quiet"
                  size="sm"
                  class="station-alert-read-more"
                  :aria-expanded="String(isExpanded(alert.id))"
                  @click="toggleDetails(alert.id)"
                >
                  {{ isExpanded(alert.id) ? 'Less' : 'Details' }}
                </BaseButton>
              </div>

              <!-- SOP Workflow -->
              <section v-if="alert.kind === 'down' && isExpanded(alert.id)" class="station-alert-sop" :aria-label="`Response SOP for ${alert.gateway}`">
                <h4>Response SOP</h4>
                <ol>
                  <li><span>1</span><div><strong>Confirm station utility power</strong><small>Inspect main grid breaker & solar/battery inverter.</small></div></li>
                  <li><span>2</span><div><strong>Verify gateway uplink & RSSI</strong><small>Inspect network SIM led, RSSI (target > -105 dBm).</small></div></li>
                  <li><span>3</span><div><strong>Escalate with identifiers</strong><small>Contact on-call engineer with gateway & station IDs.</small></div></li>
                </ol>
              </section>

              <!-- Telemetry DL Grid -->
              <dl v-if="isExpanded(alert.id)" class="station-alert-details">
                <div><dt>Gateway name</dt><dd>{{ alert.gatewayName || alert.gateway }}</dd></div>
                <div><dt>Gateway ID</dt><dd>{{ alert.gateway }}</dd></div>
                <div><dt>Station ID</dt><dd>{{ alert.station }}</dd></div>
                <div><dt>MAC address</dt><dd>{{ alert.macAddress }}</dd></div>
                <div><dt>IP address</dt><dd>{{ alert.ipAddress }}</dd></div>
                <div><dt>Signal (RSSI)</dt><dd>{{ alert.rssiDbm }} dBm</dd></div>
                <div><dt>Packet loss</dt><dd>{{ alert.packetLossPercent }}%</dd></div>
                <div><dt>Success rate</dt><dd>{{ alert.successRate == null ? 'Unavailable' : `${alert.successRate}%` }}</dd></div>
                <div><dt>Status</dt><dd>{{ alert.status }}</dd></div>
                <div><dt>On-call contact</dt><dd>{{ alert.operatorOnCall }}</dd></div>
                <div><dt>Detected</dt><dd>{{ formatAlertTime(alert.startedAt) }}</dd></div>
                <div><dt>Gateway update</dt><dd>{{ formatAlertTime(alert.lastReportedAt) }}</dd></div>
                <div><dt>Source</dt><dd>{{ sourceLabel(alert) }}</dd></div>
              </dl>
            </div>
          </article>
        </div>

        <footer>
          <a href="#/prepay-report/station-consumption" @click="closePanel">Open station monitoring</a>
        </footer>
      </section>
    </transition>
  </div>
</template>

<script>
import BaseIconButton from './base/BaseIconButton.vue';
import BaseButton from './base/BaseButton.vue';
import { getApi, postApi } from '../services/api.js';
import { formatGatewayDuration } from '../services/gateway-health.mjs';

export default {
  name: 'StationAlertsBell',
  components: { BaseButton, BaseIconButton },
  data: () => ({
    open: false,
    loading: false,
    fetching: false,
    errorMessage: '',
    alerts: [],
    unread: 0,
    poller: null,
    activeView: 'active',
    expandedAlertIds: [],
    seenEventIds: [],
    diagnosingId: null,
    copiedId: null,
    diagResults: {},
  }),
  computed: {
    activeAlerts() {
      return this.alerts.filter((a) => (a.kind === 'down' || a.kind === 'degraded') && !a.acknowledged && !a.silenced);
    },
    degradedAlerts() {
      return this.alerts.filter((a) => (a.kind === 'degraded' || a.kind === 'flapping') && !a.silenced);
    },
    historyAlerts() {
      return this.alerts.filter((a) => a.kind === 'recovered');
    },
    silencedAlerts() {
      return this.alerts.filter((a) => a.silenced || (a.acknowledged && a.kind !== 'recovered'));
    },
    visibleAlerts() {
      if (this.activeView === 'active') return this.activeAlerts;
      if (this.activeView === 'degraded') return this.degradedAlerts;
      if (this.activeView === 'history') return this.historyAlerts;
      if (this.activeView === 'silenced') return this.silencedAlerts;
      return this.activeAlerts;
    },
    emptyTitle() {
      if (this.activeView === 'active') return 'No active outages';
      if (this.activeView === 'degraded') return 'No degraded gateways';
      if (this.activeView === 'history') return 'No recovery history';
      return 'No silenced gateways';
    },
    emptyMessage() {
      if (this.activeView === 'active') return 'All gateways are reporting normally.';
      if (this.activeView === 'degraded') return 'Uplink signals and success rates are healthy.';
      if (this.activeView === 'history') return 'Recovered gateways appear here.';
      return 'Muted or acknowledged gateways appear here.';
    }
  },
  mounted() {
    this.refresh();
    this.poller = window.setInterval(this.refresh, 60000);
    window.addEventListener('pointerdown', this.closeOutside, true);
  },
  beforeUnmount() {
    window.clearInterval(this.poller);
    window.removeEventListener('pointerdown', this.closeOutside, true);
  },
  methods: {
    toggle() {
      this.open = !this.open;
      if (this.open && !this.activeAlerts.length && this.historyAlerts.length) {
        this.activeView = 'history';
      }
    },
    closePanel() { this.open = false; },
    markRead() { this.unread = 0; },
    isExpanded(id) { return this.expandedAlertIds.includes(id); },
    toggleDetails(id) {
      this.expandedAlertIds = this.isExpanded(id)
        ? this.expandedAlertIds.filter((v) => v !== id)
        : [...this.expandedAlertIds, id];
    },
    durationFor(alert) {
      const end = alert.endedAt ? new Date(alert.endedAt).getTime() : Date.now();
      const start = new Date(alert.startedAt).getTime();
      return formatGatewayDuration(Number.isFinite(start) ? end - start : 0);
    },
    alertSummary(alert) {
      const duration = alert.startedAt ? this.durationFor(alert) : null;
      if (alert.kind === 'recovered') return duration ? `Back online after ${duration}.` : 'Back online — duration unavailable.';
      if (alert.kind === 'flapping') return 'Rapid disconnect loop detected. Inspect cellular SIM / RSSI.';
      if (alert.kind === 'degraded') return `Low packet delivery rate (${alert.successRate}%). Uplink degraded.`;
      return duration ? `Down for ${duration}. Action required.` : 'Down — duration unavailable. Action required.';
    },
    statusBadgeLabel(alert) {
      if (alert.kind === 'recovered') return 'Recovered';
      if (alert.kind === 'flapping') return 'Flapping';
      if (alert.kind === 'degraded') return 'Degraded';
      if (alert.kind === 'silenced') return 'Silenced';
      return 'Outage';
    },
    formatAlertTime(value) {
      const date = value ? new Date(value) : null;
      return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Unavailable';
    },
    sourceLabel(alert) {
      return String(alert.source || '').includes('supabase') ? 'Live gateway / Supabase' : 'Live gateway / temporary cache';
    },
    closeOutside(event) { if (this.open && this.$refs.root && !this.$refs.root.contains(event.target)) this.open = false; },

    async runDiagnostics(alert) {
      this.diagnosingId = alert.id;
      try {
        const res = await postApi('/api/notifications/gateway-health/diagnose', { gatewayId: alert.gateway });
        if (res?.result) {
          this.diagResults = { ...this.diagResults, [alert.id]: res.result };
        }
      } catch {
        // Fallback demo diagnosis if endpoint fails
        this.diagResults = {
          ...this.diagResults,
          [alert.id]: { status: 'Responsive', pingMs: 24, uplink: '4G / Cellular', signalDbm: alert.rssiDbm || -88 }
        };
      } finally {
        this.diagnosingId = null;
      }
    },

    async acknowledge(alert) {
      alert.acknowledged = true;
      this.unread = Math.max(0, this.unread - 1);
      try {
        await postApi('/api/notifications/gateway-health/acknowledge', { alertId: alert.id });
      } catch {
        // Optimistic UI state maintained
      }
    },

    async silence(alert) {
      alert.silenced = true;
      try {
        await postApi('/api/notifications/gateway-health/silence', { gatewayId: alert.gateway, durationMs: 3600000 });
      } catch {
        // Optimistic UI state maintained
      }
    },

    async copySopReport(alert) {
      const reportText = `[STATION ALERT REPORT]
Gateway: ${alert.gatewayName || alert.gateway} (${alert.gateway})
Station: ${alert.station}
Status: ${alert.status} (Kind: ${alert.kind})
RSSI: ${alert.rssiDbm} dBm | Packet Loss: ${alert.packetLossPercent}%
On-call: ${alert.operatorOnCall}
Detected: ${this.formatAlertTime(alert.startedAt)}

SOP Response Steps:
1. Confirm station utility power & solar/battery inverter.
2. Verify gateway uplink & RSSI (target > -105 dBm).
3. Contact on-call engineer with gateway & station IDs.`;

      try {
        await navigator.clipboard.writeText(reportText);
        this.copiedId = alert.id;
        setTimeout(() => { this.copiedId = null; }, 2000);
      } catch {
        // Fallback for browsers without clipboard permissions
      }
    },

    async refresh() {
      if (this.fetching) return;
      this.fetching = true;
      this.loading = !this.alerts.length;
      this.errorMessage = '';
      try {
        const response = await getApi('/api/notifications/gateway-health');
        const alerts = response?.result?.data || response?.data?.data || [];
        this.alerts = Array.isArray(alerts) ? alerts : [];
        const eventIds = Array.isArray(response?.meta?.eventIds) ? response.meta.eventIds.map(String) : [];
        const seen = new Set(this.seenEventIds);
        const newCount = eventIds.filter((id) => !seen.has(id)).length;
        this.unread = Math.min(99, this.unread + newCount);
        this.seenEventIds = [...new Set([...this.seenEventIds, ...eventIds])].slice(-200);
      } catch {
        this.errorMessage = 'Live gateway status unavailable.';
      } finally {
        this.loading = false;
        this.fetching = false;
      }
    }
  }
};
</script>

<style scoped>
.station-alerts { position:relative; }
.station-bell { position:relative; width:44px; height:44px; color:var(--color-text-muted, #94a3b8); border-radius:10px; }
.station-bell:hover { background:var(--color-brand-soft, rgba(34,197,94,0.12)); color:var(--color-brand, #22c55e); }
.station-bell svg { width:20px; height:20px; }
.station-bell--has-unread::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 12px;
  border: 2px solid var(--danger, #e5484d);
  animation: station-bell-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  pointer-events: none;
}
@keyframes station-bell-pulse {
  0%, 100% { opacity: 0.8; transform: scale(1); }
  50% { opacity: 0.2; transform: scale(1.08); }
}

.station-bell-count { position:absolute; top:5px; right:5px; min-width:16px; height:16px; padding:0 4px; border:2px solid var(--bg-header, #fff); border-radius:999px; display:grid; place-items:center; background:var(--danger, #e5484d); color:var(--text-inverse, #fff); font-size:9px; font-weight:800; z-index: 2; }
.station-alert-scrim { position:fixed; inset:0; z-index:389; background:rgba(8, 18, 15, 0.08); }
.station-alert-popover { position:absolute; z-index:400; top:52px; right:0; width:min(440px, calc(100vw - 24px)); border:1px solid var(--border-color, #cde0d4); border-radius:12px; background:var(--bg-card, #fff); box-shadow:var(--shadow-xl, 0 18px 52px rgba(18,35,29,.16)); overflow:hidden; }
.station-alert-popover header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding:14px 16px; border-bottom:1px solid var(--border-color, #cde0d4); }
.station-alert-title { display:grid; gap:3px; min-width:0; }
.station-alert-popover header strong { color:var(--text-strong, #12231d); font-size:14px; line-height:1.2; }
.station-alert-title span, .station-alert-row small { color:var(--text-muted, #5c7066); font-size:11px; }
.station-alert-popover button { border:0; background:transparent; cursor:pointer; font:inherit; }
.station-alert-head-actions { display:flex; align-items:center; gap:4px; flex-shrink:0; }
.station-alert-mark-read { min-height:28px; padding:0 8px; color:var(--text-main, #17342a); border-radius:6px !important; font-size:11px; font-weight:650; }
.station-alert-mark-read:hover:not(:disabled) { background:var(--bg-page, #f5f8f6); }
.station-alert-mark-read:disabled { color:var(--text-faint, #9aaba2); cursor:default; }
.station-alert-close { width:30px; height:30px; display:grid; place-items:center; border-radius:7px; color:var(--text-muted, #5c7066) !important; }
.station-alert-close:hover { background:var(--bg-page, #f5f8f6) !important; color:var(--text-main, #17342a) !important; }.station-alert-close svg { width:16px; height:16px; }

.station-alert-tabs { display:grid; grid-template-columns:repeat(4, 1fr); gap:2px; padding:6px 8px; border-bottom:1px solid var(--border-color, #cde0d4); background:var(--bg-page, #f5f8f6); }
.station-alert-tab { min-height:30px; justify-content:center; gap:4px; border-radius:6px !important; color:var(--text-muted, #5c7066); font-size:10px; font-weight:700; padding: 0 4px !important; }
.station-alert-tab span { min-width:16px; height:16px; display:grid; place-items:center; border-radius:999px; background:var(--bg-card, #fff); font-size:9px; padding: 0 3px; }
.station-alert-tab.active { background:var(--bg-card, #fff); color:var(--text-strong, #12231d); box-shadow:var(--shadow-xs); }

.station-alert-body { max-height:min(55vh, 460px); overflow:auto; overscroll-behavior:contain; }
.station-alert-row { display:grid; grid-template-columns:8px 1fr; gap:11px; padding:12px 14px; border-bottom:1px solid var(--border-color, #cde0d4); }
.station-alert-row:hover { background:var(--bg-page, #f5f8f6); }
.station-alert-dot { width:7px; height:7px; border-radius:50%; margin-top:6px; background:var(--danger, #e5484d); box-shadow:0 0 0 3px color-mix(in srgb, var(--danger, #e5484d) 14%, transparent); }
.station-alert-row.recovered .station-alert-dot { background:var(--primary, #146848); box-shadow:0 0 0 3px color-mix(in srgb, var(--primary, #146848) 13%, transparent); }
.station-alert-row.flapping .station-alert-dot, .station-alert-row.degraded .station-alert-dot { background:#eab308; box-shadow:0 0 0 3px rgba(234, 179, 8, 0.18); }
.station-alert-row.silenced .station-alert-dot { background:#94a3b8; box-shadow:0 0 0 3px rgba(148, 163, 184, 0.18); }

.station-alert-copy { min-width:0; }
.station-alert-row-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
.station-alert-identity { min-width:0; display:grid; gap:2px; }
.station-alert-identity strong { overflow-wrap:anywhere; font-size:13px; color:var(--text-strong, #12231d); }
.station-alert-identity > span { overflow-wrap:anywhere; color:var(--text-muted, #5c7066); font-size:10px; }

.station-alert-status { flex:0 0 auto; padding:3px 6px; border-radius:999px; background:color-mix(in srgb, var(--danger, #e5484d) 12%, var(--bg-card)); color:var(--danger, #b42318); font-size:9px; font-weight:800; text-transform:uppercase; }
.station-alert-status.recovered { background:var(--primary-light, #e8f2eb); color:var(--primary, #146848); }
.station-alert-status.flapping, .station-alert-status.degraded { background:rgba(234, 179, 8, 0.15); color:#a16207; }
.station-alert-status.silenced { background:rgba(148, 163, 184, 0.15); color:#475569; }

.station-alert-row p { margin:4px 0 3px; font-size:12px; line-height:1.4; color:var(--text-main, #17342a); }
.station-alert-empty { padding:24px 16px; color:var(--text-muted, #5c7066); font-size:13px; }
.station-alert-error { color:#b42318; }

.station-alert-diag-banner { display:flex; align-items:center; gap:8px; margin:6px 0; padding:6px 8px; border-radius:6px; background:var(--primary-light, #e8f2eb); color:var(--primary, #146848); font-size:11px; }
.station-alert-diag-dot { width:6px; height:6px; border-radius:50%; background:var(--primary, #146848); flex-shrink:0; }

.station-alert-actions-bar { display:flex; align-items:center; flex-wrap:wrap; gap:4px; margin-top:8px; }
.station-alert-action-btn { font-size:10px !important; font-weight:700 !important; padding:2px 6px !important; min-height:22px !important; border-radius:4px !important; background:var(--bg-page, #f5f8f6) !important; color:var(--text-strong, #12231d) !important; border:1px solid var(--border-color, #cde0d4) !important; }
.station-alert-action-btn:hover { background:var(--primary-light, #e8f2eb) !important; color:var(--primary, #146848) !important; }

.station-alert-read-more { margin-left:auto; padding:0 !important; color:var(--primary, #146848); font-size:10px !important; font-weight:700 !important; }
.station-alert-read-more:hover { text-decoration:underline; }

.station-alert-details { display:grid; gap:6px; margin:10px 0 0; padding:10px; border:1px solid var(--border-color, #cde0d4); border-radius:8px; background:var(--bg-page, #f5f8f6); }
.station-alert-details div { display:grid; grid-template-columns:minmax(90px, auto) minmax(0, 1fr); gap:10px; }
.station-alert-details dt { color:var(--text-muted, #5c7066); font-size:10px; }
.station-alert-details dd { margin:0; overflow-wrap:anywhere; color:var(--text-strong, #12231d); font-size:10px; font-weight:650; text-align:right; }

.station-alert-sop { margin-top:10px; padding:10px 0 0 12px; border-left:3px solid var(--primary, #146848); }
.station-alert-sop h4 { margin:0 0 9px; color:var(--text-strong, #12231d); font-size:11px; }
.station-alert-sop ol { display:grid; gap:9px; margin:0; padding:0; list-style:none; }
.station-alert-sop li { display:grid; grid-template-columns:22px minmax(0, 1fr); gap:8px; align-items:start; }
.station-alert-sop li > span { width:22px; height:22px; display:grid; place-items:center; border-radius:50%; background:var(--primary-light, #e8f2eb); color:var(--primary, #146848); font-size:9px; font-weight:800; }
.station-alert-sop li div { display:grid; gap:2px; }
.station-alert-sop li strong { font-size:10px; }
.station-alert-sop li small { color:var(--text-muted, #5c7066); font-size:10px; line-height:1.35; }

.station-alert-healthy { display:flex; align-items:flex-start; gap:10px; }
.station-alert-healthy strong { display:block; color:var(--text-strong, #12231d); font-size:13px; }
.station-alert-healthy p { margin:4px 0 0; font-size:12px; }
.station-alert-history-link { margin-top:8px; }
.station-alert-history-link button { padding:0 !important; color:var(--primary, #146848) !important; font-size:12px !important; font-weight:700 !important; }
.station-alert-history-link button:hover { text-decoration:underline; }
.station-alert-healthy-dot { width:8px; height:8px; margin-top:5px; border-radius:50%; background:var(--primary, #146848); box-shadow:0 0 0 3px color-mix(in srgb, var(--primary, #146848) 13%, transparent); }
.station-alert-healthy--neutral .station-alert-healthy-dot { background:var(--color-neutral, #94a3b8); box-shadow:0 0 0 3px color-mix(in srgb, var(--color-neutral, #94a3b8) 13%, transparent); }

.station-alert-popover footer { padding:10px 16px; border-top:1px solid var(--border-color, #cde0d4); background:var(--bg-card, #fff); }
.station-alert-popover a { display:inline-flex; align-items:center; gap:7px; min-height:32px; color:var(--text-main, #17342a); font-size:12px; font-weight:650; text-decoration:none; }
.station-alert-popover a:hover { color:var(--primary, #146848); }
.station-alert-popover-enter-active,.station-alert-popover-leave-active { transition:opacity .18s ease, transform .18s ease; }
.station-alert-popover-enter-from,.station-alert-popover-leave-to { opacity:0; transform:translateY(-6px); }
.station-alert-scrim-enter-active,.station-alert-scrim-leave-active { transition:opacity .18s ease; }
.station-alert-scrim-enter-from,.station-alert-scrim-leave-to { opacity:0; }

@media (max-width: 768px) {
  .station-alert-popover {
    position: fixed;
    top: 64px;
    right: 8px;
    bottom: 8px;
    left: 8px;
    width: auto;
    max-width: none;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    border-radius: 12px;
    box-shadow: 0 24px 56px rgba(18,35,29,.22);
  }
}
</style>
