<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, naira, shortDate } from '../lib/api';
import { useStaffAuthStore } from '../stores/auth';
import WalletGreeting from '@beverly/tokens/WalletGreeting.vue';

interface FundingRequest { id: string; amount_minor: number; status: string; created_at: string; actor_id?: string | null; reference?: string | null; }
interface Application    { id: string; legal_name: string; created_at: string; }
interface Purchase        { id: string; amount_minor: number; energy_amount_minor?: number | null; vat_amount_minor?: number | null; units_kwh?: number | null; status: string; meter_id?: string; station_id?: string | null; customer_name?: string | null; purchase_mode?: string | null; actor_type?: string | null; reference?: string | null; created_at: string; }
interface WalletSummary {
    walletCount: number;
    totalFloatMinor: number;
    totalBalanceMinor?: number;
    activeWallets?: number;
    suspendedWallets?: number;
    closedWallets?: number;
    byStatus?: Record<string, number>;
}

const funding = ref<FundingRequest[]>([]);
const auth = useStaffAuthStore();
const apps    = ref<Application[]>([]);
const vending = ref<Purchase[]>([]);
const walletSummary = ref<WalletSummary>({ walletCount: 0, totalFloatMinor: 0, byStatus: {} });
const loading = ref(true);
const feedErrors = ref<string[]>([]);
const staffName = computed(() => auth.user?.full_name?.split(' ')[0] || 'team');
let poll: ReturnType<typeof setInterval> | null = null;
const statPendingFundingMinor = ref(0);
const statTodayPurchasesMinor = ref(0);
const statFailedToday = ref(0);
const statApplications = ref(0);
const statTotalWalletFloatMinor = ref(0);
const statTokensDeliveredToday = ref(0);
const recentTypeFilter = ref('all');
const recentActorFilter = ref('all');
const recentStationFilter = ref('');
const recentDateFilter = ref('all');
const recentSearchQuery = ref('');
const showRecentFilters = ref(false);
const knownStations = ref<string[]>([]);

const RECENT_TYPE_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'purchases', label: 'Purchases' },
    { id: 'funding', label: 'Funding' },
    { id: 'reversals', label: 'Reversals' },
    { id: 'disputes', label: 'Disputes' },
    { id: 'failed', label: 'Failed' },
] as const;

const pendingFundingTotal = computed(() => funding.value.reduce((s, f) => s + f.amount_minor, 0));
const todayVendingTotal = computed(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return vending.value
        .filter(p => new Date(p.created_at) >= today && p.status === 'delivered')
        .reduce((s, p) => s + p.amount_minor, 0);
});
const failedToday = computed(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return vending.value.filter(p => new Date(p.created_at) >= today && p.status === 'failed').length;
});
const deliveredToday = computed(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return vending.value.filter(p => new Date(p.created_at) >= today && p.status === 'delivered').length;
});
const pendingVending = computed(() =>
    vending.value.filter(p => ['hold_active', 'dispatching', 'delivery_pending_review'].includes(p.status))
);
const recentActivityRows = computed(() => {
    const purchases = vending.value.map((p) => {
        const isFailed = p.status === 'failed';
        const isReversal = p.status === 'reversed';
        const kind = isFailed ? 'failed' : (isReversal ? 'reversals' : 'purchases');
        const rawId = p.id;
        const reference = p.reference ? (p.reference.startsWith('#') ? p.reference : `#${p.reference}`) : `#po_${p.id.slice(0, 8)}`;
        return {
            id: `purchase-${p.id}`,
            rawId,
            reference,
            type: typeLabel(p),
            kind,
            typeTone: typeTone(kind),
            vendor: p.purchase_mode ? p.purchase_mode.replace(/_/g, ' ') : 'Vending',
            customerName: p.customer_name || 'Unknown customer',
            meterId: p.meter_id || '',
            actorType: p.actor_type || 'customer',
            customerMeter: [p.customer_name, p.meter_id].filter(Boolean).join(' - ') || 'Unknown meter',
            station: p.station_id || '',
            amountMinor: p.amount_minor,
            unitsKwh: p.units_kwh,
            units: p.units_kwh ? `${p.units_kwh.toLocaleString('en-NG', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} kWh` : '',
            status: p.status.replace(/_/g, ' '),
            statusTone: statusTone(p.status),
            createdAt: p.created_at,
        };
    });

    const fundingRows = funding.value.map((f) => ({
        id: `funding-${f.id}`,
        rawId: f.id,
        reference: `#fund_${f.id.slice(0, 8)}`,
        type: 'Funding',
        kind: 'funding',
        typeTone: 'info',
        vendor: 'Funding queue',
        customerName: f.actor_id || 'Vendor/Customer',
        meterId: '',
        actorType: 'vendor',
        customerMeter: '',
        station: '',
        amountMinor: f.amount_minor,
        unitsKwh: null,
        units: '',
        status: f.status.replace(/_/g, ' '),
        statusTone: statusTone(f.status),
        createdAt: f.created_at,
    }));

    return [...purchases, ...fundingRows]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
});
const recentActivityTabs = computed(() =>
    RECENT_TYPE_FILTERS.map((tab) => ({
        ...tab,
        count: tab.id === 'all'
            ? recentActivityRows.value.length
            : recentActivityRows.value.filter((row) => row.kind === tab.id).length,
    })),
);
const recentStations = computed(() => {
    const fromRows = recentActivityRows.value.map(row => row.station).filter(Boolean);
    return [...new Set([...knownStations.value, ...fromRows])].sort();
});
const filteredRecentTransactions = computed(() =>
    recentActivityRows.value.filter((row) => {
        const matchesType = recentTypeFilter.value === 'all' || row.kind === recentTypeFilter.value;
        const matchesActor = recentActorFilter.value === 'all' || row.actorType === recentActorFilter.value;
        const matchesStation = !recentStationFilter.value || row.station.trim().toUpperCase() === recentStationFilter.value.trim().toUpperCase();
        const matchesDate = matchesDateFilter(row.createdAt, recentDateFilter.value);
        const query = recentSearchQuery.value.trim().toLowerCase();
        const matchesQuery = !query || [
            row.reference,
            row.rawId,
            row.customerName,
            row.meterId,
            row.vendor,
            row.type,
            row.status,
            row.station
        ].some(val => val && val.toString().toLowerCase().includes(query));

        return matchesType && matchesActor && matchesStation && matchesDate && matchesQuery;
    }),
);
const recentTransactions = computed(() => filteredRecentTransactions.value.slice(0, 10));
const totalWalletFloatMinor = computed(() =>
    walletSummary.value.totalFloatMinor ?? walletSummary.value.totalBalanceMinor ?? 0,
);
const activeWalletCount = computed(() =>
    walletSummary.value.byStatus?.active ?? walletSummary.value.activeWallets ?? 0,
);

function animateStat(targetRef: { value: number }, target: number, durationMs = 700) {
    const from = Number(targetRef.value || 0);
    const to = Number(target || 0);
    if (from === to) return;
    const start = performance.now();

    const step = (now: number) => {
        const t = Math.min((now - start) / durationMs, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        targetRef.value = Math.round(from + (to - from) * eased);
        if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

function syncAnimatedStats() {
    animateStat(statPendingFundingMinor, pendingFundingTotal.value);
    animateStat(statTodayPurchasesMinor, todayVendingTotal.value);
    animateStat(statFailedToday, failedToday.value);
    animateStat(statApplications, apps.value.length);
    animateStat(statTotalWalletFloatMinor, totalWalletFloatMinor.value);
    animateStat(statTokensDeliveredToday, deliveredToday.value);
}

function typeLabel(p: Purchase) {
    if (p.status === 'reversed') return 'Reversal';
    if (p.status === 'failed') return 'Failed Vend';
    if (p.purchase_mode === 'remote_send') return 'Remote Send';
    return 'Token Buy';
}

function typeTone(kind: string) {
    if (kind === 'funding') return 'info';
    if (kind === 'reversals') return 'warn';
    if (kind === 'disputes' || kind === 'failed') return 'danger';
    return 'success';
}

function statusTone(status: string) {
    if (status === 'delivered' || status === 'approved' || status === 'processed') return 'success';
    if (status === 'failed' || status === 'rejected') return 'danger';
    if (status === 'dispatching' || status === 'hold_active') return 'info';
    if (status === 'delivery_pending_review' || status === 'reversed' || status === 'pending') return 'warn';
    return 'neutral';
}

function matchesDateFilter(iso: string, filter: string) {
    if (filter === 'all') return true;
    const created = new Date(iso);
    if (Number.isNaN(created.getTime())) return true;
    const now = new Date();
    const start = new Date(now);
    if (filter === 'seven') {
        start.setDate(now.getDate() - 7);
        return created >= start;
    }
    if (filter === 'month') {
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        return created >= start;
    }
    start.setHours(0, 0, 0, 0);
    return created >= start;
}

function adminAutoRefreshEnabled() {
    try {
        const saved = JSON.parse(localStorage.getItem('beverly.admin.qualitySettings') || '{}');
        return saved.autoRefresh !== false;
    } catch {
        return true;
    }
}

async function fetchAll() {
    const errors: string[] = [];
    
    const [fundingRes, appsRes, vendingRes, walletRes, stationsRes] = await Promise.allSettled([
        api.get<{ funding: FundingRequest[] }>('/api/v1/admin/funding/pending'),
        api.get<{ applications: Application[] }>('/api/v1/admin/vendor-applications'),
        api.get<{ purchases: Purchase[] }>('/api/v1/admin/vending'),
        api.get<WalletSummary>('/api/v1/admin/wallets/summary'),
        api.get<{ stations: any[] }>('/api/v1/admin/stations')
    ]);

    if (fundingRes.status === 'fulfilled') funding.value = fundingRes.value.funding;
    else errors.push('Funding queue unavailable');

    if (appsRes.status === 'fulfilled') apps.value = appsRes.value.applications;
    else errors.push('Applications feed unavailable');

    if (vendingRes.status === 'fulfilled') vending.value = vendingRes.value.purchases;
    else errors.push('Vending feed unavailable');

    if (walletRes.status === 'fulfilled') walletSummary.value = walletRes.value;
    else errors.push('Wallet summary unavailable');

    if (stationsRes.status === 'fulfilled') {
        const list = Array.isArray(stationsRes.value?.stations)
            ? stationsRes.value.stations.map((s: any) => typeof s === 'string' ? s : (s.name || s.id || s.code)).filter(Boolean)
            : [];
        knownStations.value = list;
    }

    feedErrors.value = errors;
    syncAnimatedStats();
}

onMounted(async () => {
    await fetchAll();
    loading.value = false;
    if (adminAutoRefreshEnabled()) poll = setInterval(fetchAll, 30_000);
});
onUnmounted(() => { if (poll) clearInterval(poll); });
</script>

<template>
  <AppShell title="Dashboard">

    <WalletGreeting
      audience="Wallet command room"
      :name="staffName"
      detail="for Beverly wallet operations."
    />

    <!-- Page header -->
    <div class="bw-page-head">
      <div class="bw-page-title">
        <h1>Dashboard</h1>
        <p>Real-time overview of Beverly vending wallet. Refreshes every 30 s.</p>
      </div>
      <div class="bw-head-actions">
        <router-link v-if="auth.hasPermission('wallet.vendors.manage')" to="/vendors/new" class="bw-btn primary" style="text-decoration:none">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          New Vendor
        </router-link>
      </div>
    </div>

    <div v-if="feedErrors.length" class="bw-banner error" role="alert" style="margin-bottom: var(--s-4)">
      Live dashboard degraded: {{ feedErrors.join(' - ') }}.
    </div>

    <!-- KPI grid -->
    <div v-if="loading" class="bw-kpi-grid" aria-label="Loading dashboard">
      <div v-for="n in 6" :key="`kpi-skeleton-${n}`" class="bw-kpi bw-skeleton"></div>
    </div>
    <div v-else class="bw-kpi-grid">

      <!-- Featured: pending funding -->
      <div class="bw-kpi featured">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Pending Funding</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value" style="color: var(--brand)">
          {{ naira(statPendingFundingMinor) }}
        </div>
        <div class="bw-kpi-foot">
          <span :class="['bw-delta', funding.length > 0 ? 'up' : 'flat']">
            {{ funding.length }} request{{ funding.length !== 1 ? 's' : '' }}
          </span>
          <span class="bw-kpi-note">awaiting approval</span>
        </div>
        <svg class="bw-spark" viewBox="0 0 120 36" preserveAspectRatio="none">
          <defs>
            <linearGradient id="bw-sparkGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="oklch(70% 0.19 145)" stop-opacity="0.25"/>
              <stop offset="100%" stop-color="oklch(70% 0.19 145)" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path class="fill" d="M0 36 L0 24 C15 20,25 28,40 22 C55 16,65 8,80 12 C95 16,105 10,120 6 L120 36 Z"/>
          <path class="stroke" d="M0 24 C15 20,25 28,40 22 C55 16,65 8,80 12 C95 16,105 10,120 6"/>
        </svg>
      </div>

      <!-- Today vended -->
      <div class="bw-kpi">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Today's Purchases</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value" style="color: var(--brand)">{{ naira(statTodayPurchasesMinor) }}</div>
        <div class="bw-kpi-foot">
          <span class="bw-delta up">{{ deliveredToday }} vends</span>
          <span class="bw-kpi-note">successful today</span>
        </div>
        <svg class="bw-spark" viewBox="0 0 120 36" preserveAspectRatio="none">
          <path class="fill" d="M0 36 L0 30 C20 26,30 18,50 20 C70 22,80 14,120 8 L120 36 Z"/>
          <path class="stroke" d="M0 30 C20 26,30 18,50 20 C70 22,80 14,120 8"/>
        </svg>
      </div>

      <!-- Failed today -->
      <div :class="['bw-kpi', failedToday > 0 ? 'danger-tone' : '']">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Failed Transactions</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value" :style="{ color: failedToday > 0 ? 'var(--danger)' : 'var(--text-dim)' }">
          {{ statFailedToday }}
        </div>
        <div class="bw-kpi-foot">
          <span :class="['bw-delta', failedToday > 0 ? 'down' : 'flat']">
            {{ failedToday > 0 ? 'needs review' : 'all clear' }}
          </span>
        </div>
      </div>

      <!-- Applications -->
      <div :class="['bw-kpi', apps.length > 0 ? 'info-tone' : '']">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Applications</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value" :style="{ color: apps.length > 0 ? 'var(--info)' : 'var(--text-dim)' }">
          {{ statApplications }}
        </div>
        <div class="bw-kpi-foot">
          <span :class="['bw-delta', apps.length > 0 ? 'flat' : 'flat']" style="background: oklch(72% 0.13 220 / 0.12); color: var(--info)">
            awaiting review
          </span>
        </div>
      </div>

      <!-- Total wallet float -->
      <router-link
        to="/wallets"
        class="bw-kpi featured bw-kpi-link"
        style="text-decoration:none; color:inherit"
        aria-label="Open all wallets"
      >
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Total Wallet Float</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7h20v10H2z"/><path d="M16 12h.01"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value" style="color: var(--brand)">{{ naira(statTotalWalletFloatMinor) }}</div>
        <div class="bw-kpi-foot">
          <span class="bw-delta up">{{ activeWalletCount }} active</span>
          <span class="bw-kpi-note">across all wallets</span>
        </div>
      </router-link>

      <!-- Tokens delivered today -->
      <div class="bw-kpi info-tone">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Tokens Delivered Today</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value" style="color: var(--info)">{{ statTokensDeliveredToday }}</div>
        <div class="bw-kpi-foot">
          <span class="bw-delta up">{{ deliveredToday }} successful</span>
          <span class="bw-kpi-note">live delivery count</span>
        </div>
      </div>

    </div>

    <!-- Queues row -->
    <div v-if="loading" class="bw-row-2">
      <div class="bw-card bw-skeleton" style="min-height:260px"></div>
      <div class="bw-card bw-skeleton" style="min-height:260px"></div>
    </div>
    <div v-else class="bw-row-2">

      <!-- Funding queue -->
      <div class="bw-card flush">
        <div class="bw-table-head-bar">
          <div>
            <div class="bw-card-title">Funding queue</div>
            <div class="bw-card-sub">Pending maker-checker approval</div>
          </div>
          <span v-if="funding.length" class="bw-badge warn">{{ funding.length }}</span>
          <span v-else class="bw-badge success">Clear</span>
        </div>

        <div v-if="!funding.length && !loading" class="bw-muted" style="text-align:center; padding: var(--s-6); font-size: var(--t-sm)">
          No pending funding requests.
        </div>

        <div class="bw-queue" style="padding: var(--s-4) var(--s-5); gap: var(--s-2)">
          <div v-for="f in funding.slice(0, 6)" :key="f.id" class="bw-q-row warn">
            <div class="bw-q-icon warn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
            </div>
            <div class="bw-q-body">
              <div class="bw-q-title bw-money">{{ naira(f.amount_minor) }}</div>
              <div class="bw-q-sub bw-mono">#{{ f.id.slice(0, 8) }} · {{ shortDate(f.created_at) }}</div>
            </div>
            <span class="bw-badge warn">pending</span>
          </div>
        </div>

        <div style="padding: var(--s-3) var(--s-5); border-top: 1px solid var(--border)">
          <router-link v-if="auth.hasPermission('wallet.funding.view')" to="/funding" class="bw-btn" style="text-decoration:none; width:100%; justify-content:center">
            Open queue
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </router-link>
        </div>
      </div>

      <!-- Applications queue -->
      <div class="bw-card flush">
        <div class="bw-table-head-bar">
          <div>
            <div class="bw-card-title">Vendor applications</div>
            <div class="bw-card-sub">New vendor interest forms</div>
          </div>
          <span v-if="apps.length" class="bw-badge info">{{ apps.length }}</span>
          <span v-else class="bw-badge success">Clear</span>
        </div>

        <div v-if="!apps.length && !loading" class="bw-muted" style="text-align:center; padding: var(--s-6); font-size: var(--t-sm)">
          No new applications.
        </div>

        <div class="bw-queue" style="padding: var(--s-4) var(--s-5); gap: var(--s-2)">
          <div v-for="a in apps.slice(0, 6)" :key="a.id" class="bw-q-row info">
            <div class="bw-avatar indigo" style="width:38px; height:38px; border-radius: var(--r-md); font-size: 12px; flex-shrink:0">
              {{ a.legal_name.slice(0, 2).toUpperCase() }}
            </div>
            <div class="bw-q-body">
              <div class="bw-q-title">{{ a.legal_name }}</div>
              <div class="bw-q-sub">{{ shortDate(a.created_at) }}</div>
            </div>
          </div>
        </div>

        <div style="padding: var(--s-3) var(--s-5); border-top: 1px solid var(--border)">
          <router-link v-if="auth.hasPermission('wallet.vendors.review')" to="/applications" class="bw-btn" style="text-decoration:none; width:100%; justify-content:center">
            Review all
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </router-link>
        </div>
      </div>

    </div>

    <!-- In-flight vending table -->
    <div v-if="pendingVending.length" class="bw-card flush">
      <div class="bw-table-head-bar">
        <div>
          <div class="bw-card-title">
            In-flight vending
            <span class="bw-badge warn" style="font-size: 9px">{{ pendingVending.length }}</span>
          </div>
          <div class="bw-card-sub">Orders that haven't resolved yet</div>
        </div>
        <router-link v-if="auth.hasPermission('wallet.vending.monitor')" to="/vending" class="bw-btn sm" style="text-decoration:none">Open monitor</router-link>
      </div>

      <!-- Desktop table -->
      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Meter</th>
              <th style="text-align:right">Amount</th>
              <th>Status</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in pendingVending.slice(0, 8)" :key="p.id">
              <td class="bw-row-id">#{{ p.id.slice(0, 8) }}</td>
              <td class="bw-mono">{{ p.meter_id || '—' }}</td>
              <td class="bw-money" style="text-align:right">{{ naira(p.amount_minor) }}</td>
              <td><span class="bw-badge warn">{{ p.status }}</span></td>
              <td class="bw-muted" style="font-size: var(--t-xs)">{{ shortDate(p.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="bw-t-cards">
        <div v-for="p in pendingVending.slice(0, 8)" :key="p.id" class="bw-tc">
          <div class="bw-tc-top">
            <div>
              <div class="bw-tc-vendor">{{ p.meter_id || 'Unknown meter' }}</div>
              <div class="bw-tc-id">#{{ p.id.slice(0, 12) }}</div>
            </div>
            <div class="bw-tc-amt bw-money">{{ naira(p.amount_minor) }}</div>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Status</span>
              <span class="bw-badge warn">{{ p.status }}</span>
            </div>
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">When</span>
              <span class="bw-tc-pair-val bw-muted">{{ shortDate(p.created_at) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent transactions -->
    <div class="bw-card flush">
      <div class="bw-table-head-bar recent-head-bar">
        <div>
          <div class="bw-card-title">Recent Transactions</div>
          <div class="bw-card-sub">Most recent vending orders and wallet activity</div>
        </div>
        <div class="bw-row" style="gap: var(--s-2)">
          <button
            class="bw-btn sm"
            :class="{ active: showRecentFilters }"
            @click="showRecentFilters = !showRecentFilters"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            Filter
          </button>
          <router-link
            v-if="auth.hasPermission('wallet.vending.monitor')"
            to="/vending"
            class="bw-btn sm"
            style="text-decoration:none"
          >
            See more
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </router-link>
        </div>
      </div>

      <!-- Filter Controls Panel -->
      <div v-if="showRecentFilters" class="recent-filter-panel">
        <div class="recent-filter-grid">
          <div class="filter-group">
            <label class="filter-label">Search</label>
            <input
              v-model="recentSearchQuery"
              type="text"
              class="bw-input bw-input-sm"
              placeholder="Search reference, customer, meter..."
            />
          </div>
          <div class="filter-group">
            <label class="filter-label">Range</label>
            <select v-model="recentDateFilter" class="bw-select bw-select-sm">
              <option value="all">All available</option>
              <option value="today">Today</option>
              <option value="seven">Last 7 days</option>
              <option value="month">This month</option>
            </select>
          </div>
          <div class="filter-group">
            <label class="filter-label">Station</label>
            <select v-model="recentStationFilter" class="bw-select bw-select-sm">
              <option value="">All stations</option>
              <option v-for="st in recentStations" :key="st" :value="st">{{ st }}</option>
            </select>
          </div>
          <div class="filter-group">
            <label class="filter-label">Actor</label>
            <div class="bw-row" style="gap: 4px">
              <button
                v-for="act in [
                  { id: 'all', label: 'All' },
                  { id: 'customer', label: 'Customer' },
                  { id: 'vendor', label: 'Vendor' }
                ]"
                :key="act.id"
                :class="['bw-btn sm', recentActorFilter === act.id ? 'primary' : '']"
                @click="recentActorFilter = act.id"
              >
                {{ act.label }}
              </button>
            </div>
          </div>
          <div class="filter-group full-width">
            <label class="filter-label">Type</label>
            <div class="recent-tabs-row">
              <button
                v-for="tab in recentActivityTabs"
                :key="tab.id"
                :class="['bw-btn sm', recentTypeFilter === tab.id ? 'primary' : '']"
                @click="recentTypeFilter = tab.id"
              >
                {{ tab.label }} ({{ tab.count }})
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Desktop table -->
      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer / Meter</th>
              <th>Station</th>
              <th>Type</th>
              <th>Status</th>
              <th style="text-align:right">Amount</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            <template v-if="loading">
              <tr v-for="n in 5" :key="`recent-skeleton-${n}`"><td colspan="7"><div class="bw-skeleton"></div></td></tr>
            </template>
            <tr v-for="p in recentTransactions" :key="`recent-${p.id}`">
              <td class="bw-row-id">{{ p.reference }}</td>
              <td>
                <div style="font-weight:600">{{ p.customerName }}</div>
                <div class="bw-mono bw-muted" style="font-size: var(--t-xs)">
                  {{ p.meterId || '—' }}
                </div>
                <div v-if="p.units" class="bw-muted" style="font-size: 10px; color: var(--text-muted)">
                  {{ p.units }}
                </div>
              </td>
              <td class="bw-mono">{{ p.station || '—' }}</td>
              <td><span :class="['bw-badge', p.typeTone]">{{ p.type }}</span></td>
              <td><span :class="['bw-badge', p.statusTone]">{{ p.status }}</span></td>
              <td class="bw-money" style="text-align:right">{{ naira(p.amountMinor) }}</td>
              <td class="bw-muted" style="font-size: var(--t-xs)">{{ shortDate(p.createdAt) }}</td>
            </tr>
            <tr v-if="!recentTransactions.length && !loading">
              <td colspan="7" class="bw-muted" style="text-align:center; padding: var(--s-5)">No transactions match filters.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="bw-t-cards">
        <div v-for="p in recentTransactions" :key="`recent-card-${p.id}`" class="bw-tc">
          <div class="bw-tc-top">
            <div>
              <div class="bw-tc-vendor">{{ p.customerName }}</div>
              <div class="bw-tc-id">{{ p.reference }} · {{ shortDate(p.createdAt) }}</div>
            </div>
            <div class="bw-tc-amt bw-money">{{ naira(p.amountMinor) }}</div>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Meter</span>
              <span class="bw-tc-pair-val bw-mono">{{ p.meterId || '—' }}</span>
              <span v-if="p.units" class="bw-muted" style="font-size: 10px">{{ p.units }}</span>
            </div>
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Station</span>
              <span class="bw-tc-pair-val bw-mono">{{ p.station || '—' }}</span>
            </div>
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Type & Status</span>
              <span class="bw-tc-pair-val">
                <span :class="['bw-badge', p.typeTone]">{{ p.type }}</span>
                <span :class="['bw-badge', p.statusTone]" style="margin-left:4px">{{ p.status }}</span>
              </span>
            </div>
          </div>
        </div>
        <div v-if="!recentTransactions.length && !loading" class="bw-muted" style="text-align:center; padding: var(--s-5)">
          No transactions match filters.
        </div>
      </div>
    </div>

  </AppShell>
</template>

<style scoped>
.recent-filter-panel {
  padding: var(--s-3) var(--s-4);
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
}
.recent-filter-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--s-3);
}
.filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.filter-group.full-width {
  grid-column: 1 / -1;
}
.filter-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}
.recent-tabs-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

@media (max-width: 640px) {
  .recent-filter-grid {
    grid-template-columns: 1fr 1fr;
  }
  .recent-filter-grid > .filter-group:first-child {
    grid-column: 1 / -1;
  }
}
</style>
