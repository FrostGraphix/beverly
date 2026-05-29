<script setup lang="ts">
import { ref } from 'vue';
import { api, ApiError } from '../lib/api';
import CustomerAuthShell from '../components/CustomerAuthShell.vue';

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
        await api.post('/api/v1/customer/auth/email/reset-request', { email: trimmed });
        sent.value = true;
    } catch (e: any) {
        // Never reveal whether the email exists
        if (e instanceof ApiError && e.status >= 500) {
            error.value = 'Something went wrong. Please try again.';
        } else {
            sent.value = true; // treat all non-500 errors the same way
        }
    } finally {
        loading.value = false;
    }
}
</script>

<template>
  <CustomerAuthShell
    title="Forgot password"
    subtitle="Enter the email on your account and we'll send a reset link"
    back="/login"
  >
    <!-- Success state -->
    <div v-if="sent" style="text-align:center; padding: var(--s-4) 0">
      <div style="width:56px;height:56px;border-radius:50%;background:var(--success-bg);display:grid;place-items:center;margin:0 auto var(--s-4)">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <polyline points="22,6 12,13 2,6"/>
        </svg>
      </div>
      <p style="font-weight:600; margin:0 0 var(--s-2)">Check your inbox</p>
      <p class="bw-muted" style="font-size:var(--t-sm); margin:0 0 var(--s-5)">
        If an account exists for <strong>{{ email }}</strong>, a reset link has been sent. It expires in 30 minutes.
      </p>
      <router-link to="/login" class="bw-btn primary" style="text-decoration:none; display:inline-flex">
        Back to login
      </router-link>
    </div>

    <!-- Form state -->
    <form v-else class="auth-form" @submit.prevent="submit" novalidate>
      <div class="field">
        <label class="field-label" for="fp-email">Email address</label>
        <input
          id="fp-email"
          v-model="email"
          class="bw-input"
          type="email"
          inputmode="email"
          autocomplete="email"
          placeholder="you@example.com"
          :disabled="loading"
          @input="error = null"
        />
      </div>

      <div v-if="error" class="auth-error" role="alert">{{ error }}</div>

      <button class="bw-btn primary lg auth-btn" type="submit" :disabled="loading || !email">
        <span v-if="loading" class="btn-spinner" aria-hidden="true" />
        {{ loading ? 'Sending…' : 'Send reset link' }}
      </button>

      <p style="text-align:center; font-size:var(--t-sm); margin-top: var(--s-4)">
        <router-link to="/login" style="color:var(--brand)">Back to login</router-link>
      </p>
    </form>
  </CustomerAuthShell>
</template>
