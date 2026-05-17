<script setup lang="ts">
import { ref, computed } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { naira, kwh } from '../lib/format';

type Step = 'meter' | 'amount' | 'preview' | 'success';

const step = ref<Step>('meter');
const meterId = ref('');
const amountNaira = ref(2000);
const loading = ref(false);
const error = ref<string | null>(null);

interface MeterInfo { meterId: string; customerId: string; customerName: string; stationId: string; tariffId: string; }
interface Preview { amountMinor: number; units: number; effectivePricePerKwh: number; tariffId: string; }

const meter = ref<MeterInfo | null>(null);
const preview = ref<Preview | null>(null);
const result = ref<{ token: string | null; units: number; receiptId: string | null; purchaseOrder: any } | null>(null);

const amountMinor = computed(() => Math.max(0, Math.round(amountNaira.value * 100)));

async function lookupMeter() {
    if (!meterId.value.trim()) return;
    loading.value = true; error.value = null;
    try {
        const r = await api.post<{ meter: MeterInfo; preview: Preview }>('/api/v1/vendor/vend/preview', {
            meterId: meterId.value.trim(),
            amountMinor: 100000,
        });
        meter.value = r.meter;
        step.value = 'amount';
    } catch (e: any) {
        error.value = e?.message ?? 'Meter lookup failed';
    } finally {
        loading.value = false;
    }
}

async function loadPreview() {
    if (!meter.value) return;
    loading.value = true; error.value = null;
    try {
        const r = await api.post<{ meter: MeterInfo; preview: Preview }>('/api/v1/vendor/vend/preview', {
            meterId: meter.value.meterId,
            amountMinor: amountMinor.value,
        });
        preview.value = r.preview;
        step.value = 'preview';
    } catch (e: any) {
        error.value = e?.message ?? 'Preview failed';
    } finally {
        loading.value = false;
    }
}

async function confirm() {
    if (!meter.value || !preview.value) return;
    loading.value = true; error.value = null;
    try {
        const r = await api.post<{ token: string | null; units: number; receiptId: string | null; purchaseOrder: any }>(
            '/api/v1/vendor/vend',
            { meterId: meter.value.meterId, amountMinor: amountMinor.value, mode: 'wallet' },
        );
        result.value = r;
        step.value = 'success';
    } catch (e: any) {
        error.value = e?.message ?? 'Vending failed';
    } finally {
        loading.value = false;
    }
}

function reset() {
    step.value = 'meter';
    meterId.value = '';
    amountNaira.value = 2000;
    meter.value = null;
    preview.value = null;
    result.value = null;
    error.value = null;
}

async function copyToken() {
    if (!result.value?.token) return;
    try { await navigator.clipboard.writeText(result.value.token); } catch { /* noop */ }
}
</script>

<template>
  <AppShell title="Buy Token">
    <div style="max-width: 560px; margin: 0 auto">

      <!-- Step: meter lookup -->
      <div v-if="step === 'meter'" class="bw-card">
        <h1 class="bw-h1">Vend electricity</h1>
        <p class="bw-muted" style="margin: 0 0 var(--s-5)">Enter the customer's meter number to begin.</p>
        <label class="bw-label">Meter number</label>
        <input class="bw-input bw-mono" inputmode="numeric"
               v-model="meterId" @keyup.enter="lookupMeter"
               placeholder="44120…" autofocus />
        <p v-if="error" class="bw-alert danger" style="margin-top: var(--s-3)">{{ error }}</p>
        <button class="bw-btn primary" style="margin-top: var(--s-4); width: 100%; justify-content: center; height: 44px"
                @click="lookupMeter" :disabled="loading || !meterId.trim()">
          {{ loading ? 'Looking up…' : 'Continue' }}
        </button>
      </div>

      <!-- Step: amount -->
      <div v-else-if="step === 'amount'" class="bw-card">
        <button class="bw-btn sm" style="margin-bottom: var(--s-4)" @click="step = 'meter'">← Back</button>
        <p class="bw-label">Customer</p>
        <h2 class="bw-h2" style="margin: 0">{{ meter?.customerName }}</h2>
        <p class="bw-muted bw-mono" style="font-size: var(--t-sm); margin-top: 4px">
          {{ meter?.meterId }} · {{ meter?.stationId }} · {{ meter?.tariffId }}
        </p>

        <div style="margin-top: var(--s-5)">
          <label class="bw-label">Amount (₦)</label>
          <input class="bw-input bw-mono" type="number" min="100" step="100" v-model.number="amountNaira" style="font-size: var(--t-xl)" />
          <div class="bw-row" style="margin-top: var(--s-3); gap: var(--s-2); flex-wrap: wrap">
            <button v-for="n in [1000, 2000, 5000, 10000, 25000]" :key="n"
                    class="bw-btn sm" @click="amountNaira = n">₦{{ n.toLocaleString() }}</button>
          </div>
        </div>

        <p v-if="error" class="bw-alert danger" style="margin-top: var(--s-3)">{{ error }}</p>
        <button class="bw-btn primary" style="margin-top: var(--s-5); width: 100%; justify-content: center; height: 44px"
                @click="loadPreview" :disabled="loading || amountNaira < 100">
          {{ loading ? 'Calculating…' : 'Preview' }}
        </button>
      </div>

      <!-- Step: preview / confirm -->
      <div v-else-if="step === 'preview'" class="bw-card">
        <button class="bw-btn sm" style="margin-bottom: var(--s-4)" @click="step = 'amount'">← Back</button>
        <p class="bw-label">Confirm purchase</p>
        <h2 class="bw-h2 bw-mono" style="font-size: var(--t-3xl); margin: 0">{{ naira(preview?.amountMinor) }}</h2>
        <p class="bw-muted bw-mono">{{ kwh(preview?.units) }} @ ₦{{ preview?.effectivePricePerKwh.toFixed(2) }}/kWh</p>

        <div style="border-top: 1px solid var(--border); margin-top: var(--s-4); padding-top: var(--s-4); display: grid; gap: var(--s-2)">
          <div class="bw-row"><span class="bw-muted">Customer</span><span class="bw-spacer"></span><strong>{{ meter?.customerName }}</strong></div>
          <div class="bw-row"><span class="bw-muted">Meter</span><span class="bw-spacer"></span><span class="bw-mono">{{ meter?.meterId }}</span></div>
          <div class="bw-row"><span class="bw-muted">Station</span><span class="bw-spacer"></span><span>{{ meter?.stationId }}</span></div>
          <div class="bw-row"><span class="bw-muted">Tariff</span><span class="bw-spacer"></span><span>{{ meter?.tariffId }}</span></div>
        </div>

        <p v-if="error" class="bw-alert danger" style="margin-top: var(--s-3)">{{ error }}</p>
        <button class="bw-btn primary" style="margin-top: var(--s-5); width: 100%; justify-content: center; height: 44px"
                @click="confirm" :disabled="loading">
          {{ loading ? 'Generating token…' : `Confirm · ${naira(preview?.amountMinor)}` }}
        </button>
      </div>

      <!-- Step: success / receipt -->
      <div v-else-if="step === 'success'" class="bw-stack">
        <div class="bw-token-box">
          <p class="bw-label" style="color: var(--brand)">Token generated</p>
          <p class="bw-token-value">{{ result?.token }}</p>
          <p class="bw-muted bw-mono" style="font-size: var(--t-sm)">{{ kwh(result?.units) }} · {{ naira(preview?.amountMinor) }}</p>
          <button class="bw-btn" @click="copyToken" style="margin-top: var(--s-4)">Copy token</button>
        </div>
        <div class="bw-card">
          <div class="bw-row"><span class="bw-muted">Customer</span><span class="bw-spacer"></span><strong>{{ meter?.customerName }}</strong></div>
          <div class="bw-row" style="margin-top: var(--s-2)"><span class="bw-muted">Meter</span><span class="bw-spacer"></span><span class="bw-mono">{{ meter?.meterId }}</span></div>
          <div class="bw-row" style="margin-top: var(--s-2)"><span class="bw-muted">Order</span><span class="bw-spacer"></span><span class="bw-mono">#{{ String(result?.purchaseOrder?.id).slice(0, 8) }}</span></div>
        </div>
        <button class="bw-btn primary" style="justify-content: center; height: 44px" @click="reset">New vend</button>
      </div>
    </div>
  </AppShell>
</template>
