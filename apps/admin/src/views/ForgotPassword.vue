<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../lib/api';

const router = useRouter();
const email = ref('');
const otp = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const sent = ref(false);

async function submit() {
  const normalized = email.value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    error.value = 'Enter a valid work email.';
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    await api.post('/api/v1/admin/auth/reset-request', { email: normalized });
    sent.value = true;
  } catch (cause) {
    error.value = cause instanceof ApiError && cause.status >= 500
      ? 'Password reset is temporarily unavailable.'
      : 'Could not request password reset.';
  } finally {
    loading.value = false;
  }
}

async function verifyOtp() {
  if (!/^\d{6}$/.test(otp.value) || loading.value) return;
  loading.value = true;
  error.value = null;
  try {
    const result = await api.post<{ token: string }>('/api/v1/admin/auth/reset-verify', {
      email: email.value.trim().toLowerCase(), otp: otp.value,
    });
    sessionStorage.setItem('beverly.admin.password-reset-grant', result.token);
    await router.push('/reset-password');
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : 'Code verification failed.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="auth-stage">
    <section class="bw-card auth-card">
      <template v-if="sent">
        <form @submit.prevent="verifyOtp">
          <p class="eyebrow">Code sent</p>
          <h1 class="bw-h1">Enter verification code</h1>
          <p class="bw-muted">Enter the six-digit code emailed.</p>
          <label class="bw-label" for="recovery-otp">Verification code</label>
          <input id="recovery-otp" v-model="otp" class="bw-input otp-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required />
          <p v-if="error" class="bw-alert danger" role="alert">{{ error }}</p>
          <button class="bw-btn primary" type="submit" :disabled="loading || !/^\d{6}$/.test(otp)">{{ loading ? 'Verifying…' : 'Verify code' }}</button>
          <button class="bw-btn ghost" type="button" @click="sent = false; otp = ''; error = null">Request another code</button>
        </form>
      </template>
      <form v-else @submit.prevent="submit">
        <p class="eyebrow">Account recovery</p>
        <h1 class="bw-h1">Forgot password</h1>
        <p class="bw-muted">We will email one code.</p>
        <label class="bw-label" for="recovery-email">Work email</label>
        <input id="recovery-email" v-model="email" class="bw-input" type="email" autocomplete="email" maxlength="320" required />
        <p v-if="error" class="bw-alert danger" role="alert">{{ error }}</p>
        <button class="bw-btn primary" type="submit" :disabled="loading">{{ loading ? 'Sending…' : 'Send verification code' }}</button>
        <router-link class="bw-btn ghost" to="/login">Back to sign in</router-link>
      </form>
    </section>
  </main>
</template>

<style scoped>
.auth-stage { min-height:100dvh; display:grid; place-items:center; padding:var(--s-5); }
.auth-card { width:min(100%,460px); }
form, .auth-card { display:grid; gap:var(--s-3); }
.eyebrow { margin:0; color:var(--brand); font-size:var(--t-xs); font-weight:800; text-transform:uppercase; }
.bw-h1, .bw-muted { margin:0; }
.bw-btn { justify-content:center; }
.otp-input { text-align:center; letter-spacing:.5em; font-size:var(--t-xl); }
</style>
