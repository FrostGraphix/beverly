<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useVendorAuthStore } from '../stores/auth';
import { api, ApiError } from '../lib/api';
import VendorAuthShell from '../components/VendorAuthShell.vue';

const REMEMBERED_VENDOR_EMAIL_KEY = 'beverly.vendor.remembered_email';

const router = useRouter();
const route  = useRoute();
const auth   = useVendorAuthStore();

const sessionEnded = computed(() => ['session_timeout', 'session_expired'].includes(String(route.query.reason ?? '')));
const redirectTarget = computed(() => safeRedirectTarget(route.query.redirect));

const email        = ref('');
const password     = ref('');
const showPassword = ref(false);
const rememberEmail = ref(true);
const loading      = ref(false);
const error        = ref<string | null>(null);

function safeRedirectTarget(raw: unknown, fallback = '/') {
    if (typeof raw !== 'string') return fallback;
    const value = raw.trim();
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
    return value;
}

async function submit() {
    const normalizedEmail = email.value.trim().toLowerCase();
    if (!normalizedEmail || !password.value) {
        error.value = 'Email and password are required.';
        return;
    }
    loading.value = true;
    error.value   = null;
    try {
        const r = await api.post<{ access_token: string; vendor: any }>(
            '/api/v1/vendor/auth/email/login',
            { email: normalizedEmail, password: password.value },
        );

        auth.setSession(r.access_token, r.vendor, rememberEmail.value);
        if (rememberEmail.value) localStorage.setItem(REMEMBERED_VENDOR_EMAIL_KEY, normalizedEmail);
        else localStorage.removeItem(REMEMBERED_VENDOR_EMAIL_KEY);
        await router.push(r.vendor.password_reset_required
            ? { path: '/password-change', query: { redirect: redirectTarget.value } }
            : redirectTarget.value);
    } catch (e: any) {
        if (e instanceof ApiError) {
            error.value =
                e.code === 'invalid_credentials' ? 'Invalid email or password.'
                : e.code === 'not_vendor' ? 'Access denied. This is not a vendor account.'
                : e.code === 'account_inactive' ? 'This vendor account is not active. Contact support.'
                : e.code === 'org_not_approved' ? 'Your vendor organization is not approved yet.'
                : e.code === 'auth_not_configured' || e.code === 'auth_upstream_unreachable'
                    ? 'Authentication is temporarily unavailable. Try again shortly.'
                : (e.message ?? 'Sign-in failed.');
        } else {
            error.value = 'Network error. Please try again.';
        }
    } finally {
        loading.value = false;
    }
}

const rememberedEmail = localStorage.getItem(REMEMBERED_VENDOR_EMAIL_KEY);
if (rememberedEmail) email.value = rememberedEmail;
rememberEmail.value = Boolean(rememberedEmail);
</script>

<template>
  <VendorAuthShell
    title="Sign in"
    subtitle="Access your Beverly vendor account"
  >
    <div v-if="sessionEnded" class="session-banner" role="status">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="6.5" stroke="currentColor"/>
        <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <span>Your session timed out for security. Please sign in again.</span>
    </div>

    <form class="auth-form" @submit.prevent="submit" novalidate>
      <div class="field">
        <label class="field-label" for="login-email">Email</label>
        <input
          id="login-email"
          v-model.trim="email"
          class="bw-input"
          type="email"
          inputmode="email"
          autocomplete="username"
          placeholder="vendor@example.com"
          :disabled="loading"
          @input="error = null"
        />
      </div>

      <div class="field">
        <label class="field-label" for="login-password">Password</label>
        <div class="password-field">
          <input
            id="login-password"
            v-model="password"
            class="bw-input"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
            placeholder="Password"
            :disabled="loading"
            @input="error = null"
          />
          <button
            type="button"
            class="password-toggle"
            :aria-label="showPassword ? 'Hide password' : 'Show password'"
            @click="showPassword = !showPassword"
          >{{ showPassword ? 'Hide' : 'Show' }}</button>
        </div>
      </div>

      <div class="login-row">
        <label class="remember-row">
          <input v-model="rememberEmail" type="checkbox" />
          Remember email
        </label>
        <router-link to="/forgot-password" class="forgot-link">Forgot password?</router-link>
      </div>

      <div v-if="error" class="auth-error" role="alert">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" class="error-icon">
          <circle cx="7" cy="7" r="6.5" stroke="currentColor"/>
          <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span>{{ error }}</span>
      </div>

      <button class="bw-btn primary lg auth-btn" type="submit" :disabled="loading || !email || !password">
        <span v-if="loading" class="btn-spinner" aria-hidden="true" />
        {{ loading ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
  </VendorAuthShell>
</template>

<style scoped>
.session-banner {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-3);
  background: oklch(from var(--warn) l c h / 0.10);
  border: 1px solid oklch(from var(--warn) l c h / 0.30);
  color: var(--warn);
  border-radius: var(--r-md);
  font-size: var(--t-sm);
}
.session-banner span { flex: 1; }

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

.login-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
}
.remember-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-2);
  font-size: var(--t-sm);
  cursor: pointer;
}
.forgot-link {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--brand);
  text-decoration: none;
}
.forgot-link:hover { text-decoration: underline; }

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
</style>
