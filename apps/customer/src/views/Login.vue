<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../lib/api';
import CustomerAuthShell from '../components/CustomerAuthShell.vue';

const router = useRouter();
const phone = ref('');
const loading = ref(false);
const error = ref<string | null>(null);

async function submit() {
    loading.value = true;
    error.value = null;
    const raw = phone.value.replace(/\s/g, '');
    try {
        const r = await api.post<{ challenge_id: string }>('/api/v1/customer/auth/login', { phone: raw });
        await router.push({ name: 'verify', query: { challenge_id: r.challenge_id, phone: raw } });
    } catch (e: any) {
        error.value = e?.message ?? 'Something went wrong. Try again.';
    } finally {
        loading.value = false;
    }
}
</script>

<template>
  <CustomerAuthShell
    title="Customer Wallet"
    subtitle="Sign in to buy tokens and manage your wallet"
  >
    <form class="bw-stack bw-auth-form" @submit.prevent="submit">
      <div>
        <label class="bw-label" for="login-phone">Phone number</label>
        <input
          id="login-phone"
          v-model="phone"
          class="bw-input bw-auth-input"
          type="tel"
          inputmode="tel"
          autocomplete="tel"
          required
          placeholder="0800 000 0000"
        />
      </div>

      <div v-if="error" class="bw-alert danger" style="font-size: var(--t-sm)">{{ error }}</div>

      <button class="bw-btn primary lg bw-auth-submit" type="submit" :disabled="loading">
        {{ loading ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>

    <p class="bw-muted bw-auth-footer">
      New to Beverly?
      <router-link to="/signup" class="bw-auth-inline-link">Create account</router-link>
    </p>
    <p class="bw-muted bw-auth-footer bw-auth-footer--tight">
      Need recovery?
      <router-link to="/recover" class="bw-auth-inline-link">Restore access</router-link>
    </p>
  </CustomerAuthShell>
</template>
