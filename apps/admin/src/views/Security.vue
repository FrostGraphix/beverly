<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, ApiError, shortDate } from '../lib/api';
import qrcode from 'qrcode-generator';

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

const status = ref<MfaStatus | null>(null);
const setup = ref<MfaSetupStart | null>(null);
const recoveryCodes = ref<string[]>([]);
const loading = ref(true);
const busy = ref<'' | 'start' | 'verify' | 'reset' | 'disable' | 'regen'>('');
const notice = ref('');
const error = ref('');

const setupCode = ref('');
const resetCode = ref('');
const disableCode = ref('');
const regenCode = ref('');

const enabled = computed(() => status.value?.enrolled === true);
const verified = computed(() => status.value?.verified === true);
const displaySecret = computed(() => setup.value?.secret.match(/.{1,4}/g)?.join(' ') ?? '');

// Render the otpauth URI as an inline SVG QR via qrcode-generator (ECC level M,
// auto type number). otpauth URIs are ASCII so byte mode needs no UTF-8 shim.
const qr = computed(() => {
    if (!setup.value) return null;
    try {
        const model = qrcode(0, 'M');
        model.addData(setup.value.otpauth_uri);
        model.make();
        const count = model.getModuleCount();
        const quiet = 4;
        const dim = count + quiet * 2;
        let path = '';
        for (let row = 0; row < count; row++) {
            for (let col = 0; col < count; col++) {
                if (model.isDark(row, col)) path += `M${col + quiet},${row + quiet}h1v1h-1z`;
            }
        }
        return { dim, path };
    } catch {
        return null;
    }
});

function readableError(err: unknown, fallback: string): string {
    if (err instanceof ApiError) return err.message || fallback;
    if (err instanceof Error) return err.message || fallback;
    return fallback;
}

async function loadStatus() {
    status.value = await api.get<MfaStatus>('/api/v1/admin/mfa/status');
}

async function startSetup() {
    busy.value = 'start'; error.value = ''; notice.value = ''; recoveryCodes.value = [];
    try {
        setup.value = await api.post<MfaSetupStart>('/api/v1/admin/mfa/setup/start', {});
        notice.value = 'Scan the code with your authenticator app, then confirm a code below.';
    } catch (err) {
        error.value = readableError(err, 'Could not start 2FA setup.');
    } finally { busy.value = ''; }
}

async function verifySetup() {
    if (setupCode.value.replace(/\D/g, '').length < 6) { error.value = 'Enter the 6-digit code.'; return; }
    busy.value = 'verify'; error.value = '';
    try {
        const res = await api.post<{ recovery_codes: string[] }>('/api/v1/admin/mfa/setup/verify', { code: setupCode.value });
        recoveryCodes.value = res.recovery_codes;
        setup.value = null; setupCode.value = '';
        notice.value = '2FA is now active. Save your recovery codes — they are shown once.';
        await loadStatus();
    } catch (err) {
        error.value = readableError(err, 'That code is not correct.');
    } finally { busy.value = ''; }
}

async function replaceAuthenticator() {
    if (resetCode.value.trim().length < 6) { error.value = 'Enter a current code to replace your authenticator.'; return; }
    busy.value = 'reset'; error.value = ''; recoveryCodes.value = [];
    try {
        setup.value = await api.post<MfaSetupStart>('/api/v1/admin/mfa/setup/reset', { code: resetCode.value });
        resetCode.value = '';
        notice.value = 'Replacement started — your old code stays valid until you confirm the new one.';
    } catch (err) {
        error.value = readableError(err, 'Could not start replacement.');
    } finally { busy.value = ''; }
}

async function regenerate() {
    if (regenCode.value.trim().length < 6) { error.value = 'Enter a current code to regenerate recovery codes.'; return; }
    busy.value = 'regen'; error.value = '';
    try {
        const res = await api.post<{ recovery_codes: string[] }>('/api/v1/admin/mfa/recovery/regenerate', { code: regenCode.value });
        recoveryCodes.value = res.recovery_codes;
        regenCode.value = '';
        notice.value = 'New recovery codes generated. Old codes no longer work.';
        await loadStatus();
    } catch (err) {
        error.value = readableError(err, 'Could not regenerate recovery codes.');
    } finally { busy.value = ''; }
}

async function disable() {
    if (disableCode.value.trim().length < 6) { error.value = 'Enter a current code to disable 2FA.'; return; }
    busy.value = 'disable'; error.value = '';
    try {
        await api.post('/api/v1/admin/mfa/disable', { code: disableCode.value });
        disableCode.value = ''; setup.value = null; recoveryCodes.value = [];
        notice.value = '2FA disabled. Re-enable it to keep this account protected.';
        await loadStatus();
    } catch (err) {
        error.value = readableError(err, 'Could not disable 2FA.');
    } finally { busy.value = ''; }
}

async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); notice.value = `${label} copied.`; }
    catch { error.value = 'Clipboard unavailable — copy manually.'; }
}

function downloadRecovery() {
    const blob = new Blob([
        `Beverly Wallet Admin — recovery codes\nGenerated ${new Date().toISOString()}\n\n${recoveryCodes.value.join('\n')}\n`,
    ], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'beverly-admin-recovery-codes.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

onMounted(async () => {
    try { await loadStatus(); }
    catch (err) { error.value = readableError(err, 'Could not load security status.'); }
    finally { loading.value = false; }
});
</script>

<template>
  <AppShell title="Security">
    <!-- Hero -->
    <section class="sec-hero">
      <div class="sec-hero-glow" />
      <div class="sec-hero-left">
        <p class="sec-eyebrow">Account protection</p>
        <h1>Two-factor authentication</h1>
        <p class="sec-hero-sub">
          Staff move money, approve refunds, and control launch gates. A second factor stops a stolen
          password from becoming a breach.
        </p>
      </div>
      <div :class="['sec-orb', enabled ? 'on' : 'off']">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        <strong>{{ enabled ? (verified ? 'Verified' : 'Enabled') : 'Off' }}</strong>
      </div>
    </section>

    <div v-if="notice" class="bw-alert sec-alert ok">{{ notice }}</div>
    <div v-if="error" class="bw-alert danger sec-alert">{{ error }}</div>

    <div v-if="loading" class="bw-loading">Loading…</div>

    <div v-else class="sec-grid">
      <!-- Primary panel -->
      <section class="bw-card sec-main">
        <!-- Recovery codes reveal (shown once after enable / regenerate) -->
        <div v-if="recoveryCodes.length" class="sec-recovery-reveal">
          <div class="sec-panel-head">
            <h2>Save your recovery codes</h2>
            <span class="bw-badge bw-badge-warning">Shown once</span>
          </div>
          <p class="bw-muted">Each code works a single time if you lose your authenticator. Store them somewhere safe.</p>
          <div class="sec-recovery-grid">
            <code v-for="c in recoveryCodes" :key="c">{{ c }}</code>
          </div>
          <div class="sec-row">
            <button class="bw-btn primary" @click="copy(recoveryCodes.join('\n'), 'Recovery codes')">Copy all</button>
            <button class="bw-btn" @click="downloadRecovery">Download .txt</button>
            <button class="bw-btn bw-btn-ghost" @click="recoveryCodes = []">I've saved them</button>
          </div>
        </div>

        <!-- Enrollment wizard -->
        <template v-else-if="setup">
          <div class="sec-panel-head">
            <h2>Set up authenticator</h2>
            <span class="bw-badge bw-badge-neutral">Step {{ setupCode.replace(/\D/g,'').length >= 6 ? 2 : 1 }} of 2</span>
          </div>

          <div class="sec-enroll">
            <div class="sec-qr-wrap">
              <svg v-if="qr" class="sec-qr" :viewBox="`0 0 ${qr.dim} ${qr.dim}`" shape-rendering="crispEdges" role="img" aria-label="Authenticator QR code">
                <rect :width="qr.dim" :height="qr.dim" fill="#fff" />
                <path :d="qr.path" fill="#000" />
              </svg>
              <div v-else class="sec-qr-fallback">QR unavailable — use the manual key.</div>
            </div>

            <div class="sec-enroll-body">
              <ol class="sec-steps">
                <li><strong>Scan</strong> the QR with Google Authenticator, 1Password, Authy, or similar.</li>
                <li>Can't scan? Enter this key manually:</li>
              </ol>
              <div class="sec-secret">
                <code>{{ displaySecret }}</code>
                <button class="bw-icon-btn" title="Copy key" @click="copy(setup.secret, 'Setup key')">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                </button>
              </div>
              <label class="bw-label" style="margin-top: var(--s-4)">Enter the 6-digit code to confirm</label>
              <div class="sec-row">
                <input v-model="setupCode" class="bw-input sec-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" @keyup.enter="verifySetup" />
                <button class="bw-btn primary" :disabled="busy === 'verify'" @click="verifySetup">{{ busy === 'verify' ? 'Enabling…' : 'Enable 2FA' }}</button>
              </div>
              <button class="bw-btn bw-btn-ghost bw-btn-sm" style="margin-top: var(--s-3)" @click="setup = null; setupCode = ''">Cancel setup</button>
            </div>
          </div>
        </template>

        <!-- Active state -->
        <template v-else-if="enabled">
          <div class="sec-panel-head">
            <h2>Authenticator app connected</h2>
            <span class="bw-badge bw-badge-success">Protected</span>
          </div>
          <dl class="sec-facts">
            <div><dt>Method</dt><dd>Authenticator app (TOTP)</dd></div>
            <div><dt>Enabled</dt><dd>{{ status?.enrolled_at ? shortDate(status.enrolled_at) : '—' }}</dd></div>
            <div><dt>Last verified</dt><dd>{{ status?.last_verified_at ? shortDate(status.last_verified_at) : '—' }}</dd></div>
            <div><dt>Recovery codes left</dt><dd>{{ status?.recovery_codes_remaining ?? 0 }}</dd></div>
          </dl>
          <p class="bw-muted">You'll be asked for a code at sign-in and again after your 2FA grant expires.</p>
        </template>

        <!-- Not enrolled -->
        <template v-else>
          <div class="sec-panel-head">
            <h2>Protect this account</h2>
            <span class="bw-badge bw-badge-warning">Recommended</span>
          </div>
          <p class="bw-muted">Add an authenticator app to require a one-time code in addition to your password.</p>
          <button class="bw-btn primary lg" :disabled="busy === 'start'" @click="startSetup">
            {{ busy === 'start' ? 'Starting…' : 'Set up two-factor authentication' }}
          </button>
        </template>
      </section>

      <!-- Side: manage (only when enabled and not mid-setup) -->
      <aside v-if="enabled && !setup && !recoveryCodes.length" class="sec-side">
        <section class="bw-card">
          <p class="sec-eyebrow">Recovery</p>
          <h3>Regenerate codes</h3>
          <p class="bw-muted">Invalidates old codes and issues a fresh set of 10.</p>
          <input v-model="regenCode" class="bw-input" inputmode="numeric" placeholder="Current 2FA code" />
          <button class="bw-btn" style="width:100%; justify-content:center" :disabled="busy === 'regen'" @click="regenerate">
            {{ busy === 'regen' ? 'Generating…' : 'Regenerate recovery codes' }}
          </button>
        </section>

        <section class="bw-card">
          <p class="sec-eyebrow">Replace</p>
          <h3>New authenticator</h3>
          <p class="bw-muted">Moving to a new phone? Confirm a current code, then scan again.</p>
          <input v-model="resetCode" class="bw-input" inputmode="numeric" placeholder="Current 2FA code" />
          <button class="bw-btn" style="width:100%; justify-content:center" :disabled="busy === 'reset'" @click="replaceAuthenticator">
            {{ busy === 'reset' ? 'Starting…' : 'Replace authenticator' }}
          </button>
        </section>

        <section class="bw-card sec-danger">
          <p class="sec-eyebrow" style="color: var(--danger)">Danger zone</p>
          <h3>Disable 2FA</h3>
          <p class="bw-muted">Removes the second factor. Your account will rely on its password alone.</p>
          <input v-model="disableCode" class="bw-input" inputmode="numeric" placeholder="Current 2FA code" />
          <button class="bw-btn danger" style="width:100%; justify-content:center" :disabled="busy === 'disable'" @click="disable">
            {{ busy === 'disable' ? 'Disabling…' : 'Disable two-factor' }}
          </button>
        </section>
      </aside>
    </div>
  </AppShell>
</template>

<style scoped>
.sec-hero {
  position: relative; overflow: hidden;
  display: flex; justify-content: space-between; align-items: center; gap: var(--s-6);
  padding: clamp(1.5rem, 4vw, 2.75rem);
  border-radius: var(--r-2xl, 20px);
  background: linear-gradient(140deg, oklch(12% .02 260) 0%, oklch(8% .01 260) 100%);
  border: 1px solid oklch(100% 0 0 / .07);
  margin-bottom: var(--s-5);
}
.sec-hero-glow { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(60% 60% at 90% 0%, oklch(70% .19 145 / .2), transparent 70%); }
.sec-hero-left { position: relative; }
.sec-hero h1 { margin: .25rem 0 0; font-size: clamp(1.8rem, 4vw, 3rem); letter-spacing: -.04em; }
.sec-hero-sub { margin: .6rem 0 0; max-width: 560px; color: var(--text-muted, #94a3b8); }
.sec-eyebrow { margin: 0 0 .35rem; color: var(--brand); font-size: var(--t-xs); font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
.sec-orb {
  position: relative; flex-shrink: 0; width: 120px; height: 120px; border-radius: 50%;
  display: grid; place-items: center; gap: 4px;
}
.sec-orb svg { width: 34px; height: 34px; }
.sec-orb strong { font-size: var(--t-sm); }
.sec-orb.on { border: 1px solid oklch(from var(--brand) l c h / .4); background: oklch(from var(--brand) l c h / .12); color: var(--brand); }
.sec-orb.off { border: 1px solid oklch(from var(--warn) l c h / .4); background: oklch(from var(--warn) l c h / .12); color: var(--warn); }

.sec-alert { margin-bottom: var(--s-4); }
.sec-alert.ok { background: oklch(from var(--brand) l c h / .12); border: 1px solid oklch(from var(--brand) l c h / .3); color: var(--brand); }

.sec-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(280px, .9fr); gap: var(--s-4); align-items: start; }
.sec-main { min-height: 220px; }
.sec-panel-head { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); margin-bottom: var(--s-3); }
.sec-panel-head h2 { margin: 0; font-size: var(--t-lg); }

.sec-enroll { display: grid; grid-template-columns: auto 1fr; gap: var(--s-5); align-items: start; }
.sec-qr-wrap { width: 200px; height: 200px; background: #fff; border-radius: 14px; padding: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.25); }
.sec-qr { width: 100%; height: 100%; display: block; }
.sec-qr-fallback { display: grid; place-items: center; height: 100%; color: #475569; font-size: var(--t-sm); text-align: center; padding: 1rem; }
.sec-steps { margin: 0 0 var(--s-3); padding-left: 1.1rem; color: var(--text-dim, #cbd5e1); display: flex; flex-direction: column; gap: 6px; font-size: var(--t-sm); }
.sec-secret { display: flex; align-items: center; gap: 8px; background: var(--surface-2, #0d1117); border: 1px dashed oklch(from var(--brand) l c h / .4); border-radius: var(--r-md); padding: .65rem .85rem; }
.sec-secret code { flex: 1; font-family: var(--font-mono, monospace); letter-spacing: .12em; word-break: break-all; }
.sec-code { max-width: 180px; text-align: center; font-size: 22px; letter-spacing: .25em; font-family: var(--font-mono, monospace); }
.sec-row { display: flex; gap: var(--s-3); flex-wrap: wrap; align-items: center; }

.sec-facts { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); margin: var(--s-3) 0 var(--s-4); }
.sec-facts dt { font-size: var(--t-xs); text-transform: uppercase; letter-spacing: .06em; color: var(--text-faint, #64748b); }
.sec-facts dd { margin: 2px 0 0; font-weight: 600; }

.sec-recovery-reveal { display: flex; flex-direction: column; gap: var(--s-3); }
.sec-recovery-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: var(--s-2) 0; }
.sec-recovery-grid code { background: var(--surface-2, #0d1117); border: 1px solid var(--border, #1e293b); border-radius: var(--r-md); padding: .6rem .8rem; font-family: var(--font-mono, monospace); letter-spacing: .08em; text-align: center; }

.sec-side { display: flex; flex-direction: column; gap: var(--s-4); }
.sec-side h3 { margin: 0 0 4px; font-size: var(--t-md); }
.sec-side .bw-input { margin: var(--s-3) 0; }
.sec-danger { border-color: oklch(from var(--danger) l c h / .3); }
.bw-btn.danger { background: var(--danger); color: #fff; }

@media (max-width: 960px) {
  .sec-grid { grid-template-columns: 1fr; }
  .sec-hero { flex-direction: column; align-items: flex-start; }
  .sec-enroll { grid-template-columns: 1fr; justify-items: center; }
  .sec-enroll-body { width: 100%; }
}
</style>
