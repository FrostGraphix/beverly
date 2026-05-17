<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth   = useAuthStore();
const phone  = ref('');
const loading = ref(false);
const error   = ref<string | null>(null);

async function submit() {
    loading.value = true; error.value = null;
    const raw = phone.value.replace(/\s/g, '');
    try {
        const r = await api.post<{ challenge_id: string }>('/api/v1/customer/auth/login', { phone: raw });
        await router.push({ name: 'verify', query: { challenge_id: r.challenge_id, phone: raw } });
    } catch (e: any) {
        error.value = e?.message ?? 'Something went wrong. Try again.';
    } finally { loading.value = false; }
}
</script>

<template>
  <div class="bw-auth-page">
    <div class="bw-card bw-auth-card">
      <div style="text-align:center; margin-bottom: var(--s-6)">
        <div class="bw-mark" style="width:52px; height:52px; font-size:22px; margin: 0 auto var(--s-4)">B</div>
        <div class="bw-h1" style="font-size: var(--t-2xl); margin-bottom:6px">Welcome back</div>
        <p class="bw-muted" style="margin:0; font-size: var(--t-sm)">Enter your phone to receive a code</p>
      </div>

      <form class="bw-stack" @submit.prevent="submit">
        <div>
          <label class="bw-label">Phone number</label>
          <input class="bw-input" v-model="phone" type="tel" inputmode="tel"
                 autocomplete="tel" required placeholder="0800 000 0000" style="font-size: var(--t-lg)" />
        </div>

        <div v-if="error" class="bw-alert danger" style="font-size: var(--t-sm)">{{ error }}</div>

        <button class="bw-btn primary lg" type="submit" :disabled="loading" style="width:100%; justify-content:center">
          {{ loading ? 'Sending code…' : 'Send OTP' }}
        </button>
      </form>

      <p class="bw-muted" style="text-align:center; margin-top: var(--s-5); font-size: var(--t-sm)">
        New to Beverly?
        <router-link to="/signup" style="color: var(--brand); font-weight:600">Create account</router-link>
      </p>
    </div>
  </div>
</template>
