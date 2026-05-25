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
    protocolVersion?: string | null;
    isThreePhase?: boolean | null;
    liveVerified?: boolean;
    resolutionSource?: string;
}
interface Preview { amountMinor: number; units: number; effectivePricePerKwh: number; tariffId: string; }

const meter = ref<MeterInfo | null>(null);
const preview = ref<Preview | null>(null);
const result = ref<{ remoteTaskId: string | null; units: number; purchaseOrder: any } | null>(null);

const amountMinor = computed(() => Math.max(0, Math.round(amountNaira.value * 100)));
// Remote send writes a token straight to the physical meter — never allow it
// for meters that are only resolvable from archived/read-only metadata.
const canDispatch = computed(() => meter.value?.liveVerified !== false);

function meterTypeLabel(isThreePhase?: boolean | null) {
    return isThreePhase ? 'Three Phase' : 'Single Phase';
}

function describeApiError(e: unknown, fallback: string) {
    if (e instanceof ApiError) {
        if (e.code === 'meter_lookup_unavailable' || e.status === 503) {
            return {
                title: 'Live lookup unavailable',
                message: e.message,
                action: 'No wallet debit or dispatch was attempted. Retry shortly, or ask an admin to bind this meter first.',
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
        if (e.code === 'remote_token_rejected') {
            return {
                title: 'Meter rejected the token',
                message: e.message,
                action: 'Verify the meter phase and key data (SGC/KRN/TI/KT) match this meter, then retry.',
                code: e.code,
            };
        }
        return {
            title: 'Dispatch failed',
            message: e.message,
            action: 'No token was delivered. Please retry or contact support if this repeats.',
            code: e.code,
        };
    }
    return { title: 'Dispatch failed', message: fallback };
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

function confirm() {
    if (!meter.value || !preview.value) return;
    if (!canDispatch.value) {
        error.value = {
            title: 'Remote send blocked for safety',
            message: 'This meter must be live-verified or locally bound before a token can be dispatched to it.',
            action: 'No wallet debit or dispatch was attempted.',
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
        const r = await api.post<{ remoteTaskId: string | null; units: number; purchaseOrder: any }>(
            '/api/v1/vendor/vend',
            {
                meterId: meter.value.meterId,
                amountMinor: amountMinor.value,
                mode: 'remote_send',
                authorization: authorization.value,
            },
        );
        result.value = r;
        authorization.value = '';
        authOpen.value = false;
        step.value = 'success';
    } catch (e: any) {
        error.value = describeApiError(e, e?.message ?? 'Remote send failed');
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
</script>

<template>
  <AppShell title="Remote Send">
    <div style="max-width: 560px; margin: 0 auto">

      <!-- Step: meter lookup -->
      <div v-if="step === 'meter'" class="bw-card">
        <h1 class="bw-h1">Remote send</h1>
        <p class="bw-muted" style="margin: 0 0 var(--s-5)">
          The token is generated for the meter's phase and delivered straight to the meter — no display, no copy.
        </p>
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

        <span :class="['bw-badge', meter?.isThreePhase ? 'info' : 'neutral']" style="margin-top: var(--s-2)">
          {{ meterTypeLabel(meter?.isThreePhase) }}
        </span>

        <div v-if="!canDispatch" class="bw-alert" style="margin-top: var(--s-3); display: grid; gap: 6px">
          <strong>Preview-only meter metadata</strong>
          <span>This meter was resolved from archived read-only records, not the live account catalog. Bind or confirm it live before dispatching a token.</span>
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
        </div>
        <button class="bw-btn primary" style="margin-top: var(--s-5); width: 100%; justify-content: center; height: 44px"
                @click="loadPreview" :disabled="loading || amountNaira < 100">
          {{ loading ? 'Calculating…' : 'Preview' }}
        </button>
      </div>

      <!-- Step: preview / confirm -->
      <div v-else-if="step === 'preview'" class="bw-card">
        <button class="bw-btn sm" style="margin-bottom: var(--s-4)" @click="step = 'amount'">← Back</button>
        <p class="bw-label">Confirm remote send</p>
        <h2 class="bw-h2 bw-mono" style="font-size: var(--t-3xl); margin: 0">{{ naira(preview?.amountMinor) }}</h2>
        <p class="bw-muted bw-mono">{{ kwh(preview?.units) }} @ ₦{{ preview?.effectivePricePerKwh.toFixed(2) }}/kWh</p>

        <div style="border-top: 1px solid var(--border); margin-top: var(--s-4); padding-top: var(--s-4); display: grid; gap: var(--s-2)">
          <div class="bw-row"><span class="bw-muted">Customer</span><span class="bw-spacer"></span><strong>{{ meter?.customerName }}</strong></div>
          <div class="bw-row"><span class="bw-muted">Meter</span><span class="bw-spacer"></span><span class="bw-mono">{{ meter?.meterId }}</span></div>
          <div class="bw-row"><span class="bw-muted">Phase</span><span class="bw-spacer"></span><span>{{ meterTypeLabel(meter?.isThreePhase) }}</span></div>
          <div class="bw-row"><span class="bw-muted">Station</span><span class="bw-spacer"></span><span>{{ meter?.stationId }}</span></div>
          <div class="bw-row"><span class="bw-muted">Tariff</span><span class="bw-spacer"></span><span>{{ meter?.tariffId }}</span></div>
          <div class="bw-row"><span class="bw-muted">Delivery</span><span class="bw-spacer"></span><span>Direct to meter</span></div>
        </div>

        <div class="bw-alert" style="margin-top: var(--s-3); display: grid; gap: 4px">
          <strong>Token goes straight to the meter</strong>
          <span>It is not shown or copyable. Confirm the meter and phase are correct before dispatching.</span>
        </div>
        <div v-if="!canDispatch" class="bw-alert danger" style="margin-top: var(--s-3); display: grid; gap: 6px">
          <strong>Remote send blocked for safety</strong>
          <span>This preview is allowed, but dispatch is blocked until the meter is live-verified or locally bound.</span>
        </div>

        <div v-if="error" class="bw-alert danger" style="margin-top: var(--s-3); display: grid; gap: 6px">
          <strong>{{ error.title }}</strong>
          <span>{{ error.message }}</span>
          <small v-if="error.action" class="bw-muted">{{ error.action }}</small>
          <small v-if="error.code" class="bw-mono">Code: {{ error.code }}</small>
        </div>
        <button class="bw-btn primary" style="margin-top: var(--s-5); width: 100%; justify-content: center; height: 44px"
                @click="confirm" :disabled="loading || !canDispatch">
          {{ loading ? 'Dispatching…' : `Dispatch — ${naira(preview?.amountMinor)}` }}
        </button>
      </div>

      <!-- Step: success -->
      <div v-else-if="step === 'success'" class="bw-stack">
        <div class="bw-token-box">
          <p class="bw-label" style="color: var(--brand)">Dispatched</p>
          <h1 class="bw-h1" style="margin: var(--s-2) 0">Token sent to meter</h1>
          <p class="bw-muted bw-mono" style="font-size: var(--t-sm)">
            Task #{{ String(result?.remoteTaskId ?? '').slice(0, 12) }}
          </p>
          <p class="bw-muted bw-mono" style="font-size: var(--t-sm)">{{ kwh(result?.units) }} · {{ naira(preview?.amountMinor) }}</p>
        </div>
        <div class="bw-card">
          <div class="bw-row"><span class="bw-muted">Customer</span><span class="bw-spacer"></span><strong>{{ meter?.customerName }}</strong></div>
          <div class="bw-row" style="margin-top: var(--s-2)"><span class="bw-muted">Meter</span><span class="bw-spacer"></span><span class="bw-mono">{{ meter?.meterId }}</span></div>
          <div class="bw-row" style="margin-top: var(--s-2)"><span class="bw-muted">Phase</span><span class="bw-spacer"></span><span>{{ meterTypeLabel(meter?.isThreePhase) }}</span></div>
          <div class="bw-row" style="margin-top: var(--s-2)"><span class="bw-muted">Order</span><span class="bw-spacer"></span><span class="bw-mono">#{{ String(result?.purchaseOrder?.id ?? '').slice(0, 8) }}</span></div>
          <p class="bw-muted" style="font-size: var(--t-sm); margin-top: var(--s-3)">
            Delivery is confirmed asynchronously — track final status in Transactions.
          </p>
        </div>
        <button class="bw-btn primary" style="justify-content: center; height: 44px" @click="reset">New send</button>
      </div>
    </div>

    <ConfirmDialog
      v-model:open="authOpen"
      title="Authorize remote send"
      description="Enter your vendor PIN or password before dispatching a token to the meter."
      confirm-label="Dispatch token"
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
        This protects remote token dispatch and confirms the wallet debit.
      </p>
    </ConfirmDialog>
  </AppShell>
</template>
