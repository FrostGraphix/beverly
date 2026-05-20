<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import OnboardingChecklist from '../components/OnboardingChecklist.vue';
import { useAuthStore } from '../stores/auth';
import { api } from '../lib/api';
import { naira, shortDate } from '../lib/format';

const auth    = useAuthStore();
const wallet  = ref<any>(null);
const ledger  = ref<any[]>([]);
const loading = ref(false);

onMounted(async () => {
    loading.value = true;
    try {
        const [w, l] = await Promise.all([
            api.get<any>('/api/v1/customer/wallet'),
            api.get<{ entries: any[] }>('/api/v1/customer/wallet/ledger?limit=5'),
        ]);
        wallet.value = w;
        ledger.value = l.entries;
    } catch { /* noop */ } finally { loading.value = false; }
});

function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
</script>

<template>
  <AppShell>
    <!-- Balance hero -->
    <div class="bw-balance-hero">
      <p class="bw-label" style="color: var(--brand); margin:0 0 var(--s-1)">{{ greeting() }}, {{ auth.customer?.full_name?.split(' ')[0] || 'there' }}</p>
      <div class="bw-kpi-value" style="color: var(--brand); font-size: var(--t-4xl); margin-bottom: var(--s-1)">
        {{ naira(wallet?.balance_minor) }}
      </div>
      <p class="bw-muted bw-mono" style="font-size: var(--t-xs); margin-bottom: var(--s-4)">
        Available {{ naira(wallet?.available_minor) }}
        <span v-if="(wallet?.holds_minor ?? 0) > 0"> · {{ naira(wallet?.holds_minor) }} on hold</span>
      </p>
      <div class="bw-row" style="gap: var(--s-2)">
        <router-link to="/buy-token" class="bw-btn primary" style="text-decoration:none; flex:1; justify-content:center">
          Buy Token
        </router-link>
        <router-link to="/wallet/fund" class="bw-btn" style="text-decoration:none; flex:1; justify-content:center">
          Add Money
        </router-link>
      </div>
    </div>

    <!-- Onboarding checklist -->
    <OnboardingChecklist />

    <!-- Recent activity -->
    <div class="bw-card flush">
      <div class="bw-table-head-bar">
        <div>
          <div class="bw-card-title">Recent activity</div>
          <div class="bw-card-sub">Latest wallet movements</div>
        </div>
        <router-link to="/wallet" class="bw-card-cta" style="text-decoration:none">All →</router-link>
      </div>

      <div class="bw-t-cards" style="display:block">
        <div v-for="e in ledger" :key="e.id" class="bw-tc">
          <div class="bw-tc-top">
            <div>
              <div class="bw-tc-vendor">{{ e.entry_type.replace(/_/g,' ') }}</div>
              <div class="bw-tc-id bw-mono" style="font-size: var(--t-2xs)">{{ shortDate(e.created_at) }}</div>
            </div>
            <div class="bw-tc-amt bw-money"
                 :style="{ color: e.direction === 'credit' ? 'var(--brand)' : 'var(--text)' }">
              {{ e.direction === 'credit' ? '+' : '−' }}{{ naira(e.amount_minor) }}
            </div>
          </div>
        </div>
        <div v-if="!ledger.length && !loading" class="bw-muted"
             style="text-align:center; padding: var(--s-6); font-size: var(--t-sm)">
          No activity yet.
        </div>
      </div>
    </div>
  </AppShell>
</template>
