<script setup lang="ts">
import { ref } from 'vue';
import { api, ApiError } from '../lib/api';

const email   = ref('');
const loading = ref(false);
const error   = ref<string | null>(null);
const sent    = ref(false);

async function submit() {
    const trimmed = email.value.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        error.value = 'Enter a valid email address.';
        return;
    }
    loading.value = true;
    error.value   = null;
    try {
        await api.post('/api/v1/vendor/auth/reset-request', { email: trimmed });
        sent.value = true;
    } catch (e: any) {
        if (e instanceof ApiError && e.status >= 500) {
            error.value = 'Something went wrong. Please try again.';
        } else {
            sent.value = true;
        }
    } finally {
        loading.value = false;
    }
}
</script>

<template>
  <main style="min-height:100dvh; display:grid; place-items:center; padding: var(--s-5)">
    <div style="width:100%; max-width:380px">

      <!-- Success state -->
      <div v-if="sent" style="text-align:center">
        <div style="width:64px;height:64px;border-radius:50%;background:var(--success-bg);display:grid;place-items:center;margin:0 auto var(--s-5)">
          <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
        <p style="font-size:var(--t-xl); font-weight:700; margin:0 0 var(--s-2)">Check your inbox</p>
        <p class="bw-muted" style="font-size:var(--t-sm); margin:0 0 var(--s-6)">
          If a vendor account exists for <strong>{{ email }}</strong>, a password reset link has been sent. It expires in 30 minutes.
        </p>
        <router-link to="/login" class="bw-btn primary" style="text-decoration:none">Back to login</router-link>
      </div>

      <!-- Form state -->
      <template v-else>
        <p style="font-size:var(--t-xl); font-weight:700; margin:0 0 var(--s-1)">Forgot password</p>
        <p class="bw-muted" style="font-size:var(--t-sm); margin:0 0 var(--s-5)">Enter your account email and we'll send a reset link.</p>

        <form @submit.prevent="submit" novalidate style="display:flex; flex-direction:column; gap: var(--s-4)">
          <div>
            <label style="display:block; font-size:var(--t-sm); font-weight:500; margin-bottom:var(--s-1)" for="fp-email">Email address</label>
            <input
              id="fp-email"
              v-model="email"
              class="bw-input"
              type="email"
              inputmode="email"
              autocomplete="email"
              placeholder="you@company.com"
              :disabled="loading"
              @input="error = null"
            />
          </div>

          <div v-if="error" class="bw-alert danger" style="font-size:var(--t-sm)">{{ error }}</div>

          <button class="bw-btn primary" type="submit" :disabled="loading || !email" style="justify-content:center">
            <span v-if="loading" class="bw-spinner" aria-hidden="true" />
            {{ loading ? 'Sending…' : 'Send reset link' }}
          </button>

          <p style="text-align:center; font-size:var(--t-sm); color:var(--text-muted)">
            <router-link to="/login" style="color:var(--brand)">Back to login</router-link>
          </p>
        </form>
      </template>
    </div>
  </main>
</template>
