<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

const auth   = useAuthStore();
const router = useRouter();
const tier   = ref(auth.kycTier);

// Tier 1 form
const fullName   = ref(auth.customer?.full_name ?? '');
const dob        = ref('');
const address    = ref('');
const state      = ref('');
const lga        = ref('');
const loading1   = ref(false);
const error1     = ref<string | null>(null);

// Tier 2 NIN form
const nin        = ref('');
const loading2   = ref(false);
const error2     = ref<string | null>(null);

async function submitTier1() {
    loading1.value = true; error1.value = null;
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
    } catch (e: any) {
        error1.value = e?.message ?? 'Verification failed.';
    } finally { loading1.value = false; }
}

async function submitTier2() {
    loading2.value = true; error2.value = null;
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

const nigerianStates = [
    'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
    'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo',
    'Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa',
    'Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba',
    'Yobe','Zamfara',
];
</script>

<template>
  <AppShell>
    <!-- Header -->
    <div>
      <p class="bw-page-title">Verify identity</p>
      <p class="bw-page-sub">Unlock token purchases and higher limits</p>
    </div>

    <!-- Tier indicator -->
    <div style="display:flex; gap: var(--s-2)">
      <div v-for="n in [0,1,2]" :key="n"
           :class="['bw-kyc-tier', tier >= n ? `tier-${n}` : 'tier-0']">
        Tier {{ n }}{{ tier >= n ? ' ✓' : '' }}
      </div>
    </div>

    <!-- Tier 0 → 1: Basic info -->
    <div class="bw-card" v-if="tier < 1">
      <p style="font-weight:700; margin:0 0 var(--s-1)">Tier 1 — Basic details</p>
      <p class="bw-muted" style="font-size: var(--t-sm); margin:0 0 var(--s-4)">Required to start buying tokens</p>
      <form class="bw-stack" @submit.prevent="submitTier1">
        <div>
          <label class="bw-label">Full legal name</label>
          <input class="bw-input" v-model="fullName" required placeholder="First Last name" />
        </div>
        <div>
          <label class="bw-label">Date of birth</label>
          <input class="bw-input" v-model="dob" type="date" required
                 :max="new Date(Date.now() - 18*365.25*24*3600*1000).toISOString().slice(0,10)" />
        </div>
        <div>
          <label class="bw-label">Residential address</label>
          <input class="bw-input" v-model="address" required placeholder="12 Example Street" />
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap: var(--s-3)">
          <div>
            <label class="bw-label">State</label>
            <select class="bw-input" v-model="state" required>
              <option value="">Select…</option>
              <option v-for="s in nigerianStates" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div>
            <label class="bw-label">LGA</label>
            <input class="bw-input" v-model="lga" required placeholder="Ikeja" />
          </div>
        </div>
        <div v-if="error1" class="bw-alert danger" style="font-size: var(--t-sm)">{{ error1 }}</div>
        <button class="bw-btn primary lg" type="submit" :disabled="loading1"
                style="width:100%; justify-content:center">
          {{ loading1 ? 'Verifying…' : 'Submit Tier 1' }}
        </button>
      </form>
    </div>

    <!-- Tier 1 → 2: NIN -->
    <div class="bw-card" v-if="tier >= 1 && tier < 2">
      <p style="font-weight:700; margin:0 0 var(--s-1)">Tier 2 — NIN verification</p>
      <p class="bw-muted" style="font-size: var(--t-sm); margin:0 0 var(--s-4)">
        Unlock up to ₦200,000/day. Your NIN is verified via Paystack Identity — we don't store it.
      </p>
      <form class="bw-stack" @submit.prevent="submitTier2">
        <div>
          <label class="bw-label">National ID number (NIN)</label>
          <input class="bw-input bw-mono" v-model="nin" inputmode="numeric" required
                 maxlength="11" placeholder="00000000000" style="letter-spacing: 0.12em" />
        </div>
        <div v-if="error2" class="bw-alert danger" style="font-size: var(--t-sm)">{{ error2 }}</div>
        <button class="bw-btn primary lg" type="submit" :disabled="loading2 || nin.replace(/\s/g,'').length !== 11"
                style="width:100%; justify-content:center">
          {{ loading2 ? 'Verifying…' : 'Verify NIN' }}
        </button>
      </form>
    </div>

    <!-- All done -->
    <div v-if="tier >= 2" class="bw-card" style="text-align:center; padding: var(--s-8)">
      <div style="width:56px; height:56px; border-radius:50%; background: oklch(70% 0.19 145 / 0.15); display:grid; place-items:center; margin: 0 auto var(--s-4)">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <p class="bw-page-title" style="margin-bottom: var(--s-2)">Fully verified!</p>
      <p class="bw-muted" style="font-size: var(--t-sm); margin-bottom: var(--s-5)">You've reached Tier 2. Enjoy up to ₦200,000/day.</p>
      <router-link to="/buy-token" class="bw-btn primary" style="text-decoration:none; display:inline-flex">
        Buy tokens now
      </router-link>
    </div>
  </AppShell>
</template>
