<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '../lib/api';
import CustomerAuthShell from '../components/CustomerAuthShell.vue';

const route = useRoute();

const token    = ref('');
const password = ref('');
const showPass = ref(false);
const loading  = ref(false);
const error    = ref<string | null>(null);
const success  = ref(false);

const checks = computed(() => [
    { ok: password.value.length >= 8,   label: 'At least 8 characters' },
    { ok: /[A-Z]/.test(password.value), label: 'An uppercase letter' },
    { ok: /[0-9]/.test(password.value), label: 'A number' },
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
    <div v-if="success" class="success-state">
      <div class="success-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <p class="success-title">Password updated</p>
      <p class="success-sub">You can now sign in with your new password.</p>
      <router-link to="/login" class="bw-btn primary auth-btn">
        Sign in
      </router-link>
    </div>

    <!-- Token-missing error -->
    <div v-else-if="!token" class="error-state">
      <p class="error-state-msg">{{ error }}</p>
      <router-link to="/forgot-password" class="bw-btn primary auth-btn">
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

        <ul v-if="password" class="checks">
          <li v-for="c in checks" :key="c.label" :class="{ ok: c.ok }">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <circle cx="6" cy="6" r="5.5" :stroke="c.ok ? 'currentColor' : 'var(--border)'"/>
              <path v-if="c.ok" d="M3.5 6l2 2 3-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ c.label }}
          </li>
        </ul>
      </div>

      <div v-if="error" class="auth-error" role="alert">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" class="error-icon">
          <circle cx="7" cy="7" r="6.5" stroke="currentColor"/>
          <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span>
          {{ error }}
          <router-link v-if="error.includes('expired') || error.includes('invalid')" to="/forgot-password" class="error-link">Request new link →</router-link>
        </span>
      </div>

      <button class="bw-btn primary lg auth-btn" type="submit" :disabled="loading || !strong">
        <span v-if="loading" class="btn-spinner" aria-hidden="true" />
        {{ loading ? 'Updating…' : 'Set new password' }}
      </button>
    </form>
  </CustomerAuthShell>
</template>

<style scoped>
.auth-form { display: flex; flex-direction: column; gap: var(--s-4); }

.field { display: flex; flex-direction: column; gap: 6px; }
.field-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-2);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.password-field { position: relative; }
.password-field .bw-input { padding-right: 76px; }
.password-toggle {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  border: 0;
  background: transparent;
  color: var(--brand);
  font-size: var(--t-xs);
  font-weight: 700;
  cursor: pointer;
  padding: 4px 6px;
}

.checks {
  list-style: none;
  margin: var(--s-2) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.checks li {
  font-size: var(--t-xs);
  color: var(--text-2);
  display: flex;
  align-items: center;
  gap: 6px;
  transition: color var(--dur-fast);
}
.checks li.ok { color: var(--success); }

.auth-error {
  display: flex;
  align-items: flex-start;
  gap: var(--s-2);
  padding: var(--s-3);
  background: oklch(from var(--danger) l c h / 0.10);
  border: 1px solid oklch(from var(--danger) l c h / 0.25);
  border-radius: var(--r-md);
  font-size: var(--t-sm);
  color: var(--danger);
  line-height: 1.5;
}
.error-icon { flex-shrink: 0; margin-top: 1px; }
.auth-error span { flex: 1; }
.error-link { display: block; margin-top: 4px; color: var(--brand); font-weight: 600; text-decoration: none; font-size: var(--t-xs); }
.error-link:hover { text-decoration: underline; }

.auth-btn {
  width: 100%;
  justify-content: center;
  gap: var(--s-2);
  height: 48px;
  font-size: var(--t-md);
  display: inline-flex;
  align-items: center;
}

@keyframes spin { to { transform: rotate(360deg); } }
.btn-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid oklch(100% 0 0 / 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

.success-state, .error-state {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-3);
}
.success-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: oklch(70% 0.19 145 / 0.12);
  color: var(--brand);
  display: grid;
  place-items: center;
}
.success-title { font-weight: 700; font-size: var(--t-lg); margin: 0; }
.success-sub   { font-size: var(--t-sm); color: var(--text-2); margin: 0; }
.error-state-msg { font-size: var(--t-sm); color: var(--text-2); margin: 0; }
</style>
