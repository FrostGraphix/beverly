<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useStaffAuthStore } from '../stores/auth';
import { api, ApiError } from '../lib/api';
import { PORTAL_URLS } from '../lib/portals';
import { unlockLoginVoice, playLoginVoice } from '../utils/voice';

const REMEMBERED_EMAIL_KEY = 'beverly.staff.remembered_email';

const route = useRoute();
const router = useRouter();
const auth = useStaffAuthStore();

const authReason = computed(() => String(route.query.reason ?? ''));
const sessionEnded = computed(() => authReason.value === 'session_timeout' || authReason.value === 'session_expired');
const sessionEndedMsg = computed(() => {
    if (authReason.value === 'session_timeout') return 'Session timed out after inactivity. Sign in to continue.';
    return 'Session ended. Sign in to continue.';
});
const reasonMfa = computed(() => String(route.query.reason ?? '') === 'mfa_required');
const showSessionEnded = computed(() => sessionEnded.value && !email.value && !password.value && !error.value);

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const step = ref<'password' | 'challenge'>('password');
const email = ref('');
const password = ref('');
const showPassword = ref(false);
const rememberEmail = ref(true);
const challengeCode = ref('');
const useRecovery = ref(false);
const error = ref<string | null>(null);
const loading = ref(false);
const hasVendorSession = ref(false);
const hasCustomerSession = ref(false);

const redirectTarget = computed(() => {
    return safeRedirectTarget(route.query.redirect);
});

function safeRedirectTarget(raw: unknown, fallback = '/') {
    if (typeof raw !== 'string') return fallback;
    const value = raw.trim();
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
    return value;
}

function readableError(err: unknown, fallback: string): string {
    if (err instanceof ApiError && err.status >= 500) {
        return 'Authentication service is temporarily unavailable. Retry shortly.';
    }
    if (err instanceof ApiError && err.status === 401) {
        return 'This Supabase account signed in, but no active Beverly Wallet Admin staff profile is linked.';
    }
    if (err instanceof ApiError) return err.message || fallback;
    if (err instanceof Error) return err.message || fallback;
    return fallback;
}

function signInFailureMessage(data: any, status: number): string {
    const message = String(data?.error_description ?? data?.message ?? data?.msg ?? '').trim();
    if (status >= 500 || /^internal server error$/i.test(message)) {
        return 'Authentication service is temporarily unavailable. Retry shortly.';
    }
    return message || 'Sign-in failed. Check your details and retry.';
}

function isMfaRequired(err: unknown): boolean {
    return err instanceof ApiError
        && err.status === 403
        && (err.code === 'mfa_required' || /two-factor|mfa_required/i.test(err.message || ''));
}

async function afterAuthenticated() {
    // Decide whether an MFA challenge is required before entering the app.
    try {
        const status = await api.get<{ enrolled: boolean; verified: boolean }>('/api/v1/admin/mfa/status');
        if (status.enrolled && !status.verified) {
            step.value = 'challenge';
            return;
        }
    } catch {
        // status is best-effort; if it fails, continue and let route guards apply
    }
    playLoginVoice();
    await router.push(redirectTarget.value);
}

async function signIn() {
    unlockLoginVoice();
    const normalizedEmail = email.value.trim().toLowerCase();
    if (!normalizedEmail || !password.value) {
        error.value = 'Email and password are required.';
        return;
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        error.value = 'Authentication is not configured. Contact your administrator.';
        return;
    }
    loading.value = true;
    error.value = null;
    try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
            body: JSON.stringify({ email: normalizedEmail, password: password.value }),
        });
        const data = await res.json();
        if (!res.ok) {
            error.value = signInFailureMessage(data, res.status);
            return;
        }
        const accessToken: string = data.access_token;
        if (!accessToken || !data.user?.id) {
            error.value = 'Sign-in response was incomplete. Try again.';
            return;
        }
        auth.setSession(accessToken, {
            id: data.user.id,
            email: data.user.email ?? null,
            full_name: data.user.user_metadata?.full_name ?? null,
            role: data.user?.user_metadata?.role_key ?? data.user?.user_metadata?.role ?? 'staff',
            profile_picture_url: data.user?.user_metadata?.profile_picture_url ?? null,
        });
        try {
            await auth.refreshSession();
        } catch (err) {
            // `/admin/me` is MFA-protected. Preserve the fresh password session
            // and show the challenge rather than logging the staff user out.
            if (isMfaRequired(err)) {
                if (rememberEmail.value) localStorage.setItem(REMEMBERED_EMAIL_KEY, normalizedEmail);
                else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
                step.value = 'challenge';
                return;
            }
            auth.logout();
            error.value = readableError(err, 'Access denied. Staff account required.');
            return;
        }
        if (rememberEmail.value) localStorage.setItem(REMEMBERED_EMAIL_KEY, normalizedEmail);
        else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        await afterAuthenticated();
    } catch {
        error.value = 'Network error. Please try again.';
    } finally {
        loading.value = false;
    }
}

async function verifyChallenge() {
    if (challengeCode.value.trim().length < 6) {
        error.value = 'Enter your 6-digit authenticator code, or a recovery code.';
        return;
    }
    loading.value = true;
    error.value = null;
    try {
        await api.post('/api/v1/admin/mfa/challenge/verify', { code: challengeCode.value.trim() });
        challengeCode.value = '';
        await auth.refreshSession();
        playLoginVoice();
        await router.push(redirectTarget.value);
    } catch (err) {
        error.value = readableError(err, 'Security code rejected.');
    } finally {
        loading.value = false;
    }
}

function backToPassword() {
    step.value = 'password';
    error.value = null;
    challengeCode.value = '';
    auth.logout();
}

onMounted(async () => {
    try {
        hasVendorSession.value = !!(localStorage.getItem('beverly.vendor.access_token') || sessionStorage.getItem('beverly.vendor.access_token'));
        hasCustomerSession.value = !!(
            localStorage.getItem('beverly.customer.access_token') ||
            sessionStorage.getItem('beverly.customer.access_token') ||
            localStorage.getItem('beverly.access_token') ||
            sessionStorage.getItem('beverly.access_token')
        );
    } catch { /* noop */ }
    const rememberedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (rememberedEmail) email.value = rememberedEmail;
    rememberEmail.value = Boolean(rememberedEmail);
    await auth.hydrate();
    // Mid-session re-challenge: token already present, MFA grant expired.
    if (reasonMfa.value && auth.isAuthenticated) {
        try {
            const status = await api.get<{ enrolled: boolean; verified: boolean }>('/api/v1/admin/mfa/status');
            if (status.enrolled && !status.verified) step.value = 'challenge';
        } catch { /* ignore */ }
    }
});
</script>

<template>
  <main class="login-stage">
    <div class="login-aura" />
    <div class="bw-card login-card">
      <div class="login-head">
        <div class="bw-mark login-mark" aria-hidden="true"></div>
        <div class="bw-h1 login-title">Wallet Admin</div>
        <p class="bw-muted login-sub">{{ step === 'challenge' ? 'Two-factor verification' : 'Your Smart Power Partner.' }}</p>
      </div>

      <div v-if="hasVendorSession" class="login-flash warn" style="background: rgba(234, 88, 12, 0.12); border: 1px solid rgba(234, 88, 12, 0.3); color: #c2410c; margin-bottom: 16px;">
        🛒 <strong>Vendor Session Active</strong>: You are signed in to Vendor Portal.
        <div style="margin-top: 4px;">
          <a :href="PORTAL_URLS.vendor" style="font-weight: 600; text-decoration: underline;">Go to Vendor Dashboard &rarr;</a>
        </div>
      </div>

      <div v-else-if="hasCustomerSession" class="login-flash warn" style="background: rgba(14, 165, 233, 0.12); border: 1px solid rgba(14, 165, 233, 0.3); color: #0284c7; margin-bottom: 16px;">
        ⚡ <strong>Customer Session Active</strong>: You are signed in as a Customer.
        <div style="margin-top: 4px;">
          <a :href="PORTAL_URLS.customer" style="font-weight: 600; text-decoration: underline;">Go to Customer Portal &rarr;</a>
        </div>
      </div>

      <div v-if="showSessionEnded" class="login-flash warn" role="status" aria-live="polite">
        <svg class="login-flash-ic" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <circle cx="10" cy="10" r="7.5" />
          <path d="M10 6.6v4.2" />
          <circle cx="10" cy="13.8" r=".7" fill="currentColor" stroke="none" />
        </svg>
        <span>{{ sessionEndedMsg }}</span>
      </div>
      <div v-else-if="reasonMfa && step === 'challenge'" class="login-flash warn">
        Confirm your identity to continue — your 2FA grant expired.
      </div>

      <!-- Step 1: password -->
      <form v-if="step === 'password'" class="bw-stack" @submit.prevent="signIn">
        <div>
          <label class="bw-label">Email</label>
          <input class="bw-input" v-model.trim="email" type="email" autocomplete="username" placeholder="staff@acoblighting.com" required @input="error = null" />
        </div>
        <div>
          <label class="bw-label">Password</label>
          <div class="password-field">
            <input class="bw-input" v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" placeholder="Password" required @input="error = null" />
            <button type="button" class="password-toggle" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">
              {{ showPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
        </div>
        <div class="login-row">
          <label class="login-check">
            <input v-model="rememberEmail" type="checkbox" />
            Remember email
          </label>
          <button type="button" class="login-link" @click="error = 'Ask a Beverly super admin to reset your password.'">Forgot password?</button>
        </div>
        <div v-if="error" class="bw-alert danger">{{ error }}</div>
        <button class="bw-btn primary lg login-submit" type="submit" :disabled="loading || !email || !password">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>

      <!-- Step 2: MFA challenge -->
      <form v-else class="bw-stack" @submit.prevent="verifyChallenge">
        <div class="login-mfa-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        </div>
        <p class="login-mfa-copy">
          {{ useRecovery ? 'Enter one of your saved recovery codes.' : 'Open your authenticator app and enter the current 6-digit code.' }}
        </p>
        <input
          class="bw-input login-code"
          v-model="challengeCode"
          :inputmode="useRecovery ? 'text' : 'numeric'"
          autocomplete="one-time-code"
          :maxlength="useRecovery ? 14 : 6"
          :placeholder="useRecovery ? 'XXXX-XXXX-XXXX' : '000000'"
          autofocus
          @keyup.enter="verifyChallenge"
        />
        <div v-if="error" class="bw-alert danger">{{ error }}</div>
        <button class="bw-btn primary lg login-submit" type="submit" :disabled="loading">
          {{ loading ? 'Verifying…' : 'Verify & continue' }}
        </button>
        <div class="login-mfa-actions">
          <button type="button" class="login-link" @click="useRecovery = !useRecovery; error = null">
            {{ useRecovery ? 'Use authenticator code' : 'Use a recovery code' }}
          </button>
          <button type="button" class="login-link" @click="backToPassword">Start over</button>
        </div>
      </form>

      <p class="bw-muted login-foot">
        Access is restricted to Beverly staff. Contact your administrator.
      </p>
    </div>
  </main>
</template>

<style scoped>
.login-stage { position: relative; min-height: 100dvh; display: grid; place-items: center; padding: var(--s-5); background: transparent; overflow: hidden; }
.login-aura {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(50% 40% at 50% 0%, oklch(70% 0.19 145 / .16) 0%, transparent 70%),
    radial-gradient(40% 40% at 80% 100%, oklch(68% 0.17 280 / .12) 0%, transparent 65%);
}
.login-card { position: relative; width: 100%; max-width: 420px; }
.login-head { text-align: center; margin-bottom: var(--s-6); }
.login-mark { width: 52px; height: 52px; font-size: 22px; margin: 0 auto var(--s-4); }
.login-title { font-size: var(--t-2xl); margin-bottom: 6px; }
.login-sub { margin: 0; font-size: var(--t-sm); }
.login-flash {
  display: flex;
  align-items: center;
  gap: .55rem;
  background: oklch(78% 0.16 75 / .08);
  border: 1px solid oklch(78% 0.16 75 / .24);
  color: var(--warn);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: var(--s-4);
  border-radius: 10px;
  padding: .55rem .7rem;
}
.login-flash-ic {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  opacity: .9;
}
.login-submit { justify-content: center; width: 100%; }
.login-foot { font-size: var(--t-xs); text-align: center; margin-top: var(--s-5); }
.login-mfa-icon { width: 56px; height: 56px; margin: 0 auto; display: grid; place-items: center; border-radius: 16px; background: oklch(from var(--brand) l c h / .14); color: var(--brand); }
.login-mfa-icon svg { width: 26px; height: 26px; }
.login-mfa-copy { text-align: center; color: var(--text-dim, var(--muted)); font-size: var(--t-sm); margin: 0; }
.login-code { text-align: center; font-size: 28px; letter-spacing: .3em; font-family: var(--font-mono, monospace); }
.login-mfa-actions { display: flex; justify-content: space-between; gap: var(--s-3); }
.login-link { background: none; border: none; color: var(--brand); font-size: var(--t-sm); font-weight: 600; cursor: pointer; padding: 4px; }
.login-link:hover { text-decoration: underline; }
.password-field { position: relative; }
.password-field .bw-input { padding-right: 76px; }
.password-toggle { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); border: 0; background: transparent; color: var(--brand); font-weight: 700; cursor: pointer; }
.login-row { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); }
.login-check { display: inline-flex; align-items: center; gap: 8px; color: var(--text-dim, var(--muted)); font-size: var(--t-sm); cursor: pointer; }
</style>
