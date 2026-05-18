<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useVendorAuthStore } from '../stores/auth';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const API_BASE          = import.meta.env.VITE_API_BASE ?? '';

const router = useRouter();
const route  = useRoute();
const auth   = useVendorAuthStore();
const sessionEnded = computed(() => route.query.reason === 'session_timeout');

const email    = ref('');
const password = ref('');
const loading  = ref(false);
const error    = ref<string | null>(null);

async function submit() {
    if (!email.value || !password.value) {
        error.value = 'Email and password are required.';
        return;
    }
    loading.value = true; error.value = null;
    try {
        // 1) Sign in via Supabase
        const tokRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
            body: JSON.stringify({ email: email.value, password: password.value }),
        });
        const tokData = await tokRes.json();
        if (!tokRes.ok) {
            error.value = tokData.error_description ?? tokData.msg ?? 'Sign-in failed.';
            return;
        }
        const accessToken: string = tokData.access_token;

        // 2) Verify they're a vendor_user via /me (auth plugin resolves the actor)
        const meRes = await fetch(`${API_BASE}/api/v1/vendor/me`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!meRes.ok) {
            const j = await meRes.json().catch(() => ({}));
            error.value =
                meRes.status === 403 ? 'Access denied. This is not a vendor account.'
                : meRes.status === 401 ? 'Session invalid. Try again.'
                : (j?.message ?? 'Vendor lookup failed.');
            return;
        }
        const me = await meRes.json();

        // 3) Store session + route forward (forced password reset gate)
        auth.setSession(accessToken, me);
        await router.push(me.password_reset_required ? '/password-change' : '/');
    } catch {
        error.value = 'Network error. Please try again.';
    } finally {
        loading.value = false;
    }
}
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
          <input class="bw-input" v-model="email" type="email" autocomplete="username" required placeholder="vendor@example.com" />
        </div>
        <div>
          <label class="bw-label">Password</label>
          <input class="bw-input" v-model="password" type="password" autocomplete="current-password" required placeholder="••••••••" />
        </div>

        <div v-if="error" class="bw-alert danger" style="font-size: var(--t-sm)">{{ error }}</div>

        <button class="bw-btn primary lg" type="submit" :disabled="loading" style="justify-content:center; width:100%">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>

      <p class="bw-muted" style="font-size: var(--t-xs); text-align:center; margin-top: var(--s-5)">
        Vendor accounts are created by Beverly staff. Need access? Contact your account manager.
      </p>
    </div>
  </main>
</template>
