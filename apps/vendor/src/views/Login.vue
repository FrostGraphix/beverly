<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../lib/api';
import { useVendorAuthStore } from '../stores/auth';

const router = useRouter();
const auth   = useVendorAuthStore();
const identifier = ref('');
const password   = ref('');
const loading    = ref(false);
const error      = ref<string | null>(null);

async function submit() {
    loading.value = true; error.value = null;
    try {
        const r = await api.post<{ access_token: string; user: any }>('/api/v1/vendor/login', {
            identifier: identifier.value,
            password: password.value,
        });
        auth.setSession(r.access_token, r.user);
        await router.push(r.user.password_reset_required ? '/password-change' : '/');
    } catch (e: any) {
        error.value = e?.message ?? 'Login failed. Check your credentials.';
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

      <form class="bw-stack" @submit.prevent="submit">
        <div>
          <label class="bw-label">Email</label>
          <input class="bw-input" v-model="identifier" type="email" autocomplete="username" required placeholder="vendor@example.com" />
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
