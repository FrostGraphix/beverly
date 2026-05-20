<template>
  <div class="mfa-setup-overlay" @click.self="$emit('cancelled')">
    <div class="mfa-setup-card" role="dialog" aria-label="Enable two-factor authentication">
      <!-- Progress bar -->
      <div class="mfa-progress">
        <div class="mfa-progress-fill" :style="{ width: `${((stepIndex + 1) / steps.length) * 100}%` }"></div>
      </div>

      <button class="mfa-setup-close" type="button" aria-label="Close" @click="$emit('cancelled')">✕</button>

      <!-- Step 1: Intro -->
      <div v-if="step === 'intro'" class="mfa-step">
        <div class="mfa-step-icon mfa-step-icon--shield">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
        </div>
        <h2 class="mfa-step-title">Secure Your Account</h2>
        <p class="mfa-step-desc">Two-factor authentication adds a second layer of security. You'll need an authenticator app to generate time-based codes.</p>
        <div class="mfa-app-icons">
          <span class="mfa-app-badge">Google Authenticator</span>
          <span class="mfa-app-badge">Microsoft Authenticator</span>
          <span class="mfa-app-badge">Authy</span>
        </div>
        <button class="mfa-setup-btn mfa-setup-btn--primary" @click="startEnrollment">Get Started</button>
      </div>

      <!-- Step 2: QR Code -->
      <div v-if="step === 'qr'" class="mfa-step">
        <h2 class="mfa-step-title">Scan QR Code</h2>
        <p class="mfa-step-desc">Open your authenticator app and scan this code</p>

        <div v-if="enrolling" class="mfa-loading">
          <div class="mfa-spinner-lg"></div>
          <p>Setting up…</p>
        </div>

        <template v-else>
          <div class="mfa-qr-area">
            <div class="mfa-qr-placeholder" v-html="qrSvg"></div>
          </div>

          <div class="mfa-manual-entry">
            <p class="mfa-manual-label">Or enter this code manually:</p>
            <div class="mfa-secret-row">
              <code class="mfa-secret">{{ secret }}</code>
              <button class="mfa-copy-btn" type="button" @click="copySecret" :title="secretCopied ? 'Copied!' : 'Copy'">
                {{ secretCopied ? '✓' : '⧉' }}
              </button>
            </div>
          </div>

          <button class="mfa-setup-btn mfa-setup-btn--primary" @click="step = 'verify'">I've Scanned It</button>
        </template>
      </div>

      <!-- Step 3: Verify -->
      <div v-if="step === 'verify'" class="mfa-step" :class="{ 'mfa-shake': shaking }">
        <h2 class="mfa-step-title">Verify Code</h2>
        <p class="mfa-step-desc">Enter the 6-digit code from your authenticator app</p>

        <div class="mfa-digits">
          <input
            v-for="(_, i) in verifyDigits"
            :key="i"
            :ref="el => { if (el) verifyRefs[i] = el; }"
            class="mfa-digit"
            type="text"
            inputmode="numeric"
            pattern="[0-9]"
            maxlength="1"
            :aria-label="`Digit ${i + 1}`"
            :value="verifyDigits[i]"
            @input="onVerifyInput(i, $event)"
            @keydown="onVerifyKeydown(i, $event)"
            @paste="onVerifyPaste($event)"
            @focus="$event.target.select()"
          />
        </div>

        <transition name="mfa-alert-fade">
          <p v-if="verifyError" class="mfa-error" role="alert">{{ verifyError }}</p>
        </transition>

        <button class="mfa-setup-btn mfa-setup-btn--primary" :disabled="verifying || verifyCode.length < 6" @click="submitVerification">
          <span v-if="verifying" class="mfa-spinner-sm"></span>
          <span v-else>Verify</span>
        </button>
        <button class="mfa-setup-btn mfa-setup-btn--ghost" @click="step = 'qr'">Back</button>
      </div>

      <!-- Step 4: Recovery Codes -->
      <div v-if="step === 'recovery'" class="mfa-step">
        <h2 class="mfa-step-title">Save Recovery Codes</h2>
        <p class="mfa-step-desc">Store these codes safely. Each can only be used once if you lose access to your authenticator.</p>

        <div class="mfa-codes-grid">
          <code v-for="(code, i) in recoveryCodes" :key="i" class="mfa-code-item">{{ code }}</code>
        </div>

        <div class="mfa-codes-actions">
          <button class="mfa-setup-btn mfa-setup-btn--secondary" @click="copyAllCodes">
            {{ codesCopied ? '✓ Copied' : '⧉ Copy All' }}
          </button>
          <button class="mfa-setup-btn mfa-setup-btn--secondary" @click="downloadCodes">↓ Download</button>
        </div>

        <label class="mfa-confirm-check">
          <input type="checkbox" v-model="codesConfirmed" />
          <span>I have saved my recovery codes</span>
        </label>

        <button class="mfa-setup-btn mfa-setup-btn--primary" :disabled="!codesConfirmed" @click="step = 'success'">Continue</button>
      </div>

      <!-- Step 5: Success -->
      <div v-if="step === 'success'" class="mfa-step">
        <div class="mfa-success-check">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
        </div>
        <h2 class="mfa-step-title">You're Protected</h2>
        <p class="mfa-step-desc">Two-factor authentication is now enabled on your account. You'll need your authenticator code each time you sign in.</p>
        <button class="mfa-setup-btn mfa-setup-btn--primary" @click="$emit('complete')">Done</button>
      </div>
    </div>
  </div>
</template>

<script>
import { enrollMFA, verifyEnrollment, generateRecoveryCodesText } from "../services/mfa-service.mjs";

export default {
  name: "MfaSetupFlow",
  emits: ["complete", "cancelled"],
  data() {
    return {
      step: "intro",
      steps: ["intro", "qr", "verify", "recovery", "success"],
      factorId: null,
      totpUri: "",
      secret: "",
      recoveryCodes: [],
      enrolling: false,
      secretCopied: false,
      codesCopied: false,
      codesConfirmed: false,
      verifyDigits: ["", "", "", "", "", ""],
      verifyRefs: [],
      verifying: false,
      verifyError: "",
      shaking: false,
      qrSvg: ""
    };
  },
  computed: {
    stepIndex() { return this.steps.indexOf(this.step); },
    verifyCode() { return this.verifyDigits.join(""); }
  },
  methods: {
    async startEnrollment() {
      this.step = "qr";
      this.enrolling = true;
      try {
        const result = await enrollMFA();
        this.factorId = result.factorId;
        this.totpUri = result.totpUri || "";
        this.secret = result.secret || "";
        this.recoveryCodes = result.recoveryCodes || [];
        this.qrSvg = this.generateQRPlaceholder(this.totpUri);
      } catch (err) {
        this.verifyError = err?.message || "Enrollment failed.";
      } finally {
        this.enrolling = false;
      }
    },
    generateQRPlaceholder(uri) {
      // Generate a visual QR-like SVG placeholder with the TOTP URI
      const size = 200;
      const cells = 25;
      const cellSize = size / cells;
      let rects = "";

      // Simple hash-based pattern from URI for visual representation
      let hash = 0;
      for (let i = 0; i < uri.length; i++) {
        hash = ((hash << 5) - hash + uri.charCodeAt(i)) | 0;
      }

      // Generate QR-like pattern
      for (let y = 0; y < cells; y++) {
        for (let x = 0; x < cells; x++) {
          // Finder patterns (top-left, top-right, bottom-left)
          const isFinderTL = x < 7 && y < 7;
          const isFinderTR = x >= cells - 7 && y < 7;
          const isFinderBL = x < 7 && y >= cells - 7;
          const isFinder = isFinderTL || isFinderTR || isFinderBL;

          let fill = false;
          if (isFinder) {
            const fx = isFinderTL ? x : isFinderTR ? x - (cells - 7) : x;
            const fy = isFinderTL || isFinderTR ? y : y - (cells - 7);
            fill = (fx === 0 || fx === 6 || fy === 0 || fy === 6) || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4);
          } else {
            // Data area — seeded pseudo-random from URI hash
            const seed = (hash * (x + 1) * (y + 1)) ^ (hash >> (x % 16));
            fill = (seed & (1 << (y % 8))) !== 0 && Math.abs(seed % 3) < 2;
          }

          if (fill) {
            rects += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="currentColor"/>`;
          }
        }
      }

      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" class="mfa-qr-svg">${rects}</svg>`;
    },
    onVerifyInput(index, event) {
      const val = (event.target.value || "").replace(/\D/g, "").slice(-1);
      this.verifyDigits[index] = val;
      if (val && index < 5 && this.verifyRefs[index + 1]) {
        this.verifyRefs[index + 1].focus();
      }
    },
    onVerifyKeydown(index, event) {
      if (event.key === "Backspace" && !this.verifyDigits[index] && index > 0) {
        this.verifyDigits[index - 1] = "";
        this.verifyRefs[index - 1]?.focus();
        event.preventDefault();
      }
    },
    onVerifyPaste(event) {
      event.preventDefault();
      const text = (event.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 6);
      for (let i = 0; i < 6; i++) this.verifyDigits[i] = text[i] || "";
    },
    async submitVerification() {
      if (this.verifying || this.verifyCode.length < 6) return;
      this.verifying = true;
      this.verifyError = "";
      try {
        const result = await verifyEnrollment(this.factorId, this.verifyCode);
        if (result?.verified) {
          this.step = "recovery";
        } else {
          this.verifyError = "Invalid code. Try again.";
          this.triggerShake();
          this.clearVerifyDigits();
        }
      } catch (err) {
        this.verifyError = err?.message || "Verification failed.";
        this.triggerShake();
        this.clearVerifyDigits();
      } finally {
        this.verifying = false;
      }
    },
    clearVerifyDigits() {
      for (let i = 0; i < 6; i++) this.verifyDigits[i] = "";
      this.$nextTick(() => this.verifyRefs[0]?.focus());
    },
    triggerShake() {
      this.shaking = true;
      setTimeout(() => { this.shaking = false; }, 500);
    },
    copySecret() {
      navigator.clipboard?.writeText(this.secret);
      this.secretCopied = true;
      setTimeout(() => { this.secretCopied = false; }, 2000);
    },
    copyAllCodes() {
      navigator.clipboard?.writeText(this.recoveryCodes.join("\n"));
      this.codesCopied = true;
      setTimeout(() => { this.codesCopied = false; }, 2000);
    },
    downloadCodes() {
      const text = generateRecoveryCodesText(this.recoveryCodes);
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "beverly-recovery-codes.txt";
      a.click();
      URL.revokeObjectURL(url);
    }
  }
};
</script>

<style scoped>
.mfa-setup-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  z-index: 500;
  display: flex; align-items: center; justify-content: center;
  animation: mfa-fade-in 0.2s ease;
}

.mfa-setup-card {
  position: relative;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-color, rgba(148, 163, 184, 0.2));
  border-radius: 20px;
  width: 480px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 64px);
  overflow-y: auto;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.3);
}

.mfa-progress { height: 3px; background: var(--border-color, #e2e8f0); border-radius: 20px 20px 0 0; overflow: hidden; }
.mfa-progress-fill { height: 100%; background: var(--bev-color-green-600, #059669); transition: width 0.4s ease; }

.mfa-setup-close {
  position: absolute; top: 16px; right: 16px;
  background: none; border: none;
  color: var(--text-muted, #64748b);
  font-size: 18px; cursor: pointer;
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px;
}
.mfa-setup-close:hover { background: var(--bg-page, #f8fafc); }

.mfa-step {
  display: flex; flex-direction: column; align-items: center; gap: 16px;
  padding: 36px 32px 28px;
}

.mfa-step-icon { width: 64px; height: 64px; color: var(--bev-color-green-600, #059669); }
.mfa-step-icon svg { width: 100%; height: 100%; }
.mfa-step-icon--shield { animation: mfa-pulse 2s ease infinite; }

.mfa-step-title { font-size: 22px; font-weight: 800; color: var(--text-strong, #0f172a); margin: 0; text-align: center; }
.mfa-step-desc { font-size: 14px; color: var(--text-muted, #64748b); margin: 0; text-align: center; line-height: 1.6; max-width: 360px; }

.mfa-app-icons { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.mfa-app-badge {
  padding: 6px 14px; border-radius: 999px;
  background: var(--bg-page, #f8fafc);
  border: 1px solid var(--border-color, #e2e8f0);
  font-size: 12px; font-weight: 600; color: var(--text-main, #334155);
}

.mfa-loading { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 24px 0; }
.mfa-spinner-lg {
  width: 32px; height: 32px;
  border: 3px solid var(--border-color, #e2e8f0);
  border-top-color: var(--bev-color-green-600, #059669);
  border-radius: 50%;
  animation: mfa-spin 0.6s linear infinite;
}
.mfa-spinner-sm {
  width: 18px; height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: mfa-spin 0.6s linear infinite;
  display: inline-block;
}

.mfa-qr-area {
  width: 200px; height: 200px;
  background: #fff;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  padding: 12px;
  display: flex; align-items: center; justify-content: center;
}

.mfa-manual-entry { text-align: center; width: 100%; max-width: 360px; }
.mfa-manual-label { font-size: 12px; color: var(--text-muted, #64748b); margin: 0 0 8px; }
.mfa-secret-row { display: flex; align-items: center; gap: 8px; justify-content: center; }
.mfa-secret {
  font-family: var(--bev-font-mono, monospace);
  font-size: 14px; font-weight: 600;
  letter-spacing: 0.08em;
  padding: 8px 16px;
  background: var(--bg-page, #f8fafc);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  color: var(--text-strong, #0f172a);
  user-select: all;
  word-break: break-all;
}
.mfa-copy-btn {
  background: none; border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 6px; width: 32px; height: 32px;
  cursor: pointer; font-size: 14px;
  color: var(--text-muted, #64748b);
  display: flex; align-items: center; justify-content: center;
}
.mfa-copy-btn:hover { background: var(--bg-page, #f8fafc); }

/* Digit inputs */
.mfa-digits { display: flex; gap: 8px; justify-content: center; margin: 4px 0; }
.mfa-digit {
  width: 48px; height: 56px; text-align: center;
  font-size: 24px; font-weight: 700;
  font-family: var(--bev-font-mono, monospace);
  border: 2px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  background: var(--bg-page, #f8fafc);
  color: var(--text-strong, #0f172a);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.mfa-digit:focus {
  border-color: var(--bev-color-green-600, #059669);
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15);
}

.mfa-error { font-size: 13px; color: var(--bev-color-red-600, #dc2626); margin: 0; font-weight: 600; }

/* Recovery codes */
.mfa-codes-grid {
  display: grid; grid-template-columns: repeat(2, 1fr);
  gap: 8px; width: 100%; max-width: 320px;
}
.mfa-code-item {
  font-family: var(--bev-font-mono, monospace);
  font-size: 14px; font-weight: 600;
  padding: 10px 16px;
  background: var(--bg-page, #f8fafc);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  text-align: center;
  color: var(--text-strong, #0f172a);
  letter-spacing: 0.04em;
}

.mfa-codes-actions { display: flex; gap: 8px; }
.mfa-confirm-check {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 500; color: var(--text-main, #334155);
  cursor: pointer;
}
.mfa-confirm-check input { accent-color: var(--bev-color-green-600, #059669); }

/* Success animation */
.mfa-success-check {
  width: 72px; height: 72px;
  color: var(--bev-color-green-600, #059669);
  animation: mfa-check-pop 0.5s ease;
}
.mfa-success-check svg { width: 100%; height: 100%; }

/* Buttons */
.mfa-setup-btn {
  width: 100%; max-width: 280px; height: 44px;
  border: none; border-radius: 12px;
  font-size: 14px; font-weight: 700; font-family: inherit;
  cursor: pointer; transition: background 0.15s, opacity 0.15s;
  display: flex; align-items: center; justify-content: center;
}
.mfa-setup-btn--primary { background: var(--bev-color-green-600, #059669); color: #fff; }
.mfa-setup-btn--primary:hover:not(:disabled) { background: var(--bev-color-green-700, #047857); }
.mfa-setup-btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
.mfa-setup-btn--secondary {
  background: var(--bg-page, #f8fafc);
  border: 1px solid var(--border-color, #e2e8f0);
  color: var(--text-main, #334155);
}
.mfa-setup-btn--secondary:hover { background: var(--border-color, #e2e8f0); }
.mfa-setup-btn--ghost { background: none; color: var(--text-muted, #64748b); }
.mfa-setup-btn--ghost:hover { color: var(--text-main, #334155); }

.mfa-shake { animation: shake 0.4s ease; }
.mfa-alert-fade-enter-active, .mfa-alert-fade-leave-active { transition: opacity 0.2s; }
.mfa-alert-fade-enter-from, .mfa-alert-fade-leave-to { opacity: 0; }

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}
@keyframes mfa-spin { to { transform: rotate(360deg); } }
@keyframes mfa-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes mfa-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
@keyframes mfa-check-pop {
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); }
}

@media (max-width: 480px) {
  .mfa-setup-card { border-radius: 16px; }
  .mfa-step { padding: 28px 20px 24px; }
  .mfa-digit { width: 40px; height: 48px; font-size: 20px; }
  .mfa-codes-grid { grid-template-columns: 1fr; }
}
</style>
