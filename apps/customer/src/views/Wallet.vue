<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { naira, shortDate } from '../lib/format';

const wallet  = ref<any>(null);
const entries = ref<any[]>([]);
const loading = ref(false);

onMounted(async () => {
    loading.value = true;
    try {
        const [w, l] = await Promise.all([
            api.get<any>('/api/v1/customer/wallet'),
            api.get<{ entries: any[] }>('/api/v1/customer/wallet/ledger?limit=50'),
        ]);
        wallet.value = w;
        entries.value = l.entries;
    } catch { /* noop */ } finally { loading.value = false; }
});
</script>

<template>
  <AppShell>
    <!-- Balance card -->
    <div class="bw-balance-hero">
      <p class="bw-label" style="color: var(--brand); margin:0 0 var(--s-1)">Wallet</p>
      <div class="bw-kpi-value" style="color: var(--brand); font-size: var(--t-4xl); margin-bottom: var(--s-1)">
        {{ naira(wallet?.balance_minor) }}
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap: var(--s-3); margin-bottom: var(--s-4)">
        <div>
          <p class="bw-label" style="margin:0 0 2px">On hold</p>
          <p class="bw-mono" style="margin:0; font-size: var(--t-sm)">{{ naira(wallet?.holds_minor) }}</p>
        </div>
        <div>
          <p class="bw-label" style="margin:0 0 2px">Available</p>
          <p class="bw-mono" style="margin:0; font-size: var(--t-sm); color: var(--brand)">{{ naira(wallet?.available_minor) }}</p>
        </div>
      </div>
      <div class="bw-row" style="gap: var(--s-2)">
        <router-link to="/wallet/fund" class="bw-btn primary" style="text-decoration:none; flex:1; justify-content:center">
          Add Money
        </router-link>
        <router-link to="/wallet/funding" class="bw-btn" style="text-decoration:none; flex:1; justify-content:center">
          Funding
        </router-link>
        <router-link to="/transactions" class="bw-btn" style="text-decoration:none; flex:1; justify-content:center">
          Spending
        </router-link>
      </div>
    </div>

    <!-- Ledger -->
    <div class="bw-card flush">
      <div class="bw-table-head-bar">
        <div>
          <div class="bw-card-title">Ledger</div>
          <div class="bw-card-sub">{{ entries.length }} entries</div>
        </div>
      </div>

      <!-- Desktop table -->
      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th style="text-align:right">Amount</th>
              <th style="text-align:right">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in entries" :key="e.id">
              <td class="bw-mono bw-dim" style="font-size: var(--t-xs)">{{ shortDate(e.created_at) }}</td>
              <td><span :class="['bw-badge', e.direction === 'credit' ? 'success' : 'neutral']">{{ e.entry_type.replace(/_/g,' ') }}</span></td>
              <td class="bw-money" :style="{ textAlign:'right', color: e.direction === 'credit' ? 'var(--brand)' : 'var(--text)' }">
                {{ e.direction === 'credit' ? '+' : '−' }}{{ naira(e.amount_minor) }}
              </td>
              <td class="bw-money" style="text-align:right">{{ naira(e.balance_after_minor) }}</td>
            </tr>
            <tr v-if="!entries.length && !loading">
              <td colspan="4" class="bw-muted" style="text-align:center; padding: var(--s-6)">No entries yet.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="bw-t-cards">
        <div v-for="e in entries" :key="e.id" class="bw-tc">
          <div class="bw-tc-top">
            <div>
              <div class="bw-tc-vendor">{{ e.entry_type.replace(/_/g,' ') }}</div>
              <div class="bw-tc-id">{{ shortDate(e.created_at) }}</div>
            </div>
            <div class="bw-tc-amt bw-money"
                 :style="{ color: e.direction === 'credit' ? 'var(--brand)' : 'var(--text)' }">
              {{ e.direction === 'credit' ? '+' : '−' }}{{ naira(e.amount_minor) }}
            </div>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Balance after</span>
              <span class="bw-tc-pair-val bw-money">{{ naira(e.balance_after_minor) }}</span>
            </div>
          </div>
        </div>
        <div v-if="!entries.length && !loading" class="bw-muted"
             style="text-align:center; padding: var(--s-6); font-size: var(--t-sm)">No entries yet.</div>
      </div>
    </div>
  </AppShell>
</template>
