<script setup lang="ts">
import { ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { useAuthStore } from '../stores/auth';
import { api } from '../lib/api';

const auth    = useAuthStore();
const loading = ref(false);
const error   = ref<string | null>(null);
const message = ref<string | null>(null);

async function requestOtpLink() {
    loading.value = true; error.value = null; message.value = null;
    try {
        await api.post('/api/v1/customer/auth/login', { phone: auth.customer?.phone });
        message.value = 'A verification code was sent to your phone. Use it to log in from a new device.';
    } catch (e: any) {
        error.value = e?.message ?? 'Failed to send code.';
    } finally { loading.value = false; }
}
</script>

<template>
  <AppShell>
    <div>
      <p class="bw-page-title">Security</p>
      <p class="bw-page-sub">Your account protection settings</p>
    </div>

    <!-- Auth method -->
    <div class="bw-card">
      <p style="font-weight:700; margin:0 0 var(--s-1)">Authentication</p>
      <p class="bw-muted" style="font-size: var(--t-sm); margin:0 0 var(--s-4)">
        Beverly uses phone OTP (one-time password) for secure, passwordless sign-in.
        Every login requires a fresh code sent to your phone.
      </p>
      <div class="bw-row" style="gap: var(--s-2); flex-wrap:wrap">
        <div class="bw-badge success" style="font-size: var(--t-xs)">OTP enabled</div>
        <div class="bw-badge neutral" style="font-size: var(--t-xs)">{{ auth.customer?.phone }}</div>
      </div>
    </div>

    <!-- Re-send login link -->
    <div class="bw-card">
      <p style="font-weight:700; margin:0 0 var(--s-1)">Sign in from new device</p>
      <p class="bw-muted" style="font-size: var(--t-sm); margin:0 0 var(--s-4)">
        Request a fresh OTP to authenticate on a different device or browser.
      </p>
      <div v-if="message" class="bw-alert" style="font-size: var(--t-sm); margin-bottom: var(--s-3)">{{ message }}</div>
      <div v-if="error" class="bw-alert danger" style="font-size: var(--t-sm); margin-bottom: var(--s-3)">{{ error }}</div>
      <button class="bw-btn" style="justify-content:center" :disabled="loading" @click="requestOtpLink">
        {{ loading ? 'Sending…' : 'Send OTP to phone' }}
      </button>
    </div>

    <!-- KYC status -->
    <div class="bw-card">
      <p style="font-weight:700; margin:0 0 var(--s-1)">Identity verification</p>
      <div class="bw-row" style="gap: var(--s-2); flex-wrap:wrap; margin-top: var(--s-2)">
        <span :class="['bw-kyc-tier', `tier-${auth.kycTier}`]">
          Tier {{ auth.kycTier }} verified
        </span>
      </div>
      <p class="bw-muted" style="font-size: var(--t-xs); margin: var(--s-2) 0 0">
        {{ auth.kycTier === 0 ? 'Verify your identity to start buying tokens.' :
           auth.kycTier === 1 ? 'Add your NIN to unlock Tier 2 (₦200k/day).' :
           'You\'re fully verified. Highest limits unlocked.' }}
      </p>
      <router-link v-if="auth.kycTier < 2" to="/kyc"
                   class="bw-btn primary" style="text-decoration:none; display:inline-flex; margin-top: var(--s-3)">
        {{ auth.kycTier === 0 ? 'Verify identity' : 'Upgrade to Tier 2' }}
      </router-link>
    </div>
  </AppShell>
</template>
