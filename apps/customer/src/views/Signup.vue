<script setup lang="ts">
import { nextTick, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import CustomerAuthShell from '../components/CustomerAuthShell.vue';
import { isValidNigerianPhone, normaliseNigerianPhone } from '../lib/auth-flow';

const router = useRouter();
const auth = useAuthStore();
const nameInput = ref<HTMLInputElement | null>(null);
const passwordInput = ref<HTMLInputElement | null>(null);

const accountMode = ref<'email' | 'phone'>('email');
const step = ref<'details' | 'password'>('details');
const fullName = ref('');
const phone = ref('');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const errorCode = ref<string | null>(null);

onMounted(() => nameInput.value?.focus());

function switchMode(mode: 'email' | 'phone') {
    accountMode.value = mode;
    step.value = 'details';
    error.value = null;
    errorCode.value = null;
}

function validateDetails(): string | null {
    if (!fullName.value.trim() || fullName.value.trim().length < 2) {
        return 'Enter your full name (at least 2 characters).';
    }
    if (accountMode.value === 'phone' && !isValidNigerianPhone(phone.value)) {
        return 'Enter a valid Nigerian phone number.';
    }
    if (accountMode.value === 'email' && !email.value) {
        return 'Enter a valid email address.';
    }
    if (email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        return 'Enter a valid email address.';
    }
    return null;
}

function validatePassword(): string | null {
    if (password.value.length < 8) {
        return 'Password must be at least 8 characters.';
    }
    if (password.value !== confirmPassword.value) {
        return 'Passwords do not match.';
    }
    return null;
}

async function continueFromDetails() {
    const validationError = validateDetails();
    if (validationError) {
        error.value = validationError;
        errorCode.value = null;
        return;
    }
    error.value = null;
    step.value = 'password';
    nextTick(() => passwordInput.value?.focus());
}

function backToDetails() {
    error.value = null;
    step.value = 'details';
}

async function submitPassword() {
    if (accountMode.value === 'email') {
        await submitEmail();
    } else {
        await submitPhonePassword();
    }
}

async function submitPhonePassword() {
    const validationError = validatePassword();
    if (validationError) {
        error.value = validationError;
        errorCode.value = null;
        return;
    }
    loading.value = true;
    error.value = null;
    errorCode.value = null;
    try {
        const normalised = normaliseNigerianPhone(phone.value);
        const r = await api.post<{ access_token: string; refresh_token?: string | null; expires_at?: number | null; expires_in?: number | null; customer: any; is_new: boolean }>('/api/v1/customer/auth/phone/signup', {
            phone: normalised,
            password: password.value,
            full_name: fullName.value.trim(),
            email: email.value.trim() || undefined,
        });
        auth.setSession(r.access_token, r.customer, true, {
            refreshToken: r.refresh_token,
            expiresAt: r.expires_at,
            expiresIn: r.expires_in,
        });
        await router.replace(r.customer.kyc_tier === 0 ? '/kyc' : '/');
    } catch (e: any) {
        handleError(e);
        if (errorCode.value === 'email_in_use' || errorCode.value === 'phone_in_use') {
            step.value = 'details';
        }
    } finally {
        loading.value = false;
    }
}

async function submitPhoneOtp() {
    const validationError = validateDetails();
    if (validationError) {
        error.value = validationError;
        errorCode.value = null;
        return;
    }
    loading.value = true;
    error.value = null;
    errorCode.value = null;
    try {
        const normalised = normaliseNigerianPhone(phone.value);
        const r = await api.post<{ challenge_id: string; expires_at: string; retry_after_seconds: number }>('/api/v1/customer/auth/signup', {
            phone: normalised,
            email: email.value.trim() || undefined,
            full_name: fullName.value.trim(),
        });
        await router.push({
            name: 'verify',
            query: {
                challenge_id: r.challenge_id,
                phone: normalised,
                signup: '1',
                full_name: fullName.value.trim(),
                email: email.value.trim() || undefined,
                expires_at: r.expires_at,
                retry_after_seconds: r.retry_after_seconds,
            },
        });
    } catch (e: any) {
        handleError(e);
    } finally {
        loading.value = false;
    }
}

async function submitEmail() {
    const validationError = validatePassword();
    if (validationError) {
        error.value = validationError;
        errorCode.value = null;
        return;
    }
    loading.value = true;
    error.value = null;
    errorCode.value = null;
    try {
        const r = await api.post<{ access_token: string; refresh_token?: string | null; expires_at?: number | null; expires_in?: number | null; customer: any; is_new: boolean }>('/api/v1/customer/auth/email/signup', {
            email: email.value.trim().toLowerCase(),
            password: password.value,
            full_name: fullName.value.trim(),
            phone: phone.value.trim() ? normaliseNigerianPhone(phone.value) : undefined,
        });
        auth.setSession(r.access_token, r.customer, true, {
            refreshToken: r.refresh_token,
            expiresAt: r.expires_at,
            expiresIn: r.expires_in,
        });
        if (!r.customer?.email_verified_at) {
            await router.replace('/verify-email');
        } else {
            await router.replace(r.customer.kyc_tier === 0 ? '/kyc' : '/');
        }
    } catch (e: any) {
        handleError(e);
        if (errorCode.value === 'email_in_use' || errorCode.value === 'phone_in_use') {
            step.value = 'details';
        }
    } finally {
        loading.value = false;
    }
}

function handleError(e: any) {
    if (e instanceof ApiError) {
        errorCode.value = e.code;
        if (e.code === 'rate_limit') {
            error.value = 'Too many requests. Wait a few minutes and try again.';
        } else if (e.code === 'email_in_use') {
            error.value = 'An account already exists for this email.';
        } else if (e.code === 'phone_in_use') {
            error.value = 'An account already exists for this phone.';
        } else if (e.code === 'weak_password') {
            error.value = 'Password must be at least 8 characters.';
        } else {
            error.value = e.message ?? 'Something went wrong. Please try again.';
        }
    } else {
        error.value = 'Could not connect. Check your internet and try again.';
    }
}
</script>

<template>
  <CustomerAuthShell
    title="Create account"
    back="/login"
    compact
  >
    <template #header-accessory>
      <div class="step-indicator" aria-label="Signup progress">
        <div class="step-dot" :class="{ 'step-dot--active': step === 'details', 'step-dot--done': step === 'password' }">1</div>
        <div class="step-line" :class="{ 'step-line--done': step === 'password' }" />
        <div class="step-dot" :class="{ 'step-dot--active': step === 'password' }">2</div>
      </div>
    </template>

    <form class="auth-form" @submit.prevent novalidate>
      <div class="mode-switch" role="tablist" aria-label="Signup method">
        <button type="button" :class="{ active: accountMode === 'email' }" @click="switchMode('email')">Email account</button>
        <button type="button" :class="{ active: accountMode === 'phone' }" @click="switchMode('phone')">Phone account</button>
      </div>

      <!-- STEP 1: details -->
      <template v-if="step === 'details'">
        <div class="field">
          <label class="field-label" for="signup-name">Full name</label>
          <input
            id="signup-name"
            ref="nameInput"
            v-model="fullName"
            class="bw-input"
            type="text"
            autocomplete="name"
            placeholder="Amaka Obi"
            :disabled="loading"
            @input="error = null"
            @keydown.enter.prevent="continueFromDetails"
          />
        </div>

        <!-- Phone -->
        <div class="field">
          <label class="field-label" for="signup-phone">
            Phone number
            <span v-if="accountMode === 'email'" class="field-optional">Optional</span>
          </label>
          <div class="phone-wrap">
            <span class="phone-prefix">
              <span class="flag" aria-hidden="true">NG</span>
              +234
            </span>
            <input
              id="signup-phone"
              v-model="phone"
              class="bw-input phone-input"
              type="tel"
              inputmode="tel"
              autocomplete="tel"
              placeholder="080 0000 0000"
              :disabled="loading"
              @input="error = null"
              @keydown.enter.prevent="continueFromDetails"
            />
          </div>
          <p class="field-hint">{{ accountMode === 'phone' ? 'Your primary login phone number.' : 'Optional for account recovery.' }}</p>
        </div>

        <!-- Email -->
        <div class="field">
          <label class="field-label" for="signup-email">
            Email
            <span v-if="accountMode === 'phone'" class="field-optional">Optional</span>
          </label>
          <input
            id="signup-email"
            v-model="email"
            class="bw-input"
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder="you@example.com"
            :disabled="loading"
            @input="error = null"
            @keydown.enter.prevent="continueFromDetails"
          />
          <p class="field-hint">{{ accountMode === 'email' ? 'This will be your login credential.' : 'Optional, for order and account updates.' }}</p>
        </div>

        <div v-if="error" class="auth-error" role="alert">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" class="error-icon">
            <circle cx="7" cy="7" r="6.5" stroke="currentColor"/>
            <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span>{{ error }}</span>
        </div>

        <button class="bw-btn primary lg auth-btn" type="button" :disabled="loading" @click="continueFromDetails">
          <span v-if="loading" class="btn-spinner" aria-hidden="true" />
          {{ loading ? 'Processing…' : 'Continue' }}
        </button>
        <button v-if="accountMode === 'phone'" class="bw-btn secondary lg auth-btn" type="button" style="margin-top: 8px;" :disabled="loading" @click="submitPhoneOtp">
          Send SMS OTP Instead
        </button>
      </template>

      <!-- STEP 2: password -->
      <template v-else>
        <button type="button" class="step-back" @click="backToDetails">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M9 11L5 7l4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Back
        </button>

        <div class="field">
          <label class="field-label" for="signup-password">Password</label>
          <div class="password-field">
            <input
              id="signup-password"
              ref="passwordInput"
              v-model="password"
              class="bw-input"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="At least 8 characters"
              :disabled="loading"
              @input="error = null"
            />
            <button type="button" class="password-toggle" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">
              {{ showPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="signup-confirm-password">Confirm password</label>
          <input
            id="signup-confirm-password"
            v-model="confirmPassword"
            class="bw-input"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password"
            placeholder="Re-enter your password"
            :disabled="loading"
            @input="error = null"
            @keydown.enter.prevent="submitPassword"
          />
        </div>

        <div v-if="error" class="auth-error" role="alert">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" class="error-icon">
            <circle cx="7" cy="7" r="6.5" stroke="currentColor"/>
            <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span>{{ error }}</span>
        </div>

        <button class="bw-btn primary lg auth-btn" type="button" :disabled="loading" @click="submitPassword">
          <span v-if="loading" class="btn-spinner" aria-hidden="true" />
          {{ loading ? 'Creating account...' : 'Create account' }}
        </button>
      </template>

    </form>

    <!-- Footer -->
    <p class="auth-footer">
      Already have an account?
      <router-link to="/login" class="auth-inline-link">Sign in</router-link>
    </p>
  </CustomerAuthShell>
</template>

<style scoped>
.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
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

.step-indicator {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}
.step-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  background: var(--surface-2);
  border: 1.5px solid var(--border);
  color: var(--text-2);
  transition: all var(--dur-fast);
}
.step-dot--active {
  background: var(--brand);
  border-color: var(--brand);
  color: #04140b;
}
.step-dot--done {
  background: oklch(70% 0.19 145 / 0.15);
  border-color: var(--brand);
  color: var(--brand);
}
.step-line {
  width: 32px;
  height: 1.5px;
  background: var(--border);
  transition: background var(--dur-fast);
}
.step-line--done { background: var(--brand); }

.step-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  padding: 0;
  margin-bottom: 2px;
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--text-2);
  cursor: pointer;
  align-self: flex-start;
  transition: color var(--dur-fast);
}
.step-back:hover { color: var(--brand); }

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
  font-weight: 700;
  cursor: pointer;
}

.field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-2);
  letter-spacing: 0.01em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: var(--s-2);
}

.field-optional {
  font-size: var(--t-xs);
  font-weight: 500;
  color: var(--text-2);
  text-transform: none;
  letter-spacing: 0;
  background: var(--surface-3);
  padding: 1px 6px;
  border-radius: var(--r-full);
}

.field-hint {
  font-size: var(--t-xs);
  color: var(--text-2);
  margin: 0;
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
}
.error-icon { flex-shrink: 0; margin-top: 1px; }

.auth-btn {
  width: 100%;
  justify-content: center;
  gap: var(--s-2);
  height: 48px;
  font-size: var(--t-md);
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

.auth-footer {
  margin-top: var(--s-5);
  font-size: var(--t-sm);
  color: var(--text-2);
  text-align: center;
}
.auth-inline-link {
  color: var(--brand);
  font-weight: 600;
  text-decoration: none;
  margin-left: 4px;
}
.auth-inline-link:hover { text-decoration: underline; }
</style>
