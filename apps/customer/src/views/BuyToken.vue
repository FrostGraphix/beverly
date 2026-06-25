<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { naira, kwh } from '../lib/format';
import { useAuthStore } from '../stores/auth';

const auth    = useAuthStore();
const step    = ref<1 | 2 | 3 | 4>(1);

// Step 1 — meter
const meters    = ref<any[]>([]);
const selMeter  = ref<any>(null);

// Step 2 — amount
const amountRaw  = ref('');
const quickAmts  = [500_00, 1000_00, 2000_00, 5000_00, 10000_00, 20000_00];
const amountMinor = computed(() => Math.round(parseFloat(amountRaw.value || '0') * 100));

// Step 3 — preview
const preview  = ref<any>(null);
const mode     = ref<'wallet' | 'direct_pay'>('wallet');
const walletBal = ref(0);
const loadingPreview = ref(false);

// Step 4 — result
const result   = ref<any>(null);
const loading  = ref(false);
const error    = ref<string | null>(null);
const copied   = ref(false);

// Step-up auth
const stepUpRequired  = ref(false);
const stepUpChallengeId = ref('');
const stepUpExpiry    = ref('');
const stepUpOtp       = ref('');
const stepUpLoading   = ref(false);
const stepUpError     = ref<string | null>(null);
// Keep purchase params so we can resubmit after OTP
let pendingPurchaseParams: { meter_id: string; amount_minor: number; mode: 'wallet' | 'direct_pay'; idempotency_key: string } | null = null;

onMounted(async () => {
    const [m, w] = await Promise.all([
        api.get<{ meters: any[] }>('/api/v1/customer/meters'),
        api.get<any>('/api/v1/customer/wallet').catch(() => null),
    ]);
    meters.value = m.meters;
    walletBal.value = w?.available_minor ?? 0;
    if (meters.value.length === 1) selMeter.value = meters.value[0];
});

function setQuick(amt: number) {
    amountRaw.value = (amt / 100).toString();
}

async function goToPreview() {
    if (!selMeter.value || amountMinor.value < 50000) return;
    loadingPreview.value = true; error.value = null;
    try {
        preview.value = await api.post<any>('/api/v1/customer/purchase/preview', {
            meter_id: selMeter.value.meter_id,
            amount_minor: amountMinor.value,
        });
        mode.value = walletBal.value >= amountMinor.value ? 'wallet' : 'direct_pay';
        step.value = 3;
    } catch (e: any) {
        error.value = e?.message ?? 'Could not load preview.';
    } finally { loadingPreview.value = false; }
}

async function purchase() {
    if (!selMeter.value || !preview.value) return;
    loading.value = true; error.value = null;
    const params = {
        meter_id:        selMeter.value.meter_id,
        amount_minor:    amountMinor.value,
        mode:            mode.value as 'wallet' | 'direct_pay',
        idempotency_key: crypto.randomUUID(),
    };
    try {
        const r = await api.post<any>('/api/v1/customer/purchase', params);

        // Fraud engine: step-up required (202)
        if (r.step_up_required) {
            pendingPurchaseParams    = params;
            stepUpChallengeId.value  = r.challenge_id;
            stepUpExpiry.value       = r.expires_at;
            stepUpRequired.value     = true;
            stepUpOtp.value          = '';
            stepUpError.value        = null;
            return;
        }

        if (mode.value === 'direct_pay' && r.authorizationUrl) {
            window.location.href = r.authorizationUrl;
            return;
        }
        result.value = r;
        step.value   = 4;
    } catch (e: any) {
        error.value = e?.message ?? 'Purchase failed. Try again.';
    } finally { loading.value = false; }
}

async function submitStepUp() {
    if (!pendingPurchaseParams || !stepUpOtp.value) return;
    stepUpLoading.value = true; stepUpError.value = null;
    try {
        const r = await api.post<any>('/api/v1/customer/purchase/step-up-verify', {
            challenge_id:    stepUpChallengeId.value,
            otp:             stepUpOtp.value.trim(),
            ...pendingPurchaseParams,
        });
        stepUpRequired.value = false;
        pendingPurchaseParams = null;
        if (pendingPurchaseParams === null && r.authorizationUrl) {
            window.location.href = r.authorizationUrl;
            return;
        }
        result.value = r;
        step.value   = 4;
    } catch (e: any) {
        stepUpError.value = e?.message ?? 'Incorrect code. Try again.';
    } finally { stepUpLoading.value = false; }
}

function cancelStepUp() {
    stepUpRequired.value  = false;
    stepUpChallengeId.value = '';
    stepUpOtp.value       = '';
    stepUpError.value     = null;
    pendingPurchaseParams = null;
}

function copyToken() {
    if (result.value?.token) {
        navigator.clipboard.writeText(result.value.token);
        copied.value = true;
        setTimeout(() => { copied.value = false; }, 2000);
    }
}

function reset() {
    step.value = 1; result.value = null; preview.value = null;
    amountRaw.value = ''; error.value = null;
}
</script>

<template>
  <AppShell>
    <!-- Step indicator -->
    <div class="bw-steps">
      <div v-for="n in 4" :key="n"
           :class="['bw-step', step === n ? 'active' : step > n ? 'done' : '']">
        <div class="bw-step-dot">{{ step > n ? '✓' : n }}</div>
        <span v-if="step === n">{{ ['Meter','Amount','Preview','Done'][n-1] }}</span>
      </div>
      <div v-if="false" class="bw-step-line"></div>
    </div>

    <!-- Step 1: Select meter -->
    <template v-if="step === 1">
      <div class="bw-card">
        <p class="bw-page-title" style="margin-bottom: var(--s-4)">Select meter</p>
        <div v-if="meters.length" class="bw-stack">
          <div v-for="m in meters" :key="m.id"
               :class="['bw-meter-card', selMeter?.id === m.id ? 'selected' : '']"
               @click="selMeter = m">
            <div class="bw-meter-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
              </svg>
            </div>
            <div style="flex:1">
              <div style="font-weight:700; font-size: var(--t-sm)">{{ m.nickname || m.meter_id }}</div>
              <div class="bw-muted bw-mono" style="font-size: var(--t-xs)">{{ m.meter_id }}</div>
            </div>
            <div v-if="selMeter?.id === m.id" style="color: var(--brand)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>
        </div>
        <div v-else class="bw-muted" style="text-align:center; padding: var(--s-5); font-size: var(--t-sm)">
          No meters linked yet.
          <router-link to="/onboard-meter" style="color:var(--brand); font-weight:600; display:block; margin-top:var(--s-2)">Link a meter →</router-link>
        </div>
      </div>
      <button class="bw-btn primary lg" style="width:100%; justify-content:center"
              :disabled="!selMeter" @click="step = 2">
        Continue
      </button>
    </template>

    <!-- Step 2: Choose amount -->
    <template v-if="step === 2">
      <div class="bw-card">
        <p class="bw-page-title" style="margin-bottom: var(--s-1)">How much?</p>
        <p class="bw-muted" style="font-size: var(--t-sm); margin-bottom: var(--s-4)">
          Meter: <span class="bw-mono">{{ selMeter?.meter_id }}</span>
        </p>
        <label class="bw-label">Amount (₦)</label>
        <input class="bw-input bw-mono" v-model="amountRaw" type="number" min="500"
               inputmode="numeric" placeholder="0.00"
               style="font-size: var(--t-2xl); font-weight:700; text-align:right" />
        <div class="bw-quick-amounts" style="margin-top: var(--s-3)">
          <button v-for="a in quickAmts" :key="a"
                  :class="['bw-quick-amt', amountMinor === a ? 'active' : '']"
                  @click="setQuick(a)">
            {{ naira(a) }}
          </button>
        </div>
      </div>
      <div v-if="error" class="bw-alert danger" style="font-size: var(--t-sm)">{{ error }}</div>
      <div class="bw-row" style="gap: var(--s-3)">
        <button class="bw-btn" style="flex:1; justify-content:center" @click="step = 1">Back</button>
        <button class="bw-btn primary" style="flex:2; justify-content:center"
                :disabled="amountMinor < 50000 || loadingPreview" @click="goToPreview">
          {{ loadingPreview ? 'Loading…' : 'Preview →' }}
        </button>
      </div>
    </template>

    <!-- Step 3: Preview & pay -->
    <template v-if="step === 3 && preview">
      <div class="bw-card">
        <p class="bw-page-title" style="margin-bottom: var(--s-4)">Confirm purchase</p>
        <div class="bw-stack" style="gap: var(--s-3)">
          <div class="bw-row" style="justify-content:space-between">
            <span class="bw-muted" style="font-size: var(--t-sm)">Meter</span>
            <span class="bw-mono" style="font-size: var(--t-sm)">{{ preview.meterId }}</span>
          </div>
          <div class="bw-row" style="justify-content:space-between">
            <span class="bw-muted" style="font-size: var(--t-sm)">Units</span>
            <span class="bw-mono" style="font-weight:700">{{ kwh(preview.units) }}</span>
          </div>
          <div class="bw-row" style="justify-content:space-between">
            <span class="bw-muted" style="font-size: var(--t-sm)">Amount</span>
            <span class="bw-money" style="font-weight:700">{{ naira(preview.amountMinor) }}</span>
          </div>
          <hr style="border:none; border-top:1px solid var(--border)">
          <div class="bw-row" style="justify-content:space-between">
            <span class="bw-muted" style="font-size: var(--t-sm)">Pay with</span>
            <div class="bw-row" style="gap: var(--s-2)">
              <button :class="['bw-badge', mode === 'wallet' ? 'success' : 'neutral']"
                      style="cursor:pointer; border:none"
                      :disabled="walletBal < amountMinor"
                      @click="mode = 'wallet'">Wallet ({{ naira(walletBal) }})</button>
              <button :class="['bw-badge', mode === 'direct_pay' ? 'info' : 'neutral']"
                      style="cursor:pointer; border:none"
                      @click="mode = 'direct_pay'">Card</button>
            </div>
          </div>
          <div v-if="mode === 'wallet' && walletBal < amountMinor" class="bw-alert warn" style="font-size: var(--t-xs)">
            Insufficient wallet balance.
            <router-link to="/wallet/fund" style="color:var(--brand); font-weight:600">Top up →</router-link>
          </div>
        </div>
      </div>
      <div v-if="error" class="bw-alert danger" style="font-size: var(--t-sm)">{{ error }}</div>
      <div class="bw-row" style="gap: var(--s-3)">
        <button class="bw-btn" style="flex:1; justify-content:center" @click="step = 2">Back</button>
        <button class="bw-btn primary" style="flex:2; justify-content:center"
                :disabled="loading || (mode === 'wallet' && walletBal < amountMinor)"
                @click="purchase">
          {{ loading ? 'Processing…' : mode === 'direct_pay' ? 'Pay with Card →' : 'Buy Token' }}
        </button>
      </div>
    </template>

    <!-- Step-up auth modal -->
    <div v-if="stepUpRequired" class="bw-stepup-backdrop">
      <div class="bw-stepup-modal">
        <div style="width:48px; height:48px; border-radius:50%; background:oklch(75% 0.18 85 / 0.15); display:grid; place-items:center; margin:0 auto var(--s-4)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(75% 0.18 85)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <p style="font-weight:700; text-align:center; margin:0 0 var(--s-2)">Security check</p>
        <p class="bw-muted" style="font-size:var(--t-sm); text-align:center; margin:0 0 var(--s-5)">
          We sent a 6-digit code to your registered phone. Enter it below to complete your purchase.
        </p>
        <input
          v-model="stepUpOtp"
          class="bw-input bw-mono"
          inputmode="numeric"
          maxlength="6"
          placeholder="000000"
          style="text-align:center; font-size:var(--t-2xl); font-weight:700; letter-spacing:0.2em"
          @keyup.enter="submitStepUp"
        />
        <p v-if="stepUpError" class="bw-alert danger" style="font-size:var(--t-sm); margin-top:var(--s-2)">{{ stepUpError }}</p>
        <button class="bw-btn primary" style="width:100%; justify-content:center; margin-top:var(--s-4)"
                :disabled="stepUpOtp.length < 6 || stepUpLoading"
                @click="submitStepUp">
          {{ stepUpLoading ? 'Verifying…' : 'Verify & complete purchase' }}
        </button>
        <button class="bw-btn" style="width:100%; justify-content:center; margin-top:var(--s-2)" @click="cancelStepUp">
          Cancel
        </button>
      </div>
    </div>

    <!-- Step 4: Token reveal -->
    <template v-if="step === 4 && result">
      <div class="bw-card" style="text-align:center">
        <div style="width:48px; height:48px; border-radius:50%; background: oklch(70% 0.19 145 / 0.15); display:grid; place-items:center; margin: 0 auto var(--s-4)">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <p class="bw-page-title" style="margin-bottom: var(--s-2)">Token generated!</p>
        <p class="bw-muted" style="font-size: var(--t-sm); margin-bottom: var(--s-5)">{{ kwh(result.units) }} credited to meter {{ result.purchaseOrder?.meter_id }}</p>
        <div class="bw-token-box">
          <div class="bw-token-value">{{ result.token }}</div>
          <div class="bw-token-units">{{ kwh(result.units) }}</div>
        </div>
        <button class="bw-btn" style="width:100%; justify-content:center; margin-top: var(--s-4)" @click="copyToken">
          {{ copied ? '✓ Copied!' : 'Copy token' }}
        </button>
      </div>
      <button class="bw-btn primary" style="width:100%; justify-content:center" @click="reset">
        Buy another
      </button>
    </template>
  </AppShell>
</template>

<style scoped>
.bw-stepup-backdrop {
  position: fixed; inset: 0;
  background: oklch(0% 0 0 / 0.6);
  display: grid; place-items: center;
  z-index: 300;
  padding: var(--s-4);
}
.bw-stepup-modal {
  background: var(--surface-0);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  padding: var(--s-7);
  width: min(420px, 100%);
  display: flex; flex-direction: column;
}
</style>
