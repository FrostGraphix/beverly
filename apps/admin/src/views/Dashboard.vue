
<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue';
import AppShell from '../components/AppShell.vue';
import { ApiError, api, naira, shortDate } from '../lib/api';
import { businessDaysAgo, isSameBusinessDay, startOfBusinessDay, startOfBusinessMonth } from '../lib/business-day';
import { useStaffAuthStore } from '../stores/auth';
import WalletGreeting from '@beverly/tokens/WalletGreeting.vue';

interface FundingRequest { id: string; amount_minor: number; status: string; created_at: string; }
interface FundingHistoryRow {
    id: string;
    amount_minor: number;
    status: string;
    channel?: string | null;
    created_at: string;
    vendor_organization_id?: string | null;
    vendor_organizations?: { legal_name?: string | null; trading_name?: string | null } | null;
}
interface Application    { id: string; legal_name: string; created_at: string; }
interface Purchase        { id: string; amount_minor: number; energy_amount_minor?: number | null; vat_amount_minor?: number | null; units_kwh?: number | null; status: string; actor_type?: 'vendor' | 'customer' | null; meter_id?: string; station_id?: string | null; customer_name?: string | null; purchase_mode?: string | null; created_at: string; }
interface StationOption   { stationId: string; name: string; }
interface WalletSummary {
    walletCount: number;
    totalFloatMinor: number;
    totalBalanceMinor?: number;
    vendorFloatMinor: number;
    customerFloatMinor: number;
    activeWallets?: number;
    suspendedWallets?: number;
    closedWallets?: number;
    byStatus?: Record<string, number>;
    byOwnerType: Record<string, number>;
}
interface PurchaseSummary {
    businessDayStart?: string;
    deliveredTodayCount: number;
    deliveredTodayValueMinor: number;
    vendorTodayCount: number;
    vendorTodayValueMinor: number;
    customerTodayCount: number;
    customerTodayValueMinor: number;
    failedTodayCount: number;
}

/**
 * Per-feed availability. A feed the signed-in role is not entitled to is
 * `restricted` — a policy outcome, not an outage. It must never be rendered as
 * a zero figure, and never reported in the degradation banner.
 */
type FeedState = 'ok' | 'restricted' | 'error';
type FeedKey = 'funding' | 'fundingHistory' | 'apps' | 'vending' | 'wallets' | 'purchaseSummary' | 'stations';

const FEED_LABELS: Record<FeedKey, string> = {
    funding: 'Funding queue',
    fundingHistory: 'Funding history',
    apps: 'Applications feed',
    vending: 'Vending feed',
    wallets: 'Wallet summary',
    purchaseSummary: 'Purchase totals',
    stations: 'Station directory',
};

const funding = ref<FundingRequest[]>([]);
const fundingHistory = ref<FundingHistoryRow[]>([]);
const auth = useStaffAuthStore();
const apps    = ref<Application[]>([]);
const vending = ref<Purchase[]>([]);
const knownStations = ref<StationOption[]>([]);
const walletSummary = ref<WalletSummary>({
    walletCount: 0,
    totalFloatMinor: 0,
    vendorFloatMinor: 0,
    customerFloatMinor: 0,
    byStatus: {},
    byOwnerType: {},
});
const purchaseSummary = ref<PurchaseSummary | null>(null);
const loading = ref(true);
const refreshing = ref(false);
const lastUpdatedAt = ref<Date | null>(null);
const feedErrors = ref<string[]>([]);
const feedState = ref<Record<FeedKey, FeedState>>({
    funding: 'ok', fundingHistory: 'ok', apps: 'ok', vending: 'ok', wallets: 'ok', purchaseSummary: 'ok', stations: 'ok',
});
const staffName = computed(() => auth.user?.full_name?.split(' ')[0] || 'team');

const canSeeFunding = computed(() => auth.hasPermission('wallet.funding.view'));
const canSeeApps    = computed(() => auth.hasPermission('wallet.vendors.review'));
const canSeeVending = computed(() => auth.hasPermission('wallet.vending.monitor'));

function isRestricted(key: FeedKey) { return feedState.value[key] === 'restricted'; }
function isUnavailable(key: FeedKey) { return feedState.value[key] === 'error'; }

const purchaseMetricUnavailable = computed(() =>
    isUnavailable('vending') && isUnavailable('purchaseSummary'),
);

const scopeLabel = computed(() => {
    if (auth.user?.role === 'super-admin') return 'All stations';
    const ids = auth.stationScope;
    if (!ids.length) return 'No station assigned — ask a Super Admin to assign one';
    return ids.length <= 3 ? `Stations: ${ids.join(', ')}` : `${ids.length} assigned stations`;
});
const autoRefreshEnabled = ref(adminAutoRefreshEnabled());
const dashboardFreshness = computed(() => {
    if (refreshing.value) return 'Refreshing data…';
    if (!lastUpdatedAt.value) return 'Checking live data…';
    const time = new Intl.DateTimeFormat('en-NG', { hour: '2-digit', minute: '2-digit' }).format(lastUpdatedAt.value);
    return `Updated ${time}${autoRefreshEnabled.value ? ' · every 30 s' : ' · auto-refresh off'}`;
});
let poll: ReturnType<typeof setInterval> | null = null;
const statPendingFundingMinor = ref(0);
const statVendorPurchasesMinor = ref(0);
const statCustomerPurchasesMinor = ref(0);
const statFailedToday = ref(0);
const statVendorWalletFloatMinor = ref(0);
const statCustomerWalletFloatMinor = ref(0);
const recentTypeFilter = ref('all');
const recentActorFilter = ref<'all' | 'vendor' | 'customer'>('all');
const recentStationFilter = ref('');
// Default to all available range
const recentDateFilter = ref('all');
const showRecentFilters = ref(true);

// Every id here must be produced by recentActivityRows(), otherwise the tab
// renders a permanent zero.
const RECENT_TYPE_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'purchases', label: 'Purchases' },
    { id: 'funding', label: 'Funding' },
    { id: 'reversals', label: 'Reversals' },
    { id: 'failed', label: 'Failed' },
] as const;

const RECENT_DATE_FILTERS = [
    { id: 'today', label: 'Today' },
    { id: 'seven', label: 'Last 7 days' },
    { id: 'month', label: 'This month' },
    { id: 'all', label: 'All available' },
] as const;

const recentRangeLabel = computed(() =>
    RECENT_DATE_FILTERS.find((option) => option.id === recentDateFilter.value)?.label ?? 'Recent',
);

const pendingFundingTotal = computed(() => funding.value.reduce((s, f) => s + f.amount_minor, 0));
/*
 * Day totals come from the server aggregate, which counts every matching row.
 * The /vending feed is capped at 200 rows, so reducing over it undercounts on a
 * busy day — that path is only a fallback for when the aggregate is unavailable.
 */
function deliveredTodayBy(actorType: 'vendor' | 'customer') {
    return vending.value.filter(p =>
        p.actor_type === actorType
        && p.status === 'delivered'
        && isSameBusinessDay(p.created_at),
    );
}
const vendorTodayTotal = computed(() => (purchaseSummary.value
    ? purchaseSummary.value.vendorTodayValueMinor
    : deliveredTodayBy('vendor').reduce((sum, purchase) => sum + purchase.amount_minor, 0)));
const vendorTodayCount = computed(() => (purchaseSummary.value
    ? purchaseSummary.value.vendorTodayCount
    : deliveredTodayBy('vendor').length));
const customerTodayTotal = computed(() => (purchaseSummary.value
    ? purchaseSummary.value.customerTodayValueMinor
    : deliveredTodayBy('customer').reduce((sum, purchase) => sum + purchase.amount_minor, 0)));
const customerTodayCount = computed(() => (purchaseSummary.value
    ? purchaseSummary.value.customerTodayCount
    : deliveredTodayBy('customer').length));
const failedToday = computed(() => (purchaseSummary.value
    ? purchaseSummary.value.failedTodayCount
    : vending.value.filter(p => isSameBusinessDay(p.created_at) && p.status === 'failed').length));
const dayTotalsAreExact = computed(() => purchaseSummary.value !== null);
const pendingVending = computed(() =>
    vending.value.filter(p => ['hold_active', 'dispatching', 'delivery_pending_review'].includes(p.status))
);
const recentSearchQuery = ref('');

const recentActivityRows = computed(() => {
    const purchases = vending.value.map((p) => {
        const isFailed = p.status === 'failed';
        const isReversal = p.status === 'reversed';
        const kind = isFailed ? 'failed' : (isReversal ? 'reversals' : 'purchases');
        const rawId = p.id;
        const refId = rawId.startsWith('po_') || rawId.startsWith('purchase_')
            ? rawId
            : rawId.slice(0, 8);
        return {
            id: `purchase-${p.id}`,
            rawId,
            reference: refId.startsWith('#') ? refId : `#${refId}`,
            type: typeLabel(p),
            kind,
            typeTone: typeTone(kind),
            actorType: (p.actor_type ?? 'vendor') as 'vendor' | 'customer',
            vendor: p.purchase_mode ? p.purchase_mode.replace(/_/g, ' ') : 'Vending',
            customerMeter: [p.customer_name, p.meter_id].filter(Boolean).join(' - ') || 'Unknown meter',
            station: p.station_id || '',
            amountMinor: p.amount_minor,
            units: p.units_kwh ? `${p.units_kwh.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} kWh` : '',
            status: p.status.replace(/_/g, ' '),
            statusTone: statusTone(p.status),
            createdAt: p.created_at,
        };
    });

    // Use the full funding history (all statuses) so approved, rejected, and
    // initiated rows appear in the feed — not just the pending queue.
    const historySource = fundingHistory.value.length ? fundingHistory.value : funding.value;
    const fundingRows = historySource.map((f) => {
        const vendorName = (f as FundingHistoryRow).vendor_organizations?.trading_name
            || (f as FundingHistoryRow).vendor_organizations?.legal_name
            || 'Vendor funding';
        const rawId = f.id;
        const refId = rawId.startsWith('fund_') || rawId.startsWith('f_')
            ? rawId
            : rawId.slice(0, 8);
        return {
            id: `funding-${f.id}`,
            rawId,
            reference: refId.startsWith('#') ? refId : `#${refId}`,
            type: 'Vendor Funding',
            kind: 'funding' as const,
            typeTone: 'info',
            actorType: 'vendor' as const,
            vendor: vendorName,
            customerMeter: vendorName,
            station: '',
            amountMinor: f.amount_minor,
            units: '',
            status: f.status.replace(/_/g, ' '),
            statusTone: statusTone(f.status),
            createdAt: f.created_at,
        };
    });

    return [...purchases, ...fundingRows]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
});
const recentRowsInScope = computed(() =>
    recentActivityRows.value.filter((row) => {
        const matchesStation = !recentStationFilter.value
            || row.station.trim().toUpperCase() === recentStationFilter.value.trim().toUpperCase();
        const matchesActor = recentActorFilter.value === 'all' || row.actorType === recentActorFilter.value;
        const q = recentSearchQuery.value.trim().toLowerCase();
        const matchesSearch = !q || [
            row.reference,
            row.rawId,
            row.customerMeter,
            row.vendor,
            row.type,
            row.status,
            row.station,
        ].some(val => String(val || '').toLowerCase().includes(q));
        return matchesStation && matchesActor && matchesSearch && matchesDateFilter(row.createdAt, recentDateFilter.value);
    }),
);
const recentActivityTabs = computed(() =>
    RECENT_TYPE_FILTERS.map((tab) => ({
        ...tab,
        count: tab.id === 'all'
            ? recentRowsInScope.value.length
            : recentRowsInScope.value.filter((row) => row.kind === tab.id).length,
    })),
);
const recentStations = computed(() => {
    const list: Array<{ id: string; name: string }> = [];
    const seen = new Set<string>();

    for (const s of knownStations.value) {
        if (!s.stationId) continue;
        const idUpper = s.stationId.trim().toUpperCase();
        if (!seen.has(idUpper)) {
            seen.add(idUpper);
            list.push({ id: s.stationId, name: s.name || s.stationId });
        }
    }

    for (const row of recentActivityRows.value) {
        if (!row.station) continue;
        const idUpper = row.station.trim().toUpperCase();
        if (!seen.has(idUpper)) {
            seen.add(idUpper);
            list.push({ id: row.station, name: row.station });
        }
    }

    return list.sort((a, b) => a.name.localeCompare(b.name));
});
const recentPage = ref(1);
const recentPageSize = ref(10);

const filteredRecentTransactions = computed(() =>
    recentRowsInScope.value.filter((row) => recentTypeFilter.value === 'all' || row.kind === recentTypeFilter.value),
);

const totalRecentPages = computed(() =>
    Math.ceil(filteredRecentTransactions.value.length / recentPageSize.value) || 1,
);

const recentTransactions = computed(() => {
    const start = (recentPage.value - 1) * recentPageSize.value;
    return filteredRecentTransactions.value.slice(start, start + recentPageSize.value);
});

watch([recentTypeFilter, recentActorFilter, recentStationFilter, recentDateFilter, recentSearchQuery, recentPageSize], () => {
    recentPage.value = 1;
});

const hasAvailableRecentActivity = computed(() => recentActivityRows.value.length > 0);
const vendorWalletCount = computed(() => walletSummary.value.byOwnerType.vendor ?? 0);
const customerWalletCount = computed(() => walletSummary.value.byOwnerType.customer ?? 0);

// Frame handles for in-flight count-up animations. The 30s poll can fire while a
// previous animation is still running; without cancellation the two chains
// interleave and the displayed figure jitters between them.
const statFrames = new Map<{ value: number }, number>();

function animateStat(targetRef: { value: number }, target: number, durationMs = 700) {
    const pending = statFrames.get(targetRef);
    if (pending !== undefined) cancelAnimationFrame(pending);
    const from = Number(targetRef.value || 0);
    const to = Number(target || 0);
    if (from === to) { statFrames.delete(targetRef); return; }
    const start = performance.now();

    const step = (now: number) => {
        const t = Math.min((now - start) / durationMs, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        targetRef.value = Math.round(from + (to - from) * eased);
        if (t < 1) statFrames.set(targetRef, requestAnimationFrame(step));
        else statFrames.delete(targetRef);
    };
    statFrames.set(targetRef, requestAnimationFrame(step));
}

function syncAnimatedStats() {
    animateStat(statPendingFundingMinor, pendingFundingTotal.value);
    animateStat(statVendorPurchasesMinor, vendorTodayTotal.value);
    animateStat(statCustomerPurchasesMinor, customerTodayTotal.value);
    animateStat(statFailedToday, failedToday.value);
    animateStat(statVendorWalletFloatMinor, walletSummary.value.vendorFloatMinor);
    animateStat(statCustomerWalletFloatMinor, walletSummary.value.customerFloatMinor);
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
    if (filter === 'seven') return created >= businessDaysAgo(6, now);
    if (filter === 'month') return created >= startOfBusinessMonth(now);
    return created >= startOfBusinessDay(now);
}

function showAllRecentTransactions() {
    recentTypeFilter.value = 'all';
    recentActorFilter.value = 'all';
    recentStationFilter.value = '';
    recentDateFilter.value = 'all';
}

function adminAutoRefreshEnabled() {
    try {
        const saved = JSON.parse(localStorage.getItem('beverly.admin.qualitySettings') || '{}');
        return saved.autoRefresh !== false;
    } catch {
        return true;
    }
}

/**
 * Runs a feed only when the signed-in role is entitled to it, and classifies the
 * outcome. A 403 means "not entitled" — recorded as `restricted` so the caller
 * hides the tile instead of publishing a zero the operator would read as fact.
 */
async function settle<T>(key: FeedKey, entitled: boolean, run: () => Promise<T>): Promise<T | null> {
    if (!entitled) {
        feedState.value[key] = 'restricted';
        return null;
    }
    try {
        const value = await run();
        feedState.value[key] = 'ok';
        return value;
    } catch (error) {
        feedState.value[key] = error instanceof ApiError && error.status === 403 ? 'restricted' : 'error';
        return null;
    }
}

async function fetchAll() {
    if (refreshing.value) return;
    refreshing.value = true;
    // settle() never rejects, so Promise.all is safe here.
    try {
        const [fundingRes, fundingHistRes, appsRes, vendingRes, walletRes, summaryRes, stationsRes] = await Promise.all([
            settle('funding', canSeeFunding.value, () => api.get<{ funding: FundingRequest[] }>('/api/v1/admin/funding/pending')),
            settle('fundingHistory', canSeeFunding.value, () => api.get<{ funding: FundingHistoryRow[] }>('/api/v1/admin/funding/history?limit=50')),
            settle('apps', canSeeApps.value, () => api.get<{ applications: Application[] }>('/api/v1/admin/vendor-applications')),
            settle('vending', canSeeVending.value, () => api.get<{ purchases: Purchase[] }>('/api/v1/admin/vending')),
            settle('wallets', canSeeFunding.value, () => api.get<WalletSummary>('/api/v1/admin/wallets/summary')),
            settle('purchaseSummary', canSeeVending.value, () => api.get<PurchaseSummary>('/api/v1/admin/purchases/summary')),
            settle('stations', canSeeVending.value, () => api.get<{ stations: StationOption[] }>('/api/v1/admin/stations')),
        ]);

        if (fundingRes) funding.value = fundingRes.funding;
        if (fundingHistRes) fundingHistory.value = fundingHistRes.funding;
        if (appsRes) apps.value = appsRes.applications;
        if (vendingRes) vending.value = vendingRes.purchases;
        if (walletRes) walletSummary.value = walletRes;
        if (stationsRes) knownStations.value = stationsRes.stations ?? [];
        purchaseSummary.value = summaryRes;

        feedErrors.value = (Object.keys(feedState.value) as FeedKey[])
            .filter((key) => feedState.value[key] === 'error')
            .map((key) => FEED_LABELS[key]);
        syncAnimatedStats();
    } finally {
        lastUpdatedAt.value = new Date();
        refreshing.value = false;
    }
}

function startPolling() {
    if (poll || !autoRefreshEnabled.value) return;
    poll = setInterval(fetchAll, 30_000);
}

function stopPolling() {
    if (!poll) return;
    clearInterval(poll);
    poll = null;
}

// A hidden tab has no viewer, so polling it only burns queries — and, for a
// role that is not entitled to a feed, keeps writing permission-denied audit
// rows every 30s.
function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') { stopPolling(); return; }
    void fetchAll();
    startPolling();
}

onMounted(async () => {
    await fetchAll();
    loading.value = false;
    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);
});
onUnmounted(() => {
    stopPolling();
    for (const handle of statFrames.values()) cancelAnimationFrame(handle);
    statFrames.clear();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
});
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
        <p aria-live="polite">{{ scopeLabel }} · {{ dashboardFreshness }}</p>
      </div>
      <div class="bw-head-actions">
        <button class="bw-btn" :disabled="refreshing" @click="fetchAll">
          {{ refreshing ? 'Refreshing…' : 'Refresh' }}
        </button>
        <router-link v-if="auth.hasPermission('wallet.vendors.manage')" to="/vendors/new" class="bw-btn primary" style="text-decoration:none">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          New Vendor
        </router-link>
      </div>
    </div>

    <div v-if="feedErrors.length" class="bw-banner error" role="alert" style="margin-bottom: var(--s-4)">
      Live dashboard degraded: {{ feedErrors.join(' - ') }}.
    </div>

    <div v-if="auth.permissionsStale" class="bw-banner warn" role="status" style="margin-bottom: var(--s-4)">
      Your permissions could not be revalidated — showing the last known access level.
    </div>

    <!-- KPI grid -->
    <div v-if="loading" class="bw-kpi-grid dashboard-kpi-grid" aria-label="Loading operational summary">
      <div v-for="n in 6" :key="`kpi-skeleton-${n}`" class="bw-kpi bw-skeleton"></div>
    </div>
    <section v-else class="bw-kpi-grid dashboard-kpi-grid" aria-label="Operational summary">

      <!-- Featured: pending funding -->
      <article class="bw-kpi featured">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Pending Funding</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          </div>
        </div>
        <template v-if="isUnavailable('funding')">
          <div class="bw-kpi-value bw-kpi-unavailable">Unavailable</div>
          <div class="bw-kpi-foot"><span class="bw-kpi-note">Refresh to retry</span></div>
        </template>
        <template v-else-if="isRestricted('funding')">
          <div class="bw-kpi-value bw-kpi-restricted">Restricted</div>
          <div class="bw-kpi-foot"><span class="bw-kpi-note">Needs funding access</span></div>
        </template>
        <template v-else>
          <div class="bw-kpi-value" style="color: var(--brand)">
            {{ naira(statPendingFundingMinor) }}
          </div>
          <div class="bw-kpi-foot">
            <span :class="['bw-delta', funding.length > 0 ? 'up' : 'flat']">
              {{ funding.length }} request{{ funding.length !== 1 ? 's' : '' }}
            </span>
            <span class="bw-kpi-note">awaiting approval</span>
          </div>
        </template>
      </article>

      <!-- Vendor purchases today -->
      <article class="bw-kpi">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Vendor Purchases Today</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>
          </div>
        </div>
        <template v-if="purchaseMetricUnavailable">
          <div class="bw-kpi-value bw-kpi-unavailable">Unavailable</div>
          <div class="bw-kpi-foot"><span class="bw-kpi-note">Refresh to retry</span></div>
        </template>
        <template v-else-if="isRestricted('vending')">
          <div class="bw-kpi-value bw-kpi-restricted">Restricted</div>
          <div class="bw-kpi-foot"><span class="bw-kpi-note">Needs vending access</span></div>
        </template>
        <template v-else>
          <div class="bw-kpi-value" style="color: var(--brand)">{{ naira(statVendorPurchasesMinor) }}</div>
          <div class="bw-kpi-foot">
            <span class="bw-delta up">{{ vendorTodayCount }} purchases</span>
            <span class="bw-kpi-note">{{ dayTotalsAreExact ? 'successful today' : 'recent sample only' }}</span>
          </div>
        </template>
      </article>

      <!-- Failed today -->
      <article :class="['bw-kpi', failedToday > 0 ? 'danger-tone' : '']">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Failed Transactions</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
        </div>
        <template v-if="purchaseMetricUnavailable">
          <div class="bw-kpi-value bw-kpi-unavailable">Unavailable</div>
          <div class="bw-kpi-foot"><span class="bw-kpi-note">Refresh to retry</span></div>
        </template>
        <template v-else-if="isRestricted('vending')">
          <div class="bw-kpi-value bw-kpi-restricted">Restricted</div>
          <div class="bw-kpi-foot"><span class="bw-kpi-note">Needs vending access</span></div>
        </template>
        <template v-else>
          <div class="bw-kpi-value" :style="{ color: failedToday > 0 ? 'var(--danger)' : 'var(--text-dim)' }">
            {{ statFailedToday }}
          </div>
          <div class="bw-kpi-foot">
            <span :class="['bw-delta', failedToday > 0 ? 'down' : 'flat']">
              {{ failedToday > 0 ? 'needs review' : 'all clear' }}
            </span>
          </div>
        </template>
      </article>

      <!-- Customer purchases today -->
      <article class="bw-kpi info-tone">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Customer Purchases Today</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </div>
        </div>
        <template v-if="purchaseMetricUnavailable">
          <div class="bw-kpi-value bw-kpi-unavailable">Unavailable</div>
          <div class="bw-kpi-foot"><span class="bw-kpi-note">Refresh to retry</span></div>
        </template>
        <template v-else-if="isRestricted('vending')">
          <div class="bw-kpi-value bw-kpi-restricted">Restricted</div>
          <div class="bw-kpi-foot"><span class="bw-kpi-note">Needs vending access</span></div>
        </template>
        <template v-else>
          <div class="bw-kpi-value" style="color: var(--info)">{{ naira(statCustomerPurchasesMinor) }}</div>
          <div class="bw-kpi-foot">
            <span class="bw-delta up">{{ customerTodayCount }} purchases</span>
            <span class="bw-kpi-note">{{ dayTotalsAreExact ? 'successful today' : 'recent sample only' }}</span>
          </div>
        </template>
      </article>

      <!-- Vendor wallet float -->
      <!-- Only a link when the role may open /wallets; otherwise the router
           guard would bounce the click to Not Found. -->
      <component
        :is="canSeeFunding ? 'router-link' : 'div'"
        :to="canSeeFunding ? '/wallets' : undefined"
        :class="['bw-kpi', 'featured', canSeeFunding && 'bw-kpi-link']"
        style="text-decoration:none; color:inherit"
        :aria-label="canSeeFunding ? 'Open vendor wallets' : undefined"
      >
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Vendor Wallet Float</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7h20v10H2z"/><path d="M16 12h.01"/></svg>
          </div>
        </div>
        <template v-if="isUnavailable('wallets')">
          <div class="bw-kpi-value bw-kpi-unavailable">Unavailable</div>
          <div class="bw-kpi-foot"><span class="bw-kpi-note">Refresh to retry</span></div>
        </template>
        <template v-else-if="isRestricted('wallets')">
          <div class="bw-kpi-value bw-kpi-restricted">Restricted</div>
          <div class="bw-kpi-foot"><span class="bw-kpi-note">Needs funding access</span></div>
        </template>
        <template v-else>
          <div class="bw-kpi-value" style="color: var(--brand)">{{ naira(statVendorWalletFloatMinor) }}</div>
          <div class="bw-kpi-foot">
            <span class="bw-delta up">{{ vendorWalletCount }} wallets</span>
            <span class="bw-kpi-note">vendor-held balance</span>
          </div>
        </template>
      </component>

      <!-- Customer wallet float -->
      <component
        :is="canSeeFunding ? 'router-link' : 'div'"
        :to="canSeeFunding ? '/wallets' : undefined"
        :class="['bw-kpi', 'info-tone', canSeeFunding && 'bw-kpi-link']"
        style="text-decoration:none; color:inherit"
        :aria-label="canSeeFunding ? 'Open customer wallets' : undefined"
      >
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Customer Wallet Float</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7h20v10H2z"/><path d="M16 12h.01"/></svg>
          </div>
        </div>
        <template v-if="isUnavailable('wallets')">
          <div class="bw-kpi-value bw-kpi-unavailable">Unavailable</div>
          <div class="bw-kpi-foot"><span class="bw-kpi-note">Refresh to retry</span></div>
        </template>
        <template v-else-if="isRestricted('wallets')">
          <div class="bw-kpi-value bw-kpi-restricted">Restricted</div>
          <div class="bw-kpi-foot"><span class="bw-kpi-note">Needs funding access</span></div>
        </template>
        <template v-else>
          <div class="bw-kpi-value" style="color: var(--info)">{{ naira(statCustomerWalletFloatMinor) }}</div>
          <div class="bw-kpi-foot">
            <span class="bw-delta up">{{ customerWalletCount }} wallets</span>
            <span class="bw-kpi-note">customer-held balance</span>
          </div>
        </template>
      </component>

    </section>

    <!-- Queues row -->
    <div v-if="loading" class="bw-row-2">
      <div class="bw-card bw-skeleton" style="min-height:260px"></div>
      <div class="bw-card bw-skeleton" style="min-height:260px"></div>
    </div>
    <div v-else class="bw-row-2">

      <!-- Funding queue -->
      <div v-if="!isRestricted('funding')" class="bw-card flush">
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
      <div v-if="!isRestricted('apps')" class="bw-card flush">
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
      <div class="bw-table-head-bar">
        <div>
          <div class="bw-card-title">Recent Transactions</div>
          <div class="bw-card-sub">{{ recentRangeLabel }} · {{ filteredRecentTransactions.length }} matching</div>
        </div>
        <button
          class="bw-btn sm ghost"
          :aria-expanded="showRecentFilters"
          @click="showRecentFilters = !showRecentFilters"
        >
          {{ showRecentFilters ? 'Hide filters' : 'Filters' }}
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

      <!-- Filter bar: the state behind these controls always existed, but the
           controls themselves were never rendered — so an active filter could
           hide every row with no way to see or clear it. -->
      <div v-if="showRecentFilters" class="bw-recent-filters">
        <!-- Actor split: Customer vs Vendor -->
        <div class="bw-recent-actor-tabs" role="group" aria-label="Actor type">
          <button
            :class="['bw-actor-tab', recentActorFilter === 'all' && 'is-active']"
            :aria-pressed="recentActorFilter === 'all'"
            @click="recentActorFilter = 'all'"
          >All</button>
          <button
            :class="['bw-actor-tab customer', recentActorFilter === 'customer' && 'is-active']"
            :aria-pressed="recentActorFilter === 'customer'"
            @click="recentActorFilter = 'customer'"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Customer
          </button>
          <button
            :class="['bw-actor-tab vendor', recentActorFilter === 'vendor' && 'is-active']"
            :aria-pressed="recentActorFilter === 'vendor'"
            @click="recentActorFilter = 'vendor'"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
            Vendor
          </button>
        </div>
        <!-- Transaction type tabs -->
        <div class="bw-recent-tabs" role="group" aria-label="Transaction type">
          <button
            v-for="tab in recentActivityTabs"
            :key="tab.id"
            :aria-pressed="recentTypeFilter === tab.id"
            :class="['bw-recent-tab', recentTypeFilter === tab.id && 'is-active']"
            @click="recentTypeFilter = tab.id"
          >
            {{ tab.label }} <span>{{ tab.count }}</span>
          </button>
        </div>
        <label class="bw-recent-field full-width">
          <span>Search</span>
          <input
            v-model="recentSearchQuery"
            type="text"
            class="bw-input sm"
            placeholder="Search ID, meter, vendor…"
          />
        </label>
        <label class="bw-recent-field">
          <span>Range</span>
          <select v-model="recentDateFilter" class="bw-select">
            <option v-for="option in RECENT_DATE_FILTERS" :key="option.id" :value="option.id">{{ option.label }}</option>
          </select>
        </label>
        <label v-if="recentStations.length" class="bw-recent-field">
          <span>Station</span>
          <select v-model="recentStationFilter" class="bw-select">
            <option value="">All stations</option>
            <option v-for="station in recentStations" :key="station.id" :value="station.id">
              {{ station.name && station.name.toUpperCase() !== station.id.toUpperCase() ? `${station.name} (${station.id})` : (station.name || station.id) }}
            </option>
          </select>
        </label>
      </div>

      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Meter / Details</th>
              <th>Actor</th>
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
              <td class="bw-mono">
                <div>{{ p.customerMeter || '—' }}</div>
                <div v-if="p.units" class="bw-muted" style="font-size: var(--t-xs)">{{ p.units }}</div>
              </td>
              <td>
                <span :class="['bw-badge', p.actorType === 'customer' ? 'info' : 'neutral']">
                  {{ p.actorType === 'customer' ? 'Customer' : 'Vendor' }}
                </span>
              </td>
              <td><span class="bw-badge ghost">{{ p.type }}</span></td>
              <td><span :class="['bw-badge', p.statusTone]">{{ p.status }}</span></td>
              <td class="bw-money" style="text-align:right">{{ naira(p.amountMinor) }}</td>
              <td class="bw-muted" style="font-size: var(--t-xs)">{{ shortDate(p.createdAt) }}</td>
            </tr>
            <tr v-if="!recentTransactions.length && !loading">
              <td colspan="7">
                <div class="bw-muted bw-recent-empty">
                  <span>{{ hasAvailableRecentActivity ? 'No transactions match these filters.' : 'No recent transactions yet.' }}</span>
                  <button v-if="hasAvailableRecentActivity" class="bw-btn sm" @click="showAllRecentTransactions">
                    Show available transactions
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="bw-t-cards" aria-label="Recent transactions">
        <div v-if="!recentTransactions.length && !loading" class="bw-muted bw-recent-empty">
          <span>{{ hasAvailableRecentActivity ? 'No transactions match these filters.' : 'No recent transactions yet.' }}</span>
          <button v-if="hasAvailableRecentActivity" class="bw-btn sm" @click="showAllRecentTransactions">
            Show available transactions
          </button>
        </div>
        <article v-for="p in recentTransactions" :key="`recent-card-${p.id}`" class="bw-tc">
          <div class="bw-tc-top">
            <div>
              <div class="bw-tc-vendor">{{ p.customerMeter || 'Unknown meter' }}</div>
              <div class="bw-tc-id">{{ p.reference }} · {{ p.type }}</div>
            </div>
            <div class="bw-tc-amt bw-money">{{ naira(p.amountMinor) }}</div>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Actor</span>
              <span :class="['bw-badge', p.actorType === 'customer' ? 'info' : 'neutral']">
                {{ p.actorType === 'customer' ? 'Customer' : 'Vendor' }}
              </span>
            </div>
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Status</span>
              <span :class="['bw-badge', p.statusTone]">{{ p.status }}</span>
            </div>
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Time</span>
              <span class="bw-tc-pair-val bw-muted">{{ shortDate(p.createdAt) }}</span>
            </div>
          </div>
        </article>
      </div>

      <!-- Pagination bar -->
      <div v-if="filteredRecentTransactions.length > 0" class="bw-pagination-bar">
        <div class="bw-pagination-info">
          Showing {{ ((recentPage - 1) * recentPageSize) + 1 }}–{{ Math.min(recentPage * recentPageSize, filteredRecentTransactions.length) }} of {{ filteredRecentTransactions.length }}
        </div>
        <div class="bw-pagination-controls">
          <label class="bw-recent-field inline">
            <span>Per page</span>
            <select v-model="recentPageSize" class="bw-select sm">
              <option :value="10">10</option>
              <option :value="25">25</option>
              <option :value="50">50</option>
            </select>
          </label>
          <button class="bw-btn sm ghost" :disabled="recentPage <= 1" @click="recentPage--">
            Previous
          </button>
          <span class="bw-page-num">Page {{ recentPage }} of {{ totalRecentPages }}</span>
          <button class="bw-btn sm ghost" :disabled="recentPage >= totalRecentPages" @click="recentPage++">
            Next
          </button>
        </div>
      </div>
    </div>

  </AppShell>
</template>

<style scoped>
/* A tile the signed-in role may not see. Deliberately muted and un-emphasised —
   it must never read as a financial figure. */
.bw-kpi-restricted {
  color: var(--text-dim);
  font-weight: 600;
  letter-spacing: -0.01em;
}

.bw-kpi-unavailable {
  color: var(--danger-on-surface);
  font-size: var(--t-xl);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.dashboard-kpi-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.bw-recent-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-6) var(--s-4);
  text-align: center;
}

.bw-recent-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-5);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.bw-recent-tabs { display: flex; flex-wrap: wrap; gap: var(--s-2); }

.bw-recent-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--t-xs);
  font-weight: 600;
  cursor: pointer;
}

.bw-recent-tab span {
  padding: 0 5px;
  border-radius: 999px;
  background: var(--surface-3, var(--surface-2));
  font-variant-numeric: tabular-nums;
}

.bw-recent-tab.is-active {
  border-color: var(--brand);
  color: var(--brand);
}

.bw-recent-tab:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 3px var(--brand-glow), 0 0 0 5px var(--brand);
}


.bw-recent-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--t-xs);
  color: var(--text-muted);
  font-weight: 600;
}

.bw-recent-field.inline {
  flex-direction: row;
  align-items: center;
  gap: var(--s-2);
}

.bw-recent-actor-tabs {
  display: flex;
  background: var(--surface-3, rgba(255, 255, 255, 0.04));
  padding: 3px;
  border-radius: var(--r-md, 8px);
  border: 1px solid var(--border);
  gap: 2px;
}

.bw-actor-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border: 0;
  border-radius: var(--r-sm, 6px);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--t-xs);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.bw-actor-tab:hover {
  color: var(--text-main, #fff);
}

.bw-actor-tab.is-active {
  background: var(--brand);
  color: #000;
  font-weight: 700;
}

.bw-actor-tab.is-active.customer {
  background: #3b82f6;
  color: #fff;
}

.bw-actor-tab.is-active.vendor {
  background: #10b981;
  color: #fff;
}

.bw-pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--s-3) var(--s-5);
  border-top: 1px solid var(--border);
  background: var(--surface-1);
  gap: var(--s-4);
  flex-wrap: wrap;
}

.bw-pagination-info {
  font-size: var(--t-xs);
  color: var(--text-muted);
  font-weight: 500;
}

.bw-pagination-controls {
  display: flex;
  align-items: center;
  gap: var(--s-3);
}

.bw-page-num {
  font-size: var(--t-xs);
  font-weight: 600;
  color: var(--text-muted);
}

@media (max-width: 640px) {
  .bw-recent-filters {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--s-3);
    align-items: end;
  }
  .bw-recent-actor-tabs,
  .bw-recent-tabs,
  .bw-recent-field.full-width {
    grid-column: 1 / -1;
  }
  .bw-recent-actor-tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    width: 100%;
    box-sizing: border-box;
  }
  .bw-actor-tab {
    justify-content: center;
    padding: 6px 4px;
    font-size: var(--t-xs);
  }
  .bw-recent-tabs {
    display: flex;
    overflow-x: auto;
    padding-bottom: 4px;
    -webkit-overflow-scrolling: touch;
    white-space: nowrap;
    max-width: 100%;
  }
  .bw-recent-field {
    width: 100%;
  }
  .bw-recent-field select,
  .bw-recent-field input {
    width: 100% !important;
    box-sizing: border-box;
  }
  .bw-recent-tab { min-height: 44px; }
  .dashboard-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dashboard-kpi-grid .bw-kpi {
    min-height: 132px;
    padding: var(--s-4);
    gap: var(--s-2);
  }
  .dashboard-kpi-grid .bw-kpi-value { font-size: clamp(1.25rem, 5.5vw, 1.65rem); }
  .dashboard-kpi-grid .bw-kpi-foot { align-items: flex-start; flex-direction: column; }
  .dashboard-kpi-grid .bw-kpi-note { line-height: 1.3; }
  .bw-pagination-bar { flex-direction: column; align-items: center; text-align: center; }
}

@media (max-width: 419px) {
  .dashboard-kpi-grid { grid-template-columns: 1fr; }
  .bw-recent-filters {
    grid-template-columns: 1fr;
  }
}
</style>
