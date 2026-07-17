<template>
  <div :class="['station-alerts', { 'station-alerts--open': open }]" ref="root">
    <BaseIconButton class="station-bell" aria-label="Station health notifications" :aria-expanded="String(open)" @click="toggle">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
      <span v-if="unread" class="station-bell-count">{{ unread > 9 ? '9+' : unread }}</span>
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
        <div class="station-alert-tabs" role="tablist" aria-label="Notification status">
          <BaseButton role="tab" variant="quiet" size="sm" :class="['station-alert-tab', activeView === 'active' ? 'active' : '']" :aria-selected="String(activeView === 'active')" @click="activeView = 'active'">
            Active <span>{{ activeAlerts.length }}</span>
          </BaseButton>
          <BaseButton role="tab" variant="quiet" size="sm" :class="['station-alert-tab', activeView === 'history' ? 'active' : '']" :aria-selected="String(activeView === 'history')" @click="activeView = 'history'">
            History <span>{{ historyAlerts.length }}</span>
          </BaseButton>
        </div>
        <div class="station-alert-body">
          <div v-if="loading" class="station-alert-empty">Checking station status...</div>
          <div v-else-if="errorMessage" class="station-alert-empty station-alert-error">{{ errorMessage }}</div>
          <div v-else-if="!visibleAlerts.length" class="station-alert-empty station-alert-healthy">
            <span class="station-alert-healthy-dot"></span>
            <div><strong>{{ activeView === 'active' ? 'No active outages' : 'No recovery history' }}</strong><p>{{ activeView === 'active' ? 'Gateways are reporting normally.' : 'Recovered gateways appear here.' }}</p></div>
          </div>
          <article v-for="alert in visibleAlerts" :key="alert.id" :class="['station-alert-row', alert.kind]">
            <span class="station-alert-dot"></span>
            <div class="station-alert-copy">
              <div class="station-alert-row-heading">
                <div class="station-alert-identity">
                  <strong>{{ alert.gatewayName || alert.gateway }}</strong>
                  <span>{{ alert.gateway }}</span>
                </div>
                <span :class="['station-alert-status', alert.kind]">{{ alert.kind === 'recovered' ? 'Recovered' : 'Outage' }}</span>
              </div>
              <div class="station-alert-station">Station ID {{ alert.station }}</div>
              <p>{{ alertSummary(alert) }}</p>
              <BaseButton variant="quiet" size="sm" class="station-alert-read-more" :aria-expanded="String(isExpanded(alert.id))" @click="toggleDetails(alert.id)">
                {{ isExpanded(alert.id) ? 'Show less' : 'Read more' }}
              </BaseButton>
              <section v-if="alert.kind === 'down' && isExpanded(alert.id)" class="station-alert-sop" :aria-label="`Response SOP for ${alert.gateway}`">
                <h4>Response SOP</h4>
                <ol>
                  <li><span>1</span><div><strong>Confirm station power</strong><small>Check utility and backup supply.</small></div></li>
                  <li><span>2</span><div><strong>Verify gateway uplink</strong><small>Inspect network, SIM, and heartbeat.</small></div></li>
                  <li><span>3</span><div><strong>Escalate with identifiers</strong><small>Send gateway and station IDs.</small></div></li>
                </ol>
              </section>
              <dl v-if="isExpanded(alert.id)" class="station-alert-details">
                <div><dt>Gateway name</dt><dd>{{ alert.gatewayName || alert.gateway }}</dd></div>
                <div><dt>Gateway ID</dt><dd>{{ alert.gateway }}</dd></div>
                <div><dt>Station ID</dt><dd>{{ alert.station }}</dd></div>
                <div><dt>Status</dt><dd>{{ alert.status }}</dd></div>
                <div><dt>Duration</dt><dd>{{ durationFor(alert) }}</dd></div>
                <div><dt>Success rate</dt><dd>{{ alert.successRate == null ? 'Unavailable' : `${alert.successRate}%` }}</dd></div>
                <div><dt>Detected</dt><dd>{{ formatAlertTime(alert.startedAt) }}</dd></div>
                <div><dt>Gateway update</dt><dd>{{ formatAlertTime(alert.lastReportedAt) }}</dd></div>
                <div><dt>Source</dt><dd>{{ sourceLabel(alert) }}</dd></div>
              </dl>
            </div>
          </article>
        </div>
        <footer><a href="#/prepay-report/station-consumption" @click="closePanel">Open station monitoring</a></footer>
      </section>
    </transition>
  </div>
</template>

<script>
import BaseIconButton from './base/BaseIconButton.vue';
import BaseButton from './base/BaseButton.vue';
import { getApi } from '../services/api.js';
import { formatGatewayDuration } from '../services/gateway-health.mjs';

export default {
  name: 'StationAlertsBell', components: { BaseButton, BaseIconButton },
  data: () => ({ open: false, loading: false, errorMessage: '', alerts: [], unread: 0, poller: null, activeView: 'active', expandedAlertIds: [], seenEventIds: [] }),
  computed: {
    activeAlerts() { return this.alerts.filter((alert) => alert.kind === 'down'); },
    historyAlerts() { return this.alerts.filter((alert) => alert.kind === 'recovered'); },
    visibleAlerts() { return this.activeView === 'active' ? this.activeAlerts : this.historyAlerts; }
  },
  mounted() { this.refresh(); this.poller = window.setInterval(this.refresh, 60000); window.addEventListener('pointerdown', this.closeOutside, true); },
  beforeUnmount() { window.clearInterval(this.poller); window.removeEventListener('pointerdown', this.closeOutside, true); },
  methods: {
    toggle() { this.open = !this.open; },
    closePanel() { this.open = false; },
    markRead() { this.unread = 0; },
    isExpanded(id) { return this.expandedAlertIds.includes(id); },
    toggleDetails(id) {
      this.expandedAlertIds = this.isExpanded(id)
        ? this.expandedAlertIds.filter((value) => value !== id)
        : [...this.expandedAlertIds, id];
    },
    durationFor(alert) {
      const end = alert.endedAt ? new Date(alert.endedAt).getTime() : Date.now();
      const start = new Date(alert.startedAt).getTime();
      return formatGatewayDuration(Number.isFinite(start) ? end - start : 0);
    },
    alertSummary(alert) {
      return alert.kind === 'recovered'
        ? `Back online after ${this.durationFor(alert)}.`
        : `Down for ${this.durationFor(alert)}. Action required.`;
    },
    formatAlertTime(value) {
      const date = value ? new Date(value) : null;
      return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Unavailable';
    },
    sourceLabel(alert) {
      return String(alert.source || '').includes('supabase') ? 'Live gateway / Supabase' : 'Live gateway / temporary cache';
    },
    closeOutside(event) { if (this.open && this.$refs.root && !this.$refs.root.contains(event.target)) this.open = false; },
    async refresh() {
      this.loading = true;
      this.errorMessage = '';
      try {
        const response = await getApi('/api/notifications/gateway-health');
        const alerts = response?.result?.data || response?.data?.data || [];
        this.alerts = Array.isArray(alerts) ? alerts : [];
        const eventIds = Array.isArray(response?.meta?.eventIds) ? response.meta.eventIds.map(String) : [];
        const seen = new Set(this.seenEventIds);
        this.unread += eventIds.filter((id) => !seen.has(id)).length;
        this.seenEventIds = [...new Set([...this.seenEventIds, ...eventIds])].slice(-200);
      } catch {
        this.errorMessage = 'Live gateway status unavailable.';
      } finally { this.loading = false; }
    }
  }
};
</script>

<style scoped>
.station-alerts { position:relative; }
.station-bell { position:relative; width:44px; height:44px; color:var(--text-main, #17342a); border-radius:10px; }
.station-bell:hover { background:var(--primary-light, #e8f2eb); color:var(--primary, #146848); }.station-bell svg { width:20px; height:20px; }
.station-bell-count { position:absolute; top:5px; right:5px; min-width:16px; height:16px; padding:0 4px; border:2px solid var(--bg-header, #fff); border-radius:999px; display:grid; place-items:center; background:var(--danger, #e5484d); color:var(--text-inverse, #fff); font-size:9px; font-weight:800; }
.station-alert-scrim { position:fixed; inset:0; z-index:389; background:rgba(8, 18, 15, 0.08); }
.station-alert-popover { position:absolute; z-index:400; top:52px; right:0; width:min(420px, calc(100vw - 24px)); border:1px solid var(--border-color, #cde0d4); border-radius:12px; background:var(--bg-card, #fff); box-shadow:var(--shadow-xl, 0 18px 52px rgba(18,35,29,.16)); overflow:hidden; }
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
.station-alert-tabs { display:grid; grid-template-columns:1fr 1fr; gap:4px; padding:8px 12px; border-bottom:1px solid var(--border-color, #cde0d4); background:var(--bg-page, #f5f8f6); }
.station-alert-tab { min-height:34px; justify-content:center; gap:7px; border-radius:7px !important; color:var(--text-muted, #5c7066); font-size:11px; font-weight:700; }
.station-alert-tab span { min-width:19px; height:19px; display:grid; place-items:center; border-radius:999px; background:var(--bg-card, #fff); font-size:9px; }
.station-alert-tab.active { background:var(--bg-card, #fff); color:var(--text-strong, #12231d); box-shadow:var(--shadow-xs); }
.station-alert-body { max-height:min(52vh, 440px); overflow:auto; overscroll-behavior:contain; }
.station-alert-row { display:grid; grid-template-columns:8px 1fr; gap:11px; padding:14px 16px; border-bottom:1px solid var(--border-color, #cde0d4); }
.station-alert-row:hover { background:var(--bg-page, #f5f8f6); }
.station-alert-dot { width:7px; height:7px; border-radius:50%; margin-top:6px; background:var(--danger, #e5484d); box-shadow:0 0 0 3px color-mix(in srgb, var(--danger, #e5484d) 14%, transparent); }
.station-alert-row.recovered .station-alert-dot { background:var(--primary, #146848); box-shadow:0 0 0 3px color-mix(in srgb, var(--primary, #146848) 13%, transparent); }
.station-alert-copy { min-width:0; }.station-alert-row-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
.station-alert-identity { min-width:0; display:grid; gap:3px; }.station-alert-identity strong { overflow-wrap:anywhere; font-size:13px; color:var(--text-strong, #12231d); }.station-alert-identity > span { overflow-wrap:anywhere; color:var(--text-muted, #5c7066); font-size:10px; }
.station-alert-status { flex:0 0 auto; padding:4px 7px; border-radius:999px; background:color-mix(in srgb, var(--danger, #e5484d) 12%, var(--bg-card)); color:var(--danger, #b42318); font-size:9px; font-weight:800; text-transform:uppercase; }
.station-alert-status.recovered { background:var(--primary-light, #e8f2eb); color:var(--primary, #146848); }
.station-alert-station { margin-top:6px; color:var(--text-muted, #5c7066); font-size:10px; font-weight:650; }
.station-alert-row p { margin:4px 0 3px; font-size:12px; line-height:1.45; color:var(--text-main, #17342a); }.station-alert-empty { padding:24px 16px; color:var(--text-muted, #5c7066); font-size:13px; }
.station-alert-error { color:#b42318; }
.station-alert-read-more { margin-top:4px; padding:0 !important; color:var(--primary, #146848); font-size:11px !important; font-weight:700 !important; }
.station-alert-read-more:hover { text-decoration:underline; }
.station-alert-details { display:grid; gap:6px; margin:10px 0 0; padding:10px; border:1px solid var(--border-color, #cde0d4); border-radius:8px; background:var(--bg-page, #f5f8f6); }
.station-alert-details div { display:grid; grid-template-columns:minmax(90px, auto) minmax(0, 1fr); gap:10px; }
.station-alert-details dt { color:var(--text-muted, #5c7066); font-size:10px; }
.station-alert-details dd { margin:0; overflow-wrap:anywhere; color:var(--text-strong, #12231d); font-size:10px; font-weight:650; text-align:right; }
.station-alert-sop { margin-top:10px; padding:10px 0 0 12px; border-left:3px solid var(--primary, #146848); }.station-alert-sop h4 { margin:0 0 9px; color:var(--text-strong, #12231d); font-size:11px; }.station-alert-sop ol { display:grid; gap:9px; margin:0; padding:0; list-style:none; }.station-alert-sop li { display:grid; grid-template-columns:22px minmax(0, 1fr); gap:8px; align-items:start; }.station-alert-sop li > span { width:22px; height:22px; display:grid; place-items:center; border-radius:50%; background:var(--primary-light, #e8f2eb); color:var(--primary, #146848); font-size:9px; font-weight:800; }.station-alert-sop li div { display:grid; gap:2px; }.station-alert-sop li strong { font-size:10px; }.station-alert-sop li small { color:var(--text-muted, #5c7066); font-size:10px; line-height:1.35; }
.station-alert-healthy { display:flex; align-items:flex-start; gap:10px; }.station-alert-healthy strong { display:block; color:var(--text-strong, #12231d); font-size:13px; }.station-alert-healthy p { margin:4px 0 0; font-size:12px; }.station-alert-healthy-dot { width:8px; height:8px; margin-top:5px; border-radius:50%; background:var(--primary, #146848); box-shadow:0 0 0 3px color-mix(in srgb, var(--primary, #146848) 13%, transparent); }
.station-alert-popover footer { padding:10px 16px; border-top:1px solid var(--border-color, #cde0d4); background:var(--bg-card, #fff); }.station-alert-popover a { display:inline-flex; align-items:center; gap:7px; min-height:32px; color:var(--text-main, #17342a); font-size:12px; font-weight:650; text-decoration:none; }.station-alert-popover a:hover { color:var(--primary, #146848); }
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

  .station-alert-popover header {
    padding: 14px 14px 12px;
  }

  .station-alert-popover header strong {
    font-size: 14px;
  }

  .station-alert-popover header span,
  .station-alert-popover button,
  .station-alert-row small {
    font-size: 10px;
  }

  .station-alert-head-actions {
    gap: 4px;
  }

  .station-alert-mark-read {
    min-height: 44px;
  }

  .station-alert-close {
    width: 44px;
    height: 44px;
    font-size: 20px;
  }

  .station-alert-body {
    min-height: 0;
    max-height: none;
  }

  .station-alert-row {
    gap: 12px;
    padding: 14px;
  }

  .station-alert-row strong {
    font-size: 13px;
    line-height: 1.3;
  }

  .station-alert-row p {
    font-size: 12px;
    line-height: 1.35;
  }

  .station-alert-popover footer {
    padding: 10px 14px;
  }

  .station-alert-popover a {
    display: flex;
    min-height: 44px;
    align-items: center;
    justify-content: center;
  }
}
</style>
