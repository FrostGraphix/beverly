<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api, ApiError } from '../lib/api';
import { useVendorAuthStore } from '../stores/auth';

interface MfaStatus {
    enrolled: boolean;
    verified: boolean;
    method: 'authenticator_app' | null;
    recovery_codes_remaining: number;
    last_verified_at: string | null;
    enrolled_at: string | null;
}

interface MfaSetupStart {
    factor_id: string;
    secret: string;
    otpauth_uri: string;
    issuer: string;
    account_label: string;
    digits: number;
    period_seconds: number;
}

interface MfaSetupVerify {
    ok: true;
    recovery_codes: string[];
    session_expires_at: string;
}

const route = useRoute();
const router = useRouter();
const auth = useVendorAuthStore();

const status = ref<MfaStatus | null>(null);
const setup = ref<MfaSetupStart | null>(null);
const recoveryCodes = ref<string[]>([]);
const setupCode = ref('');
const challengeCode = ref('');
const disableCode = ref('');
const resetCode = ref('');
const loading = ref(false);
const action = ref<'idle' | 'setup' | 'verify' | 'disable'>('idle');
const notice = ref('');
const error = ref('');

const needsLoginChallenge = computed(() => route.query.mode === 'verify' || auth.requiresMfaVerification);
const isEnabled = computed(() => status.value?.enrolled === true || auth.user?.mfa_enrolled === true);
const isVerified = computed(() => status.value?.verified === true || auth.user?.mfa_verified === true);
const safeRecoveryCount = computed(() => status.value?.recovery_codes_remaining ?? 0);
const displaySecret = computed(() => setup.value?.secret.match(/.{1,4}/g)?.join(' ') ?? '');
const setupHref = computed(() => setup.value?.otpauth_uri ?? '#');
const redirectTarget = computed(() => safeRedirectTarget(route.query.redirect));

// SOP step tracking
// challenge → verify login
// 1 → add to app, 2 → confirm code, 3 → save recovery codes, done → enrolled
const sopStep = computed<'challenge' | 1 | 2 | 3 | 'done'>(() => {
    if (needsLoginChallenge.value && isEnabled.value && !isVerified.value) return 'challenge';
    if (setup.value) return 1;
    if (recoveryCodes.value.length) return 3;
    if (!isEnabled.value) return 1;
    return 'done';
});

const stepperSteps = computed(() => [
    { id: 1, label: 'Add to app' },
    { id: 2, label: 'Confirm code' },
    { id: 3, label: 'Save codes' },
]);

function stepState(id: number) {
    const s = sopStep.value;
    if (s === 'done') return 'done';
    if (s === 'challenge') return 'pending';
    if (id < s) return 'done';
    if (id === s) return 'active';
    return 'pending';
}

function safeRedirectTarget(raw: unknown, fallback = '/') {
    if (typeof raw !== 'string') return fallback;
    const value = raw.trim();
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
    return value;
}

function readableError(err: unknown, fallback: string): string {
    if (err instanceof ApiError) return err.message || fallback;
    if (err instanceof Error) return err.message || fallback;
    return fallback;
}

async function loadStatus() {
    status.value = await api.get<MfaStatus>('/api/v1/vendor/mfa/status');
}

async function refreshIdentity() {
    await auth.refreshMe();
    await loadStatus();
}

async function startSetup() {
    loading.value = true;
    action.value = 'setup';
    error.value = '';
    notice.value = '';
    recoveryCodes.value = [];
    try {
        setup.value = await api.post<MfaSetupStart>('/api/v1/vendor/mfa/setup/start', {});
        notice.value = 'Setup started. Add Beverly Vendor to your authenticator app.';
    } catch (err) {
        error.value = readableError(err, 'Could not start 2FA setup.');
    } finally {
        loading.value = false;
    }
}

async function verifySetup() {
    if (setupCode.value.replace(/\D/g, '').length < 6) {
        error.value = 'Enter the six digit authenticator code.';
        return;
    }
    loading.value = true;
    action.value = 'verify';
    error.value = '';
    try {
        const response = await api.post<MfaSetupVerify>('/api/v1/vendor/mfa/setup/verify', { code: setupCode.value });
        recoveryCodes.value = response.recovery_codes;
        setup.value = null;
        setupCode.value = '';
        resetCode.value = '';
        notice.value = '2FA is live. Save your recovery codes now — they will not be shown again.';
        await refreshIdentity();
    } catch (err) {
        error.value = readableError(err, 'Could not verify this code.');
    } finally {
        loading.value = false;
    }
}

async function verifyLoginChallenge() {
    if (challengeCode.value.trim().length < 6) {
        error.value = 'Enter your authenticator or recovery code.';
        return;
    }
    loading.value = true;
    action.value = 'verify';
    error.value = '';
    try {
        await api.post('/api/v1/vendor/mfa/challenge/verify', { code: challengeCode.value });
        challengeCode.value = '';
        notice.value = 'Security check passed.';
        await refreshIdentity();
        await router.push(redirectTarget.value);
    } catch (err) {
        error.value = readableError(err, 'Security code failed.');
    } finally {
        loading.value = false;
    }
}

async function disableMfa() {
    if (disableCode.value.trim().length < 6) {
        error.value = 'Enter a current 2FA or recovery code.';
        return;
    }
    loading.value = true;
    action.value = 'disable';
    error.value = '';
    try {
        await api.post('/api/v1/vendor/mfa/disable', { code: disableCode.value });
        disableCode.value = '';
        recoveryCodes.value = [];
        setup.value = null;
        notice.value = '2FA has been disabled. Re-enable it before vending.';
        await refreshIdentity();
    } catch (err) {
        error.value = readableError(err, 'Could not disable 2FA.');
    } finally {
        loading.value = false;
    }
}

async function resetMfa() {
    if (resetCode.value.trim().length < 6) {
        error.value = 'Enter a current 2FA or recovery code to replace your authenticator.';
        return;
    }
    loading.value = true;
    action.value = 'setup';
    error.value = '';
    recoveryCodes.value = [];
    try {
        setup.value = await api.post<MfaSetupStart>('/api/v1/vendor/mfa/setup/reset', { code: resetCode.value });
        resetCode.value = '';
        notice.value = 'Replacement started. Old 2FA stays active until the new code is verified.';
        await refreshIdentity();
    } catch (err) {
        error.value = readableError(err, 'Could not reset 2FA.');
    } finally {
        loading.value = false;
    }
}

async function copyText(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    notice.value = `${label} copied.`;
}

async function copyRecoveryCodes() {
    await copyText(recoveryCodes.value.join('\n'), 'Recovery codes');
}

onMounted(async () => {
    try {
        await loadStatus();
        if (!isEnabled.value && !setup.value) await startSetup();
    } catch (err) {
        error.value = readableError(err, 'Security status failed to load.');
    }
});
</script>

<template>
  <AppShell title="Security">

    <!-- ── Page header ── -->
    <div class="sop-page-head">
      <div class="sop-page-head-copy">
        <p class="sop-eyebrow">Vendor Protection</p>
        <h1 class="sop-page-title">Two-factor authentication</h1>
        <p class="sop-page-sub">Every session must prove possession before funds, tokens, or remote-send actions unlock.</p>
      </div>
      <div :class="['sop-status-pill', isEnabled ? (isVerified ? 'sop-status-pill--verified' : 'sop-status-pill--enabled') : 'sop-status-pill--required']">
        <span class="sop-status-dot"></span>
        {{ isEnabled ? (isVerified ? 'Verified' : 'Enabled') : 'Setup required' }}
      </div>
    </div>

    <!-- ── SOP stepper (setup / challenge flow) ── -->
    <div v-if="sopStep !== 'done'" class="sop-layout">

      <!-- Stepper track (setup flow only, not challenge) -->
      <div v-if="sopStep !== 'challenge'" class="sop-track">
        <template v-for="(step, i) in stepperSteps" :key="step.id">
          <div :class="['sop-track-step', `sop-track-step--${stepState(step.id)}`]">
            <div class="sop-track-dot">
              <svg v-if="stepState(step.id) === 'done'" viewBox="0 0 16 16" fill="none">
                <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span v-else>{{ step.id }}</span>
            </div>
            <span class="sop-track-label">{{ step.label }}</span>
          </div>
          <div v-if="i < stepperSteps.length - 1" :class="['sop-track-line', stepState(step.id + 1) !== 'pending' ? 'sop-track-line--done' : '']" />
        </template>
      </div>

      <!-- Challenge mode (verify login) -->
      <div v-if="sopStep === 'challenge'" class="sop-card sop-card--primary">
        <div class="sop-card-head">
          <div class="sop-card-icon sop-card-icon--warn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <p class="sop-step-label">Identity check</p>
            <h2 class="sop-step-title">Verify this sign-in</h2>
            <p class="sop-step-sub">Enter your authenticator code, or use one recovery code.</p>
          </div>
        </div>
        <div v-if="notice" class="sop-alert sop-alert--ok">{{ notice }}</div>
        <div v-if="error" class="sop-alert sop-alert--danger">{{ error }}</div>
        <div class="sop-input-row">
          <input v-model="challengeCode" class="bw-input sop-code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="14" placeholder="123 456" @keyup.enter="verifyLoginChallenge" />
          <button class="bw-btn primary sop-btn" :disabled="loading && action === 'verify'" @click="verifyLoginChallenge">
            {{ loading && action === 'verify' ? 'Checking…' : 'Verify' }}
          </button>
        </div>
      </div>

      <!-- Setup flow: Step 1 — Add to authenticator app -->
      <template v-else-if="setup">
        <div :class="['sop-card', 'sop-card--primary', sopStep === 1 ? 'sop-card--active' : '']">
          <div class="sop-card-head">
            <div :class="['sop-card-icon', sopStep === 1 ? 'sop-card-icon--brand' : 'sop-card-icon--done']">
              <svg v-if="sopStep > 1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>
            </div>
            <div>
              <p class="sop-step-label">Step 1 of 2</p>
              <h2 class="sop-step-title">Add Beverly Vendor to your authenticator</h2>
              <p class="sop-step-sub">Open your authenticator app (Google Authenticator, Authy, 1Password) and scan or paste the secret.</p>
            </div>
          </div>

          <div v-if="notice" class="sop-alert sop-alert--ok">{{ notice }}</div>
          <div v-if="error && sopStep === 1" class="sop-alert sop-alert--danger">{{ error }}</div>

          <div class="sop-secret-card">
            <p class="sop-secret-label">Manual entry secret</p>
            <code class="sop-secret-code">{{ displaySecret }}</code>
            <div class="sop-secret-actions">
              <a class="bw-btn sop-btn" :href="setupHref">Open authenticator setup</a>
              <button class="bw-btn sop-btn" @click="copyText(setup!.secret, 'Secret')">Copy secret</button>
            </div>
          </div>
        </div>

        <!-- Step 2 — Confirm first code -->
        <div :class="['sop-card', 'sop-card--primary']">
          <div class="sop-card-head">
            <div class="sop-card-icon sop-card-icon--brand">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"/>
              </svg>
            </div>
            <div>
              <p class="sop-step-label">Step 2 of 2</p>
              <h2 class="sop-step-title">Confirm the first code</h2>
              <p class="sop-step-sub">Proves the secret was saved correctly before it is enforced on your account.</p>
            </div>
          </div>
          <div v-if="error && sopStep === 2" class="sop-alert sop-alert--danger">{{ error }}</div>
          <div class="sop-input-row">
            <input v-model="setupCode" class="bw-input sop-code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000 000" @keyup.enter="verifySetup" />
            <button class="bw-btn primary sop-btn" :disabled="loading && action === 'verify'" @click="verifySetup">
              {{ loading && action === 'verify' ? 'Enabling…' : 'Enable 2FA' }}
            </button>
          </div>
        </div>
      </template>

      <!-- Step 3 — Save recovery codes (post-verify) -->
      <div v-else-if="sopStep === 3" class="sop-card sop-card--primary sop-card--active">
        <div class="sop-card-head">
          <div class="sop-card-icon sop-card-icon--brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>
            </svg>
          </div>
          <div>
            <p class="sop-step-label">Step 3 of 3 · Final step</p>
            <h2 class="sop-step-title">Save your recovery codes</h2>
            <p class="sop-step-sub">These codes are shown exactly once. Store them somewhere safe — they are your only way back in if you lose your device.</p>
          </div>
        </div>
        <div v-if="notice" class="sop-alert sop-alert--ok">{{ notice }}</div>
        <div class="sop-recovery-grid">
          <code v-for="code in recoveryCodes" :key="code" class="sop-recovery-code">{{ code }}</code>
        </div>
        <div class="sop-input-row">
          <button class="bw-btn primary sop-btn sop-btn--full" @click="copyRecoveryCodes">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Copy all recovery codes
          </button>
        </div>
      </div>

    </div>

    <!-- ── Enrolled / management view ── -->
    <div v-else class="sop-layout sop-layout--done">

      <!-- Status card -->
      <div class="sop-card sop-card--primary">
        <div class="sop-done-head">
          <div class="sop-done-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <div>
            <p class="sop-eyebrow">Status</p>
            <h2 class="sop-step-title">Authenticator app connected</h2>
            <p class="sop-step-sub">Your account is protected. Every vending session requires a fresh authenticator code.</p>
          </div>
          <span class="sop-status-pill sop-status-pill--verified sop-status-pill--sm">Mandatory control satisfied</span>
        </div>

        <div v-if="notice" class="sop-alert sop-alert--ok">{{ notice }}</div>
        <div v-if="error" class="sop-alert sop-alert--danger">{{ error }}</div>

        <div class="sop-divider">
          <span>Replace authenticator</span>
        </div>
        <p class="sop-step-sub" style="margin-bottom: var(--s-3)">Enter your current authenticator code to swap to a new device.</p>
        <div class="sop-input-row">
          <input v-model="resetCode" class="bw-input sop-code-input" inputmode="numeric" placeholder="Current code" />
          <button class="bw-btn primary sop-btn" :disabled="loading" @click="resetMfa">
            {{ loading && action === 'setup' ? 'Starting…' : 'Replace authenticator' }}
          </button>
        </div>
      </div>

      <!-- Recovery vault + Danger zone side by side -->
      <div class="sop-side-row">
        <div class="sop-card sop-card--side">
          <p class="sop-eyebrow">Recovery vault</p>
          <h3 class="sop-step-title">Emergency access</h3>
          <p class="sop-step-sub">Each code is single-use. Shown once at setup.</p>
          <div class="sop-recovery-empty">
            <strong>{{ safeRecoveryCount }}</strong>
            <span>unused recovery {{ safeRecoveryCount === 1 ? 'code' : 'codes' }}</span>
          </div>
        </div>

        <div class="sop-card sop-card--side sop-card--danger">
          <p class="sop-eyebrow sop-eyebrow--danger">Danger zone</p>
          <h3 class="sop-step-title">Disable 2FA</h3>
          <p class="sop-step-sub">Disabling removes mandatory protection. Requires a current code.</p>
          <div class="sop-input-col">
            <input v-model="disableCode" class="bw-input" inputmode="numeric" placeholder="Current 2FA code" />
            <button class="bw-btn sop-btn sop-btn--danger" :disabled="!isEnabled || loading" @click="disableMfa">
              {{ loading && action === 'disable' ? 'Disabling…' : 'Disable 2FA' }}
            </button>
          </div>
        </div>
      </div>

    </div>

  </AppShell>
</template>

<style scoped>
/* ── Page header ── */
.sop-page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-5);
  margin-bottom: var(--s-6);
  flex-wrap: wrap;
}

.sop-eyebrow {
  margin: 0 0 var(--s-2);
  color: var(--brand);
  font-size: var(--t-xs);
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.sop-eyebrow--danger { color: var(--danger); }

.sop-page-title {
  margin: 0 0 var(--s-2);
  font-size: clamp(28px, 4vw, 48px);
  letter-spacing: -0.04em;
  font-weight: 800;
  color: var(--text);
  line-height: 1.05;
}

.sop-page-sub {
  margin: 0;
  color: var(--muted);
  font-size: var(--t-md);
  max-width: 520px;
}

/* Status pill */
.sop-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 999px;
  font-size: var(--t-sm);
  font-weight: 700;
  white-space: nowrap;
  border: 1px solid;
}

.sop-status-pill--required {
  color: var(--warn);
  background: color-mix(in srgb, var(--warn) 10%, transparent);
  border-color: color-mix(in srgb, var(--warn) 30%, transparent);
}

.sop-status-pill--enabled {
  color: var(--brand);
  background: color-mix(in srgb, var(--brand) 10%, transparent);
  border-color: color-mix(in srgb, var(--brand) 30%, transparent);
}

.sop-status-pill--verified {
  color: var(--brand);
  background: color-mix(in srgb, var(--brand) 12%, transparent);
  border-color: color-mix(in srgb, var(--brand) 35%, transparent);
}

.sop-status-pill--sm { font-size: var(--t-xs); padding: 6px 12px; }

.sop-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

/* ── SOP stepper track ── */
.sop-track {
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: var(--s-5);
  padding: var(--s-4) var(--s-5);
  border: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  border-radius: var(--r-xl);
  background: var(--panel);
}

.sop-track-step {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}

.sop-track-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 800;
  flex-shrink: 0;
  border: 2px solid;
  transition: all 0.2s;
}

.sop-track-step--pending .sop-track-dot {
  border-color: color-mix(in srgb, var(--line) 80%, transparent);
  color: var(--muted);
  background: transparent;
}

.sop-track-step--active .sop-track-dot {
  border-color: var(--brand);
  background: color-mix(in srgb, var(--brand) 15%, transparent);
  color: var(--brand);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand) 12%, transparent);
}

.sop-track-step--done .sop-track-dot {
  border-color: var(--brand);
  background: var(--brand);
  color: #031008;
}

.sop-track-dot svg { width: 14px; height: 14px; }

.sop-track-label {
  font-size: var(--t-sm);
  font-weight: 700;
}

.sop-track-step--pending .sop-track-label { color: var(--muted); }
.sop-track-step--active  .sop-track-label { color: var(--text); }
.sop-track-step--done    .sop-track-label { color: var(--brand); }

.sop-track-line {
  flex: 1;
  height: 2px;
  background: color-mix(in srgb, var(--line) 60%, transparent);
  margin: 0 var(--s-3);
  border-radius: 2px;
  transition: background 0.3s;
}

.sop-track-line--done { background: var(--brand); }

/* ── Layout ── */
.sop-layout {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.sop-layout--done { gap: var(--s-5); }

.sop-side-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s-4);
}

/* ── Cards ── */
.sop-card {
  border: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
  border-radius: var(--r-xl);
  background:
    radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--brand) 10%, transparent), transparent 40%),
    var(--panel);
  padding: clamp(20px, 3vw, 32px);
  box-shadow: var(--shadow);
  transition: border-color 0.2s;
}

.sop-card--active {
  border-color: color-mix(in srgb, var(--brand) 35%, transparent);
  box-shadow: var(--shadow), 0 0 0 1px color-mix(in srgb, var(--brand) 20%, transparent);
}

.sop-card--danger {
  background:
    radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--danger) 8%, transparent), transparent 40%),
    var(--panel);
}

.sop-card--primary { /* full-width primary card */ }
.sop-card--side { /* sidebar card in done state */ }

/* ── Card head ── */
.sop-card-head {
  display: flex;
  align-items: flex-start;
  gap: var(--s-4);
  margin-bottom: var(--s-5);
}

.sop-card-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--r-lg);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: 1px solid;
}

.sop-card-icon svg { width: 22px; height: 22px; }

.sop-card-icon--brand {
  background: color-mix(in srgb, var(--brand) 14%, transparent);
  border-color: color-mix(in srgb, var(--brand) 30%, transparent);
  color: var(--brand);
}

.sop-card-icon--done {
  background: color-mix(in srgb, var(--brand) 20%, transparent);
  border-color: var(--brand);
  color: var(--brand);
}

.sop-card-icon--warn {
  background: color-mix(in srgb, var(--warn) 14%, transparent);
  border-color: color-mix(in srgb, var(--warn) 30%, transparent);
  color: var(--warn);
}

.sop-step-label {
  margin: 0 0 4px;
  font-size: var(--t-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted);
}

.sop-step-title {
  margin: 0 0 4px;
  font-size: var(--t-xl);
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
}

.sop-step-sub {
  margin: 0;
  color: var(--muted);
  font-size: var(--t-sm);
  line-height: 1.5;
}

/* Done head row */
.sop-done-head {
  display: flex;
  align-items: flex-start;
  gap: var(--s-4);
  flex-wrap: wrap;
  margin-bottom: var(--s-5);
}

.sop-done-icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--brand);
  color: #031008;
  flex-shrink: 0;
}

.sop-done-icon svg { width: 24px; height: 24px; }

/* ── Alerts ── */
.sop-alert {
  margin-bottom: var(--s-4);
  padding: var(--s-3) var(--s-4);
  border-radius: var(--r-lg);
  font-size: var(--t-sm);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: var(--s-2);
  border: 1px solid;
}

.sop-alert--ok {
  color: var(--brand);
  background: color-mix(in srgb, var(--brand) 10%, transparent);
  border-color: color-mix(in srgb, var(--brand) 25%, transparent);
}

.sop-alert--danger {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border-color: color-mix(in srgb, var(--danger) 25%, transparent);
}

/* ── Secret card ── */
.sop-secret-card {
  margin: var(--s-4) 0;
  padding: var(--s-4) var(--s-5);
  border: 1px dashed color-mix(in srgb, var(--brand) 40%, transparent);
  border-radius: var(--r-lg);
  background: color-mix(in srgb, #000 20%, transparent);
  display: grid;
  gap: var(--s-3);
}

.sop-secret-label {
  margin: 0;
  font-size: var(--t-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted);
}

.sop-secret-code {
  font-size: clamp(16px, 2vw, 22px);
  letter-spacing: 0.12em;
  color: var(--text);
  word-break: break-all;
  line-height: 1.4;
}

.sop-secret-actions {
  display: flex;
  gap: var(--s-3);
  flex-wrap: wrap;
}

/* ── Input rows ── */
.sop-input-row {
  display: flex;
  gap: var(--s-3);
  flex-wrap: wrap;
  align-items: center;
}

.sop-input-col {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  margin-top: var(--s-3);
}

.sop-code-input {
  max-width: 200px;
  text-align: center;
  font-size: var(--t-2xl);
  letter-spacing: 0.2em;
  font-variant-numeric: tabular-nums;
}

.sop-btn { min-width: 120px; justify-content: center; }
.sop-btn--full { width: 100%; }
.sop-btn--danger {
  background: color-mix(in srgb, var(--danger) 15%, transparent);
  color: var(--danger);
  border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent);
}
.sop-btn--danger:hover:not(:disabled) {
  background: var(--danger);
  color: white;
  border-color: var(--danger);
}

/* ── Recovery grid ── */
.sop-recovery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--s-2);
  margin: var(--s-4) 0;
}

.sop-recovery-code {
  padding: var(--s-3) var(--s-4);
  background: color-mix(in srgb, #000 22%, transparent);
  border: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  border-radius: var(--r-md);
  font-size: var(--t-sm);
  letter-spacing: 0.06em;
  color: var(--text);
  text-align: center;
}

/* Recovery empty */
.sop-recovery-empty {
  display: grid;
  place-items: center;
  gap: 4px;
  padding: var(--s-5);
  margin: var(--s-3) 0;
  border-radius: var(--r-lg);
  background: color-mix(in srgb, #000 18%, transparent);
  text-align: center;
}

.sop-recovery-empty strong {
  font-size: 44px;
  font-weight: 900;
  color: var(--brand);
  line-height: 1;
}

.sop-recovery-empty span {
  font-size: var(--t-sm);
  color: var(--muted);
}

/* Divider label */
.sop-divider {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  margin: var(--s-5) 0 var(--s-3);
}

.sop-divider::before,
.sop-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: color-mix(in srgb, var(--line) 60%, transparent);
}

.sop-divider span {
  font-size: var(--t-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted);
  white-space: nowrap;
}

/* ── Responsive ── */
@media (max-width: 760px) {
  .sop-side-row { grid-template-columns: 1fr; }
  .sop-done-head { flex-direction: column; }
  .sop-card-head { flex-direction: column; }
  .sop-track { gap: var(--s-1); padding: var(--s-3) var(--s-4); }
  .sop-track-label { display: none; }
  .sop-code-input { max-width: 100%; }
}
</style>
