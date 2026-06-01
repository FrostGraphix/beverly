<script setup lang="ts">
/**
 * Vendor password-change view.
 *
 * Required on first login (vendor_users.password_reset_required=true).
 * Router guard in src/router/index.ts forces this view until the flag clears.
 */
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../lib/api';
import { useVendorAuthStore } from '../stores/auth';
import VendorAuthShell from '../components/VendorAuthShell.vue';

const router = useRouter();
const auth   = useVendorAuthStore();

const current     = ref('');
const next        = ref('');
const confirm     = ref('');
const showCurrent = ref(false);
const showNext    = ref(false);
const showConfirm = ref(false);
const loading     = ref(false);
const error       = ref<string | null>(null);
const success     = ref(false);

const checks = computed(() => {
    const p = next.value;
    return [
        { ok: p.length >= 12,                                   label: 'At least 12 characters' },
        { ok: /[A-Z]/.test(p) && /[a-z]/.test(p),              label: 'Mixed case letters' },
        { ok: /\d/.test(p),                                     label: 'A number' },
        { ok: /[^A-Za-z0-9]/.test(p),                          label: 'A symbol (! # $ …)' },
        { ok: !/(123|abc|password|qwerty|beverly)/i.test(p),   label: 'Not a common pattern' },
    ];
});

const score = computed(() => checks.value.filter((c) => c.ok).length as 0|1|2|3|4|5);
const strengthLabel = computed(() => (['', 'Weak', 'Fair', 'Good', 'Strong', 'Strong'] as const)[score.value]);
const strengthColor = computed(() => (['', 'var(--danger)', 'var(--warn)', 'var(--brand)', 'var(--success)', 'var(--success)'] as const)[score.value]);

const passwordsMatch = computed(() => !confirm.value || next.value === confirm.value);
const allValid       = computed(() => score.value >= 3 && next.value === confirm.value && current.value.length > 0);

async function submit() {
    if (loading.value) return;
    error.value = null;

    if (next.value !== confirm.value) {
        error.value = 'New passwords do not match.';
        return;
    }
    if (score.value < 3) {
        error.value = 'Choose a stronger password (Good or Strong).';
        return;
    }
    if (current.value === next.value) {
        error.value = 'New password must be different from the temporary one.';
        return;
    }

    loading.value = true;
    try {
        await api.post('/api/v1/vendor/password-change', {
            current: current.value,
            next:    next.value,
        });
        if (auth.user) auth.user.password_reset_required = false;
        success.value = true;
        setTimeout(() => router.push('/'), 1200);
    } catch (e: any) {
        error.value = (e instanceof ApiError ? e.message : e?.message) ?? 'Update failed. Please retry.';
    } finally {
        loading.value = false;
    }
}

function logout() {
    void auth.logout();
    router.push('/login');
}
</script>

<template>
  <VendorAuthShell
    title="Set your password"
    subtitle="Your temporary password was for one-time access. Choose a strong password you'll remember — it protects all funds in your wallet."
  >
    <!-- Success state -->
    <div v-if="success" class="success-state">
      <div class="success-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <p class="success-title">Password updated</p>
      <p class="success-sub">Redirecting to your dashboard…</p>
    </div>

    <!-- Form state -->
    <template v-else>
      <p class="setup-eyebrow">First-time setup · step 1 of 1</p>

      <form class="auth-form" @submit.prevent="submit" novalidate>
        <div class="field">
          <label class="field-label" for="pc-current">Temporary password</label>
          <div class="password-field">
            <input
              id="pc-current"
              v-model="current"
              class="bw-input"
              :type="showCurrent ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="The one Beverly staff provided"
              :disabled="loading"
            />
            <button
              type="button"
              class="password-toggle"
              :aria-label="showCurrent ? 'Hide password' : 'Show password'"
              @click="showCurrent = !showCurrent"
            >{{ showCurrent ? 'Hide' : 'Show' }}</button>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="pc-next">New password</label>
          <div class="password-field">
            <input
              id="pc-next"
              v-model="next"
              class="bw-input"
              :type="showNext ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="At least 12 characters"
              :disabled="loading"
            />
            <button
              type="button"
              class="password-toggle"
              :aria-label="showNext ? 'Hide password' : 'Show password'"
              @click="showNext = !showNext"
            >{{ showNext ? 'Hide' : 'Show' }}</button>
          </div>

          <div v-if="next" class="strength-wrap">
            <div class="strength-bar" :aria-label="`Password strength: ${strengthLabel}`">
              <div v-for="i in 5" :key="i" class="strength-seg" :style="{ background: i <= score ? strengthColor : 'var(--border)' }" />
            </div>
            <span v-if="strengthLabel" class="strength-label" :style="{ color: strengthColor }">{{ strengthLabel }}</span>
          </div>
          <ul v-if="next" class="checks">
            <li v-for="c in checks" :key="c.label" :class="{ ok: c.ok }">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <circle cx="6" cy="6" r="5.5" :stroke="c.ok ? 'currentColor' : 'var(--border)'"/>
                <path v-if="c.ok" d="M3.5 6l2 2 3-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              {{ c.label }}
            </li>
          </ul>
        </div>

        <div class="field">
          <label class="field-label" for="pc-confirm">Confirm new password</label>
          <div class="password-field">
            <input
              id="pc-confirm"
              v-model="confirm"
              class="bw-input"
              :type="showConfirm ? 'text' : 'password'"
              autocomplete="new-password"
              :class="{ 'input-error': !passwordsMatch }"
              :disabled="loading"
            />
            <button
              type="button"
              class="password-toggle"
              :aria-label="showConfirm ? 'Hide confirm' : 'Show confirm'"
              @click="showConfirm = !showConfirm"
            >{{ showConfirm ? 'Hide' : 'Show' }}</button>
          </div>
          <p v-if="!passwordsMatch" class="field-error">Passwords don't match.</p>
        </div>

        <div v-if="error" class="auth-error" role="alert">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" class="error-icon">
            <circle cx="7" cy="7" r="6.5" stroke="currentColor"/>
            <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span>{{ error }}</span>
        </div>

        <button class="bw-btn primary lg auth-btn" type="submit" :disabled="loading || !allValid">
          <span v-if="loading" class="btn-spinner" aria-hidden="true" />
          {{ loading ? 'Updating…' : 'Set password & continue' }}
        </button>

        <button class="logout-link" type="button" @click="logout">Sign out instead</button>
      </form>

      <p class="pc-foot">
        Trouble signing in? Contact your Beverly account manager.
        We never reset passwords by email — beware phishing.
      </p>
    </template>
  </VendorAuthShell>
</template>

<style scoped>
.setup-eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: var(--brand);
  margin: 0;
}

.auth-form { display: flex; flex-direction: column; gap: var(--s-4); }

.field { display: flex; flex-direction: column; gap: 6px; }
.field-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-2);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.field-error { font-size: var(--t-xs); color: var(--danger); margin: 2px 0 0; font-weight: 500; }

.password-field { position: relative; }
.password-field .bw-input { padding-right: 76px; }
.password-toggle {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  border: 0;
  background: transparent;
  color: var(--brand);
  font-size: var(--t-xs);
  font-weight: 700;
  cursor: pointer;
  padding: 4px 6px;
}

.input-error { border-color: var(--danger) !important; }

.strength-wrap {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin-top: 6px;
}
.strength-bar { display: flex; gap: 3px; flex: 1; }
.strength-seg {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  transition: background var(--dur-fast);
}
.strength-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  min-width: 48px;
  text-align: right;
}

.checks {
  list-style: none;
  margin: var(--s-2) 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px var(--s-3);
}
.checks li {
  font-size: var(--t-xs);
  color: var(--text-2);
  display: flex;
  align-items: center;
  gap: 5px;
  transition: color var(--dur-fast);
}
.checks li.ok { color: var(--success); }

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

.logout-link {
  background: none;
  border: none;
  color: var(--text-2);
  font-size: var(--t-xs);
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
  align-self: center;
}
.logout-link:hover { color: var(--text); }

.pc-foot {
  margin-top: var(--s-4);
  padding-top: var(--s-4);
  border-top: 1px solid var(--border);
  text-align: center;
  font-size: var(--t-xs);
  color: var(--text-2);
  line-height: 1.6;
}

/* Success state */
.success-state {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-4) 0;
}
.success-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: oklch(70% 0.19 145 / 0.12);
  color: var(--brand);
  display: grid;
  place-items: center;
  animation: pop 0.4s var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
}
@keyframes pop {
  from { transform: scale(0.6); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}
.success-title { font-weight: 700; font-size: var(--t-lg); margin: 0; }
.success-sub   { font-size: var(--t-sm); color: var(--text-2); margin: 0; }

@media (max-width: 400px) {
  .checks { grid-template-columns: 1fr; }
}
</style>
