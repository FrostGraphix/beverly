<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, ApiError } from '../lib/api';
import CustomerAuthShell from '../components/CustomerAuthShell.vue';

const route = useRoute();
const router = useRouter();

const email = String(route.query.email ?? '');

const step = ref<'code' | 'password'>('code');
const digits = ref<string[]>(['', '', '', '', '', '']);
const inputs = ref<HTMLInputElement[]>([]);
const newPassword = ref('');
const confirmPassword = ref('');
const newPasswordInput = ref<HTMLInputElement | null>(null);
const showPassword = ref(false);
const loading = ref(false);
const resending = ref(false);
const success = ref(false);
const error = ref<string | null>(null);

const RESEND_COOLDOWN = 45;
const resendCd = ref(RESEND_COOLDOWN);
let resendTimer: ReturnType<typeof setInterval>;

onMounted(() => {
    if (!email) {
        router.replace('/recover');
        return;
    }
    inputs.value[0]?.focus();
    startResendCooldown();
});

onBeforeUnmount(() => clearInterval(resendTimer));

function startResendCooldown() {
    resendCd.value = RESEND_COOLDOWN;
    clearInterval(resendTimer);
    resendTimer = setInterval(() => {
        if (--resendCd.value <= 0) clearInterval(resendTimer);
    }, 1000);
}

function onInput(i: number, e: Event) {
    const v = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(-1);
    digits.value[i] = v;
    if (v && i < 5) nextTick(() => inputs.value[i + 1]?.focus());
    if (v && i === 5 && digits.value.every((d) => d)) goToPasswordStep();
}

function onKeydown(i: number, e: KeyboardEvent) {
    if (e.key === 'Backspace' && !digits.value[i] && i > 0) {
        digits.value[i - 1] = '';
        inputs.value[i - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && i > 0) inputs.value[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) inputs.value[i + 1]?.focus();
}

function onPaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text')?.replace(/\D/g, '').slice(0, 6) ?? '';
    if (text.length === 6) {
        text.split('').forEach((c, i) => { digits.value[i] = c; });
        nextTick(() => goToPasswordStep());
    }
}

function clearDigits() {
    digits.value = ['', '', '', '', '', ''];
    nextTick(() => inputs.value[0]?.focus());
}

function goToPasswordStep() {
    error.value = null;
    step.value = 'password';
    nextTick(() => newPasswordInput.value?.focus());
}

function backToCodeStep() {
    error.value = null;
    step.value = 'code';
    nextTick(() => inputs.value.find((el) => !el?.value)?.focus() ?? inputs.value[0]?.focus());
}

function friendlyError(e: ApiError): string {
    switch (e.code) {
        case 'otp_expired': return 'This code has expired. Request a new one.';
        case 'otp_incorrect': return 'Incorrect code. Check your email and try again.';
        case 'otp_locked': return 'Too many incorrect attempts. Request a new code.';
        case 'otp_not_found': return 'This code is no longer valid. Request a new one.';
        case 'weak_password': return 'Password must be at least 8 characters.';
        default: return e.message ?? 'Something went wrong. Please try again.';
    }
}

function continueFromCode() {
    const code = digits.value.join('');
    if (code.length !== 6) {
        error.value = 'Enter the 6-digit code from your email.';
        return;
    }
    goToPasswordStep();
}

async function submit() {
    const code = digits.value.join('');
    if (newPassword.value.length < 8) {
        error.value = 'Password must be at least 8 characters.';
        return;
    }
    if (newPassword.value !== confirmPassword.value) {
        error.value = 'Passwords do not match.';
        return;
    }
    loading.value = true;
    error.value = null;
    try {
        await api.post('/api/v1/customer/auth/email/reset-password', {
            email,
            code,
            new_password: newPassword.value,
        });
        success.value = true;
        await new Promise((res) => setTimeout(res, 900));
        await router.replace({ name: 'login', query: { reason: 'password_reset' } });
    } catch (e: any) {
        if (e instanceof ApiError) {
            const isCodeIssue = ['otp_expired', 'otp_incorrect', 'otp_locked', 'otp_not_found'].includes(e.code);
            if (isCodeIssue) {
                clearDigits();
                step.value = 'code';
            }
            error.value = friendlyError(e);
        } else {
            error.value = 'Could not connect. Check your internet and try again.';
        }
    } finally {
        loading.value = false;
    }
}

async function resend() {
    if (resendCd.value > 0 || resending.value) return;
    resending.value = true;
    error.value = null;
    try {
        await api.post('/api/v1/customer/auth/email/recover', { email });
        clearDigits();
        startResendCooldown();
    } catch {
        error.value = 'Could not resend code. Try again shortly.';
    } finally {
        resending.value = false;
    }
}
</script>

<template>
  <CustomerAuthShell
    title="Set a new password"
    :subtitle="step === 'code' ? 'Enter the code we emailed you' : 'Choose a new password'"
    back="/recover"
  >
    <div class="email-badge">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <rect x="1" y="2.5" width="12" height="9" rx="1.5" stroke="currentColor"/>
        <path d="M1.5 3.5l5.5 4 5.5-4" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>Code sent to <strong>{{ email }}</strong></span>
    </div>

    <!-- Step indicator -->
    <div v-if="!success" class="step-indicator">
      <div class="step-dot" :class="{ 'step-dot--active': step === 'code', 'step-dot--done': step === 'password' }">1</div>
      <div class="step-line" :class="{ 'step-line--done': step === 'password' }" />
      <div class="step-dot" :class="{ 'step-dot--active': step === 'password' }">2</div>
    </div>

    <!-- STEP 1: code -->
    <form v-if="step === 'code' && !success" class="auth-form" @submit.prevent="continueFromCode" novalidate>
      <div class="field">
        <label class="field-label">Reset code</label>
        <div class="otp-row" @paste.prevent="onPaste">
          <input
            v-for="(_, i) in digits"
            :key="i"
            ref="inputs"
            class="otp-digit"
            :class="{ 'otp-digit--filled': !!digits[i] }"
            :value="digits[i]"
            type="text"
            inputmode="numeric"
            maxlength="1"
            autocomplete="one-time-code"
            :disabled="loading"
            @input="onInput(i, $event)"
            @keydown="onKeydown(i, $event)"
          />
        </div>
      </div>

      <div v-if="error" class="auth-error" role="alert">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" class="error-icon">
          <circle cx="7" cy="7" r="6.5" stroke="currentColor"/>
          <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span>{{ error }}</span>
      </div>

      <button class="bw-btn primary lg auth-btn" type="submit" :disabled="digits.some((d) => !d)">
        Continue
      </button>

      <div class="verify-footer">
        <span class="footer-muted">Didn't get a code?</span>
        <button
          class="resend-btn"
          :class="{ 'resend-btn--active': resendCd <= 0 && !resending }"
          type="button"
          :disabled="resendCd > 0 || resending"
          @click="resend"
        >
          {{ resending ? 'Sending…' : resendCd > 0 ? `Resend in ${resendCd}s` : 'Resend code' }}
        </button>
      </div>
    </form>

    <!-- STEP 2: new password -->
    <form v-else-if="!success" class="auth-form" @submit.prevent="submit" novalidate>
      <button type="button" class="step-back" @click="backToCodeStep">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M9 11L5 7l4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Change code
      </button>

      <div class="field">
        <label class="field-label" for="new-password">New password</label>
        <div class="password-field">
          <input
            id="new-password"
            ref="newPasswordInput"
            v-model="newPassword"
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
        <label class="field-label" for="confirm-password">Confirm password</label>
        <input
          id="confirm-password"
          v-model="confirmPassword"
          class="bw-input"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="new-password"
          placeholder="Re-enter your new password"
          :disabled="loading"
          @input="error = null"
        />
      </div>

      <div v-if="error" class="auth-error" role="alert">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" class="error-icon">
          <circle cx="7" cy="7" r="6.5" stroke="currentColor"/>
          <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span>{{ error }}</span>
      </div>

      <button class="bw-btn primary lg auth-btn" type="submit" :disabled="loading">
        <span v-if="loading" class="btn-spinner" aria-hidden="true" />
        {{ loading ? 'Updating…' : 'Reset password' }}
      </button>
    </form>

    <!-- Success -->
    <div v-if="success" class="verify-success" role="status">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="8.5" stroke="currentColor"/>
        <path d="M5 9l3 3 5-5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Password updated! Taking you to sign in…
    </div>
  </CustomerAuthShell>
</template>

<style scoped>
.email-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: 6px 12px;
  margin-bottom: var(--s-4);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-full);
  font-size: var(--t-sm);
  color: var(--text-2);
  max-width: 100%;
}
.email-badge strong { color: var(--text); word-break: break-all; }
.email-badge svg { flex-shrink: 0; }

.step-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: var(--s-5);
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

.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.field { display: flex; flex-direction: column; gap: 6px; }
.field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-2);
  letter-spacing: 0.01em;
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
  font-weight: 700;
  cursor: pointer;
}

.otp-row {
  display: flex;
  gap: var(--s-2);
  justify-content: space-between;
}
.otp-digit {
  width: 15%;
  aspect-ratio: 46 / 58;
  border-radius: var(--r-lg);
  border: 1.5px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  font-size: var(--t-2xl);
  font-weight: 700;
  font-family: var(--font-mono);
  text-align: center;
  outline: none;
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast), background var(--dur-fast);
  caret-color: var(--brand);
  -webkit-appearance: none;
}
.otp-digit:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
.otp-digit--filled { border-color: oklch(70% 0.19 145 / 0.5); background: oklch(70% 0.19 145 / 0.05); }

.verify-success {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--brand);
  padding: var(--s-2) 0;
}

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

.verify-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  flex-wrap: wrap;
}
.footer-muted { font-size: var(--t-sm); color: var(--text-2); }
.resend-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--text-2);
  cursor: default;
  transition: color var(--dur-fast);
}
.resend-btn--active { color: var(--brand); cursor: pointer; }
.resend-btn--active:hover { text-decoration: underline; }

@media (max-width: 380px) {
  .otp-digit { font-size: var(--t-xl); }
}
</style>
