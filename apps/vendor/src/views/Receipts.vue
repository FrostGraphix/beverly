<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { naira, kwh, shortDate } from '../lib/format';

interface PurchaseOrder {
    id: string;
    meter_id: string;
    customer_name: string | null;
    amount_minor: number;
    units_kwh: number | null;
    token: string | null;
    receipt_id: string | null;
    status: string;
    created_at: string;
}

const orders = ref<PurchaseOrder[]>([]);
const loading = ref(false);

onMounted(async () => {
    loading.value = true;
    try {
        const r = await api.get<{ purchases: PurchaseOrder[] }>('/api/v1/vendor/transactions?limit=200');
        orders.value = r.purchases.filter((p) => p.status === 'delivered' && p.receipt_id);
    } finally { loading.value = false; }
});

async function copyToken(t: string | null) {
    if (!t) return;
    try { await navigator.clipboard.writeText(t); } catch { /* noop */ }
}
</script>

<template>
  <AppShell title="Receipts">
    <div class="bw-card" style="padding: 0">
      <div class="bw-table-head-bar">
        <div>
          <div class="bw-card-title">Receipts</div>
          <div class="bw-card-sub">Reprint or share past vendings.</div>
        </div>
      </div>
      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Customer</th>
              <th>Meter</th>
              <th style="text-align:right">Amount</th>
              <th style="text-align:right">Units</th>
              <th>Token</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in orders" :key="p.id">
              <td class="bw-mono bw-muted">{{ shortDate(p.created_at) }}</td>
              <td>{{ p.customer_name || '—' }}</td>
              <td class="bw-mono">{{ p.meter_id }}</td>
              <td class="bw-money" style="text-align: right">{{ naira(p.amount_minor) }}</td>
              <td class="bw-mono" style="text-align: right">{{ kwh(p.units_kwh) }}</td>
              <td class="bw-mono" style="font-size: var(--t-xs)">{{ p.token?.slice(0, 16) + '…' }}</td>
              <td>
                <button class="bw-btn sm" @click="copyToken(p.token)">Copy</button>
              </td>
            </tr>
            <tr v-if="!orders.length && !loading">
              <td colspan="7" class="bw-muted" style="text-align: center; padding: var(--s-6)">No receipts yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </AppShell>
</template>
