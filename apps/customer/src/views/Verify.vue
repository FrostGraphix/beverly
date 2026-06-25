<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import CustomerAuthShell from '../components/CustomerAuthShell.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const challengeId = route.query.challenge_id as string;
const phone = route.query.phone as string;
const isSignup = route.query.signup === '1';
const isRecovery = route.query.recovery === '1';
// Stored for signup resend
const storedFullName = route.query.full_name as string | undefined;
const storedEmail = route.query.email as string | undefined;

const digits = ref<string[]>(['', '', '', '', '', '']);
const inputs = ref<HTMLInputElement[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const success = ref(false);

// Resend cooldown (30s between sends)
const resendCd = ref(30);
let resendTimer: ReturnType<typeof setInterval>;

// OTP expires in 5 minutes; show countdown last 60s
const expiryMs = 5 * 60 * 1000;
let sentAt = Date.now();
const expiresIn = ref(Math.floor(expiryMs / 1000));
let expiryTimer: ReturnType<typeof setInterval>;

onMounted(() => {
    inputs.value[0]?.focus();
    startResendCooldown();
    startExpiryCountdown();
});

onBeforeUnmount(() => {
    clearInterval(resendTimer);
    clearInterval(expiryTimer);
});

function startResendCooldown() {
    resendCd.value = 30;
    clearInterval(resendTimer);
    resendTimer = setInterval(() => {
        if (--resendCd.value <= 0) clearInterval(resendTimer);
    }, 1000);
}

function startExpiryCountdown() {
    clearInterval(expiryTimer);
    expiryTimer = setInterval(() => {
        const remaining = Math.max(0, Math.floor((sentAt + expiryMs - Date.now()) / 1000));
        expiresIn.value = remaining;
        if (remaining === 0) clearInterval(expiryTimer);
    }, 1000);
}

// Masked phone: +234 8XX XXX XX90 → +234 8** *** **90
const maskedPhone = computed(() => {
    if (!phone) return '';
    const raw = phone.replace(/\s/g, '');
    if (raw.length < 8) return phone;
    return raw.slice(0, 5) + '***' + raw.slice(-4);
});

const expiryLabel = computed(() => {
    if (expiresIn.value <= 0) return 'Code expired';
    const m = Math.floor(expiresIn.value / 60);
    const s = expiresIn.value % 60;
    return m > 0 ? `Expires in ${m}m ${s.toString().padStart(2, '0')}s` : `Expires in ${s}s`;
});

const expiryWarning = computed(() => expiresIn.value > 0 && expiresIn.value <= 60);
const expired = computed(() => expiresIn.value <= 0);

function onInput(i: number, e: Event) {
    const v = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(-1);
    digits.value[i] = v;
    if (v && i < 5) nextTick(() => inputs.value[i + 1]?.focus());
    if (digits.value.every((d) => d)) submit();
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
        nextTick(() => {
            inputs.value[5]?.focus();
            submit();
        });
    }
}

function clearDigits() {
    digits.value = ['', '', '', '', '', ''];
    nextTick(() => inputs.value[0]?.focus());
}

async function submit() {
    if (loading.value || success.value) return;
    const otp = digits.value.join('');
    if (otp.length !== 6) return;
    loading.value = true;
    error.value = null;
    try {
        const r = await api.post<{ access_token: string; customer: any; is_new: boolean }>(
            '/api/v1/customer/auth/verify',
            { challenge_id: challengeId, otp },
        );
        success.value = true;
        auth.setSession(r.access_token, r.customer);
        await new Promise((res) => setTimeout(res, 600)); // brief success pause
        await router.replace(r.customer.kyc_tier === 0 ? '/kyc' : '/');
    } catch (e: any) {
        if (e instanceof ApiError) {
            if (e.code === 'otp_expired') {
                error.value = 'This code has expired. Request a new one.';
            } else if (e.code === 'invalid_otp') {
                error.value = 'Incorrect code. Check the SMS and try again.';
            } else if (e.code === 'max_attempts') {
                error.value = 'Too many incorrect attempts. Request a new code.';
            } else {
                error.value = e.message ?? 'Verification failed. Try again.';
            }
        } else {
            error.value = 'Could not connect. Check your internet and try again.';
        }
        clearDigits();
    } finally {
        loading.value = false;
    }
}

async function resend() {
    if (resendCd.value > 0) return;
    error.value = null;
    clearDigits();
    try {
        if (isSignup) {
            await api.post('/api/v1/customer/auth/signup', {
                phone,
                full_name: storedFullName,
                email: storedEmail || undefined,
            });
        } else {
            await api.post('/api/v1/customer/auth/login', { phone });
        }
        sentAt = Date.now();
        expiresIn.value = Math.floor(expiryMs / 1000);
        startResendCooldown();
        startExpiryCountdown();
    } catch (e: any) {
        error.value = 'Could not resend code. Try again shortly.';
    }
}
</script>

<template>
  <CustomerAuthShell
    :title="isRecovery ? 'Check your phone' : isSignup ? 'Check your phone' : 'Enter your code'"
    :back="isRecovery ? '/recover' : isSignup ? '/signup' : '/login'"
  >

    <!-- Phone indicator -->
    <div class="phone-badge">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <rect x="2.5" y="0.5" width="9" height="13" rx="2" stroke="currentColor"/>
        <circle cx="7" cy="11" r="0.75" fill="currentColor"/>
      </svg>
      <span>Code sent to <strong>{{ maskedPhone }}</strong></span>
    </div>

    <!-- OTP digits -->
    <div class="otp-row" @paste.prevent="onPaste">
      <input
        v-for="(_, i) in digits"
        :key="i"
        ref="inputs"
        class="otp-digit"
        :class="{
          'otp-digit--filled': !!digits[i],
          'otp-digit--success': success,
          'otp-digit--error': !!error && !loading,
        }"
        :value="digits[i]"
        type="text"
        inputmode="numeric"
        maxlength="1"
        autocomplete="one-time-code"
        :disabled="loading || success"
        @input="onInput(i, $event)"
        @keydown="onKeydown(i, $event)"
      />
    </div>

    <!-- Success state -->
    <div v-if="success" class="verify-success" role="status">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="8.5" stroke="currentColor"/>
        <path d="M5 9l3 3 5-5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Verified! Redirecting…
    </div>

    <!-- Error -->
    <div v-else-if="error" class="auth-error" role="alert">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" class="error-icon">
        <circle cx="7" cy="7" r="6.5" stroke="currentColor"/>
        <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      {{ error }}
    </div>

    <!-- Expiry -->
    <p
      v-else-if="!success"
      class="expiry-label"
      :class="{ 'expiry-warn': expiryWarning, 'expiry-dead': expired }"
    >
      {{ expiryLabel }}
    </p>

    <!-- Verify button (explicit, shown when digits incomplete) -->
    <button
      v-if="!success"
      class="bw-btn primary lg auth-btn"
      :disabled="loading || digits.some((d) => !d) || expired"
      @click="submit"
    >
      <span v-if="loading" class="btn-spinner" aria-hidden="true" />
      {{ loading ? 'Verifying…' : 'Verify' }}
    </button>

    <!-- Resend + back -->
    <div class="verify-footer">
      <span class="footer-muted">Didn't get a code?</span>
      <button
        class="resend-btn"
        :class="{ 'resend-btn--active': resendCd <= 0 }"
        type="button"
        :disabled="resendCd > 0"
        @click="resend"
      >
        {{ resendCd > 0 ? `Resend in ${resendCd}s` : 'Resend code' }}
      </button>
    </div>

  </CustomerAuthShell>
</template>

<style scoped>
.phone-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: 6px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-full);
  font-size: var(--t-sm);
  color: var(--text-2);
  align-self: center;
}
.phone-badge strong { color: var(--text); }

/* OTP row */
.otp-row {
  display: flex;
  gap: var(--s-2);
  justify-content: center;
}

.otp-digit {
  width: 46px;
  height: 58px;
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

.otp-digit:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-glow);
}

.otp-digit--filled {
  border-color: oklch(70% 0.19 145 / 0.5);
  background: oklch(70% 0.19 145 / 0.05);
}

.otp-digit--success {
  border-color: var(--brand);
  background: oklch(70% 0.19 145 / 0.10);
  color: var(--brand);
}

.otp-digit--error {
  border-color: var(--danger);
  background: oklch(from var(--danger) l c h / 0.05);
}

/* Expiry */
.expiry-label {
  font-size: var(--t-xs);
  color: var(--text-2);
  text-align: center;
  margin: 0;
}
.expiry-warn { color: var(--warn); font-weight: 600; }
.expiry-dead { color: var(--danger); font-weight: 600; }

/* Success */
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

/* Error */
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

/* Submit */
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

/* Footer */
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
.resend-btn--active {
  color: var(--brand);
  cursor: pointer;
}
.resend-btn--active:hover { text-decoration: underline; }

/* Small screens */
@media (max-width: 380px) {
  .otp-digit { width: 40px; height: 52px; font-size: var(--t-xl); }
  .otp-row { gap: var(--s-1); }
}
</style>
