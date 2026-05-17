<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useStaffAuthStore } from '../stores/auth';

const router = useRouter();
const auth   = useStaffAuthStore();
const email  = ref('');
const devToken = ref('');
const error  = ref<string | null>(null);
const loading = ref(false);

async function signIn() {
    loading.value = true; error.value = null;
    try {
        if (devToken.value) {
            auth.setSession(devToken.value, {
                id: 'staff-dev',
                email: email.value || 'dev@beverly',
                full_name: 'Dev Staff',
                role: 'super-admin',
            });
            await router.push('/');
            return;
        }
        error.value = 'SSO from main CRM coming in next iteration. Paste a Supabase token below.';
    } finally { loading.value = false; }
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
          <input class="bw-input" v-model="email" type="email" autocomplete="email" placeholder="staff@beverly.ng" />
        </div>
        <div>
          <label class="bw-label">Password</label>
          <input class="bw-input" type="password" autocomplete="current-password" placeholder="••••••••" />
        </div>

        <details style="font-size: var(--t-xs)">
          <summary class="bw-muted" style="cursor:pointer; user-select:none">Dev: paste Supabase token</summary>
          <div style="margin-top: var(--s-2)">
            <input class="bw-input bw-mono" v-model="devToken" placeholder="eyJ…" />
          </div>
        </details>

        <div v-if="error" class="bw-alert danger">{{ error }}</div>

        <button class="bw-btn primary lg" type="submit" :disabled="loading" style="justify-content:center; width:100%">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>

      <p class="bw-muted" style="font-size: var(--t-xs); text-align:center; margin-top: var(--s-5)">
        Access is restricted to Beverly staff. Contact your administrator.
      </p>
    </div>
  </main>
</template>
