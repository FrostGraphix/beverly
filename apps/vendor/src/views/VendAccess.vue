<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api, ApiError } from '../lib/api';
import { useVendorAuthStore } from '../stores/auth';

const router = useRouter();
const route = useRoute();
const auth = useVendorAuthStore();

const type = 'pin' as const;
const credential = ref('');
const confirm = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const redirectTarget = computed(() => safeRedirectTarget(route.query.redirect, '/vend'));

function safeRedirectTarget(raw: unknown, fallback = '/vend') {
    if (typeof raw !== 'string') return fallback;
    const value = raw.trim();
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
    return value;
}

const valid = computed(() => {
    if (!credential.value || !confirm.value) return false;
    if (credentialProblem.value) return false;
    if (credential.value !== confirm.value) return false;
    return true;
});

const credentialProblem = computed(() => {
    const value = credential.value;
    if (!value) return '';
    if (!/^\d{4}$/.test(value)) return 'Use exactly four digits.';
    if (/^(\d)\1+$/.test(value) || value === '1234') {
        return 'Choose a less predictable PIN.';
    }
    return '';
});

async function submit() {
    if (!valid.value || loading.value) return;
    loading.value = true;
    error.value = null;
    try {
        await api.post('/api/v1/vendor/vend-credential', {
            type,
            credential: credential.value,
        });
        if (auth.user) {
            auth.user.vend_credential_configured = true;
            auth.user.vend_credential_type = type;
        }
        await auth.refreshMe();
        await router.push(redirectTarget.value);
    } catch (e: any) {
        error.value = e instanceof ApiError ? e.message : e?.message ?? 'Could not save authorization.';
    } finally {
        loading.value = false;
    }
}
</script>

<template>
  <AppShell title="Vendor Authorization">
    <div style="max-width: 640px; margin: 0 auto">
      <form class="bw-card" @submit.prevent="submit">
        <p class="bw-label">Required before vending</p>
        <h1 class="bw-h1">Create vend authorization</h1>
        <p class="bw-muted">
          Use this before credit-token generation.
          It protects wallet debits.
        </p>

        <div style="margin-top: var(--s-5)">
          <label class="bw-label" for="vend-credential">Four-digit vending PIN</label>
          <input
            id="vend-credential"
            class="bw-input bw-mono"
            v-model="credential"
            type="password"
            inputmode="numeric"
            maxlength="4"
            pattern="[0-9]{4}"
            autocomplete="new-password"
            placeholder="••••"
          />
        </div>

        <div style="margin-top: var(--s-4)">
          <label class="bw-label" for="vend-credential-confirm">Confirm</label>
          <input
            id="vend-credential-confirm"
            class="bw-input bw-mono"
            v-model="confirm"
            type="password"
            inputmode="numeric"
            maxlength="4"
            pattern="[0-9]{4}"
            autocomplete="new-password"
          />
        </div>

        <p class="bw-muted" style="margin-top: var(--s-3); font-size: var(--t-sm)">
          Used only for vending.
        </p>
        <p v-if="credentialProblem" class="bw-alert danger" style="margin-top: var(--s-3)">
          {{ credentialProblem }}
        </p>
        <p v-else-if="credential && confirm && credential !== confirm" class="bw-alert danger" style="margin-top: var(--s-3)">
          Authorization entries must match.
        </p>

        <p v-if="error" class="bw-alert danger" style="margin-top: var(--s-3)">
          {{ error }}
        </p>

        <button
          type="submit"
          class="bw-btn primary"
          style="margin-top: var(--s-5); width: 100%; justify-content: center; height: 46px"
          :disabled="loading || !valid"
        >
          {{ loading ? 'Saving...' : 'Save authorization' }}
        </button>
      </form>
    </div>
  </AppShell>
</template>
