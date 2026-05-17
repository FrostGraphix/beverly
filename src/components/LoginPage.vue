<template>
  <main class="login-page auth-page" aria-label="Beverly sign in">
    <div class="auth-bg" aria-hidden="true">
      <div class="auth-bg-beam auth-bg-beam--a"></div>
      <div class="auth-bg-beam auth-bg-beam--b"></div>
      <div class="auth-bg-glow"></div>
      <div class="auth-bg-grid"></div>
    </div>

    <section class="auth-panel auth-panel--right">
      <form class="auth-card login-card" @submit.prevent="submit" novalidate>
        <BaseInput v-model="form.verifycode" name="verifycode" type="hidden" />

        <header class="auth-card-head">
          <div class="auth-card-brand" aria-hidden="true">
            <span class="auth-card-mark">B</span>
            <span class="auth-card-name">Beverly</span>
          </div>
          <h2 class="auth-card-title">Sign In</h2>
        </header>

        <div class="portal-switch" aria-label="Portal switch">
          <BaseButton class="portal-switch-button" :class="{ active: portal === 'admin' }" @click="setPortal('admin')">
            Admin workspace
          </BaseButton>
          <BaseButton class="portal-switch-button" :class="{ active: portal === 'vendor' }" @click="setPortal('vendor')">
            Vendor portal
          </BaseButton>
        </div>

        <transition name="auth-alert-fade">
          <div v-if="error" class="auth-alert auth-alert--error" role="alert">
            <strong>{{ error }}</strong>
            <small v-if="errorReference">Reference {{ errorReference }}</small>
          </div>
        </transition>

        <transition name="auth-alert-fade">
          <div v-if="sessionMessage" class="auth-alert auth-alert--info" role="status">
            {{ sessionMessage }}
          </div>
        </transition>

        <transition name="auth-alert-fade">
          <div v-if="maintenanceNotice" class="auth-alert auth-alert--warn" role="status">
            {{ maintenanceNotice }}
          </div>
        </transition>

        <fieldset class="auth-fields">
          <legend class="sr-only">Credentials</legend>

          <label class="auth-field" :class="{ 'auth-field--active': focused === 'user', 'auth-field--filled': form.userId, 'auth-field--invalid': fieldErrors.userId }">
            <span class="auth-field-label">{{ portalCopy.userLabel }}</span>
            <span class="auth-field-wrap">
              <BaseInput
                v-model.trim="form.userId"
                name="userId"
                type="text"
                data-testid="login-user-id"
                :placeholder="portalCopy.userPlaceholder"
                autocomplete="username"
                autofocus
                @focus="focused = 'user'"
                @blur="focused = ''"
              />
            </span>
            <span v-if="fieldErrors.userId" class="auth-field-error">{{ fieldErrors.userId }}</span>
          </label>

          <label class="auth-field" :class="{ 'auth-field--active': focused === 'pass', 'auth-field--filled': form.password, 'auth-field--invalid': fieldErrors.password }">
            <span class="auth-field-label">Password</span>
            <span class="auth-field-wrap">
              <BaseInput
                v-model="form.password"
                name="password"
                :type="showPassword ? 'text' : 'password'"
                data-testid="login-password"
                placeholder="Password"
                autocomplete="current-password"
                @focus="focused = 'pass'"
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
        </fieldset>

        <div class="auth-row">
          <BaseCheckbox v-model="rememberUsername" class="auth-remember">Remember me</BaseCheckbox>
          <BaseButton class="auth-link" variant="ghost" size="sm" type="button" @click="forgotPassword">
            {{ portalCopy.helpLabel }}
          </BaseButton>
        </div>

        <BaseButton
          class="auth-submit login-button"
          data-testid="login-submit"
          variant="primary"
          native-type="submit"
          :disabled="loading"
        >
          <span v-if="!loading" class="auth-submit-inner">{{ portalCopy.submitLabel }}</span>
          <span v-else class="auth-submit-inner">
            <span class="auth-spinner" aria-hidden="true"></span>
            Signing in...
          </span>
        </BaseButton>

        <div class="demo-entry" aria-label="Demo entry">
          <BaseButton class="demo-entry-button" type="button" @click="enterDemo('admin')">Enter admin workspace</BaseButton>
          <BaseButton class="demo-entry-button" type="button" @click="enterDemo('vendor')">Enter vendor portal</BaseButton>
        </div>
      </form>
    </section>
  </main>
</template>

<script>
import { demoLogin, login } from "../services/api";
import { recordClientError } from "../services/error-logger.mjs";
import BaseButton from "./base/BaseButton.vue";
import BaseCheckbox from "./base/BaseCheckbox.vue";
import BaseIconButton from "./base/BaseIconButton.vue";
import BaseInput from "./base/BaseInput.vue";

const rememberedUserKey = "beverly.rememberedUser";

export default {
  name: "LoginPage",
  components: { BaseButton, BaseCheckbox, BaseIconButton, BaseInput },
  data() {
    return {
      showPassword: false,
      rememberUsername: true,
      loading: false,
      error: "",
      errorReference: "",
      fieldErrors: {},
      sessionMessage: "",
      maintenanceNotice: "",
      focused: "",
      portal: "admin",
      form: {
        userId: "",
        password: "",
        verifycode: "s3b9"
      }
    };
  },
  created() {
    const rememberedUser = localStorage.getItem(rememberedUserKey);
    this.rememberUsername = Boolean(rememberedUser);
    if (rememberedUser) this.form.userId = rememberedUser;
    if (window.location.hash.includes("timeout=true")) {
      this.sessionMessage = "Session expired. Please sign in again.";
    }
    this.maintenanceNotice = import.meta.env?.VITE_AUTH_NOTICE || "";
  },
  computed: {
    portalCopy() {
      if (this.portal === "vendor") {
        return {
          userLabel: "Vendor username",
          userPlaceholder: "Enter vendor username",
          submitLabel: "Sign in",
          helpLabel: "Forgot password?"
        };
      }
      return {
        userLabel: "Email",
        userPlaceholder: "Enter your email address",
        submitLabel: "Sign in",
        helpLabel: "Forgot password?"
      };
    }
  },
  methods: {
    setPortal(portal) {
      this.portal = portal;
      this.error = "";
      this.errorReference = "";
    },
    enterDemo(portal) {
      demoLogin(portal);
      this.$emit("logged-in");
    },
    async submit() {
      this.error = "";
      this.errorReference = "";
      this.fieldErrors = this.validateFields();
      if (Object.keys(this.fieldErrors).length) {
        this.error = "Check the highlighted fields.";
        this.errorReference = recordClientError("login-validation-error", new Error(this.error), {
          fields: Object.keys(this.fieldErrors)
        });
        this.focusFirstInvalid();
        return;
      }
      this.loading = true;
      if (!this.rememberUsername) localStorage.removeItem(rememberedUserKey);
      try {
        await login({ userId: this.form.userId, password: this.form.password });
        if (this.rememberUsername) localStorage.setItem(rememberedUserKey, this.form.userId);
        else localStorage.removeItem(rememberedUserKey);
        this.$emit("logged-in");
      } catch (err) {
        this.error = "Sign in failed. Check credentials and retry.";
        this.errorReference = recordClientError("login-submit-error", err, {
          userId: this.form.userId
        });
      } finally {
        this.loading = false;
      }
    },
    validateFields() {
      const errors = {};
      if (!this.form.userId) errors.userId = "Email is required.";
      if (!this.form.password) errors.password = "Password is required.";
      return errors;
    },
    focusFirstInvalid() {
      this.$nextTick(() => {
        const first = this.$el.querySelector(".auth-field--invalid input");
        if (first) first.focus();
      });
    },
    forgotPassword() {
      this.error = this.portal === "vendor" ? "Contact your ACOB administrator." : "Contact your Beverly administrator.";
      this.errorReference = recordClientError("login-help-requested", new Error(this.error), {
        userId: this.form.userId || "unknown"
      });
    }
  },
  watch: {
    rememberUsername(value) {
      if (!value) localStorage.removeItem(rememberedUserKey);
    }
  }
};
</script>

<style scoped>
.portal-switch,
.demo-entry {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2, 8px);
  margin-bottom: var(--space-4, 16px);
}

.portal-switch-button {
  border: 1px solid var(--border-color, rgba(148, 163, 184, 0.28));
  border-radius: var(--radius-md, 12px);
  background: color-mix(in srgb, var(--surface-elevated, #fff) 86%, transparent);
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  padding: 10px 12px;
}

.portal-switch-button.active {
  background: var(--primary-color, #16a34a);
  border-color: var(--primary-color, #16a34a);
  color: var(--primary-contrast, #fff);
}

.demo-entry {
  margin-top: var(--space-3, 12px);
}

.demo-entry-button {
  min-height: 42px;
}

@media (max-width: 640px) {
  .portal-switch,
  .demo-entry {
    grid-template-columns: 1fr;
  }
}
</style>
