<script setup lang="ts">
import { ref } from 'vue';
import { api, ApiError } from '../lib/api';

const email = ref('');
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
</script>

<template>
  <main class="auth-stage">
    <section class="bw-card auth-card">
      <template v-if="sent">
        <p class="eyebrow">Email sent</p>
        <h1 class="bw-h1">Check your inbox</h1>
        <p class="bw-muted">If that staff account exists, its secure reset link expires in 30 minutes.</p>
        <router-link class="bw-btn primary" to="/login">Back to sign in</router-link>
      </template>
      <form v-else @submit.prevent="submit">
        <p class="eyebrow">Account recovery</p>
        <h1 class="bw-h1">Forgot password</h1>
        <p class="bw-muted">We will email a one-time reset link.</p>
        <label class="bw-label" for="recovery-email">Work email</label>
        <input id="recovery-email" v-model="email" class="bw-input" type="email" autocomplete="email" maxlength="320" required />
        <p v-if="error" class="bw-alert danger" role="alert">{{ error }}</p>
        <button class="bw-btn primary" type="submit" :disabled="loading">{{ loading ? 'Sending…' : 'Send reset link' }}</button>
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
</style>
