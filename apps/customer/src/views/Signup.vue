<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../lib/api';

const router   = useRouter();
const fullName = ref('');
const phone    = ref('');
const email    = ref('');
const loading  = ref(false);
const error    = ref<string | null>(null);

async function submit() {
    loading.value = true; error.value = null;
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
    } finally { loading.value = false; }
}
</script>

<template>
  <div class="bw-auth-page">
    <div class="bw-card bw-auth-card">
      <div style="text-align:center; margin-bottom: var(--s-6)">
        <div class="bw-mark" style="width:52px; height:52px; font-size:22px; margin: 0 auto var(--s-4)">B</div>
        <div class="bw-h1" style="font-size: var(--t-2xl); margin-bottom:6px">Create account</div>
        <p class="bw-muted" style="margin:0; font-size: var(--t-sm)">Buy electricity tokens in seconds</p>
      </div>

      <form class="bw-stack" @submit.prevent="submit">
        <div>
          <label class="bw-label">Full name</label>
          <input class="bw-input" v-model="fullName" type="text" autocomplete="name"
                 required placeholder="Amaka Obi" />
        </div>
        <div>
          <label class="bw-label">Phone number</label>
          <input class="bw-input" v-model="phone" type="tel" inputmode="tel"
                 autocomplete="tel" required placeholder="0800 000 0000" />
        </div>
        <div>
          <label class="bw-label">
            Email
            <span class="bw-muted" style="text-transform:none; letter-spacing:0; font-weight:400; margin-left:4px">(optional)</span>
          </label>
          <input class="bw-input" v-model="email" type="email" autocomplete="email"
                 placeholder="you@example.com" />
        </div>

        <div v-if="error" class="bw-alert danger" style="font-size: var(--t-sm)">{{ error }}</div>

        <button class="bw-btn primary lg" type="submit" :disabled="loading"
                style="width:100%; justify-content:center">
          {{ loading ? 'Sending code…' : 'Continue' }}
        </button>
      </form>

      <p class="bw-muted" style="text-align:center; margin-top: var(--s-5); font-size: var(--t-sm)">
        Already have an account?
        <router-link to="/login" style="color: var(--brand); font-weight:600">Sign in</router-link>
      </p>
    </div>
  </div>
</template>
