<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import CustomerAuthShell from '../components/CustomerAuthShell.vue';

const router = useRouter();
const auth = useAuthStore();
const nameInput = ref<HTMLInputElement | null>(null);

const accountMode = ref<'email' | 'phone'>('email');
const fullName = ref('');
const phone = ref('');
const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const errorCode = ref<string | null>(null);

onMounted(() => nameInput.value?.focus());

function normalise(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('234')) return `+${digits}`;
    if (digits.startsWith('0')) return `+234${digits.slice(1)}`;
    return `+234${digits}`;
}

function validate(): string | null {
    if (!fullName.value.trim() || fullName.value.trim().length < 2) {
        return 'Enter your full name (at least 2 characters).';
    }
    if (accountMode.value === 'phone' && phone.value.replace(/\D/g, '').length < 10) {
        return 'Enter a valid Nigerian phone number.';
    }
    if (accountMode.value === 'email' && !email.value) {
        return 'Enter a valid email address.';
    }
    if (email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        return 'Enter a valid email address.';
    }
    if (accountMode.value === 'email' && password.value.length < 8) {
        return 'Password must be at least 8 characters.';
    }
    return null;
}

async function submit() {
    const validationError = validate();
    if (validationError) {
        error.value = validationError;
        errorCode.value = null;
        return;
    }
    loading.value = true;
    error.value = null;
    errorCode.value = null;
    try {
        if (accountMode.value === 'email') {
            const r = await api.post<{ access_token: string; customer: any; is_new: boolean }>('/api/v1/customer/auth/email/signup', {
                email: email.value.trim(),
                password: password.value,
                full_name: fullName.value.trim(),
                phone: phone.value.trim() ? normalise(phone.value) : undefined,
            });
            auth.setSession(r.access_token, r.customer);
            await router.replace(r.customer.kyc_tier === 0 ? '/kyc' : '/');
            return;
        }
        const normalised = normalise(phone.value);
        const r = await api.post<{ challenge_id: string; expires_at: string; retry_after_seconds: number }>('/api/v1/customer/auth/signup', {
            phone: normalised,
            email: email.value.trim() || undefined,
            full_name: fullName.value.trim(),
        });
        await router.push({
            name: 'verify',
            query: {
                challenge_id: r.challenge_id,
                phone: normalised,
                signup: '1',
                full_name: fullName.value.trim(),
                email: email.value.trim() || undefined,
                expires_at: r.expires_at,
                retry_after_seconds: r.retry_after_seconds,
            },
        });
    } catch (e: any) {
        if (e instanceof ApiError) {
            errorCode.value = e.code;
            if (e.code === 'rate_limit') {
                error.value = 'Too many requests. Wait a few minutes and try again.';
            } else if (e.code === 'email_in_use') {
                error.value = 'An account already exists for this email.';
            } else if (e.code === 'phone_in_use') {
                error.value = 'An account already exists for this phone.';
            } else if (e.code === 'weak_password') {
                error.value = 'Password must be at least 8 characters.';
            } else {
                error.value = e.message ?? 'Something went wrong. Please try again.';
            }
        } else {
            error.value = 'Could not connect. Check your internet and try again.';
        }
    } finally {
        loading.value = false;
    }
}
</script>

<template>
  <CustomerAuthShell
    title="Create account"
    subtitle="Buy electricity tokens in seconds. No queues."
    back="/login"
  >
    <form class="auth-form" @submit.prevent="submit" novalidate>
      <div class="mode-switch" role="tablist" aria-label="Signup method">
        <button type="button" :class="{ active: accountMode === 'email' }" @click="accountMode = 'email'">Email account</button>
        <button type="button" :class="{ active: accountMode === 'phone' }" @click="accountMode = 'phone'">Phone OTP</button>
      </div>

      <!-- Full name -->
      <div class="field">
        <label class="field-label" for="signup-name">Full name</label>
        <input
          id="signup-name"
          ref="nameInput"
          v-model="fullName"
          class="bw-input"
          type="text"
          autocomplete="name"
          placeholder="Amaka Obi"
          :disabled="loading"
          @input="error = null"
        />
      </div>

      <!-- Phone -->
      <div class="field">
        <label class="field-label" for="signup-phone">Phone number</label>
        <div class="phone-wrap">
          <span class="phone-prefix">
            <span class="flag" aria-hidden="true">🇳🇬</span>
            +234
          </span>
          <input
            id="signup-phone"
            v-model="phone"
            class="bw-input phone-input"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            placeholder="080 0000 0000"
            :disabled="loading"
            @input="error = null"
          />
        </div>
        <p class="field-hint">{{ accountMode === 'phone' ? 'This will receive your OTP.' : 'Optional for account recovery.' }}</p>
      </div>

      <!-- Email (optional) -->
      <div class="field">
        <label class="field-label" for="signup-email">
          Email
          <span v-if="accountMode === 'phone'" class="field-optional">Optional</span>
        </label>
        <input
          id="signup-email"
          v-model="email"
          class="bw-input"
          type="email"
          inputmode="email"
          autocomplete="email"
          placeholder="you@example.com"
          :disabled="loading"
          @input="error = null"
        />
        <p class="field-hint">This will be your login credential.</p>
      </div>

      <div v-if="accountMode === 'email'" class="field">
        <label class="field-label" for="signup-password">Password</label>
        <input
          id="signup-password"
          v-model="password"
          class="bw-input"
          type="password"
          autocomplete="new-password"
          placeholder="At least 8 characters"
          :disabled="loading"
          @input="error = null"
        />
      </div>

      <!-- Error -->
      <div v-if="error" class="auth-error" role="alert">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" class="error-icon">
          <circle cx="7" cy="7" r="6.5" stroke="currentColor"/>
          <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span>{{ error }}</span>
      </div>

      <!-- Submit -->
      <button class="bw-btn primary lg auth-btn" type="submit" :disabled="loading">
        <span v-if="loading" class="btn-spinner" aria-hidden="true" />
        {{ loading ? 'Sending code…' : 'Continue' }}
      </button>

    </form>

    <!-- Footer -->
    <p class="auth-footer">
      Already have an account?
      <router-link to="/login" class="auth-inline-link">Sign in</router-link>
    </p>
  </CustomerAuthShell>
</template>

<style scoped>
.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.mode-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface-2);
}
.mode-switch button {
  border: 0;
  border-radius: calc(var(--r-md) - 3px);
  padding: 8px;
  background: transparent;
  color: var(--text-2);
  font-weight: 700;
  cursor: pointer;
}
.mode-switch button.active {
  background: var(--surface);
  color: var(--text);
}

.field { display: flex; flex-direction: column; gap: 6px; }

.field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-2);
  letter-spacing: 0.01em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: var(--s-2);
}

.field-optional {
  font-size: var(--t-xs);
  font-weight: 500;
  color: var(--text-2);
  text-transform: none;
  letter-spacing: 0;
  background: var(--surface-3);
  padding: 1px 6px;
  border-radius: var(--r-full);
}

.field-hint {
  font-size: var(--t-xs);
  color: var(--text-2);
  margin: 0;
}

.phone-wrap {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface-2);
  overflow: hidden;
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.phone-wrap:focus-within {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-glow);
}

.phone-prefix {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 var(--s-3);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--text-2);
  border-right: 1px solid var(--border);
  background: var(--surface-3);
  white-space: nowrap;
  flex-shrink: 0;
  user-select: none;
}
.flag { font-size: 16px; line-height: 1; }

.phone-input {
  flex: 1;
  border: none !important;
  box-shadow: none !important;
  background: transparent;
  border-radius: 0 !important;
  padding-left: var(--s-3);
  font-size: var(--t-base);
  min-width: 0;
}
.phone-input:focus { outline: none; }

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

.auth-btn {
  width: 100%;
  justify-content: center;
  gap: var(--s-2);
  height: 48px;
  font-size: var(--t-md);
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

.auth-footer {
  margin-top: var(--s-5);
  font-size: var(--t-sm);
  color: var(--text-2);
  text-align: center;
}
.auth-inline-link {
  color: var(--brand);
  font-weight: 600;
  text-decoration: none;
  margin-left: 4px;
}
.auth-inline-link:hover { text-decoration: underline; }
</style>
