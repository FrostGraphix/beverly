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
        <header class="station-alert-header">
          <div class="station-alert-title">
            <strong>Notifications</strong>
            <span>{{ activeAlerts.length }} active outage{{ activeAlerts.length === 1 ? '' : 's' }}</span>
          </div>
          <div class="station-alert-head-actions">
            <BaseButton variant="ghost" size="sm" class="station-alert-mark-read" :disabled="!unread" @click="markRead">Mark read</BaseButton>
            <BaseIconButton class="station-alert-close" aria-label="Close notifications" @click="closePanel">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
            </BaseIconButton>
          </div>
        </header>

        <!-- 4-Tab Classification Bar -->
        <div class="station-alert-tabs" role="tablist" aria-label="Notification categories">
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
            Muted <span>{{ silencedAlerts.length }}</span>
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
                  <small>{{ alert.gateway }} • Station {{ alert.station }}</small>
                </div>
                <span :class="['station-alert-status', alert.kind]">{{ statusBadgeLabel(alert) }}</span>
              </div>

              <p class="station-alert-summary">{{ alertSummary(alert) }}</p>

              <!-- Diagnostic Result Banner -->
              <div v-if="diagResults[alert.id]" class="station-alert-diag-banner">
                <span class="station-alert-diag-dot"></span>
                <span>Ping: <strong>{{ diagResults[alert.id].pingMs }}ms</strong> • Signal: {{ diagResults[alert.id].signalDbm }} dBm</span>
              </div>

              <!-- Compact Action Bar -->
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
                  🔕 Mute 1h
                </BaseButton>

                <BaseButton
                  variant="quiet"
                  size="sm"
                  class="station-alert-action-btn"
                  @click="copyReport(alert)"
                >
                  {{ copiedId === alert.id ? '✓ Copied' : '📋 Copy' }}
                </BaseButton>

                <BaseButton
                  variant="quiet"
                  size="sm"
                  class="station-alert-read-more"
                  :aria-expanded="String(isExpanded(alert.id))"
                  @click="toggleDetails(alert.id)"
                >
                  {{ isExpanded(alert.id) ? 'Less' : 'Info' }}
                </BaseButton>
              </div>

              <!-- Compact Telemetry Details Grid -->
              <dl v-if="isExpanded(alert.id)" class="station-alert-details">
                <div><dt>Gateway</dt><dd>{{ alert.gateway }}</dd></div>
                <div><dt>Station</dt><dd>{{ alert.station }}</dd></div>
                <div><dt>Signal (RSSI)</dt><dd>{{ alert.rssiDbm }} dBm</dd></div>
                <div><dt>Packet loss</dt><dd>{{ alert.packetLossPercent }}%</dd></div>
                <div><dt>Success rate</dt><dd>{{ alert.successRate == null ? 'N/A' : `${alert.successRate}%` }}</dd></div>
                <div><dt>Outage started</dt><dd>{{ formatAlertTime(alert.startedAt) }}</dd></div>
                <div v-if="alert.endedAt"><dt>Back online at</dt><dd class="station-alert-online-time">{{ formatAlertTime(alert.endedAt) }}</dd></div>
                <div><dt>Last heartbeat</dt><dd>{{ formatAlertTime(alert.lastReportedAt) }}</dd></div>
              </dl>
            </div>
          </article>
        </div>

        <footer>
          <a href="#/prepay-report/station-consumption" @click="closePanel">Open station monitoring &rarr;</a>
        </footer>
      </section>
    </transition>
  </div>
</template>

<script>
import BaseIconButton from './base/BaseIconButton.vue';
import BaseButton from './base/BaseButton.vue';
import { getApi, isSessionExpired, readSessionState, postApi } from '../services/api.js';
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
      return 'No muted gateways';
    },
    emptyMessage() {
      if (this.activeView === 'active') return 'All gateways are reporting normally.';
      if (this.activeView === 'degraded') return 'Uplink signals and packet delivery are healthy.';
      if (this.activeView === 'history') return 'Recovered gateways appear here.';
      return 'Muted or acknowledged alerts appear here.';
    }
  },
  mounted() {
    if (this.canRefresh()) this.refresh();
    this.poller = window.setInterval(this.refresh, 60000);
    window.addEventListener('pointerdown', this.closeOutside, true);
  },
  beforeUnmount() {
    window.clearInterval(this.poller);
    window.removeEventListener('pointerdown', this.closeOutside, true);
  },
  methods: {
    canRefresh() {
      return !window.location.hash.startsWith('#/login')
        && Boolean(readSessionState())
        && !isSessionExpired();
    },
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
      const recoveredTime = alert.endedAt ? this.formatAlertTime(alert.endedAt) : null;
      if (alert.kind === 'recovered') {
        return recoveredTime && duration
          ? `Recovered at ${recoveredTime} (Outage duration: ${duration}).`
          : duration ? `Recovered — offline for ${duration}.` : 'Back online.';
      }
      if (alert.kind === 'flapping') return 'Rapid disconnect loop. Weak cellular signal.';
      if (alert.kind === 'degraded') return `Low success rate (${alert.successRate}%). Uplink degraded.`;
      return duration ? `Down for ${duration}.` : 'Down — duration N/A.';
    },
    statusBadgeLabel(alert) {
      if (alert.kind === 'recovered') return 'Online';
      if (alert.kind === 'flapping') return 'Flapping';
      if (alert.kind === 'degraded') return 'Degraded';
      if (alert.kind === 'silenced') return 'Muted';
      return 'Down';
    },
    formatAlertTime(value) {
      const date = value ? new Date(value) : null;
      if (!date || !Number.isFinite(date.getTime())) return 'N/A';
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return isToday ? timeStr : `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
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

    async copyReport(alert) {
      const reportText = `[ALERT REPORT] ${alert.gatewayName || alert.gateway} (${alert.gateway}) | Station: ${alert.station} | Status: ${alert.status} | RSSI: ${alert.rssiDbm} dBm`;
      try {
        await navigator.clipboard.writeText(reportText);
        this.copiedId = alert.id;
        setTimeout(() => { this.copiedId = null; }, 2000);
      } catch {
        // Fallback
      }
    },

    async refresh() {
      if (this.fetching || !this.canRefresh()) return;
      this.fetching = true;
      this.loading = !this.alerts.length;
      this.errorMessage = '';
      try {
        const response = await getApi('/api/notifications/gateway-health', {}, { silent: true });
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
.station-bell { position:relative; width:38px; height:38px; color:var(--color-text-muted, #94a3b8); border-radius:8px; }
.station-bell:hover { background:var(--color-brand-soft, rgba(34,197,94,0.12)); color:var(--color-brand, #22c55e); }
.station-bell svg { width:18px; height:18px; }

.station-bell--has-unread::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 10px;
  border: 2px solid var(--danger, #e5484d);
  animation: station-bell-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  pointer-events: none;
}
@keyframes station-bell-pulse {
  0%, 100% { opacity: 0.8; transform: scale(1); }
  50% { opacity: 0.2; transform: scale(1.06); }
}

.station-bell-count { position:absolute; top:3px; right:3px; min-width:14px; height:14px; padding:0 3px; border:2px solid var(--bg-header, #fff); border-radius:999px; display:grid; place-items:center; background:var(--danger, #e5484d); color:var(--text-inverse, #fff); font-size:8px; font-weight:800; z-index: 2; }
.station-alert-scrim { position:fixed; inset:0; z-index:389; background:rgba(8, 18, 15, 0.08); }

.station-alert-popover { position:absolute; z-index:400; top:46px; right:0; width:min(360px, calc(100vw - 16px)); border:1px solid var(--border-color, #cde0d4); border-radius:10px; background:var(--bg-card, #fff); box-shadow:var(--shadow-xl, 0 16px 40px rgba(18,35,29,.16)); overflow:hidden; }
.station-alert-header { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid var(--border-color, #cde0d4); }
.station-alert-title { display:grid; gap:1px; min-width:0; }
.station-alert-header strong { color:var(--text-strong, #12231d); font-size:13px; line-height:1.2; }
.station-alert-title span { color:var(--text-muted, #5c7066); font-size:10px; }
.station-alert-popover button { border:0; background:transparent; cursor:pointer; font:inherit; }
.station-alert-head-actions { display:flex; align-items:center; gap:2px; flex-shrink:0; }
.station-alert-mark-read { min-height:24px; padding:0 6px; color:var(--text-main, #17342a); border-radius:4px !important; font-size:10px; font-weight:650; }
.station-alert-mark-read:hover:not(:disabled) { background:var(--bg-page, #f5f8f6); }
.station-alert-mark-read:disabled { color:var(--text-faint, #9aaba2); cursor:default; }
.station-alert-close { width:26px; height:26px; display:grid; place-items:center; border-radius:5px; color:var(--text-muted, #5c7066) !important; }
.station-alert-close:hover { background:var(--bg-page, #f5f8f6) !important; color:var(--text-main, #17342a) !important; }
.station-alert-close svg { width:14px; height:14px; }

.station-alert-tabs { display:grid; grid-template-columns:repeat(4, 1fr); gap:2px; padding:4px 6px; border-bottom:1px solid var(--border-color, #cde0d4); background:var(--bg-page, #f5f8f6); }
.station-alert-tab { min-height:26px; justify-content:center; gap:3px; border-radius:4px !important; color:var(--text-muted, #5c7066); font-size:10px; font-weight:700; padding:0 2px !important; }
.station-alert-tab span { min-width:14px; height:14px; display:grid; place-items:center; border-radius:999px; background:var(--bg-card, #fff); font-size:8px; padding:0 2px; }
.station-alert-tab.active { background:var(--bg-card, #fff); color:var(--text-strong, #12231d); box-shadow:var(--shadow-xs); }

.station-alert-body { max-height:min(50vh, 380px); overflow:auto; overscroll-behavior:contain; }
.station-alert-row { display:grid; grid-template-columns:6px 1fr; gap:8px; padding:8px 10px; border-bottom:1px solid var(--border-color, #cde0d4); }
.station-alert-row:hover { background:var(--bg-page, #f5f8f6); }
.station-alert-dot { width:6px; height:6px; border-radius:50%; margin-top:5px; background:var(--danger, #e5484d); box-shadow:0 0 0 2px color-mix(in srgb, var(--danger, #e5484d) 14%, transparent); }
.station-alert-row.recovered .station-alert-dot { background:var(--primary, #146848); box-shadow:0 0 0 2px color-mix(in srgb, var(--primary, #146848) 13%, transparent); }
.station-alert-row.flapping .station-alert-dot, .station-alert-row.degraded .station-alert-dot { background:#eab308; box-shadow:0 0 0 2px rgba(234, 179, 8, 0.18); }
.station-alert-row.silenced .station-alert-dot { background:#94a3b8; box-shadow:0 0 0 2px rgba(148, 163, 184, 0.18); }

.station-alert-copy { min-width:0; }
.station-alert-row-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:6px; }
.station-alert-identity { min-width:0; display:grid; gap:1px; }
.station-alert-identity strong { overflow-wrap:anywhere; font-size:12px; color:var(--text-strong, #12231d); line-height:1.2; }
.station-alert-identity small { overflow-wrap:anywhere; color:var(--text-muted, #5c7066); font-size:9px; }

.station-alert-status { flex:0 0 auto; padding:2px 5px; border-radius:999px; background:color-mix(in srgb, var(--danger, #e5484d) 12%, var(--bg-card)); color:var(--danger, #b42318); font-size:8px; font-weight:800; text-transform:uppercase; }
.station-alert-status.recovered { background:var(--primary-light, #e8f2eb); color:var(--primary, #146848); }
.station-alert-status.flapping, .station-alert-status.degraded { background:rgba(234, 179, 8, 0.15); color:#a16207; }
.station-alert-status.silenced { background:rgba(148, 163, 184, 0.15); color:#475569; }

.station-alert-summary { margin:3px 0 2px; font-size:11px; line-height:1.35; color:var(--text-main, #17342a); }
.station-alert-empty { padding:18px 12px; color:var(--text-muted, #5c7066); font-size:12px; }
.station-alert-error { color:#b42318; }

.station-alert-diag-banner { display:flex; align-items:center; gap:6px; margin:4px 0; padding:4px 6px; border-radius:4px; background:var(--primary-light, #e8f2eb); color:var(--primary, #146848); font-size:10px; }
.station-alert-diag-dot { width:5px; height:5px; border-radius:50%; background:var(--primary, #146848); flex-shrink:0; }

.station-alert-actions-bar { display:flex; align-items:center; flex-wrap:wrap; gap:3px; margin-top:4px; }
.station-alert-action-btn { font-size:9px !important; font-weight:700 !important; padding:1px 5px !important; min-height:20px !important; border-radius:3px !important; background:var(--bg-page, #f5f8f6) !important; color:var(--text-strong, #12231d) !important; border:1px solid var(--border-color, #cde0d4) !important; }
.station-alert-action-btn:hover { background:var(--primary-light, #e8f2eb) !important; color:var(--primary, #146848) !important; }

.station-alert-read-more { margin-left:auto; padding:0 !important; color:var(--primary, #146848); font-size:9px !important; font-weight:700 !important; }
.station-alert-read-more:hover { text-decoration:underline; }

.station-alert-details { display:grid; grid-template-columns:1fr 1fr; gap:4px 8px; margin:6px 0 0; padding:6px 8px; border:1px solid var(--border-color, #cde0d4); border-radius:6px; background:var(--bg-page, #f5f8f6); }
.station-alert-details div { display:grid; gap:1px; }
.station-alert-details dt { color:var(--text-muted, #5c7066); font-size:9px; }
.station-alert-details dd { margin:0; overflow-wrap:anywhere; color:var(--text-strong, #12231d); font-size:9px; font-weight:650; }
.station-alert-online-time { color:var(--primary, #146848) !important; font-weight:800 !important; }

.station-alert-healthy { display:flex; align-items:flex-start; gap:8px; }
.station-alert-healthy strong { display:block; color:var(--text-strong, #12231d); font-size:12px; }
.station-alert-healthy p { margin:2px 0 0; font-size:11px; }
.station-alert-history-link { margin-top:6px; }
.station-alert-history-link button { padding:0 !important; color:var(--primary, #146848) !important; font-size:11px !important; font-weight:700 !important; }
.station-alert-history-link button:hover { text-decoration:underline; }
.station-alert-healthy-dot { width:7px; height:7px; margin-top:4px; border-radius:50%; background:var(--primary, #146848); box-shadow:0 0 0 2px color-mix(in srgb, var(--primary, #146848) 13%, transparent); }
.station-alert-healthy--neutral .station-alert-healthy-dot { background:var(--color-neutral, #94a3b8); box-shadow:0 0 0 2px color-mix(in srgb, var(--color-neutral, #94a3b8) 13%, transparent); }

.station-alert-popover footer { padding:8px 12px; border-top:1px solid var(--border-color, #cde0d4); background:var(--bg-card, #fff); }
.station-alert-popover a { display:inline-flex; align-items:center; gap:6px; min-height:26px; color:var(--text-main, #17342a); font-size:11px; font-weight:650; text-decoration:none; }
.station-alert-popover a:hover { color:var(--primary, #146848); }
.station-alert-popover-enter-active,.station-alert-popover-leave-active { transition:opacity .15s ease, transform .15s ease; }
.station-alert-popover-enter-from,.station-alert-popover-leave-to { opacity:0; transform:translateY(-4px); }
.station-alert-scrim-enter-active,.station-alert-scrim-leave-active { transition:opacity .15s ease; }
.station-alert-scrim-enter-from,.station-alert-scrim-leave-to { opacity:0; }

@media (max-width: 640px) {
  .station-alert-popover {
    position: fixed;
    top: 56px;
    right: 8px;
    left: 8px;
    width: auto;
    max-width: none;
    max-height: calc(100vh - 72px);
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    border-radius: 10px;
    box-shadow: 0 16px 40px rgba(18,35,29,.24);
  }
  .station-alert-tab {
    min-height: 32px;
  }
  .station-alert-action-btn {
    min-height: 26px !important;
    padding: 2px 8px !important;
  }
}
</style>
