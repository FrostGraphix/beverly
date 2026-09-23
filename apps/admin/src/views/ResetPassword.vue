<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { evaluateVendorPassword } from '@beverly/tokens/password-policy';
import { api, ApiError } from '../lib/api';

const route = useRoute();
const router = useRouter();
const token = ref('');
const password = ref('');
const confirmation = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const success = ref(false);
const evaluation = computed(() => evaluateVendorPassword(password.value));
const valid = computed(() => token.value.length === 64 && evaluation.value.valid && password.value === confirmation.value);

onMounted(async () => {
  const raw = typeof route.query.token === 'string' ? route.query.token : '';
  if (/^[a-f0-9]{64}$/i.test(raw)) token.value = raw;
  else error.value = 'Invalid reset link. Request another.';
  if ('token' in route.query) await router.replace({ query: {} });
});

async function submit() {
  if (!valid.value || loading.value) return;
  loading.value = true;
  error.value = null;
  try {
    await api.post('/api/v1/admin/auth/reset-confirm', { token: token.value, new_password: password.value });
    success.value = true;
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : 'Password reset failed.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="auth-stage">
    <section class="bw-card auth-card">
      <template v-if="success">
        <p class="eyebrow">Password updated</p>
        <h1 class="bw-h1">Recovery complete</h1>
        <p class="bw-muted">Sign in using your new password.</p>
        <router-link class="bw-btn primary" to="/login">Sign in</router-link>
      </template>
      <form v-else @submit.prevent="submit">
        <p class="eyebrow">Secure recovery</p>
        <h1 class="bw-h1">Set new password</h1>
        <label class="bw-label" for="recovery-new-password">New password</label>
        <input id="recovery-new-password" v-model="password" class="bw-input" type="password" autocomplete="new-password" minlength="12" maxlength="128" required />
        <ul v-if="password" class="checks"><li v-for="check in evaluation.checks" :key="check.label" :class="{ ok: check.ok }">{{ check.ok ? '✓' : '○' }} {{ check.label }}</li></ul>
        <label class="bw-label" for="recovery-confirm-password">Confirm password</label>
        <input id="recovery-confirm-password" v-model="confirmation" class="bw-input" type="password" autocomplete="new-password" minlength="12" maxlength="128" required />
        <p v-if="confirmation && confirmation !== password" class="field-error" role="alert">Passwords do not match.</p>
        <p v-if="error" class="bw-alert danger" role="alert">{{ error }}</p>
        <button class="bw-btn primary" type="submit" :disabled="!valid || loading">{{ loading ? 'Updating…' : 'Set new password' }}</button>
        <router-link class="bw-btn ghost" to="/forgot-password">Request another link</router-link>
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
