<script setup lang="ts">
import { ref, computed } from 'vue';
import AppShell from '../components/AppShell.vue';
import Stepper from '../components/Stepper.vue';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const tier = ref(auth.kycTier);

// ─ Tier 1: 3 micro-steps (Identity → Address → Confirm) ──────────
const T1_STEPS = [
    { key: 'identity', label: 'Identity' },
    { key: 'address',  label: 'Address' },
    { key: 'confirm',  label: 'Confirm' },
];
const t1Index = ref(0);

const fullName = ref(auth.customer?.full_name ?? '');
const dob      = ref('');
const address  = ref('');
const state    = ref('');
const lga      = ref('');

const t1Errors = ref<Record<string, string>>({});
const loading1 = ref(false);
const error1   = ref<string | null>(null);

// ─ Tier 2: NIN (single step) ─────────────────────────────────────
const nin      = ref('');
const loading2 = ref(false);
const error2   = ref<string | null>(null);

const nigerianStates = [
    'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
    'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo',
    'Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa',
    'Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba',
    'Yobe','Zamfara',
];

const dobMax = computed(() => new Date(Date.now() - 18 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10));

function validateT1Step(i: number): boolean {
    t1Errors.value = {};
    const errs: Record<string, string> = {};
    if (i === 0) {
        if (!fullName.value.trim() || fullName.value.trim().length < 2) errs.fullName = 'Enter your full legal name.';
        if (!dob.value) errs.dob = 'Date of birth is required.';
        else if (new Date(dob.value) > new Date(dobMax.value)) errs.dob = 'You must be 18 or older.';
    }
    if (i === 1) {
        if (!address.value.trim() || address.value.trim().length < 5) errs.address = 'Enter your residential address.';
        if (!state.value) errs.state = 'Select your state.';
        if (!lga.value.trim()) errs.lga = 'Enter your LGA.';
    }
    t1Errors.value = errs;
    return Object.keys(errs).length === 0;
}

function next() {
    if (validateT1Step(t1Index.value)) {
        t1Index.value = Math.min(T1_STEPS.length - 1, t1Index.value + 1);
    }
}

function prev() {
    error1.value = null;
    t1Errors.value = {};
    t1Index.value = Math.max(0, t1Index.value - 1);
}

async function submitTier1() {
    if (!validateT1Step(0) || !validateT1Step(1)) return;
    loading1.value = true;
    error1.value = null;
    try {
        const r = await api.post<{ kyc_tier: number }>('/api/v1/customer/kyc/tier1', {
            full_name: fullName.value.trim(),
            date_of_birth: dob.value,
            address: address.value.trim(),
            state: state.value.trim(),
            lga: lga.value.trim(),
        });
        tier.value = r.kyc_tier;
        if (auth.customer) auth.customer.kyc_tier = r.kyc_tier;
        t1Index.value = 0;
    } catch (e: any) {
        error1.value = e?.message ?? 'Verification failed.';
    } finally { loading1.value = false; }
}

async function submitTier2() {
    if (nin.value.replace(/\s/g, '').length !== 11) {
        error2.value = 'NIN must be exactly 11 digits.';
        return;
    }
    loading2.value = true;
    error2.value = null;
    try {
        const r = await api.post<{ kyc_tier: number }>('/api/v1/customer/kyc/tier2/nin', {
            nin: nin.value.replace(/\s/g, ''),
        });
        tier.value = r.kyc_tier;
        if (auth.customer) auth.customer.kyc_tier = r.kyc_tier;
    } catch (e: any) {
        error2.value = e?.message ?? 'NIN verification failed.';
    } finally { loading2.value = false; }
}
</script>

<template>
  <AppShell>
    <!-- Header -->
    <div>
      <p class="bw-page-title">Verify identity</p>
      <p class="bw-page-sub">Unlock token purchases and higher limits</p>
    </div>

    <!-- Tier indicator -->
    <div class="tier-row">
      <div v-for="n in [0, 1, 2]" :key="n" :class="['bw-kyc-tier', tier >= n ? `tier-${n}` : 'tier-0']">
        Tier {{ n }}{{ tier >= n ? ' ✓' : '' }}
      </div>
    </div>

    <!-- ─ TIER 1: multi-step ──────────────────────────────────── -->
    <div v-if="tier < 1" class="bw-card">
      <p class="card-title">Tier 1 — Basic details</p>
      <p class="card-sub">Required to start buying tokens (up to ₦50,000/day)</p>

      <Stepper :steps="T1_STEPS" :current-index="t1Index" />

      <!-- Step 0: Identity -->
      <form v-if="t1Index === 0" class="step-pane" @submit.prevent="next">
        <div>
          <label class="bw-label">Full legal name</label>
          <input
            class="bw-input"
            :class="{ 'has-error': t1Errors.fullName }"
            v-model="fullName"
            placeholder="First Last name"
            autocomplete="name"
          />
          <p v-if="t1Errors.fullName" class="field-error">{{ t1Errors.fullName }}</p>
        </div>
        <div>
          <label class="bw-label">Date of birth</label>
          <input
            class="bw-input"
            :class="{ 'has-error': t1Errors.dob }"
            v-model="dob"
            type="date"
            :max="dobMax"
          />
          <p v-if="t1Errors.dob" class="field-error">{{ t1Errors.dob }}</p>
          <p v-else class="field-hint">You must be 18 or older to use Beverly.</p>
        </div>

        <button class="bw-btn primary lg full" type="submit">Continue →</button>
      </form>

      <!-- Step 1: Address -->
      <form v-if="t1Index === 1" class="step-pane" @submit.prevent="next">
        <div>
          <label class="bw-label">Residential address</label>
          <input
            class="bw-input"
            :class="{ 'has-error': t1Errors.address }"
            v-model="address"
            placeholder="12 Example Street"
            autocomplete="street-address"
          />
          <p v-if="t1Errors.address" class="field-error">{{ t1Errors.address }}</p>
        </div>
        <div class="row">
          <div class="col">
            <label class="bw-label">State</label>
            <select
              class="bw-input"
              :class="{ 'has-error': t1Errors.state }"
              v-model="state"
            >
              <option value="">Select…</option>
              <option v-for="s in nigerianStates" :key="s" :value="s">{{ s }}</option>
            </select>
            <p v-if="t1Errors.state" class="field-error">{{ t1Errors.state }}</p>
          </div>
          <div class="col">
            <label class="bw-label">LGA</label>
            <input
              class="bw-input"
              :class="{ 'has-error': t1Errors.lga }"
              v-model="lga"
              placeholder="Ikeja"
            />
            <p v-if="t1Errors.lga" class="field-error">{{ t1Errors.lga }}</p>
          </div>
        </div>

        <div class="nav-row">
          <button type="button" class="bw-btn" @click="prev">← Back</button>
          <button type="submit" class="bw-btn primary">Continue →</button>
        </div>
      </form>

      <!-- Step 2: Confirm -->
      <div v-if="t1Index === 2" class="step-pane">
        <div class="review-card">
          <div class="review-row">
            <span class="review-key">Full name</span>
            <span class="review-val">{{ fullName }}</span>
          </div>
          <div class="review-row">
            <span class="review-key">Date of birth</span>
            <span class="review-val">{{ dob }}</span>
          </div>
          <div class="review-row">
            <span class="review-key">Address</span>
            <span class="review-val">{{ address }}</span>
          </div>
          <div class="review-row">
            <span class="review-key">State / LGA</span>
            <span class="review-val">{{ state }} · {{ lga }}</span>
          </div>
        </div>

        <p class="legal-note">
          By submitting you confirm this information is accurate. Providing false KYC information
          may result in account suspension and is a crime under NDPR.
        </p>

        <div v-if="error1" class="bw-alert danger">{{ error1 }}</div>

        <div class="nav-row">
          <button type="button" class="bw-btn" :disabled="loading1" @click="prev">← Back</button>
          <button class="bw-btn primary" :disabled="loading1" @click="submitTier1">
            {{ loading1 ? 'Verifying…' : 'Submit Tier 1' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ─ TIER 2: NIN ─────────────────────────────────────────── -->
    <div v-if="tier >= 1 && tier < 2" class="bw-card">
      <p class="card-title">Tier 2 — NIN verification</p>
      <p class="card-sub">
        Unlock up to ₦200,000/day. Your NIN is verified via Paystack Identity — we don't store it.
      </p>
      <form class="step-pane" @submit.prevent="submitTier2">
        <div>
          <label class="bw-label">National ID number (NIN)</label>
          <input
            class="bw-input bw-mono"
            v-model="nin"
            inputmode="numeric"
            maxlength="11"
            placeholder="00000000000"
            style="letter-spacing: 0.12em"
          />
          <p class="field-hint">Find your 11-digit NIN on your slip or NIN card.</p>
        </div>
        <div v-if="error2" class="bw-alert danger">{{ error2 }}</div>
        <button
          class="bw-btn primary lg full"
          type="submit"
          :disabled="loading2 || nin.replace(/\s/g, '').length !== 11"
        >
          {{ loading2 ? 'Verifying…' : 'Verify NIN' }}
        </button>
      </form>
    </div>

    <!-- ─ DONE ────────────────────────────────────────────────── -->
    <div v-if="tier >= 2" class="bw-card done-card">
      <div class="done-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <p class="bw-page-title done-title">Fully verified!</p>
      <p class="bw-muted done-sub">You've reached Tier 2. Enjoy up to ₦200,000/day.</p>
      <router-link to="/buy-token" class="bw-btn primary done-cta">
        Buy tokens now
      </router-link>
    </div>
  </AppShell>
</template>

<style scoped>
.tier-row { display: flex; gap: var(--s-2); }

.card-title { font-weight: 700; margin: 0 0 var(--s-1); }
.card-sub   { color: var(--text-muted); font-size: var(--t-sm); margin: 0 0 var(--s-4); }

.step-pane {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
  animation: fadeIn 0.25s var(--ease-out);
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s-3);
}
.col { display: flex; flex-direction: column; }

.field-hint { font-size: var(--t-xs); color: var(--text-muted); margin: 6px 0 0; }
.field-error { font-size: var(--t-xs); color: var(--danger); margin: 4px 0 0; font-weight: 500; }
.has-error { border-color: var(--danger) !important; }

.review-card {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: var(--s-4);
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}
.review-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: var(--t-sm);
  gap: var(--s-3);
}
.review-key { color: var(--text-muted); }
.review-val { color: var(--text); font-weight: 600; text-align: right; word-break: break-word; }

.legal-note {
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.6;
  margin: 0;
  padding: var(--s-2) 0;
}

.nav-row {
  display: flex;
  gap: var(--s-2);
}
.nav-row .bw-btn { flex: 1; justify-content: center; }

.full { width: 100%; justify-content: center; }

.done-card {
  text-align: center;
  padding: var(--s-8);
}
.done-icon {
  width: 56px; height: 56px;
  border-radius: 50%;
  background: oklch(70% 0.19 145 / 0.15);
  display: grid; place-items: center;
  margin: 0 auto var(--s-4);
}
.done-title { margin-bottom: var(--s-2); }
.done-sub   { font-size: var(--t-sm); margin-bottom: var(--s-5); }
.done-cta   { text-decoration: none; display: inline-flex; }

@media (max-width: 380px) {
  .row { grid-template-columns: 1fr; }
}
</style>
