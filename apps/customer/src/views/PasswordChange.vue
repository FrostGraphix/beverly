<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { evaluateVendorPassword } from '@beverly/tokens/password-policy';
import AppShell from '../components/AppShell.vue';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const current = ref('');
const next = ref('');
const confirmation = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const evaluation = computed(() => evaluateVendorPassword(next.value));
const valid = computed(() => current.value.length > 0 && evaluation.value.valid
    && next.value === confirmation.value && current.value !== next.value);

async function submit() {
  if (!valid.value || loading.value) return;
  loading.value = true;
  error.value = null;
  try {
    const response = await api.post<{
      access_token: string; refresh_token: string | null; expires_at: number | null; expires_in: number | null;
    }>('/api/v1/customer/password-change', { current: current.value, next: next.value });
    auth.rotateSession(response.access_token, {
      refreshToken: response.refresh_token,
      expiresAt: response.expires_at,
      expiresIn: response.expires_in,
    });
    await auth.refreshProfile();
    await router.replace('/profile');
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : 'Password update failed. Retry shortly.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AppShell>
    <form class="bw-card password-card" @submit.prevent="submit">
      <p class="eyebrow">Account security</p>
      <h1 class="bw-h1">Change password</h1>
      <p class="bw-muted">Confirm your current password first.</p>
      <label class="bw-label" for="customer-current-password">Current password</label>
      <input id="customer-current-password" v-model="current" class="bw-input" type="password" autocomplete="current-password" maxlength="200" required />
      <label class="bw-label" for="customer-new-password">New password</label>
      <input id="customer-new-password" v-model="next" class="bw-input" type="password" autocomplete="new-password" minlength="12" maxlength="128" required />
      <ul v-if="next" class="password-checks">
        <li v-for="check in evaluation.checks" :key="check.label" :class="{ valid: check.ok }">{{ check.ok ? '✓' : '○' }} {{ check.label }}</li>
      </ul>
      <label class="bw-label" for="customer-confirm-password">Confirm new password</label>
      <input id="customer-confirm-password" v-model="confirmation" class="bw-input" type="password" autocomplete="new-password" minlength="12" maxlength="128" required />
      <p v-if="confirmation && confirmation !== next" class="field-error" role="alert">Passwords do not match.</p>
      <p v-if="error" class="bw-alert danger" role="alert">{{ error }}</p>
      <button class="bw-btn primary" type="submit" :disabled="!valid || loading">{{ loading ? 'Updating…' : 'Update password' }}</button>
      <button class="bw-btn" type="button" :disabled="loading" @click="router.back()">Cancel</button>
    </form>
  </AppShell>
</template>

<style scoped>
.password-card { width: min(100%, 520px); margin: var(--s-4) auto; display: grid; gap: var(--s-3); }
.eyebrow { margin: 0; color: var(--brand); font-size: var(--t-xs); font-weight: 800; text-transform: uppercase; }
.bw-h1, .bw-muted { margin: 0; }
.password-checks { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; color: var(--text-muted); font-size: var(--t-xs); }
.password-checks .valid { color: var(--brand); }
.field-error { color: var(--danger); margin: 0; font-size: var(--t-xs); }
.bw-btn { justify-content: center; }
@media (max-width: 480px) { .password-checks { grid-template-columns: 1fr; } }
</style>
