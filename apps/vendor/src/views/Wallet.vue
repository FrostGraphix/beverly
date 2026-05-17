<script setup lang="ts">
import { onMounted } from 'vue';
import AppShell from '../components/AppShell.vue';
import { useWalletStore } from '../stores/wallet';
import { naira } from '../lib/format';

const wallet = useWalletStore();
onMounted(async () => {
    await wallet.fetchSummary();
    await wallet.fetchLedger(100);
});
</script>

<template>
  <AppShell title="Wallet">
    <div class="bw-stack">

      <!-- Balance card -->
      <div class="bw-card" style="background: radial-gradient(100% 80% at 0% 0%, var(--brand-glow), transparent 60%), var(--surface); border-color: oklch(70% 0.19 145 / 0.22); position:relative; overflow:hidden">
        <div style="position:absolute; top:0; left:0; right:0; height:1px; background:linear-gradient(90deg, transparent, var(--brand), transparent)"></div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px,1fr)); gap: var(--s-4)">
          <div>
            <p class="bw-label" style="color: var(--brand)">Balance</p>
            <p class="bw-kpi-value" style="color: var(--brand); font-size: var(--t-2xl); margin: 0">{{ naira(wallet.summary?.balance_minor) }}</p>
          </div>
          <div>
            <p class="bw-label">On hold</p>
            <p class="bw-kpi-value" style="font-size: var(--t-2xl); margin: 0">{{ naira(wallet.summary?.holds_minor) }}</p>
          </div>
          <div>
            <p class="bw-label">Available</p>
            <p class="bw-kpi-value" style="font-size: var(--t-2xl); margin: 0; color: var(--brand)">{{ naira(wallet.summary?.available_minor) }}</p>
          </div>
          <div>
            <p class="bw-label">Status</p>
            <span :class="['bw-badge', wallet.summary?.status === 'active' ? 'success' : 'warn']" style="font-size: 11px; margin-top: 4px; display: inline-flex">
              {{ wallet.summary?.status || '—' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Ledger -->
      <div class="bw-card flush">
        <div class="bw-table-head-bar">
          <div>
            <div class="bw-card-title">Ledger</div>
            <div class="bw-card-sub">{{ wallet.ledger.length }} entries</div>
          </div>
        </div>

        <!-- Desktop table -->
        <div class="bw-t-wrap">
          <table class="bw-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Memo</th>
                <th>Reference</th>
                <th style="text-align:right">Amount</th>
                <th style="text-align:right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in wallet.ledger" :key="e.id">
                <td class="bw-mono bw-dim" style="font-size: var(--t-xs)">{{ new Date(e.created_at).toLocaleString('en-NG', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) }}</td>
                <td><span :class="['bw-badge', e.direction === 'credit' ? 'success' : 'neutral']">{{ e.entry_type.replace(/_/g, ' ') }}</span></td>
                <td class="bw-muted" style="max-width:220px; overflow:hidden; text-overflow:ellipsis">{{ e.memo || '—' }}</td>
                <td class="bw-mono bw-dim">{{ e.reference_id ? '#' + e.reference_id.slice(0, 8) : '—' }}</td>
                <td class="bw-money" :style="{ textAlign:'right', color: e.direction === 'credit' ? 'var(--brand)' : 'var(--text)' }">
                  {{ e.direction === 'credit' ? '+' : '−' }}{{ naira(e.amount_minor) }}
                </td>
                <td class="bw-money" style="text-align:right">{{ naira(e.balance_after_minor) }}</td>
              </tr>
              <tr v-if="!wallet.ledger.length && !wallet.loading">
                <td colspan="6" class="bw-muted" style="text-align:center; padding: var(--s-6)">No entries yet.</td>
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
                <div class="bw-tc-id">{{ new Date(e.created_at).toLocaleString('en-NG', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) }}</div>
              </div>
              <div class="bw-tc-amt bw-money" :style="{ color: e.direction === 'credit' ? 'var(--brand)' : 'var(--text)' }">
                {{ e.direction === 'credit' ? '+' : '−' }}{{ naira(e.amount_minor) }}
              </div>
            </div>
            <div class="bw-tc-mid">
              <div class="bw-tc-pair">
                <span class="bw-tc-pair-label">Balance after</span>
                <span class="bw-tc-pair-val bw-money">{{ naira(e.balance_after_minor) }}</span>
              </div>
              <div class="bw-tc-pair" v-if="e.memo">
                <span class="bw-tc-pair-label">Memo</span>
                <span class="bw-tc-pair-val bw-muted">{{ e.memo }}</span>
              </div>
            </div>
          </div>
          <div v-if="!wallet.ledger.length && !wallet.loading" class="bw-muted" style="text-align:center; padding: var(--s-6); font-size: var(--t-sm)">No entries yet.</div>
        </div>
      </div>

    </div>
  </AppShell>
</template>
