<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();

const digits = ref<string[]>(['', '', '', '', '', '']);
const inputs = ref<HTMLInputElement[]>([]);
const loading = ref(false);
const sending = ref(false);
const success = ref(false);
const error = ref<string | null>(null);
const codeSent = ref(false);

const RESEND_COOLDOWN = 45;
const resendCd = ref(0);
let resendTimer: ReturnType<typeof setInterval>;

const alreadyVerified = Boolean(auth.customer?.email_verified_at);

onMounted(() => {
    if (!alreadyVerified) sendCode(true);
});

onBeforeUnmount(() => clearInterval(resendTimer));

function startResendCooldown() {
    resendCd.value = RESEND_COOLDOWN;
    clearInterval(resendTimer);
    resendTimer = setInterval(() => {
        if (--resendCd.value <= 0) clearInterval(resendTimer);
    }, 1000);
}

async function sendCode(initial = false) {
    if (resendCd.value > 0 || sending.value) return;
    sending.value = true;
    error.value = null;
    try {
        await api.post('/api/v1/customer/auth/email/verify/send', {});
        codeSent.value = true;
        startResendCooldown();
        if (!initial) nextTick(() => inputs.value[0]?.focus());
    } catch (e: any) {
        error.value = e instanceof ApiError ? (e.message ?? 'Could not send code.') : 'Could not connect. Check your internet and try again.';
    } finally {
        sending.value = false;
    }
}

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
        nextTick(() => { inputs.value[5]?.focus(); submit(); });
    }
}

function clearDigits() {
    digits.value = ['', '', '', '', '', ''];
    nextTick(() => inputs.value[0]?.focus());
}

function friendlyError(e: ApiError): string {
    switch (e.code) {
        case 'otp_expired': return 'This code has expired. Request a new one.';
        case 'otp_incorrect': return 'Incorrect code. Check your email and try again.';
        case 'otp_locked': return 'Too many incorrect attempts. Request a new code.';
        case 'otp_not_found': return 'This code is no longer valid. Request a new one.';
        default: return e.message ?? 'Verification failed. Try again.';
    }
}

async function submit() {
    if (loading.value || success.value) return;
    const code = digits.value.join('');
    if (code.length !== 6) return;
    loading.value = true;
    error.value = null;
    try {
        await api.post('/api/v1/customer/auth/email/verify/confirm', { code });
        success.value = true;
        await auth.refreshProfile().catch(() => undefined);
        await new Promise((res) => setTimeout(res, 800));
        await router.replace('/security');
    } catch (e: any) {
        error.value = e instanceof ApiError ? friendlyError(e) : 'Could not connect. Check your internet and try again.';
        clearDigits();
    } finally {
        loading.value = false;
    }
}
</script>

<template>
  <AppShell>
    <div>
      <p class="bw-page-title">Verify your email</p>
      <p class="bw-page-sub">Confirm {{ auth.customer?.email }}</p>
    </div>

    <div class="bw-card">
      <template v-if="alreadyVerified">
        <div class="verify-success" role="status">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <circle cx="9" cy="9" r="8.5" stroke="currentColor"/>
            <path d="M5 9l3 3 5-5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Your email is already verified.
        </div>
        <router-link to="/security" class="bw-btn" style="justify-content:center; margin-top: var(--s-4); text-decoration:none;">Back to security</router-link>
      </template>

      <template v-else>
        <p style="font-weight:700; margin:0 0 var(--s-1)">Enter your code</p>
        <p class="bw-muted" style="font-size: var(--t-sm); margin:0 0 var(--s-4)">
          We sent a 6-digit code to <strong>{{ auth.customer?.email }}</strong> from <strong>noreply@acoblighting.com</strong>. Please check your inbox and spam folder. It expires in 15 minutes.
        </p>

        <div class="otp-row" @paste.prevent="onPaste">
          <input
            v-for="(_, i) in digits"
            :key="i"
            ref="inputs"
            class="otp-digit"
            :class="{ 'otp-digit--filled': !!digits[i], 'otp-digit--success': success, 'otp-digit--error': !!error && !loading }"
            :value="digits[i]"
            type="text"
            inputmode="numeric"
            maxlength="1"
            autocomplete="one-time-code"
            :disabled="loading || success || !codeSent"
            @input="onInput(i, $event)"
            @keydown="onKeydown(i, $event)"
          />
        </div>

        <div v-if="success" class="verify-success" role="status" style="margin-top: var(--s-4)">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <circle cx="9" cy="9" r="8.5" stroke="currentColor"/>
            <path d="M5 9l3 3 5-5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Verified! Taking you back…
        </div>
        <div v-else-if="error" class="bw-alert danger" style="font-size: var(--t-sm); margin-top: var(--s-4)">{{ error }}</div>

        <button
          v-if="!success"
          class="bw-btn primary lg"
          style="justify-content:center; width:100%; margin-top: var(--s-4)"
          :disabled="loading || digits.some((d) => !d)"
          @click="submit"
        >
          <span v-if="loading" class="btn-spinner" aria-hidden="true" />
          {{ loading ? 'Verifying…' : 'Verify email' }}
        </button>

        <div v-if="!success" class="verify-footer">
          <span class="footer-muted">Didn't get a code?</span>
          <button
            class="resend-btn"
            :class="{ 'resend-btn--active': resendCd <= 0 && !sending }"
            type="button"
            :disabled="resendCd > 0 || sending"
            @click="sendCode(false)"
          >
            {{ sending ? 'Sending…' : resendCd > 0 ? `Resend in ${resendCd}s` : 'Resend code' }}
          </button>
        </div>
      </template>
    </div>
  </AppShell>
</template>

<style scoped>
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
.otp-digit:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
.otp-digit--filled { border-color: oklch(70% 0.19 145 / 0.5); background: oklch(70% 0.19 145 / 0.05); }
.otp-digit--success { border-color: var(--brand); background: oklch(70% 0.19 145 / 0.10); color: var(--brand); }
.otp-digit--error { border-color: var(--danger); background: oklch(from var(--danger) l c h / 0.05); }

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
  margin-right: var(--s-2);
}

.verify-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  flex-wrap: wrap;
  margin-top: var(--s-4);
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
  .otp-digit { width: 40px; height: 52px; font-size: var(--t-xl); }
  .otp-row { gap: var(--s-1); }
}
</style>
