<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useStaffAuthStore } from '../stores/auth';

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const STAFF_ROLES = new Set(['super-admin', 'account', 'finance-checker', 'operations-manager']);

const router  = useRouter();
const auth    = useStaffAuthStore();
const email   = ref('');
const password = ref('');
const error   = ref<string | null>(null);
const loading = ref(false);

async function signIn() {
    if (!email.value || !password.value) {
        error.value = 'Email and password are required.';
        return;
    }
    loading.value = true;
    error.value   = null;
    try {
        const res = await fetch(
            `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({ email: email.value, password: password.value }),
            },
        );

        const data = await res.json();

        if (!res.ok) {
            error.value = data.error_description ?? data.msg ?? 'Sign-in failed.';
            return;
        }

        const accessToken: string = data.access_token;
        const user = data.user;
        const role: string | undefined =
            user?.user_metadata?.role ?? user?.app_metadata?.role;

        if (!role || !STAFF_ROLES.has(role)) {
            error.value = 'Access denied. Staff account required.';
            return;
        }

        auth.setSession(accessToken, {
            id:        user.id,
            email:     user.email ?? null,
            full_name: user.user_metadata?.full_name ?? null,
            role,
        });

        await router.push('/');
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
        <div class="bw-h1" style="font-size: var(--t-2xl); margin-bottom: 6px">Wallet Admin</div>
        <p class="bw-muted" style="margin:0; font-size: var(--t-sm)">Staff access only</p>
      </div>

      <form class="bw-stack" @submit.prevent="signIn">
        <div>
          <label class="bw-label">Email</label>
          <input
            class="bw-input"
            v-model="email"
            type="email"
            autocomplete="email"
            placeholder="staff@acoblighting.com"
            required
          />
        </div>
        <div>
          <label class="bw-label">Password</label>
          <input
            class="bw-input"
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••"
            required
          />
        </div>

        <div v-if="error" class="bw-alert danger">{{ error }}</div>

        <button
          class="bw-btn primary lg"
          type="submit"
          :disabled="loading"
          style="justify-content:center; width:100%"
        >
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>

      <p class="bw-muted" style="font-size: var(--t-xs); text-align:center; margin-top: var(--s-5)">
        Access is restricted to Beverly staff. Contact your administrator.
      </p>
    </div>
  </main>
</template>
