<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { printReceipt, purchaseReceipt, viewReceipt } from '../lib/receipts';

const route  = useRoute();
const router = useRouter();

const loading = ref(true);
const error   = ref('');
const receipt = ref<any>(null);
const copied  = ref(false);

async function load() {
    loading.value = true;
    try {
        receipt.value = await api.get<any>(`/api/v1/customer/receipts/${route.params.id}`);
    } catch (e: any) {
        error.value = e.message ?? 'Failed to load receipt';
    } finally {
        loading.value = false;
    }
}

async function copyToken() {
    if (!receipt.value?.token) return;
    await navigator.clipboard.writeText(receipt.value.token);
    copied.value = true;
    setTimeout(() => copied.value = false, 2000);
}

async function resendSms() {
    try {
        await api.post(`/api/v1/customer/receipts/${route.params.id}/resend-sms`);
    } catch {}
}

function fmtAmount(minor: number) {
    return (minor / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });
}

function energyAmountMinor() {
    return Number(receipt.value?.energy_amount_minor ?? receipt.value?.amount_minor ?? 0);
}

function vatAmountMinor() {
    return Number(receipt.value?.vat_amount_minor ?? 0);
}

function vatRateLabel() {
    const percent = Number(receipt.value?.vat_rate_basis_points ?? 750) / 100;
    return Number.isInteger(percent) ? String(percent) : percent.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function fmtDate(s: string) {
    return s ? new Date(s).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function meterTypeLabel(type?: string | null) {
    if (type === 'three_phase') return 'Three Phase';
    if (type === 'single_phase') return 'Single Phase';
    return 'Unknown';
}

function disputeOrderId() {
    return receipt.value?.purchase_order_id ?? receipt.value?.reference ?? route.params.id;
}

function viewReceiptDoc() {
    if (receipt.value) viewReceipt(purchaseReceipt(receipt.value));
}

function printReceiptDoc() {
    if (receipt.value) printReceipt(purchaseReceipt(receipt.value));
}

onMounted(load);
</script>

<template>
  <AppShell title="Receipt" hideTabbar>
    <div class="rcpt-shell">
      <button class="rcpt-back" @click="router.back()">← Back</button>

      <div v-if="loading" class="bw-loading" style="padding: var(--s-12)">Loading receipt…</div>
      <div v-else-if="error" class="rcpt-error">{{ error }}</div>

      <template v-else-if="receipt">
        <div class="rcpt-card">
          <!-- Brand header -->
          <div class="rcpt-brand">
            <div class="bw-mark" style="width:40px;height:40px;font-size:18px">B</div>
            <div>
              <div class="rcpt-brand-name">Beverly Energy</div>
              <div class="rcpt-brand-sub">Official Receipt</div>
            </div>
          </div>

          <!-- Token highlight -->
          <div class="rcpt-token-block">
            <div class="rcpt-token-label">Your Token</div>
            <div class="rcpt-token">{{ receipt.token ?? '—' }}</div>
            <button class="rcpt-copy-btn" @click="copyToken">
              {{ copied ? '✓ Copied!' : 'Copy Token' }}
            </button>
          </div>

          <!-- Details -->
          <div class="rcpt-rows">
            <div class="rcpt-row"><span>Meter</span><span class="bw-mono">{{ receipt.meter_id }}</span></div>
            <div class="rcpt-row"><span>Phase</span><span>{{ meterTypeLabel(receipt.meter_type) }}</span></div>
            <div class="rcpt-row"><span>Amount paid</span><span>{{ fmtAmount(receipt.amount_minor) }}</span></div>
            <div class="rcpt-row"><span>Energy value</span><span>{{ fmtAmount(energyAmountMinor()) }}</span></div>
            <div class="rcpt-row"><span>VAT ({{ vatRateLabel() }}%)</span><span>{{ fmtAmount(vatAmountMinor()) }}</span></div>
            <div class="rcpt-row"><span>Units</span><span>{{ receipt.units_kwh?.toFixed(2) }} kWh</span></div>
            <div class="rcpt-row"><span>Tariff</span><span>{{ receipt.tariff_id }}</span></div>
            <div class="rcpt-row"><span>Reference</span><span class="bw-mono rcpt-ref">{{ receipt.reference }}</span></div>
            <div class="rcpt-row"><span>Date</span><span>{{ fmtDate(receipt.created_at) }}</span></div>
            <div class="rcpt-row"><span>Status</span>
              <span :class="receipt.status === 'completed' ? 'rcpt-badge-ok' : 'rcpt-badge-warn'">
                {{ receipt.status }}
              </span>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="rcpt-actions">
          <button class="rcpt-action-btn" @click="viewReceiptDoc">View Receipt</button>
          <button class="rcpt-action-btn" @click="printReceiptDoc">Print Receipt</button>
          <button class="rcpt-action-btn" @click="resendSms">Resend Token SMS</button>
          <router-link :to="`/disputes?new=1&order=${encodeURIComponent(disputeOrderId())}`" class="rcpt-action-btn">Raise Dispute</router-link>
          <a v-if="receipt.pdf_url" :href="receipt.pdf_url" download class="rcpt-action-btn">Download PDF</a>
        </div>
      </template>
    </div>
  </AppShell>
</template>

<style scoped>
.rcpt-shell { padding: var(--s-4); max-width: 440px; margin: 0 auto; }
.rcpt-back { background: none; border: none; color: var(--brand); font-size: var(--t-sm); font-weight: 600; cursor: pointer; padding: 0 0 var(--s-4); display: block; }
.rcpt-card { background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: var(--r-xl); overflow: hidden; margin-bottom: var(--s-4); backdrop-filter: blur(20px) saturate(160%); -webkit-backdrop-filter: blur(20px) saturate(160%); box-shadow: var(--glass-shine), var(--glass-shadow-card); }
.rcpt-brand { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-5); background: var(--glass-bg-strong); border-bottom: 1px solid var(--glass-border); }
.rcpt-brand-name { font-weight: 700; font-size: var(--t-md); }
.rcpt-brand-sub { font-size: var(--t-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.rcpt-token-block { padding: var(--s-6) var(--s-5); background: oklch(from var(--brand) l c h / 0.06); border-bottom: 1px solid var(--border); text-align: center; }
.rcpt-token-label { font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.10em; color: var(--text-muted); font-weight: 700; margin-bottom: var(--s-3); }
.rcpt-token { font-family: var(--font-mono); font-size: var(--t-2xl); font-weight: 700; letter-spacing: 0.12em; color: var(--text); margin-bottom: var(--s-4); word-break: break-all; }
.rcpt-copy-btn { padding: var(--s-2) var(--s-5); background: var(--brand); color: oklch(8% 0.04 145); border: none; border-radius: var(--r-lg); font-size: var(--t-sm); font-weight: 600; cursor: pointer; }
.rcpt-rows { padding: var(--s-2) 0; }
.rcpt-row { display: flex; justify-content: space-between; align-items: center; padding: var(--s-3) var(--s-5); border-bottom: 1px solid var(--border); font-size: var(--t-sm); }
.rcpt-row:last-child { border-bottom: none; }
.rcpt-row span:first-child { color: var(--text-muted); }
.rcpt-ref { font-size: var(--t-xs); }
.rcpt-badge-ok   { background: oklch(from var(--green) l c h / 0.15); color: var(--green); padding: 2px 8px; border-radius: var(--r-full); font-size: var(--t-xs); font-weight: 700; text-transform: uppercase; }
.rcpt-badge-warn { background: oklch(from var(--amber) l c h / 0.15); color: var(--amber); padding: 2px 8px; border-radius: var(--r-full); font-size: var(--t-xs); font-weight: 700; text-transform: uppercase; }
.rcpt-actions { display: flex; flex-direction: column; gap: var(--s-3); }
.rcpt-action-btn { width: 100%; padding: var(--s-3) var(--s-4); background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: var(--r-lg); font-size: var(--t-sm); font-weight: 600; cursor: pointer; text-align: center; text-decoration: none; color: var(--text); }
.rcpt-error { color: var(--red); padding: var(--s-8) var(--s-4); text-align: center; }
</style>
