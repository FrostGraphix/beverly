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
const redirectTarget = computed(() => typeof route.query.redirect === 'string' ? route.query.redirect : '/');

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
        notice.value = '2FA is live. Save your recovery codes now.';
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
    <section class="mfa-hero">
      <div>
        <p class="mfa-eyebrow">Vendor protection</p>
        <h1>Two-factor authentication</h1>
        <p>Every vendor session must prove possession before funds, tokens, or remote-send actions unlock.</p>
      </div>
      <div :class="['mfa-orb', isEnabled ? 'ready' : 'warn']">
        <span>{{ isEnabled ? '2FA' : '!' }}</span>
        <strong>{{ isEnabled ? (isVerified ? 'Verified' : 'Enabled') : 'Required' }}</strong>
      </div>
    </section>

    <div class="mfa-grid">
      <article class="mfa-card mfa-primary">
        <div class="mfa-card-head">
          <div>
            <p class="mfa-eyebrow">Status</p>
            <h2>{{ isEnabled ? 'Authenticator app connected' : 'Finish setup now' }}</h2>
          </div>
          <span :class="['mfa-badge', isEnabled ? 'ok' : 'warn']">
            {{ isEnabled ? 'Mandatory control satisfied' : 'Action needed' }}
          </span>
        </div>

        <div v-if="notice" class="mfa-alert ok">{{ notice }}</div>
        <div v-if="error" class="mfa-alert danger">{{ error }}</div>

        <div v-if="needsLoginChallenge && isEnabled && !isVerified" class="mfa-step active">
          <span class="mfa-step-index">01</span>
          <div>
            <h3>Verify this sign-in</h3>
            <p>Enter your authenticator code, or use one recovery code.</p>
            <div class="mfa-code-row">
              <input v-model="challengeCode" class="bw-input mfa-code" inputmode="numeric" autocomplete="one-time-code" maxlength="14" placeholder="123456" @keyup.enter="verifyLoginChallenge" />
              <button class="bw-btn primary" :disabled="loading && action === 'verify'" @click="verifyLoginChallenge">
                {{ loading && action === 'verify' ? 'Checking...' : 'Verify' }}
              </button>
            </div>
          </div>
        </div>

        <div v-else-if="setup" class="mfa-setup">
          <div class="mfa-step active">
            <span class="mfa-step-index">01</span>
            <div>
              <h3>Add Beverly Vendor</h3>
              <p>Open your authenticator app and add this account. On mobile, the setup link opens directly.</p>
              <div class="mfa-secret-card">
                <span>Manual secret</span>
                <code>{{ displaySecret }}</code>
                <button class="bw-btn" @click="copyText(setup.secret, 'Secret')">Copy secret</button>
              </div>
              <a class="mfa-link" :href="setupHref">Open authenticator setup</a>
            </div>
          </div>

          <div class="mfa-step active">
            <span class="mfa-step-index">02</span>
            <div>
              <h3>Confirm the first code</h3>
              <p>This proves the secret was saved before we enforce it.</p>
              <div class="mfa-code-row">
                <input v-model="setupCode" class="bw-input mfa-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" @keyup.enter="verifySetup" />
                <button class="bw-btn primary" :disabled="loading && action === 'verify'" @click="verifySetup">
                  {{ loading && action === 'verify' ? 'Enabling...' : 'Enable 2FA' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="mfa-step active">
          <span class="mfa-step-index">01</span>
          <div>
            <h3>2FA is protecting this vendor account</h3>
            <p>Use your authenticator app at sign-in. Recovery codes remain for emergencies only.</p>
            <div class="mfa-code-row">
              <input v-model="resetCode" class="bw-input" inputmode="numeric" placeholder="Current code to replace" />
              <button class="bw-btn primary" :disabled="loading" @click="resetMfa">Replace authenticator</button>
            </div>
          </div>
        </div>
      </article>

      <aside class="mfa-card">
        <p class="mfa-eyebrow">Recovery vault</p>
        <h2>{{ recoveryCodes.length ? 'Save these once' : 'Emergency access' }}</h2>
        <p class="mfa-muted">Recovery codes are shown only once. Each code works one time.</p>

        <div v-if="recoveryCodes.length" class="mfa-recovery-grid">
          <code v-for="code in recoveryCodes" :key="code">{{ code }}</code>
        </div>
        <div v-else class="mfa-recovery-empty">
          <strong>{{ safeRecoveryCount }}</strong>
          <span>unused recovery codes</span>
        </div>

        <button v-if="recoveryCodes.length" class="bw-btn primary" style="width:100%; justify-content:center" @click="copyRecoveryCodes">
          Copy recovery codes
        </button>
      </aside>

      <aside class="mfa-card mfa-danger-zone">
        <p class="mfa-eyebrow">Controlled reset</p>
        <h2>Disable or replace</h2>
        <p class="mfa-muted">Disabling requires a current authenticator code or recovery code.</p>
        <input v-model="disableCode" class="bw-input" inputmode="numeric" placeholder="Current 2FA code" />
        <button class="bw-btn danger" :disabled="!isEnabled || loading" @click="disableMfa">
          {{ loading && action === 'disable' ? 'Disabling...' : 'Disable 2FA' }}
        </button>
      </aside>
    </div>
  </AppShell>
</template>

<style scoped>
.mfa-hero,
.mfa-card {
  border: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
  background:
    radial-gradient(circle at 14% 0%, color-mix(in srgb, var(--brand) 18%, transparent), transparent 38%),
    var(--panel);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow);
}

.mfa-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--s-6);
  padding: clamp(24px, 4vw, 44px);
  margin-bottom: var(--s-5);
}

.mfa-hero h1 {
  margin: 0;
  color: var(--text);
  font-size: clamp(34px, 5vw, 64px);
  letter-spacing: -0.06em;
}

.mfa-hero p {
  max-width: 720px;
  color: var(--muted);
  font-size: var(--t-lg);
}

.mfa-eyebrow {
  margin: 0 0 var(--s-2);
  color: var(--brand);
  font-size: var(--t-xs);
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.mfa-orb {
  width: 150px;
  height: 150px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--brand) 40%, transparent);
  background: color-mix(in srgb, var(--brand) 16%, transparent);
}

.mfa-orb span {
  width: 62px;
  height: 62px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--brand);
  color: #031008;
  font-weight: 900;
}

.mfa-orb strong {
  color: var(--text);
}

.mfa-orb.warn {
  border-color: color-mix(in srgb, var(--warn) 45%, transparent);
  background: color-mix(in srgb, var(--warn) 12%, transparent);
}

.mfa-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
  gap: var(--s-5);
}

.mfa-card {
  padding: clamp(20px, 3vw, 32px);
}

.mfa-primary {
  grid-row: span 2;
}

.mfa-card-head {
  display: flex;
  justify-content: space-between;
  gap: var(--s-4);
  align-items: flex-start;
  margin-bottom: var(--s-5);
}

.mfa-card h2,
.mfa-step h3 {
  margin: 0;
  color: var(--text);
}

.mfa-muted,
.mfa-step p {
  color: var(--muted);
}

.mfa-badge {
  border-radius: 999px;
  padding: 8px 12px;
  font-size: var(--t-xs);
  font-weight: 800;
}

.mfa-badge.ok {
  color: var(--brand);
  background: color-mix(in srgb, var(--brand) 12%, transparent);
}

.mfa-badge.warn {
  color: var(--warn);
  background: color-mix(in srgb, var(--warn) 12%, transparent);
}

.mfa-alert {
  margin-bottom: var(--s-4);
  border-radius: var(--r-md);
  padding: var(--s-3);
  font-weight: 700;
}

.mfa-alert.ok {
  color: var(--brand);
  background: color-mix(in srgb, var(--brand) 12%, transparent);
}

.mfa-alert.danger {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}

.mfa-step {
  display: grid;
  grid-template-columns: 48px 1fr;
  gap: var(--s-4);
  padding: var(--s-4) 0;
  border-top: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
}

.mfa-step-index {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: color-mix(in srgb, var(--brand) 16%, transparent);
  color: var(--brand);
  font-weight: 900;
}

.mfa-secret-card {
  display: grid;
  gap: var(--s-3);
  margin: var(--s-4) 0;
  padding: var(--s-4);
  border: 1px dashed color-mix(in srgb, var(--brand) 45%, transparent);
  border-radius: var(--r-lg);
  background: color-mix(in srgb, #000 18%, transparent);
}

.mfa-secret-card span {
  color: var(--muted);
  font-size: var(--t-sm);
  font-weight: 700;
}

.mfa-secret-card code {
  color: var(--text);
  font-size: clamp(16px, 2vw, 22px);
  word-break: break-all;
}

.mfa-link {
  color: var(--brand);
  font-weight: 800;
}

.mfa-code-row,
.mfa-actions {
  display: flex;
  gap: var(--s-3);
  flex-wrap: wrap;
  align-items: center;
}

.mfa-code {
  max-width: 220px;
  text-align: center;
  font-size: 24px;
  letter-spacing: 0.22em;
}

.mfa-recovery-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-2);
  margin: var(--s-4) 0;
}

.mfa-recovery-grid code,
.mfa-recovery-empty {
  border-radius: var(--r-md);
  background: color-mix(in srgb, #000 20%, transparent);
  color: var(--text);
  padding: var(--s-3);
}

.mfa-recovery-empty {
  display: grid;
  place-items: center;
  min-height: 140px;
  margin: var(--s-4) 0;
}

.mfa-recovery-empty strong {
  color: var(--brand);
  font-size: 48px;
}

.mfa-danger-zone {
  display: grid;
  gap: var(--s-3);
}

.bw-btn.danger {
  background: var(--danger);
  color: white;
}

@media (max-width: 980px) {
  .mfa-hero,
  .mfa-card-head {
    flex-direction: column;
  }

  .mfa-grid {
    grid-template-columns: 1fr;
  }

  .mfa-orb {
    width: 120px;
    height: 120px;
  }
}
</style>
