<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api, ApiError } from '../lib/api';
import { useVendorAuthStore } from '../stores/auth';

const router = useRouter();
const route = useRoute();
const auth = useVendorAuthStore();

const type = ref<'pin' | 'password'>('pin');
const credential = ref('');
const confirm = ref('');
const loading = ref(false);
const error = ref<string | null>(null);

const valid = computed(() => {
    if (credential.value !== confirm.value) return false;
    if (type.value === 'pin') return /^\d{4,6}$/.test(credential.value);
    return credential.value.length >= 10 && /[A-Za-z]/.test(credential.value) && /\d/.test(credential.value);
});

async function submit() {
    if (!valid.value || loading.value) return;
    loading.value = true;
    error.value = null;
    try {
        await api.post('/api/v1/vendor/vend-credential', {
            type: type.value,
            credential: credential.value,
        });
        if (auth.user) {
            auth.user.vend_credential_configured = true;
            auth.user.vend_credential_type = type.value;
        }
        await auth.refreshMe();
        await router.push(String(route.query.redirect || '/vend'));
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
      <section class="bw-card">
        <p class="bw-label">Required before vending</p>
        <h1 class="bw-h1">Create vend authorization</h1>
        <p class="bw-muted">
          Use this before credit-token generation.
          It protects wallet debits.
        </p>

        <div class="bw-row" style="gap: var(--s-2); margin-top: var(--s-5)">
          <button class="bw-btn" :class="{ primary: type === 'pin' }" @click="type = 'pin'; credential = ''; confirm = ''">
            PIN
          </button>
          <button class="bw-btn" :class="{ primary: type === 'password' }" @click="type = 'password'; credential = ''; confirm = ''">
            Password
          </button>
        </div>

        <div style="margin-top: var(--s-5)">
          <label class="bw-label">{{ type === 'pin' ? 'Vend PIN' : 'Vend password' }}</label>
          <input
            class="bw-input bw-mono"
            v-model="credential"
            :type="type === 'pin' ? 'password' : 'password'"
            :inputmode="type === 'pin' ? 'numeric' : 'text'"
            :maxlength="type === 'pin' ? 6 : 80"
            :placeholder="type === 'pin' ? '4 to 6 digits' : 'Letters and numbers'"
          />
        </div>

        <div style="margin-top: var(--s-4)">
          <label class="bw-label">Confirm</label>
          <input
            class="bw-input bw-mono"
            v-model="confirm"
            type="password"
            :inputmode="type === 'pin' ? 'numeric' : 'text'"
            :maxlength="type === 'pin' ? 6 : 80"
          />
        </div>

        <p class="bw-muted" style="margin-top: var(--s-3); font-size: var(--t-sm)">
          PIN: 4-6 digits.
          Password: 10+ characters.
        </p>

        <p v-if="error" class="bw-alert danger" style="margin-top: var(--s-3)">
          {{ error }}
        </p>

        <button
          class="bw-btn primary"
          style="margin-top: var(--s-5); width: 100%; justify-content: center; height: 46px"
          :disabled="loading || !valid"
          @click="submit"
        >
          {{ loading ? 'Saving...' : 'Save authorization' }}
        </button>
      </section>
    </div>
  </AppShell>
</template>
