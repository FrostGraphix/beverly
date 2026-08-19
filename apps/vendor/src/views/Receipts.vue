<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import WalletTablePagination from '@beverly/tokens/WalletTablePagination.vue';
import WalletTableSkeleton from '@beverly/tokens/WalletTableSkeleton.vue';
import WalletRowActions from '@beverly/tokens/WalletRowActions.vue';
import type { ActionItem } from '@beverly/tokens/WalletRowActions.vue';
import { api } from '../lib/api';
import { naira, kwh, shortDate } from '../lib/format';
import { downloadReceipt, printReceipt as printReceiptWindow, purchaseReceipt, viewReceipt as viewReceiptWindow } from '../lib/receipts';

interface Receipt {
  id: string;
  receipt_number: string;
  purchase_order_id: string;
  customer_name: string | null;
  customer_phone?: string | null;
  meter_id: string;
  meter_type?: string | null;
  amount_minor: number;
  energy_amount_minor?: number | null;
  vat_amount_minor?: number | null;
  vat_rate_basis_points?: number | null;
  units_kwh: number | null;
  token: string | null;
  status: string;
  created_at: string;
}

const receipts = ref<Receipt[]>([]);
const selected = ref<Receipt | null>(null);
const loading = ref(false);
const error = ref('');
const copied = ref('');
const search = ref('');
const currentPage = ref(1);
const pageSize = ref(10);

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) return receipts.value;
  return receipts.value.filter((r) =>
    [r.receipt_number, r.customer_name, r.customer_phone, r.meter_id, r.token]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term)),
  );
});

const paginatedReceipts = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filtered.value.slice(start, start + pageSize.value);
});

const total = computed(() => receipts.value.reduce((sum, r) => sum + r.amount_minor, 0));
const totalVat = computed(() => receipts.value.reduce((sum, r) => sum + Number(r.vat_amount_minor ?? 0), 0));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get<{ receipts: Receipt[] }>('/api/v1/vendor/receipts?limit=300');
    receipts.value = r.receipts ?? [];
  } catch (e: any) {
    error.value = e.message ?? 'Failed to load receipts.';
  } finally {
    loading.value = false;
  }
}

async function copy(text: string | null | undefined, label: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copied.value = label;
    setTimeout(() => { copied.value = ''; }, 1800);
  } catch {
    copied.value = '';
  }
}

function openReceipt(receipt: Receipt) {
  selected.value = receipt;
}

function viewReceiptDoc(receipt: Receipt) {
  viewReceiptWindow(purchaseReceipt(receipt));
}

function printReceiptDoc(receipt: Receipt) {
  printReceiptWindow(purchaseReceipt(receipt));
}

function downloadReceiptDoc(receipt: Receipt) {
  downloadReceipt(purchaseReceipt(receipt));
}

function meterTypeLabel(type?: string | null) {
  if (type === 'three_phase') return 'Three Phase';
  if (type === 'single_phase') return 'Single Phase';
  return 'Unknown';
}

function tokenPreview(token: string | null) {
  if (!token) return '-';
  if (token.length <= 16) return token;
  return `${token.slice(0, 8)} ${token.slice(8, 16)}...`;
}

function buildReceiptRowActions(r: Receipt): ActionItem[] {
  const actions: ActionItem[] = [
    { label: 'View Receipt', icon: 'view', action: () => viewReceiptDoc(r) },
    { label: 'Details', icon: 'details', action: () => openReceipt(r) },
    { label: 'Print Receipt', icon: 'print', action: () => printReceiptDoc(r) },
    { label: 'Download PDF', icon: 'download', action: () => downloadReceiptDoc(r) },
  ];
  if (r.token) {
    actions.push({ label: 'Copy Token', icon: 'copy', action: () => copy(r.token, 'Token') });
  }
  return actions;
}

onMounted(load);
</script>

<template>
  <AppShell title="Receipts">
    <section class="receipt-page">
      <header class="receipt-head">
        <div>
          <p class="page-kicker">Receipts</p>
          <h1>Vending receipts</h1>
          <p>Reprint, copy tokens, and support customers quickly.</p>
        </div>
        <button class="bw-btn sm" :disabled="loading" @click="load">
          {{ loading ? 'Refreshing...' : 'Refresh' }}
        </button>
      </header>

      <div class="receipt-stats">
        <article>
          <span>Receipts</span>
          <strong>{{ receipts.length }}</strong>
        </article>
        <article>
          <span>Total sold</span>
          <strong>{{ naira(total) }}</strong>
        </article>
        <article>
          <span>VAT</span>
          <strong>{{ naira(totalVat) }}</strong>
        </article>
        <article>
          <span>Visible</span>
          <strong>{{ filtered.length }}</strong>
        </article>
      </div>

      <div class="receipt-toolbar">
        <input v-model="search" class="bw-input" placeholder="Search customer / meter / token" />
      </div>

      <div v-if="copied" class="receipt-notice">{{ copied }} copied.</div>
      <div v-if="error" class="receipt-error">{{ error }}</div>

      <div class="bw-card flush receipt-table-card">
        <div class="bw-table-head-bar">
          <div class="bw-table-heading">
            <div class="bw-table-title-row">
              <div class="bw-card-title">Token receipts</div>
              <span v-if="loading" class="bw-skeleton bw-table-count" aria-hidden="true"></span>
              <span v-else class="bw-table-count">{{ filtered.length }}</span>
            </div>
            <div class="bw-card-sub">Vendor vending tokens, receipts, and customer details</div>
          </div>
          <div class="bw-table-actions">
            <input v-model="search" class="bw-input" placeholder="Search customer / meter / token…" style="width: 240px" />
            <button class="bw-btn sm" :disabled="loading" @click="load">
              {{ loading ? 'Refreshing...' : 'Refresh' }}
            </button>
          </div>
        </div>

        <!-- Desktop table -->
        <div class="bw-t-wrap">
          <table class="bw-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Customer</th>
                <th>Meter</th>
                <th style="text-align:right">Paid</th>
                <th style="text-align:right">Units</th>
                <th>Token</th>
                <th class="action-column bw-align-center" style="text-align:center">Actions</th>
              </tr>
            </thead>
            <tbody>
              <WalletTableSkeleton v-if="loading && !filtered.length" :columns="7" />
              <tr v-for="r in paginatedReceipts" :key="r.id">
                <td class="bw-mono bw-muted">{{ shortDate(r.created_at) }}</td>
                <td>
                  <strong>{{ r.customer_name || 'Customer' }}</strong>
                  <small v-if="r.customer_phone">{{ r.customer_phone }}</small>
                </td>
                <td>
                  <span class="bw-mono">{{ r.meter_id }}</span>
                  <small>{{ meterTypeLabel(r.meter_type) }}</small>
                </td>
                <td class="bw-money" style="text-align:right">{{ naira(r.amount_minor) }}</td>
                <td class="bw-mono" style="text-align:right">{{ kwh(r.units_kwh) }}</td>
                <td class="bw-mono token-cell">{{ tokenPreview(r.token) }}</td>
                <td class="actions-cell action-column bw-align-center" style="text-align:center">
                  <WalletRowActions
                    :items="buildReceiptRowActions(r)"
                    label="Receipt actions"
                    align="center"
                  />
                </td>
              </tr>
              <tr v-if="!filtered.length && !loading">
                <td colspan="7" class="receipt-empty">
                  <strong>No receipts yet.</strong>
                  <span>Delivered vending receipts will appear here.</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="bw-t-cards receipt-mobile-list">
          <WalletTableSkeleton v-if="loading && !filtered.length" variant="cards" />
          <button v-for="r in paginatedReceipts" :key="r.id" class="receipt-mobile-card" @click="openReceipt(r)">
            <span>
              <strong>{{ r.customer_name || 'Customer' }}</strong>
              <small>{{ shortDate(r.created_at) }} - {{ r.meter_id }}</small>
            </span>
            <span class="bw-money">{{ naira(r.amount_minor) }}</span>
          </button>
          <div v-if="!filtered.length && !loading" class="receipt-empty">
            <strong>No receipts yet.</strong>
            <span>Delivered vending receipts will appear here.</span>
          </div>
        </div>

        <WalletTablePagination
          v-model:page="currentPage"
          v-model:pageSize="pageSize"
          :total-items="filtered.length"
          item-label="receipts"
        />
      </div>
    </section>

    <div v-if="selected" class="receipt-modal-backdrop" @click.self="selected = null">
      <section class="receipt-modal" role="dialog" aria-modal="true" aria-label="Receipt details">
        <header>
          <div>
            <p class="page-kicker">Official receipt</p>
            <h2>{{ selected.receipt_number }}</h2>
          </div>
          <button class="bw-btn sm" @click="selected = null">Close</button>
        </header>

        <div class="receipt-token">
          <span>Token</span>
          <strong>{{ selected.token || '-' }}</strong>
          <button class="bw-btn sm" @click="copy(selected.token, 'Token')">Copy token</button>
        </div>

        <dl>
          <div><dt>Customer</dt><dd>{{ selected.customer_name || 'Customer' }}</dd></div>
          <div><dt>Meter</dt><dd class="bw-mono">{{ selected.meter_id }}</dd></div>
          <div><dt>Phase</dt><dd>{{ meterTypeLabel(selected.meter_type) }}</dd></div>
          <div><dt>Amount</dt><dd>{{ naira(selected.amount_minor) }}</dd></div>
          <div><dt>Energy value</dt><dd>{{ naira(selected.energy_amount_minor) }}</dd></div>
          <div><dt>VAT ({{ Number(selected.vat_rate_basis_points ?? 0) / 100 }}%)</dt><dd>{{ naira(selected.vat_amount_minor) }}</dd></div>
          <div><dt>Units</dt><dd>{{ kwh(selected.units_kwh) }}</dd></div>
          <div><dt>Date</dt><dd>{{ shortDate(selected.created_at) }}</dd></div>
          <div><dt>Order</dt><dd class="bw-mono">{{ selected.purchase_order_id }}</dd></div>
        </dl>

        <footer>
          <button class="bw-btn" @click="copy(selected.receipt_number, 'Receipt reference')">Copy reference</button>
          <button class="bw-btn" @click="viewReceiptDoc(selected)">View</button>
          <button class="bw-btn" @click="downloadReceiptDoc(selected)">Download</button>
          <button class="bw-btn primary" @click="printReceiptDoc(selected)">Print</button>
        </footer>
      </section>
    </div>
  </AppShell>
</template>

<style scoped>
.receipt-page { display: grid; gap: var(--s-4); }
.receipt-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--s-3);
}
.page-kicker {
  margin: 0 0 4px;
  color: var(--brand);
  font-size: var(--t-2xs);
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.receipt-head h1 {
  margin: 0;
  font-size: var(--t-2xl);
}
.receipt-head p:last-child {
  margin: 5px 0 0;
  color: var(--text-2);
  font-size: var(--t-sm);
}
.receipt-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--s-3);
}
.receipt-stats article {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--r-xl);
  padding: var(--s-4);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
}
.receipt-stats span {
  display: block;
  color: var(--text-2);
  font-size: var(--t-2xs);
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.receipt-stats strong {
  display: block;
  margin-top: 6px;
  font-size: var(--t-xl);
}
.receipt-toolbar {
  background: var(--glass-bg-strong);
  border: 1px solid var(--glass-border);
  border-radius: var(--r-xl);
  padding: var(--s-3);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
}
.receipt-notice,
.receipt-error {
  padding: var(--s-3);
  border-radius: var(--r-lg);
  font-size: var(--t-sm);
  font-weight: 700;
}
.receipt-notice {
  background: color-mix(in srgb, var(--brand) 12%, transparent);
  color: var(--brand);
}
.receipt-error {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
}
.receipt-table-card { padding: 0; overflow: hidden; }
.receipt-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--s-4);
  border-bottom: 1px solid var(--border);
}
.receipt-card-head span {
  color: var(--text-2);
  font-size: var(--t-xs);
}
.receipt-table-wrap small,
.receipt-mobile-card small {
  display: block;
  margin-top: 3px;
  color: var(--text-2);
  font-size: var(--t-xs);
}
.token-cell {
  max-width: 140px;
  white-space: nowrap;
}
.actions-cell {
  display: flex;
  gap: var(--s-2);
}
.receipt-empty {
  text-align: center;
  padding: var(--s-7);
  color: var(--text-2);
}
.receipt-empty strong {
  display: block;
  color: var(--text);
  margin-bottom: 5px;
}
.receipt-mobile-list { display: none; }
.receipt-mobile-card {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  display: flex;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-4);
  text-align: left;
}
.receipt-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal, 1000);
  display: grid;
  place-items: center;
  padding: var(--s-4);
  background: oklch(0% 0 0 / .45);
  backdrop-filter: blur(10px);
}
.receipt-modal {
  width: min(520px, 100%);
  max-height: calc(100dvh - 48px);
  overflow-y: auto;
  background: var(--glass-bg-strong);
  border: 1px solid var(--glass-border-strong);
  backdrop-filter: blur(36px) saturate(200%);
  -webkit-backdrop-filter: blur(36px) saturate(200%);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-4);
  padding: var(--s-5);
}
.receipt-modal header,
.receipt-modal footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
}
.receipt-modal footer { flex-wrap: wrap; }
.receipt-modal h2 {
  margin: 0;
}
.receipt-token {
  display: grid;
  gap: var(--s-2);
  margin: var(--s-5) 0;
  padding: var(--s-4);
  border: 1px solid color-mix(in srgb, var(--brand) 30%, transparent);
  border-radius: var(--r-lg);
  background: color-mix(in srgb, var(--brand) 9%, var(--surface-2));
  text-align: center;
}
.receipt-token span {
  color: var(--text-2);
  font-size: var(--t-2xs);
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.receipt-token strong {
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--t-xl);
  word-break: break-all;
}
.receipt-modal dl {
  display: grid;
  gap: 0;
  margin: 0 0 var(--s-5);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  overflow: hidden;
}
.receipt-modal dl div {
  display: flex;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-3);
  border-bottom: 1px solid var(--border);
}
.receipt-modal dl div:last-child { border-bottom: 0; }
.receipt-modal dt {
  color: var(--text-2);
}
.receipt-modal dd {
  margin: 0;
  font-weight: 700;
  text-align: right;
}
@media (max-width: 720px) {
  .receipt-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .receipt-table-wrap { display: none; }
  .receipt-mobile-list { display: block; }
}
</style>
