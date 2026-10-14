<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { evaluateVendorPassword } from '@beverly/tokens/password-policy';
import { ApiError, api } from '../lib/api';

const token = ref('');
const password = ref('');
const confirmation = ref('');
const loading = ref(false);
const error = ref('');
const complete = ref(false);
const evaluation = computed(() => evaluateVendorPassword(password.value));
const valid = computed(() => Boolean(token.value) && evaluation.value.valid && password.value === confirmation.value);

onMounted(() => {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  token.value = fragment.get('access_token') ?? '';
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  if (!token.value) error.value = 'This invitation is invalid or has expired. Ask a Super Admin to send a new invitation.';
});

async function submit() {
  if (!valid.value || loading.value) return;
  loading.value = true;
  error.value = '';
  try {
    await api.post('/api/v1/admin/account-setup', { password: password.value }, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    complete.value = true;
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : 'Account setup failed. Ask a Super Admin to send a new invitation.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="auth-stage">
    <section class="bw-card auth-card">
      <template v-if="complete">
        <p class="eyebrow">Account ready</p>
        <h1 class="bw-h1">Your password is set</h1>
        <p class="bw-muted">Sign in to Beverly Admin with your work email and new password.</p>
        <router-link class="bw-btn primary" to="/login">Sign in</router-link>
      </template>
      <form v-else @submit.prevent="submit">
        <p class="eyebrow">Staff invitation</p>
        <h1 class="bw-h1">Set up your account</h1>
        <p class="bw-muted">Create the password you will use to sign in.</p>
        <label class="bw-label" for="setup-password">Password</label>
        <input id="setup-password" v-model="password" class="bw-input" type="password" autocomplete="new-password" minlength="12" maxlength="128" required />
        <ul v-if="password" class="checks"><li v-for="check in evaluation.checks" :key="check.label" :class="{ ok: check.ok }">{{ check.ok ? '✓' : '○' }} {{ check.label }}</li></ul>
        <label class="bw-label" for="setup-confirmation">Confirm password</label>
        <input id="setup-confirmation" v-model="confirmation" class="bw-input" type="password" autocomplete="new-password" minlength="12" maxlength="128" required />
        <p v-if="confirmation && confirmation !== password" class="field-error" role="alert">Passwords do not match.</p>
        <p v-if="error" class="bw-alert danger" role="alert">{{ error }}</p>
        <button class="bw-btn primary" type="submit" :disabled="!valid || loading">{{ loading ? 'Setting up…' : 'Set password' }}</button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.auth-stage { min-height:100dvh; display:grid; place-items:center; padding:var(--s-5); }
.auth-card { width:min(100%,480px); }
form, .auth-card { display:grid; gap:var(--s-3); }
.eyebrow { margin:0; color:var(--brand); font-size:var(--t-xs); font-weight:800; text-transform:uppercase; }
.bw-h1, .bw-muted { margin:0; }
.checks { list-style:none; margin:0; padding:0; display:grid; grid-template-columns:1fr 1fr; gap:4px; color:var(--text-muted); font-size:var(--t-xs); }
.checks .ok { color:var(--brand); }
.field-error { color:var(--danger); margin:0; font-size:var(--t-xs); }
.bw-btn { justify-content:center; }
@media(max-width:480px){.checks{grid-template-columns:1fr;}}
</style>
