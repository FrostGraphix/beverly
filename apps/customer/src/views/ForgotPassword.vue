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
  <CustomerAuthShell
    title="Forgot password"
    subtitle="Enter the email on your account and we'll send a reset link"
    back="/login"
  >
    <!-- Success state -->
    <div v-if="sent" class="success-state">
      <div class="success-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <polyline points="22,6 12,13 2,6"/>
        </svg>
      </div>
      <p class="success-title">Check your inbox</p>
      <p class="success-sub">
        If an account exists for <strong>{{ email }}</strong>, a reset link has been sent. It expires in 30 minutes.
      </p>
      <router-link to="/login" class="bw-btn primary auth-btn">
        Back to sign in
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

      <div v-if="error" class="auth-error" role="alert">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" class="error-icon">
          <circle cx="7" cy="7" r="6.5" stroke="currentColor"/>
          <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span>{{ error }}</span>
      </div>

      <button class="bw-btn primary lg auth-btn" type="submit" :disabled="loading || !email">
        <span v-if="loading" class="btn-spinner" aria-hidden="true" />
        {{ loading ? 'Sending…' : 'Send reset link' }}
      </button>

      <p class="back-row">
        <router-link to="/login" class="back-link">← Back to sign in</router-link>
      </p>
    </form>
  </CustomerAuthShell>
</template>

<style scoped>
.auth-form { display: flex; flex-direction: column; gap: var(--s-4); }

.field { display: flex; flex-direction: column; gap: 6px; }
.field-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-2);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.auth-error {
  display: flex;
  align-items: flex-start;
  gap: var(--s-2);
  padding: var(--s-3);
  background: oklch(from var(--danger) l c h / 0.10);
  border: 1px solid oklch(from var(--danger) l c h / 0.25);
  border-radius: var(--r-md);
  font-size: var(--t-sm);
  color: var(--danger);
  line-height: 1.5;
}
.error-icon { flex-shrink: 0; margin-top: 1px; }
.auth-error span { flex: 1; }

.auth-btn {
  width: 100%;
  justify-content: center;
  gap: var(--s-2);
  height: 48px;
  font-size: var(--t-md);
  display: inline-flex;
  align-items: center;
}

@keyframes spin { to { transform: rotate(360deg); } }
.btn-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid oklch(100% 0 0 / 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

.back-row { text-align: center; margin: 0; }
.back-link {
  font-size: var(--t-sm);
  color: var(--brand);
  font-weight: 600;
  text-decoration: none;
}
.back-link:hover { text-decoration: underline; }

.success-state {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-3);
}
.success-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: oklch(70% 0.19 145 / 0.12);
  color: var(--brand);
  display: grid;
  place-items: center;
}
.success-title { font-weight: 700; font-size: var(--t-lg); margin: 0; }
.success-sub   { font-size: var(--t-sm); color: var(--text-2); margin: 0; line-height: 1.6; max-width: 320px; }
</style>
