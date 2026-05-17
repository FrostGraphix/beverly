<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { naira, kwh, shortDate, shortId } from '../lib/format';

const receipts = ref<any[]>([]);
const loading  = ref(false);
const selected = ref<any>(null);
const loadingDetail = ref(false);

onMounted(async () => {
    loading.value = true;
    try {
        const r = await api.get<{ receipts: any[] }>('/api/v1/customer/receipts');
        receipts.value = r.receipts;
    } catch { /* noop */ } finally { loading.value = false; }
});

async function viewReceipt(purchaseOrderId: string) {
    loadingDetail.value = true;
    try {
        selected.value = await api.get<any>(`/api/v1/customer/receipts/${purchaseOrderId}`);
    } catch { /* noop */ } finally { loadingDetail.value = false; }
}

function copyToken() {
    if (selected.value?.payload?.token) {
        navigator.clipboard.writeText(selected.value.payload.token);
    }
}
</script>

<template>
  <AppShell>
    <div>
      <p class="bw-page-title">Receipts</p>
      <p class="bw-page-sub">{{ receipts.length }} receipts</p>
    </div>

    <!-- Receipt detail panel -->
    <div v-if="selected" class="bw-card">
      <div class="bw-row" style="margin-bottom: var(--s-4)">
        <p style="font-weight:700; margin:0; flex:1">{{ selected.receipt_number }}</p>
        <button class="bw-icon-btn" @click="selected = null">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="bw-stack" style="gap: var(--s-3)">
        <div v-for="[k,v] in [['Meter', selected.payload.meterId], ['Amount', naira(selected.payload.amountMinor)], ['Units', kwh(selected.payload.units)], ['Date', shortDate(selected.created_at)]]" :key="k"
             class="bw-row" style="justify-content:space-between">
          <span class="bw-muted" style="font-size: var(--t-sm)">{{ k }}</span>
          <span style="font-weight:600; font-size: var(--t-sm)">{{ v }}</span>
        </div>
      </div>
      <div class="bw-token-box" style="margin-top: var(--s-4)" v-if="selected.payload.token">
        <div class="bw-token-value">{{ selected.payload.token }}</div>
      </div>
      <div class="bw-row" style="gap: var(--s-3); margin-top: var(--s-4)">
        <button class="bw-btn" style="flex:1; justify-content:center" @click="copyToken">Copy token</button>
        <button class="bw-btn" style="flex:1; justify-content:center" @click="window.print()">Print</button>
      </div>
    </div>

    <!-- List -->
    <div v-if="loading" class="bw-muted" style="text-align:center; padding: var(--s-8); font-size: var(--t-sm)">Loading…</div>

    <div v-else-if="!receipts.length" class="bw-card" style="text-align:center; padding: var(--s-8)">
      <p class="bw-muted" style="margin:0">No receipts yet. Buy a token to see your receipts here.</p>
    </div>

    <div v-for="r in receipts" :key="r.id"
         class="bw-q-row bw-card" style="cursor:pointer"
         @click="viewReceipt(r.purchase_order_id)">
      <div class="bw-row">
        <div style="flex:1">
          <div class="bw-mono" style="font-size: var(--t-sm); font-weight:700">{{ r.receipt_number }}</div>
          <div class="bw-dim" style="font-size: var(--t-xs)">{{ shortDate(r.created_at) }}</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="bw-muted"><path d="M9 18l6-6-6-6"/></svg>
      </div>
    </div>
  </AppShell>
</template>
