<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, naira, shortDate } from '../lib/api';

interface FundingRequest { id: string; amount_minor: number; status: string; created_at: string; }
interface Application    { id: string; legal_name: string; created_at: string; }
interface Purchase        { id: string; amount_minor: number; status: string; meter_id?: string; created_at: string; }

const funding = ref<FundingRequest[]>([]);
const apps    = ref<Application[]>([]);
const vending = ref<Purchase[]>([]);
const loading = ref(true);
let poll: ReturnType<typeof setInterval> | null = null;

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

async function fetchAll() {
    try { funding.value = (await api.get<{ funding: FundingRequest[] }>('/api/v1/admin/funding/pending')).funding; } catch { /* noop */ }
    try { apps.value    = (await api.get<{ applications: Application[] }>('/api/v1/admin/vendor-applications')).applications; } catch { /* noop */ }
    try { vending.value = (await api.get<{ purchases: Purchase[] }>('/api/v1/admin/vending')).purchases; } catch { /* noop */ }
}

onMounted(async () => { await fetchAll(); loading.value = false; poll = setInterval(fetchAll, 30_000); });
onUnmounted(() => { if (poll) clearInterval(poll); });
</script>

<template>
  <AppShell title="Operations">

    <!-- Page header -->
    <div class="bw-page-head">
      <div class="bw-page-title">
        <h1>
          Operations
          <span class="bw-live-tag">
            <span class="bw-live-dot" />LIVE
          </span>
        </h1>
        <p>Real-time overview of Beverly vending wallet. Refreshes every 30 s.</p>
      </div>
      <div class="bw-head-actions">
        <router-link to="/vendors/new" class="bw-btn primary" style="text-decoration:none">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          New Vendor
        </router-link>
      </div>
    </div>

    <!-- KPI grid -->
    <div class="bw-kpi-grid">

      <!-- Featured: pending funding -->
      <div class="bw-kpi featured">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Pending Funding</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value" style="color: var(--brand)">
          {{ naira(pendingFundingTotal) }}
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
        <div class="bw-kpi-value" style="color: var(--brand)">{{ naira(todayVendingTotal) }}</div>
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
          {{ failedToday }}
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
          {{ apps.length }}
        </div>
        <div class="bw-kpi-foot">
          <span :class="['bw-delta', apps.length > 0 ? 'flat' : 'flat']" style="background: oklch(72% 0.13 220 / 0.12); color: var(--info)">
            awaiting review
          </span>
        </div>
      </div>

    </div>

    <!-- Queues row -->
    <div class="bw-row-2">

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
          <router-link to="/funding" class="bw-btn" style="text-decoration:none; width:100%; justify-content:center">
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
          <router-link to="/applications" class="bw-btn" style="text-decoration:none; width:100%; justify-content:center">
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
        <router-link to="/vending" class="bw-btn sm" style="text-decoration:none">Open monitor</router-link>
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

  </AppShell>
</template>
