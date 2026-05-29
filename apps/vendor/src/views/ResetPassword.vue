<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, ApiError } from '../lib/api';

const route  = useRoute();
const router = useRouter();

const token       = ref('');
const password    = ref('');
const confirm     = ref('');
const showPass    = ref(false);
const showConfirm = ref(false);
const loading     = ref(false);
const error       = ref<string | null>(null);
const success     = ref(false);

// Same strength rules as PasswordChange.vue (12-char min)
const checks = computed(() => [
    { ok: password.value.length >= 12,                      label: 'At least 12 characters' },
    { ok: /[A-Z]/.test(password.value) && /[a-z]/.test(password.value), label: 'Mixed case letters' },
    { ok: /\d/.test(password.value),                        label: 'A number' },
    { ok: /[^A-Za-z0-9]/.test(password.value),              label: 'A symbol (! # $ …)' },
    { ok: !/(123|abc|password|qwerty|beverly)/i.test(password.value), label: 'Not a common pattern' },
]);
const score   = computed(() => checks.value.filter((c) => c.ok).length as 0 | 1 | 2 | 3 | 4 | 5);
const strong  = computed(() => score.value >= 3);
const match   = computed(() => confirm.value === '' || password.value === confirm.value);
const canSubmit = computed(() => strong.value && password.value === confirm.value && confirm.value !== '');

const strengthLabel = computed(() => ['', 'Weak', 'Fair', 'Good', 'Strong', 'Strong'][score.value]);
const strengthColor = computed(() => ['', 'var(--danger)', 'var(--warning)', 'var(--brand)', 'var(--success)', 'var(--success)'][score.value]);

onMounted(() => {
    const t = route.query.token as string | undefined;
    if (t) { token.value = t; } else {
        error.value = 'Invalid reset link. Please request a new one.';
    }
});

async function submit() {
    if (!canSubmit.value) return;
    loading.value = true;
    error.value   = null;
    try {
        await api.post('/api/v1/vendor/auth/reset-confirm', {
            token:        token.value,
            new_password: password.value,
        });
        success.value = true;
    } catch (e: any) {
        if (e instanceof ApiError) {
            if (e.code === 'token_expired') {
                error.value = 'This reset link has expired. Please request a new one.';
            } else if (e.code === 'invalid_token') {
                error.value = 'Invalid reset link. Please request a new one.';
            } else {
                error.value = e.message ?? 'Could not reset password. Please try again.';
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
  <main style="min-height:100dvh; display:grid; place-items:center; padding: var(--s-5)">
    <div style="width:100%; max-width:420px">

      <!-- Success -->
      <div v-if="success" style="text-align:center">
        <div style="width:64px;height:64px;border-radius:50%;background:var(--success-bg);display:grid;place-items:center;margin:0 auto var(--s-5)">
          <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <p style="font-size:var(--t-xl); font-weight:700; margin:0 0 var(--s-2)">Password updated</p>
        <p class="bw-muted" style="font-size:var(--t-sm); margin:0 0 var(--s-6)">Sign in with your new password.</p>
        <router-link to="/login" class="bw-btn primary" style="text-decoration:none">Sign in</router-link>
      </div>

      <!-- Token missing -->
      <div v-else-if="!token" style="text-align:center">
        <p class="bw-muted" style="margin:0 0 var(--s-5)">{{ error }}</p>
        <router-link to="/forgot-password" class="bw-btn primary" style="text-decoration:none">Request new link</router-link>
      </div>

      <!-- Form -->
      <template v-else>
        <p style="font-size:var(--t-xl); font-weight:700; margin:0 0 var(--s-1)">Set new password</p>
        <p class="bw-muted" style="font-size:var(--t-sm); margin:0 0 var(--s-5)">Choose a strong password for your vendor account.</p>

        <form @submit.prevent="submit" novalidate style="display:flex; flex-direction:column; gap: var(--s-4)">

          <!-- New password -->
          <div>
            <label style="display:block; font-size:var(--t-sm); font-weight:500; margin-bottom:var(--s-1)" for="rp-pass">New password</label>
            <div style="position:relative">
              <input
                id="rp-pass"
                v-model="password"
                class="bw-input"
                :type="showPass ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="At least 12 characters"
                :disabled="loading"
                style="padding-right:72px"
                @input="error = null"
              />
              <button type="button" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:var(--t-xs);color:var(--text-muted)" @click="showPass = !showPass">
                {{ showPass ? 'Hide' : 'Show' }}
              </button>
            </div>

            <!-- Strength bar -->
            <div v-if="password" style="margin-top:var(--s-2)">
              <div style="display:flex; gap:3px; margin-bottom:4px">
                <div v-for="i in 5" :key="i" :style="{ flex:1, height:'3px', borderRadius:'2px', background: i <= score ? strengthColor : 'var(--border)' }" />
              </div>
              <p v-if="strengthLabel" :style="{ fontSize:'var(--t-xs)', color: strengthColor, margin:0 }">{{ strengthLabel }}</p>
              <ul style="list-style:none; margin:var(--s-2) 0 0; padding:0; display:flex; flex-direction:column; gap:3px">
                <li v-for="c in checks" :key="c.label" :style="{ fontSize:'var(--t-xs)', color: c.ok ? 'var(--success)' : 'var(--text-muted)', display:'flex', alignItems:'center', gap:'6px' }">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="6" r="5.5" :stroke="c.ok ? 'var(--success)' : 'var(--border)'"/>
                    <path v-if="c.ok" d="M3.5 6l2 2 3-4" stroke="var(--success)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  {{ c.label }}
                </li>
              </ul>
            </div>
          </div>

          <!-- Confirm -->
          <div>
            <label style="display:block; font-size:var(--t-sm); font-weight:500; margin-bottom:var(--s-1)" for="rp-confirm">Confirm password</label>
            <div style="position:relative">
              <input
                id="rp-confirm"
                v-model="confirm"
                class="bw-input"
                :type="showConfirm ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="Same password again"
                :disabled="loading"
                style="padding-right:72px"
              />
              <button type="button" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:var(--t-xs);color:var(--text-muted)" @click="showConfirm = !showConfirm">
                {{ showConfirm ? 'Hide' : 'Show' }}
              </button>
            </div>
            <p v-if="confirm && !match" style="font-size:var(--t-xs); color:var(--danger); margin:4px 0 0">Passwords don't match.</p>
          </div>

          <div v-if="error" class="bw-alert danger" style="font-size:var(--t-sm)">
            {{ error }}
            <router-link v-if="error.includes('expired') || error.includes('Invalid')" to="/forgot-password" style="color:var(--danger); font-weight:600; display:block; margin-top:4px">Request new link →</router-link>
          </div>

          <button class="bw-btn primary" type="submit" :disabled="loading || !canSubmit" style="justify-content:center">
            <span v-if="loading" class="bw-spinner" aria-hidden="true" />
            {{ loading ? 'Updating…' : 'Set new password' }}
          </button>
        </form>
      </template>
    </div>
  </main>
</template>
