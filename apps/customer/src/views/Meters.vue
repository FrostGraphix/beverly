<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';

interface Meter {
    id: string;
    meter_id: string;
    nickname?: string | null;
    meter_type?: string | null;
    station_id?: string | null;
    status?: 'pending' | 'approved' | 'rejected' | null;
    rejection_reason?: string | null;
}

type MeterLinkEventType = 'submitted' | 'approved' | 'rejected' | 'unlinked';
interface MeterLinkHistoryEvent {
    id: string;
    customer_meter_id: string | null;
    meter_id: string;
    station_id: string | null;
    event_type: MeterLinkEventType;
    previous_status: Meter['status'];
    new_status: Meter['status'];
    reason: string | null;
    note: string | null;
    created_at: string;
}

function statusLabel(status?: string | null) {
    if (status === 'pending') return 'Pending review';
    if (status === 'rejected') return 'Rejected';
    return null;
}

function statusBadgeClass(status?: string | null) {
    if (status === 'pending') return 'warn';
    if (status === 'rejected') return 'danger';
    return 'neutral';
}

const meters = ref<Meter[]>([]);
const loading = ref(false);
const confirm = ref<string | null>(null);
const deleting = ref(false);
const history = ref<MeterLinkHistoryEvent[]>([]);
const historyLoading = ref(false);
const historyError = ref('');
const prices = ref<{ residential_minor: number; commercial_minor: number }>({
    residential_minor: 3_000_000,
    commercial_minor: 15_000_000,
});

async function loadPrices() {
    try {
        const res = await api.get<{ residential_minor: number; commercial_minor: number }>('/api/v1/customer/meter-pricing');
        if (res.residential_minor) prices.value = res;
    } catch { /* noop */ }
}

function meterTypeLabel(type?: string | null) {
    if (type === 'three_phase') return 'Three Phase';
    if (type === 'single_phase') return 'Single Phase';
    return 'Phase Unknown';
}

async function loadMeters() {
    loading.value = true;
    try {
        const response = await api.get<{ meters: Meter[] }>('/api/v1/customer/meters');
        meters.value = response.meters ?? [];
    } catch { /* noop */ } finally { loading.value = false; }
}

async function loadHistory() {
    historyLoading.value = true;
    historyError.value = '';
    try {
        const response = await api.get<{ history: MeterLinkHistoryEvent[] }>('/api/v1/customer/meters/history?limit=100');
        history.value = response.history ?? [];
    } catch (error: unknown) {
        historyError.value = error instanceof Error ? error.message : 'Linking history could not be loaded.';
    } finally { historyLoading.value = false; }
}

onMounted(() => {
    void Promise.all([loadMeters(), loadHistory(), loadPrices()]);
});

async function unlink(id: string) {
    deleting.value = true;
    try {
        await api.del(`/api/v1/customer/meters/${id}`);
        meters.value = meters.value.filter((meter) => meter.id !== id);
        confirm.value = null;
        await loadHistory();
    } catch { /* noop */ } finally { deleting.value = false; }
}

function historyLabel(event: MeterLinkEventType) {
    return {
        submitted: 'Submitted for review',
        approved: 'Approved',
        rejected: 'Rejected',
        unlinked: 'Unlinked',
    }[event];
}

function historyBadgeClass(event: MeterLinkEventType) {
    return {
        submitted: 'warn',
        approved: 'success',
        rejected: 'danger',
        unlinked: 'neutral',
    }[event];
}

function formatHistoryDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}
</script>

<template>
  <AppShell>
    <div class="bw-row" style="justify-content:space-between; align-items:center">
      <div>
        <p class="bw-page-title">My Meters</p>
        <p class="bw-page-sub">{{ meters.length }} linked</p>
      </div>
      <div class="bw-row" style="gap:8px">
        <router-link to="/consumption" class="bw-btn" style="text-decoration:none; white-space:nowrap">
          Consumption
        </router-link>
        <router-link to="/onboard-meter" class="bw-btn primary" style="text-decoration:none; white-space:nowrap">
          + Add meter
        </router-link>
      </div>
    </div>

    <section class="meter-install-card">
      <div class="meter-install-icon" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M13 2 4 14h7l-1 8 10-13h-7l0-7Z" />
        </svg>
      </div>
      <div class="meter-install-copy">
        <p class="meter-install-kicker">Certified install</p>
        <h2>Need a meter installed?</h2>
        <p>Choose a prepaid meter, track installation, and start buying tokens after activation.</p>
      </div>
      <div class="meter-install-prices" aria-label="Meter prices">
        <span><strong>NGN {{ Math.round(prices.residential_minor / 100000) }}k</strong> Residential</span>
        <span><strong>NGN {{ Math.round(prices.commercial_minor / 100000) }}k</strong> Commercial</span>
      </div>
      <div class="meter-install-actions">
        <router-link to="/meter-orders" class="bw-btn meter-install-secondary">
          My orders
        </router-link>
        <router-link to="/buy-meter" class="bw-btn primary">
          Order meter
        </router-link>
      </div>
    </section>

    <div v-if="loading" class="bw-muted" style="text-align:center; padding: var(--s-8); font-size: var(--t-sm)">Loading...</div>

    <div v-else-if="!meters.length" class="bw-card" style="text-align:center; padding: var(--s-8)">
      <div class="meter-empty-icon" aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M13 2 4 14h7l-1 8 10-13h-7l0-7Z" />
        </svg>
      </div>
      <p style="font-weight:700; margin:0 0 var(--s-2)">No meters yet</p>
      <p class="bw-muted" style="font-size: var(--t-sm); margin:0 0 var(--s-5)">Link your prepaid meter to buy tokens instantly.</p>
      <router-link to="/onboard-meter" class="bw-btn primary" style="text-decoration:none; display:inline-flex">
        Link a meter
      </router-link>
    </div>

    <div v-for="meter in meters" :key="meter.id" class="bw-card">
      <div class="bw-row">
        <div class="bw-meter-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
          </svg>
        </div>
        <div style="flex:1; min-width:0">
          <div style="font-weight:700">{{ meter.nickname || meter.meter_id }}</div>
          <div class="bw-mono bw-dim" style="font-size: var(--t-xs)">{{ meter.meter_id }}</div>
          <div class="bw-row" style="gap: var(--s-2); margin-top:4px; flex-wrap:wrap">
            <span :class="['bw-badge', meter.meter_type === 'three_phase' ? 'info' : 'neutral']">
              {{ meterTypeLabel(meter.meter_type) }}
            </span>
            <span v-if="statusLabel(meter.status)" :class="['bw-badge', statusBadgeClass(meter.status)]">
              {{ statusLabel(meter.status) }}
            </span>
            <span v-if="meter.station_id" class="bw-muted" style="font-size: var(--t-xs)">{{ meter.station_id }}</span>
          </div>
          <p v-if="meter.status === 'rejected' && meter.rejection_reason" class="bw-muted" style="font-size: var(--t-xs); margin-top:4px">
            {{ meter.rejection_reason }}
          </p>
        </div>
        <div class="bw-row" style="gap: var(--s-2); flex-shrink:0">
          <router-link v-if="meter.status === 'approved'" :to="{ name: 'buy-token', query: { meter: meter.meter_id } }"
                       class="bw-btn" style="text-decoration:none; font-size: var(--t-sm); padding:0 var(--s-3); height:36px">
            Buy
          </router-link>
          <button class="bw-btn" style="font-size: var(--t-sm); padding:0 var(--s-3); height:36px; color: var(--danger)"
                  @click="confirm = meter.id">
            Remove
          </button>
        </div>
      </div>

      <div v-if="confirm === meter.id"
           style="margin-top: var(--s-3); padding: var(--s-3); background: var(--surface-2); border-radius: var(--r-md)">
        <p style="font-size: var(--t-sm); margin:0 0 var(--s-3)">Remove <strong>{{ meter.meter_id }}</strong>?</p>
        <div class="bw-row" style="gap: var(--s-2)">
          <button class="bw-btn" style="flex:1; justify-content:center; font-size: var(--t-sm)"
                  @click="confirm = null">Cancel</button>
          <button class="bw-btn danger" style="flex:1; justify-content:center; font-size: var(--t-sm)"
                  :disabled="deleting" @click="unlink(meter.id)">
            {{ deleting ? 'Removing...' : 'Remove' }}
          </button>
        </div>
      </div>
    </div>

    <section id="link-history" class="bw-card meter-history" aria-labelledby="link-history-title">
      <div class="meter-history-head">
        <div>
          <p class="meter-history-kicker">Account record</p>
          <h2 id="link-history-title">Linking history</h2>
          <p>Every meter request and decision stays here, including rejected links you submit again.</p>
        </div>
        <button class="bw-btn" type="button" :disabled="historyLoading" @click="loadHistory">
          {{ historyLoading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>

      <div v-if="historyError" class="bw-alert danger" role="alert">{{ historyError }}</div>
      <div v-if="historyLoading && !history.length" class="bw-muted meter-history-empty">Loading linking history…</div>
      <div v-else-if="!history.length" class="bw-muted meter-history-empty">No meter linking activity yet.</div>
      <ol v-else class="meter-history-list">
        <li v-for="event in history" :key="event.id" class="meter-history-event">
          <span :class="['meter-history-marker', historyBadgeClass(event.event_type)]" aria-hidden="true"></span>
          <div class="meter-history-event-copy">
            <div class="meter-history-event-head">
              <strong>{{ historyLabel(event.event_type) }}</strong>
              <time :datetime="event.created_at">{{ formatHistoryDate(event.created_at) }}</time>
            </div>
            <span class="bw-mono">{{ event.meter_id }}</span>
            <p v-if="event.reason">{{ event.reason }}</p>
            <p v-else-if="event.note">{{ event.note }}</p>
            <router-link v-if="event.event_type === 'rejected'" to="/onboard-meter" class="meter-history-action">
              Submit this meter again
            </router-link>
          </div>
        </li>
      </ol>
    </section>
  </AppShell>
</template>

<style scoped>
.meter-install-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--s-4);
    position: relative;
    overflow: hidden;
    margin-bottom: var(--s-5);
    padding: var(--s-5);
    border: 1px solid color-mix(in srgb, var(--brand) 34%, var(--border));
    border-radius: var(--r-xl);
    background:
        linear-gradient(135deg, color-mix(in srgb, var(--brand) 16%, transparent), transparent 52%),
        var(--glass-bg-strong);
    box-shadow: var(--glass-shine), var(--glass-shadow-card);
    backdrop-filter: blur(18px) saturate(160%);
    -webkit-backdrop-filter: blur(18px) saturate(160%);
}
.meter-install-card::after {
    content: "";
    position: absolute;
    right: -56px;
    top: -72px;
    width: 160px;
    height: 160px;
    border: 1px solid color-mix(in srgb, var(--brand) 24%, transparent);
    border-radius: 999px;
}
.meter-install-icon {
    width: 56px;
    height: 56px;
    display: grid;
    place-items: center;
    border-radius: var(--r-lg);
    background: color-mix(in srgb, var(--brand) 18%, transparent);
    color: var(--brand);
}
.meter-install-copy {
    min-width: 0;
}
.meter-install-kicker {
    margin: 0 0 4px;
    color: var(--brand);
    font-size: var(--t-2xs);
    font-weight: 800;
    letter-spacing: .12em;
    text-transform: uppercase;
}
.meter-install-copy h2 {
    margin: 0;
    color: var(--text);
    font-size: var(--t-xl);
    line-height: 1.05;
}
.meter-install-copy p:last-child {
    margin: var(--s-2) 0 0;
    color: var(--text-2);
    font-size: var(--t-sm);
    line-height: 1.45;
}
.meter-install-prices {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-2);
}
.meter-install-prices span {
    display: grid;
    gap: 2px;
    padding: var(--s-3);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: color-mix(in srgb, var(--surface) 72%, transparent);
    color: var(--text-2);
    font-size: var(--t-xs);
}
.meter-install-prices strong {
    color: var(--text);
    font-size: var(--t-lg);
}
.meter-install-actions {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s-2);
}
.meter-install-actions a {
    justify-content: center;
    min-height: 44px;
    text-decoration: none;
}
.meter-install-secondary {
    background: color-mix(in srgb, var(--surface) 84%, transparent);
}
.meter-empty-icon {
    width: 58px;
    height: 58px;
    display: grid;
    place-items: center;
    margin: 0 auto var(--s-3);
    border-radius: var(--r-lg);
    background: color-mix(in srgb, var(--brand) 14%, transparent);
    color: var(--brand);
}
.meter-history {
    margin-top: var(--s-5);
    scroll-margin-top: var(--s-6);
}
.meter-history-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--s-4);
    padding-bottom: var(--s-4);
    border-bottom: 1px solid var(--border);
}
.meter-history-kicker {
    margin: 0 0 var(--s-1);
    color: var(--brand);
    font-size: var(--t-2xs);
    font-weight: 800;
    letter-spacing: .12em;
    text-transform: uppercase;
}
.meter-history-head h2 {
    margin: 0;
    font-size: var(--t-xl);
}
.meter-history-head p:last-child {
    margin: var(--s-1) 0 0;
    color: var(--text-muted);
    font-size: var(--t-sm);
}
.meter-history-empty {
    padding: var(--s-6) 0;
    text-align: center;
}
.meter-history-list {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
}
.meter-history-event {
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr);
    gap: var(--s-3);
    padding: var(--s-4) 0;
    border-bottom: 1px solid var(--border);
}
.meter-history-event:last-child { border-bottom: 0; }
.meter-history-marker {
    width: 10px;
    height: 10px;
    margin-top: 5px;
    border: 2px solid var(--text-muted);
    border-radius: 50%;
    background: var(--surface-1);
    box-shadow: 0 0 0 4px var(--surface-2);
}
.meter-history-marker.warn { border-color: var(--warn); }
.meter-history-marker.success { border-color: var(--success); }
.meter-history-marker.danger { border-color: var(--danger); }
.meter-history-event-copy { min-width: 0; }
.meter-history-event-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-3);
}
.meter-history-event-head time,
.meter-history-event-copy > .bw-mono {
    color: var(--text-muted);
    font-size: var(--t-xs);
}
.meter-history-event-copy p {
    margin: var(--s-2) 0 0;
    color: var(--text-2);
    font-size: var(--t-sm);
}
.meter-history-action {
    display: inline-block;
    margin-top: var(--s-2);
    color: var(--brand);
    font-size: var(--t-sm);
    font-weight: 700;
}
@media (max-width: 420px) {
    .meter-install-card,
    .meter-install-actions {
        grid-template-columns: 1fr;
    }
    .meter-history-head,
    .meter-history-event-head {
        align-items: flex-start;
        flex-direction: column;
    }
}
</style>
