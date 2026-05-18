<template>
  <main class="vendor-auth-page auth-page" aria-label="Beverly wallet authentication">
    <div class="auth-bg" aria-hidden="true">
      <div class="auth-bg-beam auth-bg-beam--a"></div>
      <div class="auth-bg-beam auth-bg-beam--b"></div>
      <div class="auth-bg-glow"></div>
      <div class="auth-bg-grid"></div>
    </div>

    <section class="wallet-auth-shell">
      <aside class="wallet-auth-story" aria-label="Wallet access overview">
        <a class="wallet-auth-backlink" href="#/login">Back to Beverly CRM</a>
        <div class="wallet-auth-badge">
          <span class="wallet-auth-badge-mark">B</span>
          <strong>Beverly Wallet Access</strong>
        </div>
        <h1 class="wallet-auth-title">Designed for fast wallet entry, safe recovery, and traceable power sales.</h1>
        <p class="wallet-auth-copy">
          Sign in, create access, or recover your profile from one controlled wallet entry surface built on the Beverly design system.
        </p>

        <div class="wallet-auth-proof">
          <article v-for="item in highlights" :key="item.label" class="wallet-auth-proof-item">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </article>
        </div>

        <div class="wallet-auth-note">
          <strong>Operational note</strong>
          <p>
            Wallet access stays separate from the internal CRM workspace, while still following the same theme, motion, and receipt standards.
          </p>
        </div>
      </aside>

      <section class="auth-panel auth-panel--right wallet-auth-panel">
        <form class="auth-card wallet-auth-card" @submit.prevent="submit" novalidate>
          <header class="auth-card-head wallet-auth-head">
            <div class="auth-card-brand" aria-hidden="true">
              <span class="auth-card-mark">B</span>
              <span class="auth-card-name">Beverly Wallet</span>
            </div>
            <div class="wallet-auth-switch" role="tablist" aria-label="Wallet auth modes">
              <BaseButton
                v-for="item in primaryModes"
                :key="item.id"
                class="wallet-auth-switch-btn"
                :class="{ active: mode === item.id }"
                variant="ghost"
                type="button"
                :aria-pressed="String(mode === item.id)"
                @click="setMode(item.id)"
              >
                {{ item.label }}
              </BaseButton>
            </div>
            <h2 class="auth-card-title">{{ copy.title }}</h2>
            <p class="auth-card-sub">{{ copy.subtitle }}</p>
          </header>

          <transition name="auth-alert-fade">
            <div v-if="error" class="auth-alert auth-alert--error" role="alert">
              <strong>{{ error }}</strong>
            </div>
          </transition>

          <transition name="auth-alert-fade">
            <div v-if="notice" class="auth-alert auth-alert--info" role="status">
              <strong>{{ notice }}</strong>
            </div>
          </transition>

          <fieldset class="auth-fields">
            <legend class="sr-only">Wallet access form</legend>

            <label
              v-if="mode === modes.signup"
              class="auth-field"
              :class="fieldClass('fullName')"
            >
              <span class="auth-field-label">Full name</span>
              <span class="auth-field-wrap">
                <BaseInput
                  v-model.trim="form.fullName"
                  type="text"
                  autocomplete="name"
                  placeholder="Enter your legal full name"
                  @focus="focused = 'fullName'"
                  @blur="focused = ''"
                />
              </span>
              <span v-if="fieldErrors.fullName" class="auth-field-error">{{ fieldErrors.fullName }}</span>
            </label>

            <label
              v-if="mode === modes.signup"
              class="auth-field"
              :class="fieldClass('businessName')"
            >
              <span class="auth-field-label">Business or site name</span>
              <span class="auth-field-wrap">
                <BaseInput
                  v-model.trim="form.businessName"
                  type="text"
                  autocomplete="organization"
                  placeholder="Store, kiosk, or customer group"
                  @focus="focused = 'businessName'"
                  @blur="focused = ''"
                />
              </span>
            </label>

            <label class="auth-field" :class="fieldClass('identity')">
              <span class="auth-field-label">{{ mode === modes.login ? "Email or phone" : "Email address" }}</span>
              <span class="auth-field-wrap">
                <BaseInput
                  v-model.trim="form.identity"
                  :type="mode === modes.login || mode === modes.forgot ? 'text' : 'email'"
                  :autocomplete="mode === modes.login ? 'username' : 'email'"
                  :placeholder="identityPlaceholder"
                  @focus="focused = 'identity'"
                  @blur="focused = ''"
                />
              </span>
              <span v-if="fieldErrors.identity" class="auth-field-error">{{ fieldErrors.identity }}</span>
            </label>

            <label
              v-if="mode !== modes.login"
              class="auth-field"
              :class="fieldClass('phone')"
            >
              <span class="auth-field-label">Phone number</span>
              <span class="auth-field-wrap">
                <BaseInput
                  v-model.trim="form.phone"
                  type="tel"
                  autocomplete="tel"
                  placeholder="+2348012345678"
                  @focus="focused = 'phone'"
                  @blur="focused = ''"
                />
              </span>
              <span v-if="fieldErrors.phone" class="auth-field-error">{{ fieldErrors.phone }}</span>
            </label>

            <label
              v-if="mode === modes.reset"
              class="auth-field"
              :class="fieldClass('recoveryCode')"
            >
              <span class="auth-field-label">Recovery or temporary code</span>
              <span class="auth-field-wrap">
                <BaseInput
                  v-model.trim="form.recoveryCode"
                  type="text"
                  autocomplete="one-time-code"
                  placeholder="Enter the code you received"
                  @focus="focused = 'recoveryCode'"
                  @blur="focused = ''"
                />
              </span>
              <span v-if="fieldErrors.recoveryCode" class="auth-field-error">{{ fieldErrors.recoveryCode }}</span>
            </label>

            <label
              v-if="mode !== modes.forgot"
              class="auth-field"
              :class="fieldClass('password')"
            >
              <span class="auth-field-label">{{ mode === modes.reset ? "New password" : "Password" }}</span>
              <span class="auth-field-wrap">
                <BaseInput
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  :autocomplete="mode === modes.reset || mode === modes.signup ? 'new-password' : 'current-password'"
                  :placeholder="mode === modes.login ? 'Enter your password' : 'Use at least 8 characters'"
                  @focus="focused = 'password'"
                  @blur="focused = ''"
                />
                <BaseIconButton
                  class="auth-eye"
                  :aria-label="showPassword ? 'Hide password' : 'Show password'"
                  @click.prevent="showPassword = !showPassword"
                >
                  <svg v-if="!showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </BaseIconButton>
              </span>
              <span v-if="fieldErrors.password" class="auth-field-error">{{ fieldErrors.password }}</span>
            </label>

            <label
              v-if="mode === modes.signup || mode === modes.reset"
              class="auth-field"
              :class="fieldClass('confirmPassword')"
            >
              <span class="auth-field-label">Confirm password</span>
              <span class="auth-field-wrap">
                <BaseInput
                  v-model="form.confirmPassword"
                  :type="showConfirmPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  placeholder="Repeat your password"
                  @focus="focused = 'confirmPassword'"
                  @blur="focused = ''"
                />
                <BaseIconButton
                  class="auth-eye"
                  :aria-label="showConfirmPassword ? 'Hide confirmed password' : 'Show confirmed password'"
                  @click.prevent="showConfirmPassword = !showConfirmPassword"
                >
                  <svg v-if="!showConfirmPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </BaseIconButton>
              </span>
              <span v-if="fieldErrors.confirmPassword" class="auth-field-error">{{ fieldErrors.confirmPassword }}</span>
            </label>
          </fieldset>

          <div v-if="mode === modes.login" class="auth-row">
            <BaseCheckbox v-model="form.remember" class="auth-remember">Remember me</BaseCheckbox>
            <BaseButton class="auth-link" variant="ghost" size="sm" type="button" @click="setMode(modes.forgot)">
              Forgot password?
            </BaseButton>
          </div>

          <div v-else-if="mode === modes.signup" class="wallet-auth-terms">
            <BaseCheckbox v-model="form.acceptTerms" class="auth-remember">
              I agree to Beverly wallet terms and recovery controls
            </BaseCheckbox>
            <span v-if="fieldErrors.acceptTerms" class="auth-field-error">{{ fieldErrors.acceptTerms }}</span>
          </div>

          <BaseButton class="auth-submit wallet-auth-submit" variant="primary" native-type="submit" :disabled="submitting">
            <span v-if="!submitting" class="auth-submit-inner">{{ copy.submitLabel }}</span>
            <span v-else class="auth-submit-inner">
              <span class="auth-spinner" aria-hidden="true"></span>
              Processing...
            </span>
          </BaseButton>

          <div class="wallet-auth-secondary">
            <BaseButton class="wallet-auth-secondary-btn" variant="ghost" type="button" @click="runAlternateAction">
              {{ copy.alternateAction }}
            </BaseButton>
          </div>

          <footer class="auth-card-foot">
            <span>{{ copy.switchPrompt }}</span>
            <BaseButton class="auth-foot-link" variant="ghost" native-type="button" @click="switchCompanionMode">
              {{ copy.switchLabel }}
            </BaseButton>
          </footer>
        </form>
      </section>
    </section>
  </main>
</template>

<script>
import BaseButton from "../base/BaseButton.vue";
import BaseCheckbox from "../base/BaseCheckbox.vue";
import BaseIconButton from "../base/BaseIconButton.vue";
import BaseInput from "../base/BaseInput.vue";
import {
  defaultWalletAuthForm,
  resolveWalletAuthMode,
  runWalletAuthDemo,
  walletAuthCopy,
  walletAuthHash,
  walletAuthHighlights,
  walletAuthModes,
  writeWalletDemoSession,
  validateWalletAuthForm
} from "../../services/vendor-auth-service.mjs";

export default {
  name: "VendorAuthPage",
  components: { BaseButton, BaseCheckbox, BaseIconButton, BaseInput },
  emits: ["vendor-authenticated"],
  data() {
    return {
      modes: walletAuthModes,
      mode: resolveWalletAuthMode(window.location.hash),
      form: defaultWalletAuthForm(),
      notice: "",
      error: "",
      fieldErrors: {},
      focused: "",
      showPassword: false,
      showConfirmPassword: false,
      submitting: false
    };
  },
  computed: {
    copy() {
      return walletAuthCopy(this.mode);
    },
    highlights() {
      return walletAuthHighlights();
    },
    primaryModes() {
      return [
        { id: this.modes.login, label: "Sign in" },
        { id: this.modes.signup, label: "Sign up" },
        { id: this.modes.forgot, label: "Forgot password" }
      ];
    },
    identityPlaceholder() {
      if (this.mode === this.modes.login) return "Email address or phone number";
      if (this.mode === this.modes.forgot) return "Email or phone linked to your wallet";
      return "yourname@company.com";
    }
  },
  created() {
    this.seedDemoDefaults();
    window.addEventListener("hashchange", this.syncModeFromHash);
  },
  beforeUnmount() {
    window.removeEventListener("hashchange", this.syncModeFromHash);
  },
  methods: {
    seedDemoDefaults() {
      if (!this.form.identity) this.form.identity = "vendor.demo@acob.ng";
      if (!this.form.phone) this.form.phone = "+2348012345678";
    },
    syncModeFromHash() {
      const nextMode = resolveWalletAuthMode(window.location.hash);
      if (nextMode !== this.mode) this.setMode(nextMode, false);
    },
    fieldClass(field) {
      return {
        "auth-field--active": this.focused === field,
        "auth-field--filled": Boolean(this.form[field]),
        "auth-field--invalid": Boolean(this.fieldErrors[field])
      };
    },
    setMode(mode, syncHash = true) {
      this.mode = mode;
      this.error = "";
      this.notice = "";
      this.fieldErrors = {};
      this.focused = "";
      this.showPassword = false;
      this.showConfirmPassword = false;
      if (syncHash && window.location.hash !== walletAuthHash(mode)) {
        window.location.hash = walletAuthHash(mode);
      }
      if (mode === this.modes.login) {
        this.form.password = "";
      }
      if (mode === this.modes.forgot) {
        this.form.password = "";
        this.form.confirmPassword = "";
        this.form.recoveryCode = "";
      }
    },
    switchCompanionMode() {
      if (this.mode === this.modes.login) {
        this.setMode(this.modes.signup);
        return;
      }
      if (this.mode === this.modes.signup) {
        this.setMode(this.modes.login);
        return;
      }
      this.setMode(this.modes.login);
    },
    runAlternateAction() {
      if (this.mode === this.modes.login) {
        this.setMode(this.modes.forgot);
        return;
      }
      if (this.mode === this.modes.signup || this.mode === this.modes.forgot) {
        this.setMode(this.modes.reset);
        return;
      }
      this.setMode(this.modes.login);
    },
    async submit() {
      this.error = "";
      this.notice = "";
      this.fieldErrors = validateWalletAuthForm(this.mode, this.form);
      if (Object.keys(this.fieldErrors).length) {
        this.error = "Check the highlighted fields and try again.";
        this.focusFirstInvalid();
        return;
      }

      this.submitting = true;
      try {
        const outcome = runWalletAuthDemo(this.mode, this.form);
        this.notice = outcome.notice || "";

        if (outcome.authenticated) {
          writeWalletDemoSession({ passwordResetRequired: false, accountStatus: this.mode === this.modes.signup ? "pending" : "approved" });
          this.$emit("vendor-authenticated");
          return;
        }

        if (this.mode === this.modes.signup && !this.form.recoveryCode) {
          this.form.recoveryCode = "BVR-4281";
        }
        this.setMode(outcome.nextMode || this.modes.login);
        this.notice = outcome.notice || "";
      } finally {
        this.submitting = false;
      }
    },
    focusFirstInvalid() {
      this.$nextTick(() => {
        const first = this.$el.querySelector(".auth-field--invalid input");
        if (first) first.focus();
      });
    }
  }
};
</script>

<style scoped>
.vendor-auth-page {
  min-height: 100dvh;
}

.wallet-auth-shell {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 420px);
  gap: var(--bev-space-6);
  width: min(1180px, 100%);
  align-items: stretch;
}

.wallet-auth-story {
  display: grid;
  align-content: space-between;
  gap: var(--bev-space-5);
  padding: clamp(24px, 5vw, 40px);
  border: 1px solid color-mix(in srgb, var(--color-border-strong) 60%, transparent);
  border-radius: var(--bev-radius-xl);
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--color-brand) 26%, transparent), transparent 24%),
    linear-gradient(160deg, color-mix(in srgb, var(--color-surface-card) 12%, transparent), color-mix(in srgb, var(--color-surface-page) 84%, transparent));
  box-shadow: var(--bev-shadow-xl);
  backdrop-filter: blur(14px);
}

.wallet-auth-backlink {
  display: inline-flex;
  width: fit-content;
  min-height: var(--bev-touch-target-min);
  align-items: center;
  color: var(--color-text-strong);
  text-decoration: none;
  font-weight: 800;
}

.wallet-auth-badge {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: var(--bev-space-2);
  padding: 0 var(--bev-space-3) 0 var(--bev-space-1);
  min-height: 38px;
  border: 1px solid color-mix(in srgb, var(--color-border-strong) 70%, transparent);
  border-radius: var(--bev-radius-pill);
  background: color-mix(in srgb, var(--color-surface-card) 24%, transparent);
  color: var(--color-text-strong);
}

.wallet-auth-badge-mark {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: linear-gradient(145deg, color-mix(in srgb, var(--color-brand) 38%, transparent), color-mix(in srgb, var(--color-brand-strong) 52%, transparent));
  color: var(--color-text-inverse);
  font-weight: 900;
}

.wallet-auth-title {
  margin: 0;
  max-width: 11ch;
  color: var(--color-text-strong);
  font-size: clamp(2.1rem, 5vw, 4.4rem);
  line-height: 0.96;
  letter-spacing: -0.07em;
}

.wallet-auth-copy {
  margin: 0;
  max-width: 56ch;
  color: var(--color-text-muted);
  font-size: var(--bev-font-size-xl);
  line-height: 1.6;
}

.wallet-auth-proof {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--bev-space-3);
}

.wallet-auth-proof-item,
.wallet-auth-note {
  display: grid;
  gap: var(--bev-space-2);
  padding: var(--bev-space-4);
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  border-radius: var(--bev-radius-lg);
  background: color-mix(in srgb, var(--color-surface-card) 18%, transparent);
}

.wallet-auth-proof-item span,
.wallet-auth-note p {
  color: var(--color-text-muted);
}

.wallet-auth-proof-item strong,
.wallet-auth-note strong {
  color: var(--color-text-strong);
}

.wallet-auth-note p {
  margin: 0;
  line-height: 1.6;
}

.wallet-auth-panel {
  min-height: unset;
}

.wallet-auth-card {
  width: min(100%, 420px);
}

.wallet-auth-head {
  gap: var(--bev-space-3);
}

.wallet-auth-switch {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--bev-space-2);
  width: 100%;
}

.wallet-auth-switch-btn {
  min-height: 42px !important;
  border: 1px solid color-mix(in srgb, var(--color-border-strong) 70%, transparent) !important;
  border-radius: var(--bev-radius-pill) !important;
  background: color-mix(in srgb, var(--color-surface-card) 12%, transparent) !important;
  color: var(--color-text-muted) !important;
  font-size: var(--bev-font-size-md) !important;
  font-weight: 800 !important;
}

.wallet-auth-switch-btn.active {
  border-color: var(--color-brand) !important;
  background: color-mix(in srgb, var(--color-brand) 16%, transparent) !important;
  color: var(--color-text-strong) !important;
}

.wallet-auth-terms {
  display: grid;
  gap: var(--bev-space-2);
  margin: var(--bev-space-3) 0 var(--bev-space-2);
}

.wallet-auth-secondary {
  display: flex;
  justify-content: center;
  margin-top: var(--bev-space-3);
}

.wallet-auth-secondary-btn {
  min-height: var(--bev-touch-target-min) !important;
}

.wallet-auth-submit {
  margin-top: var(--bev-space-2);
}

@media (max-width: 1080px) {
  .wallet-auth-shell,
  .wallet-auth-proof {
    grid-template-columns: 1fr;
  }

  .wallet-auth-title {
    max-width: 14ch;
  }
}

@media (max-width: 640px) {
  .wallet-auth-shell {
    gap: var(--bev-space-4);
  }

  .wallet-auth-story {
    padding: var(--bev-space-5);
  }

  .wallet-auth-switch {
    grid-template-columns: 1fr;
  }

  .wallet-auth-card {
    width: min(100%, 380px);
  }
}
</style>
