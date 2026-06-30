<script setup lang="ts">
/**
 * Vendor password-change view.
 *
 * Required on first login (vendor_users.password_reset_required=true).
 * Router guard in src/router/index.ts forces this view until the flag clears.
 *
 * Flow:
 *   1. Vendor enters current temp password + new password (×2)
 *   2. Client-side strength meter (length, classes, common patterns)
 *   3. POST /api/v1/vendor/password-change → Supabase admin update + flag clear
 *   4. Auth store flag cleared, success state, redirect to dashboard
 *
 * Backend records: wallet_security_events { event_type=password_change }
 *                  wallet_security_events { event_type=temp_password_used }
 */
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../lib/api';
import { useVendorAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useVendorAuthStore();

const current = ref('');
const next = ref('');
const confirm = ref('');
const showNext = ref(false);
const showConfirm = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const success = ref(false);

// ─ Strength meter ─────────────────────────────────────────────
interface Strength {
    score: 0 | 1 | 2 | 3 | 4;
    label: string;
    color: string;
    checks: { ok: boolean; label: string }[];
}

const strength = computed<Strength>(() => {
    const p = next.value;
    const checks = [
        { ok: p.length >= 12,                      label: 'At least 12 characters' },
        { ok: /[A-Z]/.test(p) && /[a-z]/.test(p),  label: 'Mixed case letters' },
        { ok: /\d/.test(p),                        label: 'A number' },
        { ok: /[^A-Za-z0-9]/.test(p),              label: 'A symbol (! # $ …)' },
        { ok: !/(123|abc|password|qwerty|beverly)/i.test(p), label: 'Not a common pattern' },
    ];
    const passed = checks.filter((c) => c.ok).length;
    const score = (passed === 0 ? 0 : Math.min(4, Math.max(1, passed - 1))) as 0 | 1 | 2 | 3 | 4;
    const labels = ['Empty', 'Weak', 'Fair', 'Good', 'Strong'];
    const colors = ['var(--text-faint)', 'var(--danger)', 'var(--warn)', 'oklch(70% 0.13 145)', 'var(--brand)'];
    return { score, label: labels[score], color: colors[score], checks };
});

const allValid = computed(() => strength.value.score >= 3 && next.value === confirm.value && current.value.length > 0);
const passwordsMatch = computed(() => !confirm.value || next.value === confirm.value);

async function submit() {
    if (loading.value) return;
    error.value = null;

    if (next.value !== confirm.value) {
        error.value = 'New passwords do not match.';
        return;
    }
    if (strength.value.score < 3) {
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
            next: next.value,
        });
        if (auth.user) auth.user.password_reset_required = false;
        success.value = true;
        // Brief success state, then route
        setTimeout(() => router.push('/'), 1200);
    } catch (e: any) {
        if (e instanceof ApiError) {
            error.value = e.message ?? 'Update failed.';
        } else {
            error.value = e?.message ?? 'Update failed. Please retry.';
        }
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
  <main class="pc-shell">
    <div class="bw-card pc-card">

      <!-- Success state -->
      <div v-if="success" class="pc-success">
        <div class="pc-success-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h1 class="bw-h1 pc-success-title">Password updated</h1>
        <p class="pc-success-sub">Redirecting to your dashboard…</p>
      </div>

      <!-- Form state -->
      <template v-else>
        <header class="pc-head">
          <div class="bw-mark pc-mark">B</div>
          <p class="pc-eyebrow">First-time setup · step 1 of 1</p>
          <h1 class="bw-h1 pc-title">Set your new password</h1>
          <p class="pc-sub">
            Your temporary password was for one-time access. Choose a strong password you can remember —
            this protects all funds in your wallet.
          </p>
        </header>

        <form class="pc-form" @submit.prevent="submit" novalidate>
          <!-- Current (temporary) -->
          <div class="field">
            <label class="bw-label" for="pc-current">Temporary password</label>
            <input
              id="pc-current"
              class="bw-input"
              v-model="current"
              type="password"
              autocomplete="current-password"
              required
              placeholder="The one Beverly staff handed you"
            />
          </div>

          <!-- New password -->
          <div class="field">
            <label class="bw-label" for="pc-next">New password</label>
            <div class="input-wrap">
              <input
                id="pc-next"
                class="bw-input"
                v-model="next"
                :type="showNext ? 'text' : 'password'"
                autocomplete="new-password"
                minlength="12"
                required
                placeholder="At least 12 characters"
              />
              <button type="button" class="reveal" @click="showNext = !showNext" :aria-label="showNext ? 'Hide password' : 'Show password'">
                {{ showNext ? '👁' : '○' }}
              </button>
            </div>

            <!-- Strength meter -->
            <div v-if="next" class="meter">
              <div class="meter-bar" :aria-label="`Password strength: ${strength.label}`">
                <span v-for="i in 4" :key="i" :class="['meter-seg', { active: i <= strength.score }]" :style="i <= strength.score ? { background: strength.color } : {}" />
              </div>
              <span class="meter-label" :style="{ color: strength.color }">{{ strength.label }}</span>
            </div>

            <!-- Checklist -->
            <ul v-if="next" class="checks">
              <li v-for="c in strength.checks" :key="c.label" :class="{ ok: c.ok }">
                <span class="check-icon">{{ c.ok ? '✓' : '·' }}</span>
                {{ c.label }}
              </li>
            </ul>
          </div>

          <!-- Confirm -->
          <div class="field">
            <label class="bw-label" for="pc-confirm">Confirm new password</label>
            <div class="input-wrap">
              <input
                id="pc-confirm"
                class="bw-input"
                v-model="confirm"
                :type="showConfirm ? 'text' : 'password'"
                autocomplete="new-password"
                minlength="12"
                required
                :class="{ 'has-error': !passwordsMatch }"
              />
              <button type="button" class="reveal" @click="showConfirm = !showConfirm" :aria-label="showConfirm ? 'Hide' : 'Show'">
                {{ showConfirm ? '👁' : '○' }}
              </button>
            </div>
            <p v-if="!passwordsMatch" class="field-error">Passwords don't match.</p>
          </div>

          <p v-if="error" class="bw-alert danger pc-error" role="alert">{{ error }}</p>

          <button
            class="bw-btn primary lg pc-submit"
            type="submit"
            :disabled="loading || !allValid"
          >
            {{ loading ? 'Updating…' : 'Set password & continue' }}
          </button>

          <button class="bw-btn pc-logout" type="button" @click="logout">
            Sign out instead
          </button>
        </form>

        <footer class="pc-foot">
          Trouble signing in? Contact your Beverly account manager.
          We never reset passwords by email — beware phishing.
        </footer>
      </template>
    </div>
  </main>
</template>

<style scoped>
.pc-shell {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--s-5);
  background:
    radial-gradient(60% 50% at 50% 0%, var(--brand-glow), transparent 70%),
    var(--canvas);
}

.pc-card {
  width: 100%;
  max-width: 480px;
  padding: var(--s-6);
}

.pc-head { text-align: center; margin-bottom: var(--s-5); }
.pc-mark {
  width: 52px;
  height: 52px;
  font-size: 22px;
  margin: 0 auto var(--s-3);
}
.pc-eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: var(--brand);
  margin: 0 0 var(--s-1);
}
.pc-title {
  font-size: var(--t-xl);
  margin: 0 0 var(--s-2);
}
.pc-sub {
  font-size: var(--t-sm);
  color: var(--text-dim);
  line-height: 1.55;
  margin: 0;
}

.pc-form {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.field { display: flex; flex-direction: column; }

.input-wrap { position: relative; }
.reveal {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
}
.reveal:hover { color: var(--text); }

.has-error { border-color: var(--danger) !important; }
.field-error {
  font-size: var(--t-xs);
  color: var(--danger);
  margin: 4px 0 0;
  font-weight: 500;
}

.meter {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin-top: 8px;
}
.meter-bar {
  display: flex;
  gap: 3px;
  flex: 1;
}
.meter-seg {
  flex: 1;
  height: 4px;
  background: var(--surface-2);
  border-radius: var(--r-full);
  transition: background var(--dur-fast);
}
.meter-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  min-width: 60px;
  text-align: right;
}

.checks {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px var(--s-3);
}
.checks li {
  font-size: var(--t-xs);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 4px;
  transition: color var(--dur-fast);
}
.checks li.ok { color: var(--brand); }
.check-icon {
  display: inline-block;
  width: 14px;
  text-align: center;
  font-weight: 700;
}

.pc-error {
  margin: 0;
  font-size: var(--t-sm);
}

.pc-submit {
  height: 48px;
  justify-content: center;
  width: 100%;
}

.pc-logout {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: var(--t-xs);
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  align-self: center;
}
.pc-logout:hover { color: var(--text); }

.pc-foot {
  margin-top: var(--s-5);
  padding-top: var(--s-4);
  border-top: 1px solid var(--border);
  text-align: center;
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.6;
}

/* Success state */
.pc-success {
  text-align: center;
  padding: var(--s-6) 0;
}
.pc-success-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: oklch(70% 0.19 145 / 0.15);
  color: var(--brand);
  display: grid;
  place-items: center;
  margin: 0 auto var(--s-4);
  animation: pop 0.4s var(--ease-spring);
}
@keyframes pop {
  0%   { transform: scale(0.6); opacity: 0; }
  100% { transform: scale(1);   opacity: 1; }
}
.pc-success-title { margin: 0 0 var(--s-2); }
.pc-success-sub { color: var(--text-dim); margin: 0; }

@media (max-width: 480px) {
  .pc-card { padding: var(--s-5); }
  .checks { grid-template-columns: 1fr; }
}
</style>
