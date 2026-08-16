<template>
  <div class="mfa-overlay" @click.self="$emit('cancelled')">
    <div class="mfa-card" :class="{ 'mfa-shake': shaking }" role="dialog" aria-label="Two-factor authentication">

      <div class="mfa-brand" aria-hidden="true">
        <svg class="mfa-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="M9 12l2 2 4-4"/>
        </svg>
      </div>

      <h2 class="mfa-title">Two-Factor Authentication</h2>
      <p class="mfa-subtitle">
        <span v-if="!useRecovery">Enter the 6-digit code from your authenticator app</span>
        <span v-else>Enter one of your backup recovery codes</span>
      </p>

      <!-- Challenge creation failed -->
      <div v-if="challengeError && !challengeId" class="mfa-challenge-error">
        <p class="mfa-error">{{ challengeError }}</p>
        <button class="mfa-retry-btn" :disabled="retrying" @click="retryChallenge">
          <span v-if="retrying" class="mfa-spinner"></span>
          <span v-else>Retry</span>
        </button>
      </div>

      <template v-else>
        <!-- TOTP digit inputs -->
        <div v-if="!useRecovery" class="mfa-digits">
          <input
            v-for="(_, i) in digits"
            :key="i"
            :ref="el => { if (el) digitRefs[i] = el; }"
            class="mfa-digit"
            :class="{ 'mfa-digit--filled': digits[i] }"
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
            spellcheck="false"
            @keydown.enter="verifyRecovery"
          />
        </div>

        <!-- TOTP timer ring -->
        <div v-if="!useRecovery" class="mfa-timer-wrap" :class="{ 'mfa-timer--urgent': timer <= 8 }">
          <svg class="mfa-timer-ring" viewBox="0 0 36 36">
            <circle class="mfa-ring-track" cx="18" cy="18" r="15.9" />
            <circle
              class="mfa-ring-fill"
              cx="18" cy="18" r="15.9"
              :style="{ strokeDashoffset: ringOffset }"
            />
          </svg>
          <span class="mfa-timer-text">{{ timerDisplay }}</span>
        </div>

        <transition name="mfa-alert-fade">
          <p v-if="error" class="mfa-error" role="alert">{{ error }}</p>
        </transition>

        <p v-if="attempts >= 3" class="mfa-warning">
          ⚠ {{ 5 - attempts }} attempt{{ 5 - attempts === 1 ? '' : 's' }} remaining
        </p>

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
            {{ useRecovery ? '← Use authenticator code' : 'Use recovery code instead' }}
          </button>
          <button class="mfa-link mfa-link--cancel" type="button" @click="$emit('cancelled')">Cancel</button>
        </div>
      </template>

    </div>
  </div>
</template>

<script>
import { createChallenge, verifyChallenge, verifyRecoveryCode } from "../services/mfa-service.mjs";

const TOTP_PERIOD = 30;

function totpSecondsRemaining() {
  return TOTP_PERIOD - (Math.floor(Date.now() / 1000) % TOTP_PERIOD);
}

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
      challengeError: "",
      retrying: false,
      verifying: false,
      error: "",
      shaking: false,
      attempts: 0,
      timer: totpSecondsRemaining(),
      timerInterval: null
    };
  },
  computed: {
    codeStr() { return this.digits.join(""); },
    timerDisplay() { return String(this.timer).padStart(2, "0"); },
    // SVG ring: circumference ≈ 99.9, offset goes from 0 (full) to 99.9 (empty)
    ringOffset() {
      const circumference = 99.9;
      return ((TOTP_PERIOD - this.timer) / TOTP_PERIOD) * circumference;
    }
  },
  async mounted() {
    this.startTimer();
    await this.initChallenge();
  },
  beforeUnmount() {
    if (this.timerInterval) clearInterval(this.timerInterval);
  },
  methods: {
    startTimer() {
      if (this.timerInterval) clearInterval(this.timerInterval);
      this.timer = totpSecondsRemaining();
      this.timerInterval = setInterval(() => {
        this.timer = totpSecondsRemaining();
      }, 500); // poll at 500ms so it stays in sync with wall clock
    },
    async initChallenge() {
      this.challengeError = "";
      try {
        const result = await createChallenge(this.factorId);
        this.challengeId = result?.challengeId || null;
      } catch {
        this.challengeError = "Failed to start authentication challenge.";
      }
      this.$nextTick(() => {
        if (this.digitRefs[0]) this.digitRefs[0].focus();
      });
    },
    async retryChallenge() {
      this.retrying = true;
      try {
        await this.initChallenge();
      } finally {
        this.retrying = false;
      }
    },
    onDigitInput(index, event) {
      const val = (event.target.value || "").replace(/\D/g, "").slice(-1);
      this.digits[index] = val;
      if (val && index < 5 && this.digitRefs[index + 1]) {
        this.digitRefs[index + 1].focus();
      }
      if (this.codeStr.length === 6) {
        this.verifyCode();
      }
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
      for (let i = 0; i < 6; i++) this.digits[i] = text[i] || "";
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
          this.error = this.attempts >= 5
            ? "Too many failed attempts. Please try again later."
            : "Invalid code. Please try again.";
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
          this.error = "Invalid recovery code. Each code can only be used once.";
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
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
  z-index: 500;
  display: flex; align-items: center; justify-content: center;
  animation: mfa-overlay-in 0.2s ease;
}

.mfa-card {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-color, rgba(148, 163, 184, 0.2));
  border-radius: 20px;
  padding: 36px 32px 28px;
  width: 420px;
  max-width: calc(100vw - 32px);
  display: flex; flex-direction: column; align-items: center; gap: 16px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255,255,255,0.04) inset;
}

.mfa-brand { display: flex; align-items: center; justify-content: center; }
.mfa-shield { width: 48px; height: 48px; color: var(--bev-color-green-600, #059669); }

.mfa-title { font-size: 20px; font-weight: 800; color: var(--text-strong, #0f172a); margin: 0; text-align: center; }
.mfa-subtitle { font-size: 13px; color: var(--text-muted, #64748b); margin: 0; text-align: center; line-height: 1.5; max-width: 300px; }

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
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  outline: none;
  caret-color: var(--bev-color-green-600, #059669);
}
.mfa-digit:focus {
  border-color: var(--bev-color-green-600, #059669);
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.12);
}
.mfa-digit--filled {
  background: var(--bg-card, #fff);
  border-color: var(--bev-color-green-600, #059669);
  color: var(--bev-color-green-600, #059669);
}

/* Recovery input */
.mfa-recovery-input { width: 100%; max-width: 260px; margin: 4px 0; }
.mfa-recovery-field {
  width: 100%; box-sizing: border-box;
  height: 48px; text-align: center;
  font-size: 18px; font-weight: 600;
  font-family: var(--bev-font-mono, monospace);
  letter-spacing: 0.1em;
  border: 2px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  background: var(--bg-page, #f8fafc);
  color: var(--text-strong, #0f172a);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.mfa-recovery-field:focus {
  border-color: var(--bev-color-green-600, #059669);
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.12);
}

/* Timer ring */
.mfa-timer-wrap {
  position: relative;
  width: 48px; height: 48px;
  display: flex; align-items: center; justify-content: center;
}
.mfa-timer-ring {
  position: absolute; inset: 0;
  transform: rotate(-90deg);
}
.mfa-ring-track {
  fill: none;
  stroke: var(--border-color, #e2e8f0);
  stroke-width: 3;
}
.mfa-ring-fill {
  fill: none;
  stroke: var(--bev-color-green-600, #059669);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 99.9;
  stroke-dashoffset: 0;
  transition: stroke-dashoffset 0.5s linear, stroke 0.3s;
}
.mfa-timer--urgent .mfa-ring-fill { stroke: var(--bev-color-amber-500, #f59e0b); }
.mfa-timer-text {
  font-size: 13px; font-weight: 700;
  font-family: var(--bev-font-mono, monospace);
  color: var(--text-main, #334155);
  transition: color 0.3s;
  position: relative; z-index: 1;
}
.mfa-timer--urgent .mfa-timer-text { color: var(--bev-color-amber-500, #f59e0b); }

/* Error / warning */
.mfa-error { font-size: 13px; color: var(--bev-color-red-600, #dc2626); margin: 0; font-weight: 600; text-align: center; }
.mfa-warning { font-size: 12px; color: var(--bev-color-amber-500, #f59e0b); margin: 0; font-weight: 600; text-align: center; }

/* Challenge error / retry */
.mfa-challenge-error { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.mfa-retry-btn {
  height: 36px; padding: 0 20px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 10px;
  background: var(--bg-page, #f8fafc);
  color: var(--text-main, #334155);
  font-size: 13px; font-weight: 600; font-family: inherit;
  cursor: pointer; display: flex; align-items: center; gap: 8px;
  transition: background 0.15s;
}
.mfa-retry-btn:hover { background: var(--border-color, #e2e8f0); }
.mfa-retry-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Verify button */
.mfa-actions { width: 100%; max-width: 260px; }
.mfa-btn {
  width: 100%; height: 44px;
  border: none; border-radius: 12px;
  font-size: 14px; font-weight: 700; font-family: inherit;
  cursor: pointer; transition: background 0.15s, opacity 0.15s, transform 0.1s;
  display: flex; align-items: center; justify-content: center;
}
.mfa-btn:active { transform: scale(0.98); }
.mfa-btn--primary { background: var(--bev-color-green-600, #059669); color: #fff; }
.mfa-btn--primary:hover:not(:disabled) { background: var(--bev-color-green-700, #047857); }
.mfa-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

.mfa-spinner {
  width: 18px; height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: mfa-spin 0.7s linear infinite;
  display: inline-block;
}

.mfa-footer {
  display: flex; flex-direction: column; align-items: center; gap: 8px; padding-top: 4px;
}
.mfa-link {
  background: none; border: none;
  color: var(--bev-color-green-600, #059669);
  font-size: 13px; font-weight: 600; font-family: inherit;
  cursor: pointer; padding: 0; transition: opacity 0.15s;
}
.mfa-link:hover { text-decoration: underline; }
.mfa-link--cancel { color: var(--text-muted, #64748b); font-weight: 500; }

.mfa-shake { animation: shake 0.4s ease; }

.mfa-alert-fade-enter-active, .mfa-alert-fade-leave-active { transition: opacity 0.2s, transform 0.2s; }
.mfa-alert-fade-enter-from, .mfa-alert-fade-leave-to { opacity: 0; transform: translateY(-4px); }

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}
@keyframes mfa-spin { to { transform: rotate(360deg); } }
@keyframes mfa-overlay-in { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }

@media (max-width: 480px) {
  .mfa-card { padding: 28px 20px 24px; width: 100%; border-radius: 16px; }
  .mfa-digit { width: 40px; height: 48px; font-size: 20px; border-radius: 10px; }
  .mfa-digits { gap: 6px; }
}
</style>
