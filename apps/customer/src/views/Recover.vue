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
        await router.push({ name: 'verify', query: { challenge_id: r.challenge_id, phone: raw, recovery: '1' } });
    } catch (e: any) {
        error.value = e?.message ?? 'We could not start recovery right now. Try again.';
    } finally {
        loading.value = false;
    }
}
</script>

<template>
  <CustomerAuthShell
    title="Recover access"
    subtitle="Use your registered phone number to receive a new code"
  >
    <form class="bw-stack bw-auth-form" @submit.prevent="submit">
      <div>
        <label class="bw-label" for="recovery-phone">Phone number</label>
        <input
          id="recovery-phone"
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
        {{ loading ? 'Sending recovery code…' : 'Send recovery code' }}
      </button>
    </form>

    <p class="bw-muted bw-auth-footer">
      Remembered your details?
      <router-link to="/login" class="bw-auth-inline-link">Return to sign in</router-link>
    </p>
  </CustomerAuthShell>
</template>
