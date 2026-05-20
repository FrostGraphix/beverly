<script setup lang="ts">
/**
 * Vendor funding history — wallet top-ups (bank transfer + Paystack).
 * GET /api/v1/vendor/funding[?limit]
 */
import { onMounted, ref, computed } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { naira, shortDate } from '../lib/format';

interface Funding {
    id: string;
    amount_minor: number;
    channel: 'bank_transfer' | 'paystack' | 'manual';
    status: string;
    funding_reference: string | null;
    proof_view_url?: string | null;
    rejection_reason: string | null;
    created_at: string;
    approved_at: string | null;
}

const items = ref<Funding[]>([]);
const loading = ref(false);
const filter = ref<'all' | 'approved' | 'pending' | 'rejected'>('all');

async function load() {
    loading.value = true;
    try {
        const r = await api.get<{ funding: Funding[] }>('/api/v1/vendor/funding?limit=200');
        items.value = r.funding ?? [];
    } catch { /* noop */ } finally { loading.value = false; }
}

const filtered = computed(() => {
    if (filter.value === 'all') return items.value;
    if (filter.value === 'approved') return items.value.filter((f) => f.status === 'approved');
    if (filter.value === 'rejected') return items.value.filter((f) => f.status === 'rejected');
    return items.value.filter((f) => ['initiated', 'proof_uploaded', 'under_review'].includes(f.status));
});

const totalApproved = computed(() =>
    items.value.filter((f) => f.status === 'approved').reduce((s, f) => s + f.amount_minor, 0),
);

function statusBadge(s: string) {
    return ({
        approved: 'success', proof_uploaded: 'warn', under_review: 'warn',
        initiated: 'neutral', rejected: 'danger', expired: 'neutral', cancelled: 'neutral',
    } as Record<string, string>)[s] ?? 'neutral';
}
function channelBadge(c: string) {
    return ({ paystack: 'info', bank_transfer: 'neutral', manual: 'warn' } as Record<string, string>)[c] ?? 'neutral';
}

onMounted(load);
</script>

<template>
  <AppShell title="Funding History">
    <div class="bw-card hero-card">
      <p class="bw-label" style="color: var(--brand); margin: 0 0 var(--s-1)">Total funded (approved)</p>
      <div class="bw-kpi-value" style="color: var(--brand); font-size: var(--t-3xl)">{{ naira(totalApproved) }}</div>
      <p class="bw-muted" style="font-size: var(--t-xs); margin: var(--s-1) 0 0">{{ items.length }} requests all-time</p>
    </div>

    <div class="bw-segmented" style="margin-bottom: var(--s-3)">
      <button v-for="f in (['all','approved','pending','rejected'] as const)" :key="f"
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
              <th>Channel</th>
              <th>Reference</th>
              <th>Proof</th>
              <th style="text-align:right">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in filtered" :key="f.id">
              <td class="bw-mono bw-dim" style="font-size: var(--t-xs)">{{ shortDate(f.created_at) }}</td>
              <td><span :class="['bw-badge', channelBadge(f.channel)]">{{ f.channel }}</span></td>
              <td class="bw-mono" style="font-size: var(--t-xs)">{{ f.funding_reference || '—' }}</td>
              <td>
                <a v-if="f.proof_view_url" :href="f.proof_view_url" target="_blank" rel="noopener" class="proof-link">view</a>
                <span v-else class="bw-muted">—</span>
              </td>
              <td class="bw-money" style="text-align:right">{{ naira(f.amount_minor) }}</td>
              <td>
                <span :class="['bw-badge', statusBadge(f.status)]">{{ f.status }}</span>
                <div v-if="f.status === 'rejected' && f.rejection_reason" class="reject-reason">{{ f.rejection_reason }}</div>
              </td>
            </tr>
            <tr v-if="!filtered.length && !loading">
              <td colspan="6" class="bw-muted" style="text-align:center; padding: var(--s-6)">No funding requests.</td>
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
              <span :class="['bw-badge', channelBadge(f.channel)]">{{ f.channel }}</span>
            </div>
            <div class="bw-tc-pair" v-if="f.proof_view_url">
              <span class="bw-tc-pair-label">Proof</span>
              <a :href="f.proof_view_url" target="_blank" rel="noopener" class="proof-link">view</a>
            </div>
            <div class="bw-tc-pair" v-if="f.status === 'rejected' && f.rejection_reason">
              <span class="bw-tc-pair-label">Reason</span>
              <span class="bw-tc-pair-val" style="color: var(--danger)">{{ f.rejection_reason }}</span>
            </div>
          </div>
        </div>
        <div v-if="!filtered.length && !loading" class="bw-muted"
             style="text-align:center; padding: var(--s-6); font-size: var(--t-sm)">No funding requests.</div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.hero-card {
  background: radial-gradient(100% 80% at 0% 0%, var(--brand-glow), transparent 60%), var(--surface);
  border-color: oklch(70% 0.19 145 / 0.22);
  margin-bottom: var(--s-3);
}
.proof-link { color: var(--brand); font-family: var(--font-mono); font-size: var(--t-xs); text-decoration: underline; }
.reject-reason { font-size: 10px; color: var(--danger); margin-top: 2px; max-width: 220px; }
</style>
