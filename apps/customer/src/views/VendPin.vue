<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const pin = ref('');
const confirmPin = ref('');
const loading = ref(false);
const error = ref('');

const problem = computed(() => {
    if (!pin.value) return '';
    if (!/^\d{4}$/.test(pin.value)) return 'Use exactly four digits.';
    if (/^(\d)\1+$/.test(pin.value) || pin.value === '1234') return 'Choose a less predictable PIN.';
    return '';
});
const valid = computed(() => !problem.value && /^\d{4}$/.test(pin.value) && pin.value === confirmPin.value);

function safeRedirect() {
    const value = typeof route.query.redirect === 'string' ? route.query.redirect.trim() : '/buy-token';
    return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/buy-token';
}

async function savePin() {
    if (!valid.value || loading.value) return;
    loading.value = true;
    error.value = '';
    try {
        await api.post('/api/v1/customer/vend-pin', { pin: pin.value });
        if (auth.customer) auth.customer.vend_pin_configured = true;
        await auth.refreshProfile();
        if (auth.customer) auth.customer.vend_pin_configured = true;
        await router.replace(safeRedirect());
    } catch (cause) {
        error.value = cause instanceof ApiError ? cause.message : 'Could not save your PIN.';
    } finally {
        loading.value = false;
    }
}
</script>

<template>
  <AppShell>
    <form class="bw-card bw-card-shimmer vend-pin-card" @submit.prevent="savePin">
      <p class="bw-label">Required before vending</p>
      <h1 class="bw-page-title">Create vending PIN</h1>
      <p class="bw-muted">This confirms wallet purchases.</p>

      <label class="bw-label" for="customer-vend-pin">Four-digit PIN</label>
      <input
        id="customer-vend-pin"
        v-model="pin"
        class="bw-input bw-mono pin-input"
        type="password"
        inputmode="numeric"
        maxlength="4"
        pattern="[0-9]{4}"
        autocomplete="new-password"
        placeholder="••••"
      />

      <label class="bw-label" for="customer-vend-pin-confirm">Confirm PIN</label>
      <input
        id="customer-vend-pin-confirm"
        v-model="confirmPin"
        class="bw-input bw-mono pin-input"
        type="password"
        inputmode="numeric"
        maxlength="4"
        pattern="[0-9]{4}"
        autocomplete="new-password"
        placeholder="••••"
      />

      <p v-if="problem" class="bw-alert danger">{{ problem }}</p>
      <p v-else-if="confirmPin && pin !== confirmPin" class="bw-alert danger">PIN entries must match.</p>
      <p v-if="error" class="bw-alert danger">{{ error }}</p>

      <button class="bw-btn primary" type="submit" :disabled="!valid || loading">
        {{ loading ? 'Saving…' : 'Save vending PIN' }}
      </button>
    </form>
  </AppShell>
</template>

<style scoped>
.vend-pin-card {
  display: grid;
  gap: var(--s-4);
  width: min(100%, 520px);
  margin: 0 auto;
}
.vend-pin-card :is(h1, p) { margin: 0; }
.pin-input {
  text-align: center;
  font-size: var(--t-2xl);
  letter-spacing: 0.35em;
}
.vend-pin-card .bw-btn { justify-content: center; }
</style>
