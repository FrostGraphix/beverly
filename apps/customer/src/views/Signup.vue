<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../lib/api';
import CustomerAuthShell from '../components/CustomerAuthShell.vue';

const router = useRouter();
const fullName = ref('');
const phone = ref('');
const email = ref('');
const loading = ref(false);
const error = ref<string | null>(null);

async function submit() {
    loading.value = true;
    error.value = null;
    const raw = phone.value.replace(/\s/g, '');
    try {
        const r = await api.post<{ challenge_id: string }>('/api/v1/customer/auth/signup', {
            phone: raw,
            email: email.value.trim() || undefined,
            full_name: fullName.value.trim() || undefined,
        });
        await router.push({ name: 'verify', query: { challenge_id: r.challenge_id, phone: raw, signup: '1' } });
    } catch (e: any) {
        error.value = e?.message ?? 'Something went wrong. Try again.';
    } finally {
        loading.value = false;
    }
}
</script>

<template>
  <CustomerAuthShell
    title="Create account"
    subtitle="Buy electricity tokens in seconds"
  >
    <form class="bw-stack bw-auth-form" @submit.prevent="submit">
      <div>
        <label class="bw-label" for="signup-name">Full name</label>
        <input
          id="signup-name"
          v-model="fullName"
          class="bw-input bw-auth-input"
          type="text"
          autocomplete="name"
          required
          placeholder="Amaka Obi"
        />
      </div>

      <div>
        <label class="bw-label" for="signup-phone">Phone number</label>
        <input
          id="signup-phone"
          v-model="phone"
          class="bw-input bw-auth-input"
          type="tel"
          inputmode="tel"
          autocomplete="tel"
          required
          placeholder="0800 000 0000"
        />
      </div>

      <div>
        <label class="bw-label" for="signup-email">
          Email
          <span class="bw-auth-label-note">(optional)</span>
        </label>
        <input
          id="signup-email"
          v-model="email"
          class="bw-input bw-auth-input"
          type="email"
          autocomplete="email"
          placeholder="you@example.com"
        />
      </div>

      <div v-if="error" class="bw-alert danger" style="font-size: var(--t-sm)">{{ error }}</div>

      <button class="bw-btn primary lg bw-auth-submit" type="submit" :disabled="loading">
        {{ loading ? 'Sending code…' : 'Continue' }}
      </button>
    </form>

    <p class="bw-muted bw-auth-footer">
      Already have an account?
      <router-link to="/login" class="bw-auth-inline-link">Sign in</router-link>
    </p>
  </CustomerAuthShell>
</template>
