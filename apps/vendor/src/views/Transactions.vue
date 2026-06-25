<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { naira, kwh, shortDate } from '../lib/format';

interface PurchaseOrder {
    id: string; meter_id: string; customer_name: string | null;
    station_id: string | null; amount_minor: number; units_kwh: number | null;
    token: string | null; purchase_mode: 'wallet' | 'direct_pay' | 'remote_send';
    status: string; delivery_state: string | null; created_at: string;
}

const purchases = ref<PurchaseOrder[]>([]);
const loading   = ref(false);
const filter    = ref<'all' | 'delivered' | 'failed' | 'pending'>('all');

const filtered = () => {
    if (filter.value === 'all')       return purchases.value;
    if (filter.value === 'delivered') return purchases.value.filter(p => p.status === 'delivered');
    if (filter.value === 'failed')    return purchases.value.filter(p => p.status === 'failed');
    return purchases.value.filter(p => ['created', 'hold_active', 'dispatching', 'delivery_pending_review'].includes(p.status));
};

function statusBadge(s: string) {
    if (s === 'delivered')                return 'success';
    if (s === 'failed')                   return 'danger';
    if (s === 'dispatching' || s === 'hold_active') return 'info';
    if (s === 'delivery_pending_review')  return 'warn';
    if (s === 'reversed')                 return 'warn';
    return 'neutral';
}

onMounted(async () => {
    loading.value = true;
    try {
        const r = await api.get<{ purchases: PurchaseOrder[] }>('/api/v1/vendor/transactions?limit=200');
        purchases.value = r.purchases;
    } finally { loading.value = false; }
});
</script>

<template>
  <AppShell title="Transactions">
    <div class="bw-card flush">
      <div class="bw-table-head-bar">
        <div>
          <div class="bw-card-title">Vending history</div>
          <div class="bw-card-sub">{{ purchases.length }} records loaded</div>
        </div>
        <div class="bw-segmented">
          <button v-for="f in (['all','delivered','pending','failed'] as const)" :key="f"
                  :class="['bw-seg', filter === f ? 'active' : '']"
                  @click="filter = f">{{ f }}</button>
        </div>
      </div>

      <!-- Filter pills (mobile) -->
      <div class="bw-filter-bar" style="display: none">
        <button v-for="f in (['all','delivered','pending','failed'] as const)" :key="f"
                :class="['bw-filter-pill', filter === f ? 'active' : '']"
                @click="filter = f">{{ f }}</button>
      </div>

      <!-- Desktop table -->
      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Customer</th>
              <th>Meter</th>
              <th>Station</th>
              <th>Mode</th>
              <th style="text-align:right">Amount</th>
              <th style="text-align:right">Units</th>
              <th>Status</th>
              <th>Token</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in filtered()" :key="p.id">
              <td class="bw-mono bw-dim" style="font-size: var(--t-xs)">{{ shortDate(p.created_at) }}</td>
              <td>{{ p.customer_name || '—' }}</td>
              <td class="bw-mono">{{ p.meter_id }}</td>
              <td class="bw-muted">{{ p.station_id || '—' }}</td>
              <td><span class="bw-badge neutral">{{ p.purchase_mode }}</span></td>
              <td class="bw-money" style="text-align:right">{{ naira(p.amount_minor) }}</td>
              <td class="bw-mono" style="text-align:right">{{ kwh(p.units_kwh) }}</td>
              <td><span :class="['bw-badge', statusBadge(p.status)]">{{ p.status }}</span></td>
              <td class="bw-mono" style="font-size: var(--t-xs)">{{ p.token ? p.token.slice(0, 12) + '…' : '—' }}</td>
            </tr>
            <tr v-if="!filtered().length && !loading">
              <td colspan="9" class="bw-muted" style="text-align:center; padding: var(--s-6)">No transactions.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="bw-t-cards">
        <div v-for="p in filtered()" :key="p.id" class="bw-tc">
          <div class="bw-tc-top">
            <div>
              <div class="bw-tc-vendor">{{ p.customer_name || p.meter_id }}</div>
              <div class="bw-tc-id">{{ shortDate(p.created_at) }}</div>
            </div>
            <div class="bw-tc-amt bw-money">{{ naira(p.amount_minor) }}</div>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Status</span>
              <span :class="['bw-badge', statusBadge(p.status)]">{{ p.status }}</span>
            </div>
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Mode</span>
              <span class="bw-badge neutral">{{ p.purchase_mode }}</span>
            </div>
            <div class="bw-tc-pair" v-if="p.units_kwh">
              <span class="bw-tc-pair-label">Units</span>
              <span class="bw-tc-pair-val bw-mono">{{ kwh(p.units_kwh) }}</span>
            </div>
          </div>
        </div>
        <div v-if="!filtered().length && !loading" class="bw-muted" style="text-align:center; padding: var(--s-6); font-size: var(--t-sm)">No transactions.</div>
      </div>
    </div>
  </AppShell>
</template>
