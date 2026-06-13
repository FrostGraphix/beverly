<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import CustomerAuthShell from '../components/CustomerAuthShell.vue';
import {
    isValidNigerianPhone,
    normaliseNigerianPhone,
    readRememberedLogin,
    safeAuthRedirect,
    writeRememberedLogin,
} from '../lib/auth-flow';
import { unlockLoginVoice, playLoginVoice } from '../utils/voice';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const phoneInput = ref<HTMLInputElement | null>(null);
const emailInput = ref<HTMLInputElement | null>(null);
const loginMode = ref<'email' | 'phone'>('email');
const phone = ref('');
const email = ref('');
const password = ref('');
const showPassword = ref(false);
const rememberLogin = ref(true);
const loading = ref(false);
const error = ref<string | null>(null);
const errorCode = ref<string | null>(null);

const sessionEnded = computed(() => ['session_timeout', 'session_expired'].includes(String(route.query.reason ?? '')));
const passwordReset = computed(() => route.query.reason === 'password_reset');
const redirectTarget = computed(() => safeAuthRedirect(route.query.redirect));
const submitLabel = computed(() => loginMode.value === 'email' ? 'Sign in' : 'Send code');
const loadingLabel = computed(() => loginMode.value === 'email' ? 'Signing in...' : 'Sending code...');

onMounted(() => {
    const remembered = readRememberedLogin();
    if (remembered.includes('@')) email.value = remembered;
    else if (remembered) phone.value = remembered;
    rememberLogin.value = Boolean(remembered);
    if (loginMode.value === 'email') emailInput.value?.focus();
    else phoneInput.value?.focus();
});

async function submit() {
    unlockLoginVoice();
    if (loginMode.value === 'email') {
        if (!email.value || !password.value) {
            error.value = 'Enter your email and password.';
            errorCode.value = null;
            return;
        }
    } else if (!isValidNigerianPhone(phone.value)) {
        error.value = 'Enter a valid Nigerian phone number.';
        errorCode.value = null;
        return;
    }
    loading.value = true;
    error.value = null;
    errorCode.value = null;
    try {
        if (loginMode.value === 'email') {
            const r = await api.post<{ access_token: string; refresh_token?: string | null; expires_at?: number | null; expires_in?: number | null; customer: any; is_new: boolean }>('/api/v1/customer/auth/email/login', {
                email: email.value.trim().toLowerCase(),
                password: password.value,
            });
            auth.setSession(r.access_token, r.customer, rememberLogin.value, {
                refreshToken: r.refresh_token,
                expiresAt: r.expires_at,
                expiresIn: r.expires_in,
            });
            writeRememberedLogin(email.value.trim().toLowerCase(), rememberLogin.value);
            playLoginVoice();
            await router.replace(r.customer.kyc_tier === 0 ? { path: '/kyc', query: { redirect: redirectTarget.value } } : redirectTarget.value);
            return;
        }
        const normalised = normaliseNigerianPhone(phone.value);
        const r = await api.post<{ challenge_id: string; expires_at: string; retry_after_seconds: number }>(
            '/api/v1/customer/auth/login',
            { phone: normalised },
        );
        await router.push({
            name: 'verify',
            query: {
                challenge_id: r.challenge_id,
                phone: normalised,
                expires_at: r.expires_at,
                retry_after_seconds: r.retry_after_seconds,
                redirect: redirectTarget.value,
                remember: rememberLogin.value ? '1' : '0',
            },
        });
        writeRememberedLogin(normalised, rememberLogin.value);
    } catch (e: any) {
        if (e instanceof ApiError) {
            errorCode.value = e.code;
            if (e.code === 'customer_not_found') {
                error.value = 'No account found for this number.';
            } else if (e.code === 'invalid_credentials') {
                error.value = 'Invalid email or password.';
            } else if (e.code === 'rate_limit') {
                error.value = 'Too many requests. Wait a few minutes and try again.';
            } else if (e.code === 'account_inactive') {
                error.value = 'This account has been suspended. Contact support.';
            } else {
                error.value = e.message ?? 'Something went wrong. Please try again.';
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
    title="Welcome back"
    :subtitle="loginMode === 'email' ? 'Enter your email and password' : 'Enter your phone number to receive a sign-in code'"
  >
    <div v-if="sessionEnded" class="session-banner" role="status">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="6.5" stroke="currentColor"/>
        <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <span>Your session timed out for security. Please sign in again.</span>
    </div>

    <div v-if="passwordReset" class="success-banner" role="status">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="6.5" stroke="currentColor"/>
        <path d="M4.5 7l1.8 1.8L9.5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Password updated. Sign in with your new password.
    </div>

    <form class="auth-form" @submit.prevent="submit" novalidate>
      <div class="mode-switch" role="tablist" aria-label="Login method">
        <button type="button" :class="{ active: loginMode === 'email' }" @click="loginMode = 'email'">Email</button>
        <button type="button" :class="{ active: loginMode === 'phone' }" @click="loginMode = 'phone'">Phone OTP</button>
      </div>

      <!-- Phone field -->
      <div v-if="loginMode === 'phone'" class="field">
        <label class="field-label" for="login-phone">Phone number</label>
        <div class="phone-wrap">
          <span class="phone-prefix">
            <span class="flag" aria-hidden="true">NG</span>
            +234
          </span>
          <input
            id="login-phone"
            ref="phoneInput"
            v-model="phone"
            class="bw-input phone-input"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            placeholder="080 0000 0000"
            :disabled="loading"
            @input="error = null"
          />
        </div>
      </div>

      <template v-else>
        <div class="field">
          <label class="field-label" for="login-email">Email</label>
          <input
            id="login-email"
            ref="emailInput"
            v-model="email"
            class="bw-input"
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder="you@example.com"
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
              placeholder="Your password"
              :disabled="loading"
              @input="error = null"
            />
            <button type="button" class="password-toggle" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">
              {{ showPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
          <div class="forgot-row">
            <router-link to="/forgot-password" class="forgot-link">Forgot password?</router-link>
          </div>
        </div>
      </template>

      <label class="remember-row">
        <input v-model="rememberLogin" type="checkbox" />
        Remember this login
      </label>

      <!-- Error -->
      <div v-if="error" class="auth-error" role="alert">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" class="error-icon">
          <circle cx="7" cy="7" r="6.5" stroke="currentColor"/>
          <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span>{{ error }}</span>
        <router-link v-if="errorCode === 'customer_not_found'" to="/signup" class="error-link">Create account →</router-link>
      </div>

      <!-- Submit -->
      <button class="bw-btn primary lg auth-btn" type="submit" :disabled="loading">
        <span v-if="loading" class="btn-spinner" aria-hidden="true" />
        {{ loading ? loadingLabel : submitLabel }}
      </button>

    </form>

    <!-- Footer links -->
    <div class="auth-links">
      <router-link to="/signup" class="auth-inline-link">Create account</router-link>
      <span aria-hidden="true">•</span>
      <router-link to="/recover" class="auth-inline-link">Forget password</router-link>
    </div>
  </CustomerAuthShell>
</template>

<style scoped>
.session-banner {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-3);
  margin-bottom: var(--s-4);
  background: oklch(from var(--warn) l c h / 0.10);
  border: 1px solid oklch(from var(--warn) l c h / 0.30);
  color: var(--warn);
  border-radius: var(--r-md);
  font-size: var(--t-sm);
}
.session-banner span { flex: 1; }

.success-banner {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-3);
  margin-bottom: var(--s-4);
  background: oklch(70% 0.19 145 / 0.10);
  border: 1px solid oklch(70% 0.19 145 / 0.30);
  color: var(--brand);
  border-radius: var(--r-md);
  font-size: var(--t-sm);
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.mode-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface-2);
}
.mode-switch button {
  border: 0;
  border-radius: calc(var(--r-md) - 3px);
  padding: 8px;
  background: transparent;
  color: var(--text-2);
  font-weight: 700;
  cursor: pointer;
}
.mode-switch button.active {
  background: var(--glass-bg-strong);
  color: var(--text);
}

.field { display: flex; flex-direction: column; gap: 6px; }
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
.remember-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-2);
  font-size: var(--t-sm);
}

.field-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-2);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.phone-wrap {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface-2);
  overflow: hidden;
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.phone-wrap:focus-within {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-glow);
}

.phone-prefix {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 var(--s-3);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--text-2);
  border-right: 1px solid var(--border);
  background: var(--surface-3);
  white-space: nowrap;
  flex-shrink: 0;
  user-select: none;
}

.flag { font-size: 16px; line-height: 1; }

.phone-input {
  flex: 1;
  border: none !important;
  box-shadow: none !important;
  background: transparent;
  border-radius: 0 !important;
  padding-left: var(--s-3);
  font-size: var(--t-base);
  min-width: 0;
}
.phone-input:focus { outline: none; }

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
  flex-wrap: wrap;
}
.error-icon { flex-shrink: 0; margin-top: 1px; }
.auth-error span { flex: 1; }
.error-link {
  display: block;
  margin-top: 4px;
  color: var(--brand);
  font-weight: 600;
  text-decoration: none;
  font-size: var(--t-xs);
  width: 100%;
}

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

.auth-links {
  margin-top: var(--s-5);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  font-size: var(--t-sm);
  color: var(--text-2);
  white-space: nowrap;
}
.auth-inline-link {
  color: var(--brand);
  font-weight: 600;
  text-decoration: none;
}
.auth-inline-link:hover { text-decoration: underline; }

.forgot-row { text-align: right; margin-top: var(--s-1); }
.forgot-link { font-size: var(--t-xs); color: var(--brand); text-decoration: none; font-weight: 600; }
.forgot-link:hover { text-decoration: underline; }
</style>
