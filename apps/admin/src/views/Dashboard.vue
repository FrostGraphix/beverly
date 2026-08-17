<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, naira, shortDate } from '../lib/api';
import { useStaffAuthStore } from '../stores/auth';
import WalletGreeting from '@beverly/tokens/WalletGreeting.vue';
import WalletDataViewSwitch from '@beverly/tokens/WalletDataViewSwitch.vue';

interface FundingRequest { id: string; amount_minor: number; status: string; created_at: string; actor_id?: string | null; reference?: string | null; }
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
interface Purchase        { id: string; amount_minor: number; energy_amount_minor?: number | null; vat_amount_minor?: number | null; units_kwh?: number | null; status: string; delivery_state?: string | null; failure_reason?: string | null; meter_id?: string; station_id?: string | null; customer_name?: string | null; purchase_mode?: string | null; actor_type?: string | null; reference?: string | null; created_at: string; }
interface WalletSummary {
    walletCount: number;
    totalFloatMinor: number;
    vendorFloatMinor?: number;
    customerFloatMinor?: number;
    byOwnerType?: Record<string, number>;
    totalBalanceMinor?: number;
    activeWallets?: number;
    suspendedWallets?: number;
    closedWallets?: number;
    byStatus?: Record<string, number>;
}

interface PurchasesSummary {
    todayCount: number;
    todayValueMinor: number;
    todayDeliveredCount: number;
    todayDeliveredValueMinor: number;
    todayDeliveredKwh: number;
    last24hCount: number;
    last24hValueMinor: number;
    failed24hCount: number;
    refundedCount: number;
    vendorStats?: {
        successCount: number;
        successValueMinor: number;
        failedCount: number;
    };
    customerStats?: {
        successCount: number;
        successValueMinor: number;
        failedCount: number;
    };
}

const funding = ref<FundingRequest[]>([]);
const fundingHistory = ref<FundingHistoryRow[]>([]);
const auth = useStaffAuthStore();
const apps    = ref<Application[]>([]);
const vending = ref<Purchase[]>([]);
const walletSummary = ref<WalletSummary>({ walletCount: 0, totalFloatMinor: 0, byStatus: {} });
const purchasesSummary = ref<PurchasesSummary | null>(null);
const loading = ref(true);
const feedErrors = ref<string[]>([]);
const staffName = computed(() => auth.user?.full_name?.split(' ')[0] || 'team');
let poll: ReturnType<typeof setInterval> | null = null;
const statPendingFundingMinor = ref(0);
const statTodayDeliveredKwh = ref(0);
const statTodayPurchasesMinor = ref(0);
const statDeliveredTodayCount = ref(0);
const statVendorSuccessCount = ref(0);
const statVendorSuccessValueMinor = ref(0);
const statVendorFailedCount = ref(0);
const statCustomerSuccessCount = ref(0);
const statCustomerSuccessValueMinor = ref(0);
const statCustomerFailedCount = ref(0);
const statApplications = ref(0);
const statTotalWalletFloatMinor = ref(0);
const statVendorFloatMinor = ref(0);
const statCustomerFloatMinor = ref(0);
const recentTypeFilter = ref('all');
const recentActorFilter = ref('all');
const recentStationFilter = ref('');
const recentDateFilter = ref('all');
const recentSearchQuery = ref('');
const showRecentFilters = ref(false);
const recentViewMode = ref<'grid' | 'table'>(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'grid' : 'table',
);
const knownStations = ref<string[]>([]);

const activeRecentFilterCount = computed(() => [
    recentTypeFilter.value !== 'all',
    recentActorFilter.value !== 'all',
    Boolean(recentStationFilter.value),
    recentDateFilter.value !== 'all',
    Boolean(recentSearchQuery.value.trim()),
].filter(Boolean).length);

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
const todayKwhFromVending = computed(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return vending.value
        .filter(p => new Date(p.created_at) >= today && p.status === 'delivered')
        .reduce((s, p) => s + Number(p.units_kwh ?? 0), 0);
});
const deliveredToday = computed(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return vending.value.filter(p => new Date(p.created_at) >= today && p.status === 'delivered').length;
});

const isVendorPurchase = (p: Purchase) => p.actor_type === 'vendor' || p.actor_type === 'vendor_staff';

const vendorDeliveredCountFallback = computed(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return vending.value.filter(p => new Date(p.created_at) >= today && p.status === 'delivered' && isVendorPurchase(p)).length;
});
const vendorDeliveredValueFallback = computed(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return vending.value.filter(p => new Date(p.created_at) >= today && p.status === 'delivered' && isVendorPurchase(p)).reduce((s, p) => s + p.amount_minor, 0);
});
const vendorFailedCountFallback = computed(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return vending.value.filter(p => new Date(p.created_at) >= today && p.status === 'failed' && isVendorPurchase(p)).length;
});

const customerDeliveredCountFallback = computed(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return vending.value.filter(p => new Date(p.created_at) >= today && p.status === 'delivered' && !isVendorPurchase(p)).length;
});
const customerDeliveredValueFallback = computed(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return vending.value.filter(p => new Date(p.created_at) >= today && p.status === 'delivered' && !isVendorPurchase(p)).reduce((s, p) => s + p.amount_minor, 0);
});
const customerFailedCountFallback = computed(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return vending.value.filter(p => new Date(p.created_at) >= today && p.status === 'failed' && !isVendorPurchase(p)).length;
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
            status: purchaseStatusLabel(p),
            statusTone: statusTone(p.status),
            createdAt: p.created_at,
        };
    });

    const historySource = fundingHistory.value.length ? fundingHistory.value : funding.value;
    const fundingRows = historySource.map((f) => {
        const vendorName = (f as FundingHistoryRow).vendor_organizations?.trading_name
            || (f as FundingHistoryRow).vendor_organizations?.legal_name
            || (f as FundingRequest).actor_id
            || 'Vendor funding';
        return {
            id: `funding-${f.id}`,
            rawId: f.id,
            reference: `#fund_${f.id.slice(0, 8)}`,
            type: 'Vendor Funding',
            kind: 'funding' as const,
            typeTone: 'info',
            vendor: vendorName,
            customerName: vendorName,
            meterId: '',
            actorType: 'vendor' as const,
            customerMeter: vendorName,
            station: '',
            amountMinor: f.amount_minor,
            unitsKwh: null,
            units: '',
            status: f.status.replace(/_/g, ' '),
            statusTone: statusTone(f.status),
            createdAt: f.created_at,
        };
    });

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
const recentPage = ref(1);
const recentPageSize = ref(10);

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
const totalWalletFloatMinor = computed(() =>
    walletSummary.value.totalFloatMinor ?? walletSummary.value.totalBalanceMinor ?? 0,
);
const vendorFloatMinor = computed(() => walletSummary.value.vendorFloatMinor ?? 0);
const customerFloatMinor = computed(() => walletSummary.value.customerFloatMinor ?? 0);
const activeWalletCount = computed(() =>
    walletSummary.value.byStatus?.active ?? walletSummary.value.activeWallets ?? 0,
);
const vendorWalletCount = computed(() => walletSummary.value.byOwnerType?.vendor ?? 0);
const customerWalletCount = computed(() => walletSummary.value.byOwnerType?.customer ?? 0);

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
    const todayKwh = purchasesSummary.value?.todayDeliveredKwh ?? todayKwhFromVending.value;
    const todayValue = purchasesSummary.value?.todayDeliveredValueMinor ?? todayVendingTotal.value;
    const todayDeliveredCnt = purchasesSummary.value?.todayDeliveredCount ?? deliveredToday.value;

    const vSuccessCount = purchasesSummary.value?.vendorStats?.successCount ?? vendorDeliveredCountFallback.value;
    const vSuccessVal = purchasesSummary.value?.vendorStats?.successValueMinor ?? vendorDeliveredValueFallback.value;
    const vFailedCnt = purchasesSummary.value?.vendorStats?.failedCount ?? vendorFailedCountFallback.value;

    const cSuccessCount = purchasesSummary.value?.customerStats?.successCount ?? customerDeliveredCountFallback.value;
    const cSuccessVal = purchasesSummary.value?.customerStats?.successValueMinor ?? customerDeliveredValueFallback.value;
    const cFailedCnt = purchasesSummary.value?.customerStats?.failedCount ?? customerFailedCountFallback.value;

    animateStat(statPendingFundingMinor, pendingFundingTotal.value);
    animateStat(statTodayDeliveredKwh, todayKwh);
    animateStat(statTodayPurchasesMinor, todayValue);
    animateStat(statDeliveredTodayCount, todayDeliveredCnt);

    animateStat(statVendorSuccessCount, vSuccessCount);
    animateStat(statVendorSuccessValueMinor, vSuccessVal);
    animateStat(statVendorFailedCount, vFailedCnt);

    animateStat(statCustomerSuccessCount, cSuccessCount);
    animateStat(statCustomerSuccessValueMinor, cSuccessVal);
    animateStat(statCustomerFailedCount, cFailedCnt);

    animateStat(statApplications, apps.value.length);
    animateStat(statTotalWalletFloatMinor, totalWalletFloatMinor.value);
    animateStat(statVendorFloatMinor, vendorFloatMinor.value);
    animateStat(statCustomerFloatMinor, customerFloatMinor.value);
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

function purchaseStatusLabel(p: Purchase) {
    if (p.status === 'delivered') return 'Token ready';
    if (p.failure_reason?.includes('payment_amount_mismatch')) return 'Payment needs review';
    if (p.delivery_state === 'token_generated_needs_reconciliation') return 'Token generated; reconciling';
    if (p.delivery_state === 'awaiting_payment') return 'Payment awaiting confirmation';
    return p.status.replace(/_/g, ' ');
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
    
    const [fundingRes, fundingHistRes, appsRes, vendingRes, walletRes, stationsRes, purchasesSummaryRes] = await Promise.allSettled([
        api.get<{ funding: FundingRequest[] }>('/api/v1/admin/funding/pending'),
        api.get<{ funding: FundingHistoryRow[] }>('/api/v1/admin/funding/history?limit=50'),
        api.get<{ applications: Application[] }>('/api/v1/admin/vendor-applications'),
        api.get<{ purchases: Purchase[] }>('/api/v1/admin/vending'),
        api.get<WalletSummary>('/api/v1/admin/wallets/summary'),
        api.get<{ stations: any[] }>('/api/v1/admin/stations'),
        api.get<PurchasesSummary>('/api/v1/admin/purchases/summary'),
    ]);

    if (fundingRes.status === 'fulfilled') funding.value = fundingRes.value.funding;
    else errors.push('Funding queue unavailable');

    if (fundingHistRes.status === 'fulfilled') fundingHistory.value = fundingHistRes.value.funding;

    if (appsRes.status === 'fulfilled') apps.value = appsRes.value.applications;
    else errors.push('Applications feed unavailable');

    if (vendingRes.status === 'fulfilled') vending.value = vendingRes.value.purchases;
    else errors.push('Vending feed unavailable');

    if (walletRes.status === 'fulfilled') walletSummary.value = walletRes.value;
    else errors.push('Wallet summary unavailable');

    if (purchasesSummaryRes.status === 'fulfilled') purchasesSummary.value = purchasesSummaryRes.value;

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
      class="dashboard-greeting"
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
    <div
      v-if="loading"
      class="bw-kpi-grid bw-mobile-kpi-grid"
      aria-label="Loading dashboard metrics"
      aria-busy="true"
    >
      <article
        v-for="n in 8"
        :key="`kpi-skeleton-${n}`"
        class="bw-kpi dashboard-kpi-skeleton"
        aria-hidden="true"
      >
        <div class="bw-kpi-row">
          <span class="bw-skeleton dashboard-kpi-skeleton-label"></span>
          <span class="bw-skeleton dashboard-kpi-skeleton-icon"></span>
        </div>
        <span class="bw-skeleton dashboard-kpi-skeleton-value"></span>
        <div class="bw-kpi-foot dashboard-kpi-skeleton-foot">
          <span class="bw-skeleton dashboard-kpi-skeleton-pill"></span>
          <span class="bw-skeleton dashboard-kpi-skeleton-note"></span>
        </div>
        <div v-if="n <= 2" class="dashboard-kpi-skeleton-chart">
          <span class="bw-skeleton dashboard-kpi-skeleton-line line-one"></span>
          <span class="bw-skeleton dashboard-kpi-skeleton-line line-two"></span>
          <span class="bw-skeleton dashboard-kpi-skeleton-line line-three"></span>
        </div>
      </article>
    </div>
    <div v-else class="bw-kpi-grid bw-mobile-kpi-grid">

      <!-- 1: Featured: pending funding -->
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

      <!-- 2: Combined Today's Purchases & Energy Delivered -->
      <router-link
        to="/vending"
        class="bw-kpi bw-kpi-link"
        style="text-decoration:none; color:inherit"
        aria-label="View today's purchases"
      >
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Today's Purchases</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value" style="color: var(--brand)">
          {{ (statTodayDeliveredKwh || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }} <span style="font-size: 0.65em; font-weight: 500">kWh</span>
        </div>
        <div class="bw-kpi-foot">
          <span class="bw-delta up">{{ naira(statTodayPurchasesMinor) }}</span>
          <span class="bw-kpi-note">across {{ statDeliveredTodayCount }} vends</span>
        </div>
        <svg class="bw-spark" viewBox="0 0 120 36" preserveAspectRatio="none">
          <path class="fill" d="M0 36 L0 30 C20 26,30 18,50 20 C70 22,80 14,120 8 L120 36 Z"/>
          <path class="stroke" d="M0 30 C20 26,30 18,50 20 C70 22,80 14,120 8"/>
        </svg>
      </router-link>

      <!-- 3: Vendor Transactions (Success & Failed) -->
      <router-link
        to="/vending?actorType=vendor"
        :class="['bw-kpi', 'bw-kpi-link', statVendorFailedCount > 0 ? 'danger-tone' : '']"
        style="text-decoration:none; color:inherit"
        aria-label="View vendor transactions"
      >
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Vendor Transactions</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 3-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value" style="color: var(--info)">
          {{ statVendorSuccessCount }} <span style="font-size: 0.6em; font-weight:400; color:var(--text-dim)">vends</span>
        </div>
        <div class="bw-kpi-foot">
          <span class="bw-delta up">{{ naira(statVendorSuccessValueMinor) }}</span>
          <span :class="['bw-kpi-note', statVendorFailedCount > 0 ? 'danger-text' : '']">
            · {{ statVendorFailedCount > 0 ? `${statVendorFailedCount} failed` : '0 failed' }}
          </span>
        </div>
      </router-link>

      <!-- 4: Customer Transactions (Success & Failed) -->
      <router-link
        to="/vending?actorType=customer"
        :class="['bw-kpi', 'bw-kpi-link', statCustomerFailedCount > 0 ? 'danger-tone' : '']"
        style="text-decoration:none; color:inherit"
        aria-label="View customer transactions"
      >
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Customer Transactions</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value" style="color: var(--brand)">
          {{ statCustomerSuccessCount }} <span style="font-size: 0.6em; font-weight:400; color:var(--text-dim)">vends</span>
        </div>
        <div class="bw-kpi-foot">
          <span class="bw-delta up">{{ naira(statCustomerSuccessValueMinor) }}</span>
          <span :class="['bw-kpi-note', statCustomerFailedCount > 0 ? 'danger-text' : '']">
            · {{ statCustomerFailedCount > 0 ? `${statCustomerFailedCount} failed` : '0 failed' }}
          </span>
        </div>
      </router-link>

      <!-- 5: Applications -->
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

      <!-- 6: Total wallet float -->
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

      <!-- 7: Vendor float -->
      <router-link
        to="/wallets?ownerType=vendor"
        class="bw-kpi bw-kpi-link"
        style="text-decoration:none; color:inherit"
        aria-label="Filter vendor wallets"
      >
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Vendor Float</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 3-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value" style="color: var(--info)">{{ naira(statVendorFloatMinor) }}</div>
        <div class="bw-kpi-foot">
          <span class="bw-delta up">{{ vendorWalletCount }} vendor</span>
          <span class="bw-kpi-note">wallets</span>
        </div>
      </router-link>

      <!-- 8: Customer float -->
      <router-link
        to="/wallets?ownerType=customer"
        class="bw-kpi bw-kpi-link"
        style="text-decoration:none; color:inherit"
        aria-label="Filter customer wallets"
      >
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Customer Float</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value" style="color: var(--brand)">{{ naira(statCustomerFloatMinor) }}</div>
        <div class="bw-kpi-foot">
          <span class="bw-delta up">{{ customerWalletCount }} customer</span>
          <span class="bw-kpi-note">wallets</span>
        </div>
      </router-link>

    </div>

    <!-- Queues row -->
    <div v-if="loading" class="bw-row-2" aria-label="Loading dashboard queues">
      <div v-for="n in 2" :key="`queue-skeleton-${n}`" class="bw-card flush dashboard-section-skeleton" aria-hidden="true">
        <div class="bw-table-head-bar dashboard-section-skeleton-head">
          <div class="dashboard-section-skeleton-copy">
            <span class="bw-skeleton dashboard-section-skeleton-title"></span>
            <span class="bw-skeleton dashboard-section-skeleton-subtitle"></span>
          </div>
          <span class="bw-skeleton dashboard-section-skeleton-badge"></span>
        </div>
        <div class="dashboard-section-skeleton-body">
          <div v-for="row in 3" :key="row" class="dashboard-section-skeleton-row">
            <span class="bw-skeleton dashboard-section-skeleton-icon"></span>
            <span class="dashboard-section-skeleton-lines">
              <span class="bw-skeleton dashboard-section-skeleton-line"></span>
              <span class="bw-skeleton dashboard-section-skeleton-line short"></span>
            </span>
            <span class="bw-skeleton dashboard-section-skeleton-status"></span>
          </div>
        </div>
        <div class="dashboard-section-skeleton-footer">
          <span class="bw-skeleton dashboard-section-skeleton-button"></span>
        </div>
      </div>
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
    <div v-if="loading" class="bw-card flush dashboard-section-skeleton dashboard-vending-skeleton" aria-label="Loading in-flight vending" aria-busy="true">
      <div class="bw-table-head-bar dashboard-section-skeleton-head">
        <div class="dashboard-section-skeleton-copy">
          <span class="bw-skeleton dashboard-section-skeleton-title wide"></span>
          <span class="bw-skeleton dashboard-section-skeleton-subtitle"></span>
        </div>
        <span class="bw-skeleton dashboard-section-skeleton-action"></span>
      </div>
      <div class="dashboard-vending-skeleton-rows" aria-hidden="true">
        <div v-for="row in 2" :key="row" class="dashboard-vending-skeleton-row">
          <span class="bw-skeleton"></span>
          <span class="bw-skeleton"></span>
          <span class="bw-skeleton"></span>
          <span class="bw-skeleton"></span>
          <span class="bw-skeleton"></span>
        </div>
      </div>
    </div>
    <div v-else-if="pendingVending.length" class="bw-card flush">
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
    <div class="bw-card flush bw-data-region" :data-view="recentViewMode">
      <div class="bw-table-head-bar recent-head-bar">
        <div class="recent-heading">
          <div class="recent-title-row">
            <div class="bw-card-title">Recent Transactions</div>
            <span v-if="loading" class="bw-skeleton recent-count-skeleton" aria-hidden="true"></span>
            <span v-else class="recent-count">{{ filteredRecentTransactions.length }}</span>
          </div>
          <div class="bw-card-sub">Latest vending and wallet activity</div>
        </div>
        <div class="recent-actions">
          <WalletDataViewSwitch
            v-model="recentViewMode"
            :modes="['grid', 'table']"
            label="Recent transaction view"
          />
          <button
            class="bw-btn sm recent-filter-button"
            :class="{ active: showRecentFilters }"
            :aria-expanded="showRecentFilters"
            aria-controls="recent-filter-panel"
            title="Filter transactions"
            @click="showRecentFilters = !showRecentFilters"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            <span class="recent-action-label">Filter</span>
            <span v-if="activeRecentFilterCount" class="recent-filter-count">{{ activeRecentFilterCount }}</span>
          </button>
          <router-link
            v-if="auth.hasPermission('wallet.vending.monitor')"
            to="/vending"
            class="bw-btn sm recent-see-all"
            aria-label="View all transactions"
            title="View all transactions"
          >
            <span class="recent-action-label">View all</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </router-link>
        </div>
      </div>

      <!-- Filter Controls Panel -->
      <div v-if="showRecentFilters" id="recent-filter-panel" class="recent-filter-panel">
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
              <tr v-for="n in 5" :key="`recent-skeleton-${n}`" class="recent-table-skeleton" aria-hidden="true">
                <td><span class="bw-skeleton recent-cell-skeleton reference"></span></td>
                <td>
                  <span class="bw-skeleton recent-cell-skeleton customer"></span>
                  <span class="bw-skeleton recent-cell-skeleton meter"></span>
                </td>
                <td><span class="bw-skeleton recent-cell-skeleton station"></span></td>
                <td><span class="bw-skeleton recent-cell-skeleton badge"></span></td>
                <td><span class="bw-skeleton recent-cell-skeleton badge wide"></span></td>
                <td><span class="bw-skeleton recent-cell-skeleton amount"></span></td>
                <td><span class="bw-skeleton recent-cell-skeleton time"></span></td>
              </tr>
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
      <div class="bw-t-cards recent-cards">
        <template v-if="loading">
          <div v-for="n in 4" :key="`recent-card-skeleton-${n}`" class="bw-tc recent-card-skeleton" aria-hidden="true">
            <div class="bw-tc-top">
              <span class="recent-card-skeleton-copy">
                <span class="bw-skeleton recent-cell-skeleton customer"></span>
                <span class="bw-skeleton recent-cell-skeleton reference"></span>
              </span>
              <span class="bw-skeleton recent-cell-skeleton amount"></span>
            </div>
            <div class="bw-tc-mid">
              <span class="bw-skeleton recent-card-skeleton-detail"></span>
              <span class="bw-skeleton recent-card-skeleton-detail short"></span>
            </div>
          </div>
        </template>
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

      <!-- Pagination Bar -->
      <div v-if="loading" class="bw-pagination-bar dashboard-pagination-skeleton" aria-hidden="true">
        <span class="bw-skeleton dashboard-pagination-skeleton-copy"></span>
        <span class="bw-skeleton dashboard-pagination-skeleton-actions"></span>
      </div>
      <div v-else-if="filteredRecentTransactions.length > 0" class="bw-pagination-bar">
        <div class="bw-pagination-info">
          Showing {{ ((recentPage - 1) * recentPageSize) + 1 }}–{{ Math.min(recentPage * recentPageSize, filteredRecentTransactions.length) }} of {{ filteredRecentTransactions.length }} matching transactions
        </div>
        <div class="bw-pagination-controls">
          <label class="filter-label inline" style="margin: 0; flex-direction: row; align-items: center; gap: 6px;">
            <span>Per page</span>
            <select v-model="recentPageSize" class="bw-select bw-select-sm" style="width: auto">
              <option :value="10">10</option>
              <option :value="25">25</option>
              <option :value="50">50</option>
            </select>
          </label>
          <button class="bw-btn sm ghost" :disabled="recentPage <= 1" @click="recentPage--">
            Previous
          </button>
          <span class="bw-page-num" style="font-size: var(--t-xs); font-weight: 600; color: var(--text-muted)">
            Page {{ recentPage }} of {{ totalRecentPages }}
          </span>
          <button class="bw-btn sm ghost" :disabled="recentPage >= totalRecentPages" @click="recentPage++">
            Next
          </button>
        </div>
      </div>
    </div>

  </AppShell>
</template>

<style scoped>
.dashboard-greeting {
  margin-bottom: calc(var(--s-3) * -1);
}
.dashboard-kpi-skeleton {
  overflow: hidden;
  pointer-events: none;
}
.dashboard-kpi-skeleton .bw-skeleton {
  display: block;
  min-height: 0;
}
.dashboard-kpi-skeleton-label {
  width: 42%;
  height: 10px;
  border-radius: var(--r-pill);
}
.dashboard-kpi-skeleton-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--r-md);
}
.dashboard-kpi-skeleton-value {
  width: 58%;
  height: 32px;
  margin-top: var(--s-4);
  border-radius: var(--r-sm);
}
.dashboard-kpi-skeleton-foot {
  align-items: center;
  margin-top: var(--s-3);
}
.dashboard-kpi-skeleton-pill {
  width: 72px;
  height: 26px;
  border-radius: var(--r-pill);
}
.dashboard-kpi-skeleton-note {
  width: 38%;
  height: 10px;
  border-radius: var(--r-pill);
}
.dashboard-kpi-skeleton-chart {
  display: flex;
  align-items: end;
  gap: var(--s-2);
  height: 34px;
  margin-top: var(--s-4);
}
.dashboard-kpi-skeleton-line {
  flex: 1;
  height: 4px;
  border-radius: var(--r-pill);
  transform: rotate(-3deg);
  transform-origin: left center;
}
.dashboard-kpi-skeleton-line.line-two {
  transform: translateY(-5px) rotate(2deg);
}
.dashboard-kpi-skeleton-line.line-three {
  transform: translateY(-9px) rotate(-4deg);
}
.dashboard-section-skeleton {
  overflow: hidden;
  pointer-events: none;
}
.dashboard-section-skeleton .bw-skeleton,
.recent-table-skeleton .bw-skeleton,
.recent-card-skeleton .bw-skeleton,
.dashboard-pagination-skeleton .bw-skeleton {
  display: block;
  min-height: 0;
}
.dashboard-section-skeleton-head {
  flex-wrap: nowrap;
}
.dashboard-section-skeleton-copy,
.dashboard-section-skeleton-lines,
.recent-card-skeleton-copy {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}
.dashboard-section-skeleton-copy {
  flex: 1;
}
.dashboard-section-skeleton-title {
  width: 120px;
  height: 14px;
  border-radius: var(--r-pill);
}
.dashboard-section-skeleton-title.wide {
  width: 150px;
}
.dashboard-section-skeleton-subtitle {
  width: min(180px, 70%);
  height: 9px;
  border-radius: var(--r-pill);
}
.dashboard-section-skeleton-badge {
  width: 46px;
  height: 22px;
  border-radius: var(--r-pill);
}
.dashboard-section-skeleton-body {
  display: grid;
  gap: var(--s-2);
  padding: var(--s-4) var(--s-5);
}
.dashboard-section-skeleton-row {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 58px;
  align-items: center;
  gap: var(--s-3);
}
.dashboard-section-skeleton-icon {
  width: 38px;
  height: 38px;
  border-radius: var(--r-md);
}
.dashboard-section-skeleton-lines {
  width: 100%;
}
.dashboard-section-skeleton-line {
  width: min(150px, 78%);
  height: 10px;
  border-radius: var(--r-pill);
}
.dashboard-section-skeleton-line.short {
  width: min(100px, 54%);
  height: 8px;
}
.dashboard-section-skeleton-status {
  width: 58px;
  height: 22px;
  border-radius: var(--r-pill);
}
.dashboard-section-skeleton-footer {
  padding: var(--s-3) var(--s-5);
  border-top: 1px solid var(--border);
}
.dashboard-section-skeleton-button {
  width: 100%;
  height: 42px;
  border-radius: var(--r-md);
}
.dashboard-section-skeleton-action {
  width: 104px;
  height: 40px;
  border-radius: var(--r-md);
}
.dashboard-vending-skeleton-rows {
  display: grid;
  padding: var(--s-2) var(--s-5) var(--s-4);
}
.dashboard-vending-skeleton-row {
  display: grid;
  grid-template-columns: 1fr 1.2fr 0.8fr 1fr 0.8fr;
  gap: var(--s-4);
  padding-block: var(--s-3);
  border-bottom: 1px solid var(--border);
}
.dashboard-vending-skeleton-row:last-child {
  border-bottom: 0;
}
.dashboard-vending-skeleton-row .bw-skeleton {
  width: 78%;
  height: 11px;
  border-radius: var(--r-pill);
}
.recent-count-skeleton {
  width: 22px;
  height: 22px;
  border-radius: var(--r-pill);
}
.recent-cell-skeleton {
  height: 10px;
  border-radius: var(--r-pill);
}
.recent-cell-skeleton.reference { width: 86px; }
.recent-cell-skeleton.customer { width: 118px; }
.recent-cell-skeleton.meter { width: 92px; margin-top: 7px; height: 8px; }
.recent-cell-skeleton.station { width: 68px; }
.recent-cell-skeleton.badge { width: 70px; height: 22px; }
.recent-cell-skeleton.badge.wide { width: 92px; }
.recent-cell-skeleton.amount { width: 72px; margin-left: auto; }
.recent-cell-skeleton.time { width: 62px; }
.recent-card-skeleton-copy { flex: 1; }
.recent-card-skeleton-detail {
  width: 90px;
  height: 24px;
  border-radius: var(--r-sm);
}
.recent-card-skeleton-detail.short { width: 64px; }
.dashboard-pagination-skeleton-copy {
  width: min(270px, 46%);
  height: 10px;
  border-radius: var(--r-pill);
}
.dashboard-pagination-skeleton-actions {
  width: 220px;
  height: 36px;
  border-radius: var(--r-md);
}
.recent-head-bar {
  padding: var(--s-3) var(--s-4);
  gap: var(--s-3);
}
.recent-heading {
  min-width: 0;
}
.recent-title-row,
.recent-actions {
  display: flex;
  align-items: center;
}
.recent-title-row {
  gap: var(--s-2);
}
.recent-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding-inline: 6px;
  border-radius: var(--r-pill);
  background: var(--surface-2);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
}
.recent-actions {
  gap: 6px;
  flex-wrap: nowrap;
}
.recent-filter-button,
.recent-see-all {
  min-height: 42px;
  gap: 6px;
}
.recent-see-all {
  text-decoration: none;
}
.recent-filter-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding-inline: 5px;
  border-radius: var(--r-pill);
  background: var(--brand);
  color: var(--on-brand);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 800;
}
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

.bw-pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--s-3) var(--s-4);
  border-top: 1px solid var(--border);
  background: var(--surface-1);
  gap: var(--s-3);
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

.danger-text {
  color: var(--danger) !important;
  font-weight: 600;
}

@media (max-width: 640px) {
  .dashboard-section-skeleton-body {
    padding: var(--s-3);
  }
  .dashboard-section-skeleton-footer {
    padding: var(--s-3);
  }
  .dashboard-vending-skeleton-rows {
    padding: 0 var(--s-3) var(--s-3);
  }
  .dashboard-vending-skeleton-row {
    grid-template-columns: 1.2fr 0.8fr;
    gap: var(--s-3);
  }
  .dashboard-vending-skeleton-row .bw-skeleton:nth-child(n + 3) {
    display: none;
  }
  .dashboard-pagination-skeleton {
    align-items: stretch;
  }
  .dashboard-pagination-skeleton-copy,
  .dashboard-pagination-skeleton-actions {
    width: 100%;
  }
  .recent-head-bar {
    display: flex;
    align-items: center;
    padding: 12px;
  }
  .recent-heading {
    flex: 1 1 auto;
  }
  .recent-heading .bw-card-sub {
    margin-top: 2px;
    font-size: 11px;
    line-height: 1.35;
  }
  .recent-actions {
    flex: 0 0 auto;
  }
  .recent-actions .bw-data-view-switch {
    padding: 2px;
  }
  .recent-filter-button,
  .recent-see-all {
    width: 40px;
    min-width: 40px;
    min-height: 40px;
    padding: 0;
    justify-content: center;
  }
  .recent-action-label {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .recent-filter-count {
    position: absolute;
    transform: translate(10px, -10px);
  }
  .recent-cards .bw-tc {
    padding: 10px 12px;
    gap: 6px;
  }
  .recent-cards .bw-tc-mid {
    gap: 8px 12px;
    padding-top: 6px;
  }
  .recent-filter-grid {
    grid-template-columns: 1fr 1fr;
  }
  .recent-filter-grid > .filter-group:first-child {
    grid-column: 1 / -1;
  }
  .bw-pagination-bar {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .bw-kpi-grid {
    grid-template-columns: 1fr;
    gap: var(--s-3);
  }
}
@media (min-width: 641px) and (max-width: 1024px) {
  .bw-kpi-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--s-3);
  }
}
</style>
