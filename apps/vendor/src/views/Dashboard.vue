<script setup lang="ts">
import { onMounted, computed } from 'vue';
import AppShell from '../components/AppShell.vue';
import VendorOnboardingChecklist from '../components/VendorOnboardingChecklist.vue';
import { useWalletStore } from '../stores/wallet';
import { naira } from '../lib/format';

const wallet = useWalletStore();

onMounted(async () => {
    await wallet.fetchSummary();
    await wallet.fetchLedger(10);
});

function isToday(iso: string) {
    const d = new Date(iso), n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
const todayCredits = computed(() =>
    wallet.ledger.filter(e => isToday(e.created_at) && e.direction === 'credit').reduce((s, e) => s + e.amount_minor, 0)
);
const todayDebits = computed(() =>
    wallet.ledger.filter(e => isToday(e.created_at) && e.direction === 'debit').reduce((s, e) => s + e.amount_minor, 0)
);
const todayCount = computed(() => wallet.ledger.filter(e => isToday(e.created_at)).length);
</script>

<template>
  <AppShell title="Dashboard">

    <!-- Onboarding checklist (only shown until complete or dismissed) -->
    <VendorOnboardingChecklist />

    <!-- Hero balance card -->
    <div class="bw-card" style="background: radial-gradient(100% 80% at 0% 0%, var(--brand-glow), transparent 60%), var(--surface); border-color: oklch(70% 0.19 145 / 0.22); position: relative; overflow: hidden">
      <div style="position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--brand), transparent)"></div>
      <p class="bw-label" style="color: var(--brand)">Wallet Float</p>
      <div class="bw-kpi-value" style="color: var(--brand); font-size: var(--t-4xl); margin-bottom: var(--s-2)">
        {{ naira(wallet.summary?.balance_minor) }}
      </div>
      <p class="bw-muted bw-mono" style="font-size: var(--t-sm); margin-bottom: var(--s-4)">
        Available {{ naira(wallet.summary?.available_minor) }}
        <span v-if="(wallet.summary?.holds_minor ?? 0) > 0" style="opacity: 0.7">
          · {{ naira(wallet.summary?.holds_minor) }} on hold
        </span>
      </p>
      <div class="bw-row" style="gap: var(--s-2)">
        <router-link to="/vend"        class="bw-btn primary" style="text-decoration:none">Buy Token</router-link>
        <router-link to="/wallet/fund" class="bw-btn"         style="text-decoration:none">Fund Wallet</router-link>
      </div>
    </div>

    <!-- KPI tiles -->
    <div class="bw-kpi-grid">
      <div class="bw-kpi">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Today Vended</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value">{{ naira(todayDebits) }}</div>
        <div class="bw-kpi-foot">
          <span class="bw-delta flat">{{ todayCount }} ops</span>
        </div>
      </div>

      <div class="bw-kpi">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Today Funded</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value" style="color: var(--brand)">{{ naira(todayCredits) }}</div>
        <div class="bw-kpi-foot">
          <span class="bw-delta up">credited</span>
        </div>
      </div>

      <div class="bw-kpi">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Currency</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value bw-mono">{{ wallet.summary?.currency || 'NGN' }}</div>
      </div>

      <div class="bw-kpi">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Wallet Status</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        </div>
        <div style="margin-top: auto; padding-bottom: var(--s-1)">
          <span :class="['bw-badge', wallet.summary?.status === 'active' ? 'success' : 'warn']" style="font-size: 11px">
            {{ wallet.summary?.status || '—' }}
          </span>
        </div>
      </div>
    </div>

    <!-- Recent activity -->
    <div class="bw-card flush">
      <div class="bw-table-head-bar">
        <div>
          <div class="bw-card-title">Recent activity</div>
          <div class="bw-card-sub">Latest 10 wallet movements</div>
        </div>
        <router-link to="/wallet" class="bw-card-cta" style="text-decoration:none">
          View all →
        </router-link>
      </div>

      <!-- Desktop table -->
      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Memo</th>
              <th style="text-align:right">Amount</th>
              <th style="text-align:right">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in wallet.ledger" :key="e.id">
              <td class="bw-mono bw-dim" style="font-size: var(--t-xs)">{{ new Date(e.created_at).toLocaleString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</td>
              <td><span :class="['bw-badge', e.direction === 'credit' ? 'success' : 'neutral']">{{ e.entry_type.replace(/_/g, ' ') }}</span></td>
              <td class="bw-muted" style="max-width: 240px; overflow:hidden; text-overflow:ellipsis">{{ e.memo || '—' }}</td>
              <td class="bw-money" :style="{ textAlign:'right', color: e.direction === 'credit' ? 'var(--brand)' : 'var(--text)' }">
                {{ e.direction === 'credit' ? '+' : '−' }}{{ naira(e.amount_minor) }}
              </td>
              <td class="bw-money" style="text-align:right">{{ naira(e.balance_after_minor) }}</td>
            </tr>
            <tr v-if="!wallet.ledger.length">
              <td colspan="5" class="bw-muted" style="text-align:center; padding: var(--s-6)">No activity yet.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="bw-t-cards">
        <div v-for="e in wallet.ledger" :key="e.id" class="bw-tc">
          <div class="bw-tc-top">
            <div>
              <div class="bw-tc-vendor">{{ e.entry_type.replace(/_/g, ' ') }}</div>
              <div class="bw-tc-id">{{ new Date(e.created_at).toLocaleString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</div>
            </div>
            <div class="bw-tc-amt bw-money" :style="{ color: e.direction === 'credit' ? 'var(--brand)' : 'var(--text)' }">
              {{ e.direction === 'credit' ? '+' : '−' }}{{ naira(e.amount_minor) }}
            </div>
          </div>
        </div>
        <div v-if="!wallet.ledger.length" class="bw-muted" style="text-align:center; padding: var(--s-6); font-size: var(--t-sm)">No activity yet.</div>
      </div>
    </div>

  </AppShell>
</template>
