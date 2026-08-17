<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import WalletDataViewSwitch from '@beverly/tokens/WalletDataViewSwitch.vue';
import WalletTableSkeleton from '@beverly/tokens/WalletTableSkeleton.vue';
import { useWalletStore, type LedgerEntry } from '../stores/wallet';
import { naira } from '../lib/format';
import { downloadReceipt, ledgerReceipt, printReceipt, viewReceipt } from '../lib/receipts';

const wallet = useWalletStore();
const viewMode = ref<'list' | 'table'>(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'list' : 'table',
);

function viewLedgerReceipt(entry: LedgerEntry) {
    viewReceipt(ledgerReceipt(entry));
}

function printLedgerReceipt(entry: LedgerEntry) {
    printReceipt(ledgerReceipt(entry));
}

function downloadLedgerReceipt(entry: LedgerEntry) {
    downloadReceipt(ledgerReceipt(entry));
}

function displayMemo(value: string | null) {
    return value?.replace(/\uFFFD+/g, ' • ') || '—';
}

onMounted(async () => {
    await wallet.fetchSummary();
    await wallet.fetchLedger(100);
});
</script>

<template>
  <AppShell title="Wallet">
    <div class="bw-stack">

      <div class="bw-kpi-grid bw-mobile-kpi-grid wallet-stat-grid" aria-label="Wallet summary">
        <div class="bw-kpi featured wallet-stat">
          <span class="bw-kpi-label">Balance</span>
          <strong class="bw-kpi-value wallet-stat-value brand">{{ naira(wallet.summary?.balance_minor) }}</strong>
        </div>
        <div class="bw-kpi wallet-stat">
          <span class="bw-kpi-label">On hold</span>
          <strong class="bw-kpi-value wallet-stat-value">{{ naira(wallet.summary?.holds_minor) }}</strong>
        </div>
        <div class="bw-kpi featured wallet-stat">
          <span class="bw-kpi-label">Available</span>
          <strong class="bw-kpi-value wallet-stat-value brand">{{ naira(wallet.summary?.available_minor) }}</strong>
        </div>
        <div class="bw-kpi wallet-stat">
          <span class="bw-kpi-label">Status</span>
          <span :class="['bw-badge', wallet.summary?.status === 'active' ? 'success' : 'warn']">
            {{ wallet.summary?.status || '—' }}
          </span>
        </div>
      </div>

      <!-- Ledger -->
      <div class="bw-card flush bw-data-region" :data-view="viewMode">
        <div class="bw-table-head-bar">
          <div>
            <div class="bw-card-title">Ledger</div>
            <div class="bw-card-sub">{{ wallet.ledger.length }} entries</div>
          </div>
          <WalletDataViewSwitch v-model="viewMode" label="Ledger display view" />
        </div>

        <div v-if="wallet.error" class="bw-alert danger ledger-error">{{ wallet.error }}</div>

        <!-- Table view -->
        <div class="bw-t-wrap ledger-table-view">
          <table class="bw-table ledger-table">
            <caption>Wallet ledger entries</caption>
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Memo</th>
                <th>Reference</th>
                <th style="text-align:right">Amount</th>
                <th style="text-align:right">Balance</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              <WalletTableSkeleton v-if="wallet.loading && !wallet.ledger.length" :columns="7" />
              <tr v-for="e in wallet.ledger" :key="e.id">
                <td class="bw-mono bw-dim" style="font-size: var(--t-xs)">{{ new Date(e.created_at).toLocaleString('en-NG', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) }}</td>
                <td><span :class="['bw-badge', e.direction === 'credit' ? 'success' : 'neutral']">{{ e.entry_type.replace(/_/g, ' ') }}</span></td>
                <td class="bw-muted" style="max-width:220px; overflow:hidden; text-overflow:ellipsis">{{ displayMemo(e.memo) }}</td>
                <td class="bw-mono bw-dim">{{ e.reference_id ? '#' + e.reference_id.slice(0, 8) : '—' }}</td>
                <td class="bw-money" :style="{ textAlign:'right', color: e.direction === 'credit' ? 'var(--brand)' : 'var(--text)' }">
                  {{ e.direction === 'credit' ? '+' : '−' }}{{ naira(e.amount_minor) }}
                </td>
                <td class="bw-money" style="text-align:right">{{ naira(e.balance_after_minor) }}</td>
                <td>
                  <div class="ledger-receipt-actions">
                    <button type="button" class="bw-btn sm" @click="viewLedgerReceipt(e)">View</button>
                    <button type="button" class="bw-btn sm" @click="printLedgerReceipt(e)">Print</button>
                    <button type="button" class="bw-btn sm" @click="downloadLedgerReceipt(e)">Download</button>
                  </div>
                </td>
              </tr>
              <tr v-if="!wallet.ledger.length && !wallet.loading">
                <td colspan="7" class="bw-muted" style="text-align:center; padding: var(--s-6)">No entries yet.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Card view -->
        <div class="bw-t-cards ledger-card-view">
          <WalletTableSkeleton v-if="wallet.loading && !wallet.ledger.length" variant="cards" />
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
                <span class="bw-tc-pair-val bw-muted">{{ displayMemo(e.memo) }}</span>
              </div>
            </div>
            <div class="ledger-receipt-actions card-actions" aria-label="Ledger receipt actions">
              <button type="button" class="bw-btn sm" @click="viewLedgerReceipt(e)">View receipt</button>
              <button type="button" class="bw-btn sm" @click="printLedgerReceipt(e)">Print</button>
              <button type="button" class="bw-btn sm" @click="downloadLedgerReceipt(e)">Download</button>
            </div>
          </div>
          <div v-if="!wallet.ledger.length && !wallet.loading" class="bw-muted" style="text-align:center; padding: var(--s-6); font-size: var(--t-sm)">No entries yet.</div>
        </div>
      </div>

    </div>
  </AppShell>
</template>

<style scoped>
.wallet-stat-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.wallet-stat {
  min-height: 112px;
  padding: var(--s-4);
  justify-content: space-between;
}

.wallet-stat .bw-kpi-label {
  letter-spacing: 0;
}

.wallet-stat-value {
  min-width: 0;
  font-size: var(--t-2xl);
  letter-spacing: 0;
  overflow-wrap: anywhere;
}

.wallet-stat-value.brand {
  color: var(--brand);
}

.wallet-stat .bw-badge {
  align-self: flex-start;
  margin-top: auto;
}

.ledger-view-switch {
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
}

.ledger-view-button {
  min-height: 32px;
  padding: 0 var(--s-3);
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: var(--t-xs);
  font-weight: 800;
  cursor: pointer;
}

.ledger-view-button.active {
  background: color-mix(in srgb, var(--brand) 14%, var(--surface));
  color: var(--brand);
}

.ledger-view-button:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.ledger-table-view { display: block; }
.ledger-table { min-width: 980px; }
.ledger-table caption {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.ledger-card-view { display: block; }
.ledger-error { margin: var(--s-3) var(--s-4) 0; }
.ledger-receipt-actions { display: flex; gap: var(--s-2); white-space: nowrap; }
.ledger-receipt-actions.card-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  padding-top: var(--s-2);
  border-top: 1px dashed var(--border);
}
.ledger-receipt-actions.card-actions .bw-btn { justify-content: center; }

@media (max-width: 900px) {
  .wallet-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 480px) {
  .bw-table-head-bar { align-items: center; padding: var(--s-3); }
  .ledger-view-button { padding-inline: 10px; }
  .wallet-stat {
    min-height: 96px;
    padding: var(--s-3);
  }

  .wallet-stat-value {
    font-size: var(--t-lg);
  }
}
</style>
