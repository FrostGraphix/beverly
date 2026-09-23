<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { evaluateVendorPassword } from '@beverly/tokens/password-policy';
import { api, ApiError } from '../lib/api';
import { useStaffAuthStore } from '../stores/auth';

const auth = useStaffAuthStore();
const route = useRoute();
const router = useRouter();
const current = ref('');
const next = ref('');
const confirmation = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const evaluation = computed(() => evaluateVendorPassword(next.value));
const valid = computed(() => current.value.length > 0 && evaluation.value.valid && next.value === confirmation.value && current.value !== next.value);

function safeRedirect(raw: unknown) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
  return raw === '/password-change' ? '/' : raw;
}

async function submit() {
  if (!valid.value || loading.value) return;
  loading.value = true;
  error.value = null;
  try {
    const response = await api.post<{ access_token: string }>('/api/v1/admin/password-change', {
      current: current.value,
      next: next.value,
    });
    auth.rotateSession(response.access_token);
    await auth.refreshSession();
    await router.replace(safeRedirect(route.query.redirect));
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : 'Password update failed. Retry shortly.';
  } finally {
    loading.value = false;
  }
}

function logout() {
  auth.logout();
  void router.replace('/login');
}
</script>

<template>
  <main class="password-stage">
    <form class="bw-card password-card" @submit.prevent="submit">
      <div class="bw-mark password-mark" aria-hidden="true" />
      <p class="eyebrow">Required security step</p>
      <h1 class="bw-h1">Choose your password</h1>
      <p class="bw-muted">Replace your temporary password before continuing.</p>

      <label class="bw-label" for="current-password">Temporary password</label>
      <input id="current-password" v-model="current" class="bw-input" type="password" autocomplete="current-password" maxlength="200" required />

      <label class="bw-label" for="new-password">New password</label>
      <input id="new-password" v-model="next" class="bw-input" type="password" autocomplete="new-password" minlength="12" maxlength="128" required />
      <ul v-if="next" class="password-checks">
        <li v-for="check in evaluation.checks" :key="check.label" :class="{ valid: check.ok }">{{ check.ok ? '✓' : '○' }} {{ check.label }}</li>
      </ul>

      <label class="bw-label" for="confirm-password">Confirm new password</label>
      <input id="confirm-password" v-model="confirmation" class="bw-input" type="password" autocomplete="new-password" minlength="12" maxlength="128" required />
      <p v-if="confirmation && confirmation !== next" class="field-error" role="alert">Passwords do not match.</p>
      <p v-if="error" class="bw-alert danger" role="alert">{{ error }}</p>
      <button class="bw-btn primary lg" type="submit" :disabled="!valid || loading">{{ loading ? 'Updating…' : 'Set password and continue' }}</button>
      <button class="bw-btn ghost" type="button" @click="logout">Sign out instead</button>
    </form>
  </main>
</template>

<style scoped>
.password-stage { min-height: 100dvh; display: grid; place-items: center; padding: var(--s-5); }
.password-card { width: min(100%, 480px); display: grid; gap: var(--s-3); }
.password-mark { margin: 0 auto; }
.eyebrow { margin: 0; color: var(--brand); text-align: center; font-size: var(--t-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
.bw-h1, .bw-muted { text-align: center; margin: 0; }
.password-checks { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; color: var(--text-muted); font-size: var(--t-xs); }
.password-checks .valid { color: var(--brand); }
.field-error { color: var(--danger); margin: 0; font-size: var(--t-xs); }
.bw-btn { justify-content: center; }
@media (max-width: 480px) { .password-checks { grid-template-columns: 1fr; } }
</style>
