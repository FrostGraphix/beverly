<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useStaffAuthStore } from '../stores/auth';
import { api, ApiError } from '../lib/api';

const route = useRoute();
const router = useRouter();
const auth = useStaffAuthStore();

const sessionEnded = computed(() => {
    const reason = String(route.query.reason ?? '');
    return reason === 'session_timeout' || reason === 'session_expired';
});
const reasonMfa = computed(() => String(route.query.reason ?? '') === 'mfa_required');

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const STAFF_ROLES = new Set(['super-admin', 'account', 'finance-checker', 'operations-manager']);

const step = ref<'password' | 'challenge'>('password');
const email = ref('');
const password = ref('');
const challengeCode = ref('');
const useRecovery = ref(false);
const error = ref<string | null>(null);
const loading = ref(false);

const redirectTarget = computed(() => {
    const r = route.query.redirect;
    return typeof r === 'string' && r.startsWith('/') ? r : '/';
});

function readableError(err: unknown, fallback: string): string {
    if (err instanceof ApiError) return err.message || fallback;
    if (err instanceof Error) return err.message || fallback;
    return fallback;
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
    await router.push(redirectTarget.value);
}

async function signIn() {
    if (!email.value || !password.value) {
        error.value = 'Email and password are required.';
        return;
    }
    loading.value = true;
    error.value = null;
    try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
            body: JSON.stringify({ email: email.value, password: password.value }),
        });
        const data = await res.json();
        if (!res.ok) {
            error.value = data.error_description ?? data.msg ?? 'Sign-in failed.';
            return;
        }
        const accessToken: string = data.access_token;
        const user = data.user;
        const role: string | undefined =
            user?.user_metadata?.role_key ?? user?.app_metadata?.role_key
            ?? user?.user_metadata?.role ?? user?.app_metadata?.role;
        if (!role || !STAFF_ROLES.has(role)) {
            error.value = 'Access denied. Staff account required.';
            return;
        }
        auth.setSession(accessToken, {
            id: user.id,
            email: user.email ?? null,
            full_name: user.user_metadata?.full_name ?? null,
            role,
        });
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
        <div class="bw-mark login-mark">B</div>
        <div class="bw-h1 login-title">Wallet Admin</div>
        <p class="bw-muted login-sub">{{ step === 'challenge' ? 'Two-factor verification' : 'Staff access only' }}</p>
      </div>

      <div v-if="sessionEnded" class="login-flash warn">
        Your session expired or is invalid. Please sign in again.
      </div>
      <div v-else-if="reasonMfa && step === 'challenge'" class="login-flash warn">
        Confirm your identity to continue — your 2FA grant expired.
      </div>

      <!-- Step 1: password -->
      <form v-if="step === 'password'" class="bw-stack" @submit.prevent="signIn">
        <div>
          <label class="bw-label">Email</label>
          <input class="bw-input" v-model="email" type="email" autocomplete="email" placeholder="staff@acoblighting.com" required />
        </div>
        <div>
          <label class="bw-label">Password</label>
          <input class="bw-input" v-model="password" type="password" autocomplete="current-password" placeholder="••••••••" required />
        </div>
        <div v-if="error" class="bw-alert danger">{{ error }}</div>
        <button class="bw-btn primary lg login-submit" type="submit" :disabled="loading">
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
.login-stage { position: relative; min-height: 100dvh; display: grid; place-items: center; padding: var(--s-5); background: var(--canvas); overflow: hidden; }
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
.login-flash { background: oklch(78% 0.16 75 / .10); border: 1px solid oklch(78% 0.16 75 / .30); color: var(--warn); font-size: var(--t-sm); margin-bottom: var(--s-4); border-radius: var(--r-md); padding: var(--s-3); }
.login-submit { justify-content: center; width: 100%; }
.login-foot { font-size: var(--t-xs); text-align: center; margin-top: var(--s-5); }
.login-mfa-icon { width: 56px; height: 56px; margin: 0 auto; display: grid; place-items: center; border-radius: 16px; background: oklch(from var(--brand) l c h / .14); color: var(--brand); }
.login-mfa-icon svg { width: 26px; height: 26px; }
.login-mfa-copy { text-align: center; color: var(--text-dim, var(--muted)); font-size: var(--t-sm); margin: 0; }
.login-code { text-align: center; font-size: 28px; letter-spacing: .3em; font-family: var(--font-mono, monospace); }
.login-mfa-actions { display: flex; justify-content: space-between; gap: var(--s-3); }
.login-link { background: none; border: none; color: var(--brand); font-size: var(--t-sm); font-weight: 600; cursor: pointer; padding: 4px; }
.login-link:hover { text-decoration: underline; }
</style>
