<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useVendorAuthStore } from '../stores/auth';
import { API_BASE } from '../lib/api';
import { PORTAL_URLS } from '../lib/portals';
import { unlockLoginVoice, playLoginVoice } from '../utils/voice';

const REMEMBERED_VENDOR_EMAIL_KEY = 'beverly.vendor.remembered_email';
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const router = useRouter();
const route  = useRoute();
const auth   = useVendorAuthStore();
const sessionEnded = computed(() => ['session_timeout', 'session_expired'].includes(String(route.query.reason ?? '')));
const redirectTarget = computed(() => safeRedirectTarget(route.query.redirect));

const email    = ref('');
const password = ref('');
const showPassword = ref(false);
const rememberEmail = ref(true);
const loading  = ref(false);
const error    = ref<string | null>(null);

function safeRedirectTarget(raw: unknown, fallback = '/') {
    if (typeof raw !== 'string') return fallback;
    const value = raw.trim();
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
    return value;
}

async function submit() {
    unlockLoginVoice();
    const normalizedEmail = email.value.trim().toLowerCase();
    if (!normalizedEmail || !password.value) {
        error.value = 'Email and password are required.';
        return;
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        error.value = 'Authentication is not configured. Contact Beverly support.';
        return;
    }
    loading.value = true; error.value = null;
    try {
        // 1) Sign in via Supabase
        const tokRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
            body: JSON.stringify({ email: normalizedEmail, password: password.value }),
        });
        const tokData = await tokRes.json();
        if (!tokRes.ok) {
            error.value = tokData.error_description ?? tokData.msg ?? 'Sign-in failed.';
            return;
        }
        const accessToken: string = tokData.access_token;
        if (!accessToken) {
            error.value = 'Sign-in response was incomplete. Try again.';
            return;
        }

        // 2) Verify they're a vendor_user via /me (auth plugin resolves the actor)
        const meRes = await fetch(`${API_BASE}/api/v1/vendor/me`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!meRes.ok) {
            const j = await meRes.json().catch(() => ({}));
            error.value =
                meRes.status === 403 ? 'Access denied. This is not a vendor account.'
                : meRes.status === 401 ? 'Session invalid, inactive, or not linked to a vendor account.'
                : (j?.message ?? 'Vendor lookup failed.');
            return;
        }
        const me = await meRes.json();

        // 3) Store session + route forward (forced password reset gate)
        auth.setSession(accessToken, me, rememberEmail.value, {
            refreshToken: typeof tokData.refresh_token === 'string' ? tokData.refresh_token : null,
            expiresAt: typeof tokData.expires_at === 'number' ? tokData.expires_at : null,
            expiresIn: typeof tokData.expires_in === 'number' ? tokData.expires_in : null,
        });
        if (rememberEmail.value) localStorage.setItem(REMEMBERED_VENDOR_EMAIL_KEY, normalizedEmail);
        else localStorage.removeItem(REMEMBERED_VENDOR_EMAIL_KEY);
        playLoginVoice();
        await router.push(me.password_reset_required ? { path: '/password-change', query: { redirect: redirectTarget.value } } : redirectTarget.value);
    } catch {
        error.value = 'Network error. Please try again.';
    } finally {
        loading.value = false;
    }
}

const rememberedEmail = localStorage.getItem(REMEMBERED_VENDOR_EMAIL_KEY);
if (rememberedEmail) email.value = rememberedEmail;
rememberEmail.value = Boolean(rememberedEmail);
</script>

<template>
  <main class="login-root">
    <div class="bw-card login-card">
      <div class="login-head">
        <a :href="PORTAL_URLS.landing" class="vendor-brand-link" aria-label="Beverly home">
          <div class="bw-mark login-mark" aria-hidden="true"></div>
        </a>
        <div class="bw-h1 login-title">Vendor Portal</div>
        <p class="bw-muted login-subtitle">Sign in to start vending</p>
      </div>

      <div v-if="sessionEnded" class="bw-alert warn login-session-ended">
        ⓘ Your session timed out for security. Please sign in again.
      </div>

      <form class="bw-stack" @submit.prevent="submit">
        <div>
          <label class="bw-label">Email</label>
          <input class="bw-input" v-model.trim="email" type="email" autocomplete="username" required placeholder="vendor@example.com" @input="error = null" />
        </div>
        <div>
          <label class="bw-label">Password</label>
          <div class="password-field">
            <input class="bw-input" v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" required placeholder="Password" @input="error = null" />
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
          <router-link to="/forgot-password" class="login-link" style="text-decoration:none">Forgot password?</router-link>
        </div>

        <div v-if="error" class="bw-alert danger login-error">{{ error }}</div>

        <button class="bw-btn primary lg login-submit" type="submit" :disabled="loading || !email || !password">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>

      <p class="bw-muted login-note">
        Vendor accounts are created by Beverly staff. Need access? Contact your account manager.
      </p>

      <div class="vendor-cross">
        <a :href="PORTAL_URLS.customer + 'login'" class="vendor-cross-link">Buy electricity instead →</a>
      </div>
    </div>
  </main>
</template>

<style scoped>
.login-root { min-height: 100dvh; display: grid; place-items: center; padding: var(--s-5); background: transparent; }
.login-card { width: 100%; max-width: 420px; }
.login-head { text-align: center; margin-bottom: var(--s-6); }
.login-mark { width: 52px; height: 52px; font-size: 22px; margin: 0 auto var(--s-4); }
.login-title { font-size: var(--t-2xl); margin-bottom: 6px; }
.login-subtitle { margin: 0; font-size: var(--t-sm); }
.login-session-ended { margin-bottom: var(--s-4); font-size: var(--t-sm); }
.login-error { font-size: var(--t-sm); }
.login-submit { justify-content: center; width: 100%; }
.login-note { font-size: var(--t-xs); text-align: center; margin-top: var(--s-5); }
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
.login-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
}
.login-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-2);
  font-size: var(--t-sm);
  cursor: pointer;
}
.login-link {
  border: 0;
  background: transparent;
  color: var(--brand);
  font-weight: 700;
  cursor: pointer;
}
.vendor-brand-link {
  display: inline-block;
  text-decoration: none;
  transition: opacity var(--dur-fast);
}
.vendor-brand-link:hover { opacity: 0.85; }
.vendor-cross {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: var(--s-4);
  padding-top: var(--s-4);
  border-top: 1px solid var(--border);
}
.vendor-cross-link {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--brand);
  text-decoration: none;
}
.vendor-cross-link:hover { text-decoration: underline; }
.vendor-cross-link--muted {
  color: var(--text-2);
  font-weight: 500;
}
</style>
