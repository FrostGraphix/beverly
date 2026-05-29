<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, ApiError } from '../lib/api';
import CustomerAuthShell from '../components/CustomerAuthShell.vue';

const route  = useRoute();
const router = useRouter();

const token       = ref('');
const password    = ref('');
const showPass    = ref(false);
const loading     = ref(false);
const error       = ref<string | null>(null);
const success     = ref(false);

// Password strength (min 8 chars for customers)
const checks = computed(() => [
    { ok: password.value.length >= 8,        label: 'At least 8 characters' },
    { ok: /[A-Z]/.test(password.value),      label: 'An uppercase letter' },
    { ok: /[0-9]/.test(password.value),      label: 'A number' },
]);
const strong = computed(() => checks.value.every((c) => c.ok));

onMounted(() => {
    const t = route.query.token as string | undefined;
    if (!t) {
        error.value = 'Missing or invalid reset link. Please request a new one.';
        return;
    }
    token.value = t;
});

async function submit() {
    if (!strong.value) return;
    loading.value = true;
    error.value   = null;
    try {
        await api.post('/api/v1/customer/auth/email/reset-confirm', {
            token:        token.value,
            new_password: password.value,
        });
        success.value = true;
    } catch (e: any) {
        if (e instanceof ApiError) {
            if (e.code === 'token_expired') {
                error.value = 'This reset link has expired. Please request a new one.';
            } else if (e.code === 'invalid_token') {
                error.value = 'Invalid reset link. Please request a new one.';
            } else if (e.code === 'weak_password') {
                error.value = e.message;
            } else {
                error.value = e.message ?? 'Could not reset password. Please try again.';
            }
        } else {
            error.value = 'Could not connect. Check your internet and try again.';
        }
    } finally {
        loading.value = false;
    }
}
</script>

<template>
  <CustomerAuthShell
    title="Set new password"
    subtitle="Choose a strong password for your Beverly account"
    back="/forgot-password"
  >
    <!-- Success state -->
    <div v-if="success" style="text-align:center; padding: var(--s-4) 0">
      <div style="width:56px;height:56px;border-radius:50%;background:var(--success-bg);display:grid;place-items:center;margin:0 auto var(--s-4)">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <p style="font-weight:600; margin:0 0 var(--s-2)">Password updated</p>
      <p class="bw-muted" style="font-size:var(--t-sm); margin:0 0 var(--s-5)">You can now sign in with your new password.</p>
      <router-link to="/login" class="bw-btn primary" style="text-decoration:none; display:inline-flex">
        Sign in
      </router-link>
    </div>

    <!-- Token-missing error -->
    <div v-else-if="!token" style="text-align:center; padding: var(--s-4) 0">
      <p class="bw-muted" style="margin:0 0 var(--s-5)">{{ error }}</p>
      <router-link to="/forgot-password" class="bw-btn primary" style="text-decoration:none; display:inline-flex">
        Request new link
      </router-link>
    </div>

    <!-- Form state -->
    <form v-else class="auth-form" @submit.prevent="submit" novalidate>
      <div class="field">
        <label class="field-label" for="rp-password">New password</label>
        <div class="password-field">
          <input
            id="rp-password"
            v-model="password"
            class="bw-input"
            :type="showPass ? 'text' : 'password'"
            autocomplete="new-password"
            placeholder="At least 8 characters"
            :disabled="loading"
            @input="error = null"
          />
          <button type="button" class="password-toggle" :aria-label="showPass ? 'Hide password' : 'Show password'" @click="showPass = !showPass">
            {{ showPass ? 'Hide' : 'Show' }}
          </button>
        </div>

        <!-- Strength checklist -->
        <ul v-if="password" style="list-style:none; margin: var(--s-2) 0 0; padding:0; display:flex; flex-direction:column; gap:4px">
          <li v-for="c in checks" :key="c.label" :style="{ fontSize: 'var(--t-xs)', color: c.ok ? 'var(--success)' : 'var(--text-muted)', display:'flex', alignItems:'center', gap:'6px' }">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5.5" :stroke="c.ok ? 'var(--success)' : 'var(--border)'"/>
              <path v-if="c.ok" d="M3.5 6l2 2 3-4" stroke="var(--success)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ c.label }}
          </li>
        </ul>
      </div>

      <div v-if="error" class="auth-error" role="alert">
        {{ error }}
        <router-link v-if="error.includes('expired') || error.includes('invalid')" to="/forgot-password" class="error-link">Request new link →</router-link>
      </div>

      <button class="bw-btn primary lg auth-btn" type="submit" :disabled="loading || !strong">
        <span v-if="loading" class="btn-spinner" aria-hidden="true" />
        {{ loading ? 'Updating…' : 'Set new password' }}
      </button>
    </form>
  </CustomerAuthShell>
</template>

<style scoped>
.password-field { position: relative; }
.password-field .bw-input { padding-right: 76px; }
.password-toggle {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  background: none; border: none; cursor: pointer;
  font-size: var(--t-xs); color: var(--text-muted); padding: 4px 6px;
}
</style>
