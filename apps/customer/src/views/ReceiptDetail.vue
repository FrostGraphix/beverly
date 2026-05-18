<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { useAuthStore } from '../stores/auth';

const route  = useRoute();
const router = useRouter();
const auth   = useAuthStore();
const API    = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

const loading = ref(true);
const error   = ref('');
const receipt = ref<any>(null);
const copied  = ref(false);

async function load() {
    loading.value = true;
    try {
        const res = await fetch(`${API}/api/v1/customer/receipts/${route.params.id}`, {
            headers: { Authorization: `Bearer ${auth.accessToken}` },
        });
        if (!res.ok) throw new Error('Receipt not found');
        receipt.value = await res.json();
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
        await fetch(`${API}/api/v1/customer/receipts/${route.params.id}/resend-sms`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${auth.accessToken}` },
        });
    } catch {}
}

function fmtAmount(minor: number) {
    return (minor / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });
}

function fmtDate(s: string) {
    return s ? new Date(s).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
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
            <div class="rcpt-row"><span>Amount</span><span>{{ fmtAmount(receipt.amount_minor) }}</span></div>
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
          <button class="rcpt-action-btn" @click="resendSms">Resend Token SMS</button>
          <a v-if="receipt.pdf_url" :href="receipt.pdf_url" download class="rcpt-action-btn">Download PDF</a>
        </div>
      </template>
    </div>
  </AppShell>
</template>

<style scoped>
.rcpt-shell { padding: var(--s-4); max-width: 440px; margin: 0 auto; }
.rcpt-back { background: none; border: none; color: var(--brand); font-size: var(--t-sm); font-weight: 600; cursor: pointer; padding: 0 0 var(--s-4); display: block; }
.rcpt-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-xl); overflow: hidden; margin-bottom: var(--s-4); }
.rcpt-brand { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-5); background: var(--bg); border-bottom: 1px solid var(--border); }
.rcpt-brand-name { font-weight: 700; font-size: var(--t-md); }
.rcpt-brand-sub { font-size: var(--t-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.rcpt-token-block { padding: var(--s-6) var(--s-5); background: oklch(from var(--brand) l c h / 0.06); border-bottom: 1px solid var(--border); text-align: center; }
.rcpt-token-label { font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.10em; color: var(--text-muted); font-weight: 700; margin-bottom: var(--s-3); }
.rcpt-token { font-family: var(--font-mono); font-size: var(--t-2xl); font-weight: 700; letter-spacing: 0.12em; color: var(--text); margin-bottom: var(--s-4); word-break: break-all; }
.rcpt-copy-btn { padding: var(--s-2) var(--s-5); background: var(--brand); color: white; border: none; border-radius: var(--r-lg); font-size: var(--t-sm); font-weight: 600; cursor: pointer; }
.rcpt-rows { padding: var(--s-2) 0; }
.rcpt-row { display: flex; justify-content: space-between; align-items: center; padding: var(--s-3) var(--s-5); border-bottom: 1px solid var(--border); font-size: var(--t-sm); }
.rcpt-row:last-child { border-bottom: none; }
.rcpt-row span:first-child { color: var(--text-muted); }
.rcpt-ref { font-size: var(--t-xs); }
.rcpt-badge-ok   { background: oklch(from var(--green) l c h / 0.15); color: var(--green); padding: 2px 8px; border-radius: var(--r-full); font-size: var(--t-xs); font-weight: 700; text-transform: uppercase; }
.rcpt-badge-warn { background: oklch(from var(--amber) l c h / 0.15); color: var(--amber); padding: 2px 8px; border-radius: var(--r-full); font-size: var(--t-xs); font-weight: 700; text-transform: uppercase; }
.rcpt-actions { display: flex; flex-direction: column; gap: var(--s-3); }
.rcpt-action-btn { width: 100%; padding: var(--s-3) var(--s-4); background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); font-size: var(--t-sm); font-weight: 600; cursor: pointer; text-align: center; text-decoration: none; color: var(--text); }
.rcpt-error { color: var(--red); padding: var(--s-8) var(--s-4); text-align: center; }
</style>
