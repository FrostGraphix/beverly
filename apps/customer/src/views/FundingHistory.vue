<script setup lang="ts">
/**
 * Customer funding history — wallet top-ups via Paystack.
 * GET /api/v1/customer/funding[?cursor]
 */
import { onMounted, ref, computed } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { naira, shortDate } from '../lib/format';

interface Funding {
    id: string;
    gateway: string;
    gateway_reference: string;
    amount_minor: number;
    status: string;
    created_at: string;
    metadata: any;
}

const items = ref<Funding[]>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);
const filter = ref<'all' | 'success' | 'pending' | 'failed'>('all');

async function load(reset = true) {
    loading.value = true;
    try {
        const p = new URLSearchParams();
        p.set('limit', '50');
        if (!reset && cursor.value) p.set('cursor', cursor.value);
        const r = await api.get<{ funding: Funding[]; nextCursor: string | null }>(`/api/v1/customer/funding?${p}`);
        items.value = reset ? r.funding : [...items.value, ...r.funding];
        cursor.value = r.nextCursor;
    } catch { /* noop */ } finally { loading.value = false; }
}

const filtered = computed(() => {
    if (filter.value === 'all') return items.value;
    if (filter.value === 'success') return items.value.filter((f) => f.status === 'success');
    if (filter.value === 'failed') return items.value.filter((f) => ['failed', 'abandoned'].includes(f.status));
    return items.value.filter((f) => ['initiated', 'pending'].includes(f.status));
});

const totalFunded = computed(() =>
    items.value.filter((f) => f.status === 'success').reduce((s, f) => s + f.amount_minor, 0),
);

function statusBadge(s: string) {
    return ({ success: 'success', initiated: 'warn', pending: 'warn', failed: 'danger', abandoned: 'neutral' } as Record<string, string>)[s] ?? 'neutral';
}

onMounted(() => load());
</script>

<template>
  <AppShell>
    <div>
      <p class="bw-page-title">Funding history</p>
      <p class="bw-page-sub">{{ naira(totalFunded) }} funded all-time</p>
    </div>

    <div class="bw-segmented">
      <button v-for="f in (['all','success','pending','failed'] as const)" :key="f"
              :class="['bw-seg', filter === f ? 'active' : '']"
              @click="filter = f">{{ f }}</button>
    </div>

    <div class="bw-card flush">
      <!-- Desktop -->
      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Reference</th>
              <th>Channel</th>
              <th style="text-align:right">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in filtered" :key="f.id">
              <td class="bw-mono bw-dim" style="font-size: var(--t-xs)">{{ shortDate(f.created_at) }}</td>
              <td class="bw-mono" style="font-size: var(--t-xs)">{{ f.gateway_reference }}</td>
              <td><span class="bw-badge neutral">{{ f.gateway }}</span></td>
              <td class="bw-money" style="text-align:right">{{ naira(f.amount_minor) }}</td>
              <td><span :class="['bw-badge', statusBadge(f.status)]">{{ f.status }}</span></td>
            </tr>
            <tr v-if="!filtered.length && !loading">
              <td colspan="5" class="bw-muted" style="text-align:center; padding: var(--s-6)">No funding yet.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="bw-t-cards">
        <div v-for="f in filtered" :key="f.id" class="bw-tc">
          <div class="bw-tc-top">
            <div>
              <div class="bw-tc-vendor bw-money">{{ naira(f.amount_minor) }}</div>
              <div class="bw-tc-id">{{ shortDate(f.created_at) }}</div>
            </div>
            <span :class="['bw-badge', statusBadge(f.status)]">{{ f.status }}</span>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Channel</span>
              <span class="bw-tc-pair-val">{{ f.gateway }}</span>
            </div>
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Reference</span>
              <span class="bw-tc-pair-val bw-mono" style="font-size: var(--t-xs)">{{ f.gateway_reference }}</span>
            </div>
          </div>
        </div>
        <div v-if="!filtered.length && !loading" class="bw-muted"
             style="text-align:center; padding: var(--s-6); font-size: var(--t-sm)">No funding yet.</div>
      </div>

      <div v-if="cursor" style="padding: var(--s-3); text-align: center">
        <button class="bw-btn" :disabled="loading" @click="load(false)">
          {{ loading ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </div>
  </AppShell>
</template>
