<script setup lang="ts">
import { ref, computed } from 'vue';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import { api, ApiError } from '../lib/api';
import { naira, kwh } from '../lib/format';

type Step = 'meter' | 'amount' | 'preview' | 'success';

const step = ref<Step>('meter');
const meterId = ref('');
const amountNaira = ref(2000);
const loading = ref(false);
const error = ref<{ title: string; message: string; action?: string; code?: string } | null>(null);
const authOpen = ref(false);
const authorization = ref('');

interface MeterInfo {
    meterId: string;
    customerId: string;
    customerName: string;
    stationId: string;
    tariffId: string;
    liveVerified?: boolean;
    resolutionSource?: string;
}
interface Preview { amountMinor: number; units: number; effectivePricePerKwh: number; tariffId: string; }

const meter = ref<MeterInfo | null>(null);
const preview = ref<Preview | null>(null);
const result = ref<{ token: string | null; units: number; receiptId: string | null; purchaseOrder: any } | null>(null);

const amountMinor = computed(() => Math.max(0, Math.round(amountNaira.value * 100)));
const canVend = computed(() => meter.value?.liveVerified !== false);
const confirmLabel = computed(() => {
    if (loading.value) return 'Generating token...';
    if (!canVend.value) return 'Bind meter before vend';
    return `Confirm - ${naira(preview.value?.amountMinor)}`;
});

function describeApiError(e: unknown, fallback: string) {
    if (e instanceof ApiError) {
        if (e.code === 'meter_lookup_unavailable' || e.status === 503) {
            return {
                title: 'Live lookup unavailable',
                message: e.message,
                action: 'No wallet debit or vend was attempted. Retry shortly, or ask an admin to bind this meter before selling.',
                code: e.code,
            };
        }
        if (e.code === 'meter_not_found' || e.status === 404) {
            return {
                title: 'Meter not in catalog',
                message: e.message,
                action: 'Confirm the meter number, then bind the customer meter in admin if it is a valid live meter.',
                code: e.code,
            };
        }
        return {
            title: 'Request failed',
            message: e.message,
            action: 'No vend was attempted. Please retry or contact support if this repeats.',
            code: e.code,
        };
    }
    return { title: 'Request failed', message: fallback };
}

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
        error.value = describeApiError(e, e?.message ?? 'Meter lookup failed');
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
        error.value = describeApiError(e, e?.message ?? 'Preview failed');
    } finally {
        loading.value = false;
    }
}

async function confirm() {
    if (!meter.value || !preview.value) return;
    if (!canVend.value) {
        error.value = {
            title: 'Live vend blocked for safety',
            message: 'This meter must be live-verified or locally bound before token generation.',
            action: 'No wallet debit or vend was attempted.',
            code: 'meter_requires_live_binding',
        };
        return;
    }
    authOpen.value = true;
}

async function submitAuthorization() {
    if (!meter.value || !preview.value || !authorization.value) return;
    loading.value = true; error.value = null;
    try {
        const r = await api.post<{ token: string | null; units: number; receiptId: string | null; purchaseOrder: any }>(
            '/api/v1/vendor/vend',
            {
                meterId: meter.value.meterId,
                amountMinor: amountMinor.value,
                mode: 'wallet',
                authorization: authorization.value,
            },
        );
        result.value = r;
        authorization.value = '';
        authOpen.value = false;
        step.value = 'success';
    } catch (e: any) {
        error.value = describeApiError(e, e?.message ?? 'Vending failed');
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
        <div v-if="error" class="bw-alert danger" style="margin-top: var(--s-3); display: grid; gap: 6px">
          <strong>{{ error.title }}</strong>
          <span>{{ error.message }}</span>
          <small v-if="error.action" class="bw-muted">{{ error.action }}</small>
          <small v-if="error.code" class="bw-mono">Code: {{ error.code }}</small>
        </div>
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

        <div v-if="!canVend" class="bw-alert" style="margin-top: var(--s-3); display: grid; gap: 6px">
          <strong>Preview-only meter metadata</strong>
          <span>This meter was resolved from archived read-only records, not the live account catalog. Bind or confirm it live before taking payment.</span>
          <small v-if="meter?.resolutionSource" class="bw-mono">Source: {{ meter.resolutionSource }}</small>
        </div>

        <div style="margin-top: var(--s-5)">
          <label class="bw-label">Amount (₦)</label>
          <input class="bw-input bw-mono" type="number" min="100" step="100" v-model.number="amountNaira" style="font-size: var(--t-xl)" />
          <div class="bw-row" style="margin-top: var(--s-3); gap: var(--s-2); flex-wrap: wrap">
            <button v-for="n in [1000, 2000, 5000, 10000, 25000]" :key="n"
                    class="bw-btn sm" @click="amountNaira = n">₦{{ n.toLocaleString() }}</button>
          </div>
        </div>

        <div v-if="error" class="bw-alert danger" style="margin-top: var(--s-3); display: grid; gap: 6px">
          <strong>{{ error.title }}</strong>
          <span>{{ error.message }}</span>
          <small v-if="error.action" class="bw-muted">{{ error.action }}</small>
          <small v-if="error.code" class="bw-mono">Code: {{ error.code }}</small>
        </div>
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
        <div v-if="!canVend" class="bw-alert" style="margin-top: var(--s-3); display: grid; gap: 6px">
          <strong>Live vend blocked for safety</strong>
          <span>This preview is allowed, but token generation is blocked until the meter is live-verified or locally bound.</span>
        </div>

        <div v-if="error" class="bw-alert danger" style="margin-top: var(--s-3); display: grid; gap: 6px">
          <strong>{{ error.title }}</strong>
          <span>{{ error.message }}</span>
          <small v-if="error.action" class="bw-muted">{{ error.action }}</small>
          <small v-if="error.code" class="bw-mono">Code: {{ error.code }}</small>
        </div>
        <button class="bw-btn primary" style="margin-top: var(--s-5); width: 100%; justify-content: center; height: 44px"
                @click="confirm" :disabled="loading || !canVend">
          {{ confirmLabel }}
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

    <ConfirmDialog
      v-model:open="authOpen"
      title="Authorize credit token"
      description="Enter your vendor PIN or password. Beverly never shows the energy authorization password."
      confirm-label="Generate token"
      tone="warn"
      :loading="loading"
      :disable-confirm="!authorization"
      @confirm="submitAuthorization"
    >
      <label class="bw-label">Vendor authorization</label>
      <input
        class="bw-input bw-mono cd-input-target"
        v-model="authorization"
        type="password"
        autocomplete="off"
        placeholder="PIN or password"
      />
      <p class="bw-muted" style="font-size: var(--t-xs); margin-top: var(--s-2)">
        This confirms the wallet debit.
      </p>
    </ConfirmDialog>
  </AppShell>
</template>
