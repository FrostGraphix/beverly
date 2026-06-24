<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { kwh, naira, shortDate } from '../lib/format';
import { printReceipt as printReceiptWindow, purchaseReceipt, viewReceipt as viewReceiptWindow } from '../lib/receipts';

interface Receipt {
    id: string;
    receipt_number: string;
    purchase_order_id?: string | null;
    reference?: string | null;
    meter_id: string | null;
    meter_type?: string | null;
    amount_minor: number | null;
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
const loadingDetail = ref(false);
const error = ref('');
const copied = ref('');
const search = ref('');

const filtered = computed(() => {
    const term = search.value.trim().toLowerCase();
    if (!term) return receipts.value;
    return receipts.value.filter((receipt) =>
        [receipt.receipt_number, receipt.meter_id, receipt.token, receipt.reference, receipt.purchase_order_id]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(term)),
    );
});

const total = computed(() => receipts.value.reduce((sum, receipt) => sum + (receipt.amount_minor ?? 0), 0));
const totalVat = computed(() => receipts.value.reduce((sum, receipt) => sum + Number(receipt.vat_amount_minor ?? 0), 0));

async function load() {
    loading.value = true;
    error.value = '';
    try {
        const response = await api.get<{ receipts: Receipt[] }>('/api/v1/customer/receipts');
        receipts.value = response.receipts ?? [];
    } catch (err: any) {
        error.value = err?.message ?? 'Failed to load receipts.';
    } finally {
        loading.value = false;
    }
}

async function openReceipt(receipt: Receipt) {
    const orderId = disputeOrderId(receipt);
    if (!orderId) {
        selected.value = receipt;
        return;
    }
    loadingDetail.value = true;
    try {
        selected.value = await api.get<Receipt>(`/api/v1/customer/receipts/${orderId}`);
    } catch {
        selected.value = receipt;
    } finally {
        loadingDetail.value = false;
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

function viewReceiptDoc(receipt: Receipt) {
    viewReceiptWindow(purchaseReceipt(receipt));
}

function printReceiptDoc(receipt: Receipt) {
    printReceiptWindow(purchaseReceipt(receipt));
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

function disputeOrderId(row: Receipt) {
    return row.purchase_order_id ?? row.reference ?? '';
}

onMounted(load);
</script>

<template>
  <AppShell>
    <section class="receipt-page">
      <header class="receipt-head">
        <div>
          <p class="page-kicker">Receipts</p>
          <h1>Token receipts</h1>
          <p>View, print, copy tokens, or raise support disputes.</p>
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
          <span>Total spent</span>
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
        <input v-model="search" class="bw-input" placeholder="Search receipt / meter / token" />
      </div>

      <div v-if="copied" class="receipt-notice">{{ copied }} copied.</div>
      <div v-if="error" class="receipt-error">{{ error }}</div>

      <div class="bw-card receipt-table-card">
        <div class="receipt-card-head">
          <strong>{{ filtered.length }} records</strong>
          <span>{{ loading ? 'Loading...' : 'Ready' }}</span>
        </div>

        <div class="receipt-mobile-list">
          <button v-for="receipt in filtered" :key="receipt.id" class="receipt-mobile-card" @click="openReceipt(receipt)">
            <span>
              <strong>{{ receipt.receipt_number }}</strong>
              <small>{{ shortDate(receipt.created_at) }} - {{ receipt.meter_id || 'Meter' }}</small>
            </span>
            <span class="bw-money">{{ naira(receipt.amount_minor) }}</span>
          </button>
          <div v-if="!filtered.length && !loading" class="receipt-empty">
            <strong>No receipts yet.</strong>
            <span>Completed token purchases will appear here.</span>
          </div>
          <div v-if="loading && !filtered.length" class="receipt-empty">
            <strong>Loading receipts...</strong>
            <span>Fetching your latest token records.</span>
          </div>
        </div>
      </div>
    </section>

    <div v-if="selected" class="receipt-modal-backdrop" @click.self="selected = null">
      <section class="receipt-modal" role="dialog" aria-modal="true">
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
          <div><dt>Meter</dt><dd class="bw-mono">{{ selected.meter_id || '-' }}</dd></div>
          <div><dt>Phase</dt><dd>{{ meterTypeLabel(selected.meter_type) }}</dd></div>
          <div><dt>Amount</dt><dd>{{ naira(selected.amount_minor) }}</dd></div>
          <div><dt>Energy value</dt><dd>{{ naira(selected.energy_amount_minor) }}</dd></div>
          <div><dt>VAT (7.5%)</dt><dd>{{ naira(selected.vat_amount_minor) }}</dd></div>
          <div><dt>Units</dt><dd>{{ kwh(selected.units_kwh) }}</dd></div>
          <div><dt>Date</dt><dd>{{ shortDate(selected.created_at) }}</dd></div>
          <div><dt>Order</dt><dd class="bw-mono">{{ disputeOrderId(selected) || '-' }}</dd></div>
        </dl>

        <footer>
          <button class="bw-btn" @click="copy(selected.receipt_number, 'Receipt reference')">Copy reference</button>
          <button class="bw-btn" @click="viewReceiptDoc(selected)">View</button>
          <button class="bw-btn primary" @click="printReceiptDoc(selected)">Print</button>
        </footer>

        <router-link
          class="bw-btn receipt-dispute-link"
          :to="`/disputes?new=1&order=${encodeURIComponent(disputeOrderId(selected))}`"
        >
          Raise dispute
        </router-link>

        <p v-if="loadingDetail" class="receipt-detail-loading">Refreshing receipt detail...</p>
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
.receipt-card-head span,
.receipt-mobile-card small {
    color: var(--text-2);
    font-size: var(--t-xs);
}
.receipt-mobile-list { display: block; }
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
.receipt-mobile-card small {
    display: block;
    margin-top: 3px;
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
.receipt-dispute-link {
    width: 100%;
    justify-content: center;
    margin-top: var(--s-3);
    text-decoration: none;
}
.receipt-detail-loading {
    color: var(--text-2);
    font-size: var(--t-xs);
    margin: var(--s-3) 0 0;
    text-align: center;
}
@media (max-width: 720px) {
    .receipt-head,
    .receipt-modal footer {
        display: grid;
    }
    .receipt-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
