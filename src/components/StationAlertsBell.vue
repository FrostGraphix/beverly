<template>
  <div class="station-alerts" ref="root">
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
            <span>{{ unread ? `${unread} new operational alert${unread === 1 ? '' : 's'}` : 'Station health updates' }}</span>
          </div>
          <div class="station-alert-head-actions">
            <BaseButton class="station-alert-mark-read" :disabled="!unread" @click="markRead">Mark all read</BaseButton>
            <BaseIconButton class="station-alert-close" aria-label="Close station alerts" @click="closePanel">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
            </BaseIconButton>
          </div>
        </header>
        <div class="station-alert-body">
          <div v-if="loading" class="station-alert-empty">Checking station status...</div>
          <div v-else-if="!alerts.length" class="station-alert-empty station-alert-healthy">
            <span class="station-alert-healthy-dot"></span>
            <div><strong>All stations operational</strong><p>No service interruptions detected.</p></div>
          </div>
          <article v-for="alert in alerts" :key="alert.id" :class="['station-alert-row', alert.kind]">
            <span class="station-alert-dot"></span>
            <div class="station-alert-copy">
              <div class="station-alert-row-heading"><strong>{{ alert.station }} {{ alert.kind === 'recovered' ? 'restored' : 'is down' }}</strong><span>{{ alert.kind === 'recovered' ? 'Resolved' : 'Action needed' }}</span></div>
              <p>{{ alert.reason }}</p>
              <small>{{ alert.detail }}</small>
            </div>
          </article>
        </div>
        <footer><a href="#/prepay-report/station-consumption" @click="closePanel">View station monitoring <span aria-hidden="true">→</span></a></footer>
      </section>
    </transition>
  </div>
</template>

<script>
import BaseIconButton from './base/BaseIconButton.vue';
import BaseButton from './base/BaseButton.vue';
import { getApi } from '../services/api.js';

const storageKey = 'beverly.station-health-state';
const historyKey = 'beverly.station-health-history';
function readState() { try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; } }
function readHistory() { try { return JSON.parse(localStorage.getItem(historyKey) || '[]'); } catch { return []; } }
function reasonFor(row) {
  if (String(row.status || '').toLowerCase().includes('offline')) return 'Gateway heartbeat is unavailable.';
  if (Number(row.successRate) < 70) return 'Gateway success rate dropped below 70%.';
  return 'Station communication requires review.';
}

export default {
  name: 'StationAlertsBell', components: { BaseIconButton, BaseButton },
  data: () => ({ open: false, loading: false, alerts: [], unread: 0, poller: null }),
  mounted() { this.refresh(); this.poller = window.setInterval(this.refresh, 60000); window.addEventListener('pointerdown', this.closeOutside, true); },
  beforeUnmount() { window.clearInterval(this.poller); window.removeEventListener('pointerdown', this.closeOutside, true); },
  methods: {
    toggle() { this.open = !this.open; if (this.open) this.unread = 0; },
    closePanel() { this.open = false; },
    markRead() { this.unread = 0; },
    closeOutside(event) { if (this.open && this.$refs.root && !this.$refs.root.contains(event.target)) this.open = false; },
    async refresh() {
      this.loading = true;
      try {
        const response = await getApi('/api/station/read');
        const rows = Array.isArray(response.data) ? response.data : (response.data?.rows || response.data?.records || []);
        const previous = readState(); const history = readHistory(); const now = new Date(); const next = {}; const events = [];
        rows.forEach((row) => {
          const station = row.name || row.stationName || row.stationId || row.id || 'Unknown station';
          const down = /offline|down|fault|error/i.test(String(row.status || '')) || (row.successRate !== undefined && Number(row.successRate) < 70);
          next[station] = { down, checkedAt: now.toISOString(), reason: reasonFor(row) };
          if (down && !previous[station]?.down) events.push({ id: `${station}-down-${now.getTime()}`, station, kind: 'down', reason: reasonFor(row), detail: `Detected ${now.toLocaleString()}` });
          if (!down && previous[station]?.down) events.push({ id: `${station}-recovered-${now.getTime()}`, station, kind: 'recovered', reason: 'Gateway heartbeat resumed.', detail: `Back online ${now.toLocaleString()}` });
        });
        this.unread += events.length;
        this.alerts = [...events, ...history].slice(0, 25); localStorage.setItem(storageKey, JSON.stringify(next)); localStorage.setItem(historyKey, JSON.stringify(this.alerts));
      } catch { this.alerts = []; } finally { this.loading = false; }
    }
  }
};
</script>

<style scoped>
.station-alerts { position:relative; }
.station-bell { position:relative; width:44px; height:44px; color:var(--text-main, #17342a); border-radius:10px; }
.station-bell:hover { background:var(--primary-light, #e8f2eb); color:var(--primary, #146848); }.station-bell svg { width:20px; height:20px; }
.station-bell-count { position:absolute; top:5px; right:5px; min-width:16px; height:16px; padding:0 4px; border:2px solid var(--bg-header, #fff); border-radius:999px; display:grid; place-items:center; background:#e5484d; color:#fff; font-size:9px; font-weight:800; }
.station-alert-scrim { position:fixed; inset:0; z-index:389; background:rgba(8, 18, 15, 0.08); }
.station-alert-popover { position:absolute; z-index:400; top:52px; right:0; width:min(380px, calc(100vw - 24px)); border:1px solid var(--border-color, #cde0d4); border-radius:12px; background:var(--bg-card, #fff); box-shadow:0 18px 52px rgba(18,35,29,.16), 0 2px 6px rgba(18,35,29,.05); overflow:hidden; }
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
.station-alert-body { max-height:min(52vh, 440px); overflow:auto; overscroll-behavior:contain; }
.station-alert-row { display:grid; grid-template-columns:8px 1fr; gap:11px; padding:14px 16px; border-bottom:1px solid var(--border-color, #cde0d4); }
.station-alert-row:hover { background:var(--bg-page, #f5f8f6); }
.station-alert-dot { width:7px; height:7px; border-radius:50%; margin-top:6px; background:#e5484d; box-shadow:0 0 0 3px color-mix(in srgb, #e5484d 14%, transparent); }
.station-alert-row.recovered .station-alert-dot { background:var(--primary, #146848); box-shadow:0 0 0 3px color-mix(in srgb, var(--primary, #146848) 13%, transparent); }
.station-alert-copy { min-width:0; }.station-alert-row-heading { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
.station-alert-row strong { font-size:13px; color:var(--text-strong, #12231d); }.station-alert-row-heading span { flex:0 0 auto; color:var(--text-muted, #5c7066); font-size:10px; }
.station-alert-row p { margin:4px 0 3px; font-size:12px; line-height:1.45; color:var(--text-main, #17342a); }.station-alert-empty { padding:24px 16px; color:var(--text-muted, #5c7066); font-size:13px; }
.station-alert-healthy { display:flex; align-items:flex-start; gap:10px; }.station-alert-healthy strong { display:block; color:var(--text-strong, #12231d); font-size:13px; }.station-alert-healthy p { margin:4px 0 0; font-size:12px; }.station-alert-healthy-dot { width:8px; height:8px; margin-top:5px; border-radius:50%; background:var(--primary, #146848); box-shadow:0 0 0 3px color-mix(in srgb, var(--primary, #146848) 13%, transparent); }
.station-alert-popover footer { padding:10px 16px; border-top:1px solid var(--border-color, #cde0d4); background:var(--bg-card, #fff); }.station-alert-popover a { display:inline-flex; align-items:center; gap:7px; min-height:32px; color:var(--text-main, #17342a); font-size:12px; font-weight:650; text-decoration:none; }.station-alert-popover a:hover { color:var(--primary, #146848); }
.station-alert-popover-enter-active,.station-alert-popover-leave-active { transition:opacity .18s ease, transform .18s ease; }
.station-alert-popover-enter-from,.station-alert-popover-leave-to { opacity:0; transform:translateY(-6px); }
.station-alert-scrim-enter-active,.station-alert-scrim-leave-active { transition:opacity .18s ease; }
.station-alert-scrim-enter-from,.station-alert-scrim-leave-to { opacity:0; }

@media (max-width: 768px) {
  .station-alert-popover {
    position: fixed;
    top: 68px;
    right: 12px;
    left: 12px;
    width: auto;
    max-width: none;
    border-radius: 18px;
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

  .station-alert-close {
    width: 32px;
    height: 32px;
    font-size: 20px;
  }

  .station-alert-body {
    max-height: calc(100dvh - 180px);
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
    position: sticky;
    bottom: 0;
    padding: 14px;
  }

  .station-alert-popover a {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
  }
}
</style>
