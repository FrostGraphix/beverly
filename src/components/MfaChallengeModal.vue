<template>
  <div class="mfa-overlay" @click.self="$emit('cancelled')">
    <div class="mfa-card" :class="{ 'mfa-shake': shaking }" role="dialog" aria-label="Two-factor authentication">
      <div class="mfa-brand" aria-hidden="true">
        <svg class="mfa-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      </div>

      <h2 class="mfa-title">Two-Factor Authentication</h2>
      <p class="mfa-subtitle" v-if="!useRecovery">Enter the 6-digit code from your authenticator app</p>
      <p class="mfa-subtitle" v-else>Enter one of your recovery codes</p>

      <!-- TOTP digit inputs -->
      <div v-if="!useRecovery" class="mfa-digits">
        <input
          v-for="(_, i) in digits"
          :key="i"
          :ref="el => { if (el) digitRefs[i] = el; }"
          class="mfa-digit"
          type="text"
          inputmode="numeric"
          pattern="[0-9]"
          maxlength="1"
          autocomplete="one-time-code"
          :aria-label="`Digit ${i + 1}`"
          :value="digits[i]"
          @input="onDigitInput(i, $event)"
          @keydown="onDigitKeydown(i, $event)"
          @paste="onPaste($event)"
          @focus="$event.target.select()"
        />
      </div>

      <!-- Recovery code input -->
      <div v-else class="mfa-recovery-input">
        <input
          ref="recoveryRef"
          v-model="recoveryCode"
          class="mfa-recovery-field"
          type="text"
          placeholder="XXXXX-XXXXX"
          autocomplete="off"
          @keydown.enter="verifyRecovery"
        />
      </div>

      <p class="mfa-timer" v-if="!useRecovery">Code refreshes in <strong>{{ timerDisplay }}s</strong></p>

      <transition name="mfa-alert-fade">
        <p v-if="error" class="mfa-error" role="alert">{{ error }}</p>
      </transition>

      <p v-if="attempts >= 4" class="mfa-warning">⚠ {{ 5 - attempts }} attempt{{ 5 - attempts === 1 ? '' : 's' }} remaining</p>

      <div class="mfa-actions">
        <button
          class="mfa-btn mfa-btn--primary"
          :disabled="verifying || (useRecovery ? !recoveryCode.trim() : codeStr.length < 6) || attempts >= 5"
          @click="useRecovery ? verifyRecovery() : verifyCode()"
        >
          <span v-if="verifying" class="mfa-spinner"></span>
          <span v-else>Verify</span>
        </button>
      </div>

      <div class="mfa-footer">
        <button class="mfa-link" type="button" @click="toggleRecovery">
          {{ useRecovery ? 'Use authenticator code' : 'Use recovery code instead' }}
        </button>
        <button class="mfa-link mfa-link--cancel" type="button" @click="$emit('cancelled')">Cancel</button>
      </div>
    </div>
  </div>
</template>

<script>
import { createChallenge, verifyChallenge, verifyRecoveryCode } from "../services/mfa-service.mjs";

export default {
  name: "MfaChallengeModal",
  props: {
    factorId: { type: String, required: true }
  },
  emits: ["verified", "cancelled"],
  data() {
    return {
      digits: ["", "", "", "", "", ""],
      digitRefs: [],
      recoveryCode: "",
      useRecovery: false,
      challengeId: null,
      verifying: false,
      error: "",
      shaking: false,
      attempts: 0,
      timer: 30,
      timerInterval: null
    };
  },
  computed: {
    codeStr() { return this.digits.join(""); },
    timerDisplay() { return String(this.timer).padStart(2, "0"); }
  },
  async mounted() {
    this.startTimer();
    try {
      const result = await createChallenge(this.factorId);
      this.challengeId = result?.challengeId || null;
    } catch {
      this.error = "Failed to create MFA challenge.";
    }
    this.$nextTick(() => {
      if (this.digitRefs[0]) this.digitRefs[0].focus();
    });
  },
  beforeUnmount() {
    if (this.timerInterval) clearInterval(this.timerInterval);
  },
  methods: {
    startTimer() {
      this.timer = 30;
      if (this.timerInterval) clearInterval(this.timerInterval);
      this.timerInterval = setInterval(() => {
        this.timer = this.timer <= 1 ? 30 : this.timer - 1;
      }, 1000);
    },
    onDigitInput(index, event) {
      const val = (event.target.value || "").replace(/\D/g, "").slice(-1);
      this.digits[index] = val;
      if (val && index < 5 && this.digitRefs[index + 1]) {
        this.digitRefs[index + 1].focus();
      }
      if (this.codeStr.length === 6) this.verifyCode();
    },
    onDigitKeydown(index, event) {
      if (event.key === "Backspace" && !this.digits[index] && index > 0) {
        this.digits[index - 1] = "";
        this.digitRefs[index - 1]?.focus();
        event.preventDefault();
      }
    },
    onPaste(event) {
      event.preventDefault();
      const text = (event.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 6);
      for (let i = 0; i < 6; i++) {
        this.digits[i] = text[i] || "";
      }
      if (text.length >= 6) {
        this.$nextTick(() => this.verifyCode());
      } else if (text.length > 0 && this.digitRefs[text.length]) {
        this.digitRefs[text.length].focus();
      }
    },
    async verifyCode() {
      if (this.attempts >= 5 || this.verifying) return;
      this.verifying = true;
      this.error = "";
      try {
        const result = await verifyChallenge(this.challengeId, this.codeStr);
        if (result?.verified) {
          this.$emit("verified", result);
        } else {
          this.attempts++;
          this.triggerShake();
          this.error = this.attempts >= 5 ? "Too many failed attempts. Please try again later." : "Invalid code. Please try again.";
          this.clearDigits();
        }
      } catch (err) {
        this.attempts++;
        this.triggerShake();
        this.error = err?.message || "Verification failed.";
        this.clearDigits();
      } finally {
        this.verifying = false;
      }
    },
    async verifyRecovery() {
      if (this.attempts >= 5 || this.verifying || !this.recoveryCode.trim()) return;
      this.verifying = true;
      this.error = "";
      try {
        const result = await verifyRecoveryCode(this.recoveryCode.trim());
        if (result?.verified) {
          this.$emit("verified", result);
        } else {
          this.attempts++;
          this.triggerShake();
          this.error = "Invalid recovery code.";
        }
      } catch (err) {
        this.attempts++;
        this.triggerShake();
        this.error = err?.message || "Verification failed.";
      } finally {
        this.verifying = false;
      }
    },
    toggleRecovery() {
      this.useRecovery = !this.useRecovery;
      this.error = "";
      if (this.useRecovery) {
        this.$nextTick(() => this.$refs.recoveryRef?.focus());
      } else {
        this.clearDigits();
        this.$nextTick(() => this.digitRefs[0]?.focus());
      }
    },
    clearDigits() {
      for (let i = 0; i < 6; i++) this.digits[i] = "";
      this.$nextTick(() => this.digitRefs[0]?.focus());
    },
    triggerShake() {
      this.shaking = true;
      setTimeout(() => { this.shaking = false; }, 500);
    }
  }
};
</script>

<style scoped>
.mfa-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: mfa-overlay-in 0.2s ease;
}

.mfa-card {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-color, rgba(148, 163, 184, 0.2));
  border-radius: 20px;
  padding: 36px 32px 28px;
  width: 420px;
  max-width: calc(100vw - 32px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
}

.mfa-brand { display: flex; align-items: center; justify-content: center; }
.mfa-shield { width: 48px; height: 48px; color: var(--bev-color-green-600, #059669); }

.mfa-title { font-size: 20px; font-weight: 800; color: var(--text-strong, #0f172a); margin: 0; text-align: center; }
.mfa-subtitle { font-size: 13px; color: var(--text-muted, #64748b); margin: 0; text-align: center; line-height: 1.5; max-width: 300px; }

.mfa-digits { display: flex; gap: 8px; justify-content: center; margin: 8px 0; }
.mfa-digit {
  width: 48px;
  height: 56px;
  text-align: center;
  font-size: 24px;
  font-weight: 700;
  font-family: var(--bev-font-mono, monospace);
  border: 2px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  background: var(--bg-page, #f8fafc);
  color: var(--text-strong, #0f172a);
  transition: border-color 0.2s, box-shadow 0.2s;
  outline: none;
}
.mfa-digit:focus {
  border-color: var(--bev-color-green-600, #059669);
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15);
}

.mfa-recovery-input { width: 100%; max-width: 260px; margin: 8px 0; }
.mfa-recovery-field {
  width: 100%;
  height: 48px;
  text-align: center;
  font-size: 18px;
  font-weight: 600;
  font-family: var(--bev-font-mono, monospace);
  letter-spacing: 0.1em;
  border: 2px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  background: var(--bg-page, #f8fafc);
  color: var(--text-strong, #0f172a);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.mfa-recovery-field:focus {
  border-color: var(--bev-color-green-600, #059669);
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15);
}

.mfa-timer { font-size: 12px; color: var(--text-muted, #64748b); margin: 0; }
.mfa-error { font-size: 13px; color: var(--bev-color-red-600, #dc2626); margin: 0; font-weight: 600; text-align: center; }
.mfa-warning { font-size: 12px; color: var(--bev-color-amber-500, #f59e0b); margin: 0; font-weight: 600; }

.mfa-actions { width: 100%; max-width: 260px; }
.mfa-btn {
  width: 100%;
  height: 44px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mfa-btn--primary {
  background: var(--bev-color-green-600, #059669);
  color: #fff;
}
.mfa-btn--primary:hover:not(:disabled) { background: var(--bev-color-green-700, #047857); }
.mfa-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.mfa-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: mfa-spin 0.6s linear infinite;
}

.mfa-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
}
.mfa-link {
  background: none;
  border: none;
  color: var(--bev-color-green-600, #059669);
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  padding: 0;
}
.mfa-link:hover { text-decoration: underline; }
.mfa-link--cancel { color: var(--text-muted, #64748b); font-weight: 500; }

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
@keyframes mfa-overlay-in { from { opacity: 0; } to { opacity: 1; } }

@media (max-width: 480px) {
  .mfa-card { padding: 28px 20px 24px; width: 100%; border-radius: 16px; }
  .mfa-digit { width: 40px; height: 48px; font-size: 20px; border-radius: 10px; }
  .mfa-digits { gap: 6px; }
}
</style>
