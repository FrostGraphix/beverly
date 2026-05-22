<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useVendorAuthStore } from '../stores/auth';
import { API_BASE } from '../lib/api';

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
        auth.setSession(accessToken, me, rememberEmail.value);
        if (rememberEmail.value) localStorage.setItem(REMEMBERED_VENDOR_EMAIL_KEY, normalizedEmail);
        else localStorage.removeItem(REMEMBERED_VENDOR_EMAIL_KEY);
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
  <main style="min-height:100dvh; display:grid; place-items:center; padding: var(--s-5); background: var(--canvas)">
    <div class="bw-card" style="width:100%; max-width:420px">
      <div style="text-align:center; margin-bottom: var(--s-6)">
        <div class="bw-mark" style="width:52px; height:52px; font-size:22px; margin:0 auto var(--s-4)">B</div>
        <div class="bw-h1" style="font-size: var(--t-2xl); margin-bottom: 6px">Vendor Portal</div>
        <p class="bw-muted" style="margin:0; font-size: var(--t-sm)">Sign in to start vending</p>
      </div>

      <div v-if="sessionEnded" class="bw-alert" style="background: oklch(78% 0.16 75 / 0.10); border: 1px solid oklch(78% 0.16 75 / 0.30); color: var(--warn); font-size: var(--t-sm); margin-bottom: var(--s-4); border-radius: var(--r-md); padding: var(--s-3)">
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
          <button type="button" class="login-link" @click="error = 'Ask your Beverly account manager to reset your password.'">Forgot password?</button>
        </div>

        <div v-if="error" class="bw-alert danger" style="font-size: var(--t-sm)">{{ error }}</div>

        <button class="bw-btn primary lg" type="submit" :disabled="loading || !email || !password" style="justify-content:center; width:100%">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>

      <p class="bw-muted" style="font-size: var(--t-xs); text-align:center; margin-top: var(--s-5)">
        Vendor accounts are created by Beverly staff. Need access? Contact your account manager.
      </p>
    </div>
  </main>
</template>

<style scoped>
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
</style>
