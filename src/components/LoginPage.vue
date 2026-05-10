<template>
  <main class="login-page auth-page" aria-label="Beverly sign in">
    <!-- Ambient background -->
    <div class="auth-bg" aria-hidden="true">
      <div class="auth-bg-orb auth-bg-orb--a"></div>
      <div class="auth-bg-orb auth-bg-orb--b"></div>
      <div class="auth-bg-orb auth-bg-orb--c"></div>
      <div class="auth-bg-grid"></div>
    </div>

    <!-- Left panel -->
    <aside class="auth-panel auth-panel--left" aria-hidden="true">
      <div class="auth-panel-inner">
        <div class="auth-wordmark">
          <span class="auth-wordmark-mark">B</span>
          <span class="auth-wordmark-name">Beverly</span>
        </div>

        <div class="auth-hero">
          <h1 class="auth-hero-title">Energy<br><em>Intelligence</em><br>Platform.</h1>
          <p class="auth-hero-sub">Real-time control for every meter, site, and account your team manages.</p>
        </div>

        <ul class="auth-features" aria-label="Platform highlights">
          <li class="auth-feature">
            <span class="auth-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </span>
            <span>
              <strong>Live metering</strong>
              <small>Sub-second consumption feeds</small>
            </span>
          </li>
          <li class="auth-feature">
            <span class="auth-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
            </span>
            <span>
              <strong>Fraud detection</strong>
              <small>AI-powered anomaly scoring</small>
            </span>
          </li>
          <li class="auth-feature">
            <span class="auth-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>
            </span>
            <span>
              <strong>Batch operations</strong>
              <small>Bulk task processing at scale</small>
            </span>
          </li>
        </ul>

        <div class="auth-panel-foot">
          <div class="auth-stat">
            <strong>98.7%</strong><small>Uptime SLA</small>
          </div>
          <div class="auth-stat-sep"></div>
          <div class="auth-stat">
            <strong>12 ms</strong><small>Avg response</small>
          </div>
          <div class="auth-stat-sep"></div>
          <div class="auth-stat">
            <strong>AES-256</strong><small>Encrypted</small>
          </div>
        </div>
      </div>
    </aside>

    <!-- Right panel — form -->
    <section class="auth-panel auth-panel--right">
      <form class="auth-card" @submit.prevent="submit" novalidate>
        <BaseInput v-model="form.verifycode" name="verifycode" type="hidden" />

        <header class="auth-card-head">
          <div class="auth-card-brand" aria-hidden="true">
            <span class="auth-card-mark">B</span>
          </div>
          <h2 class="auth-card-title">Staff Sign In</h2>
          <p class="auth-card-sub">Access your Beverly workspace</p>
        </header>

        <!-- Alerts -->
        <transition name="auth-alert-fade">
          <div v-if="error" class="auth-alert auth-alert--error" role="alert">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {{ error }}
          </div>
        </transition>

        <transition name="auth-alert-fade">
          <div v-if="sessionMessage" class="auth-alert auth-alert--info" role="status">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            {{ sessionMessage }}
          </div>
        </transition>

        <transition name="auth-alert-fade">
          <div v-if="maintenanceNotice" class="auth-alert auth-alert--warn" role="status">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            {{ maintenanceNotice }}
          </div>
        </transition>

        <fieldset class="auth-fields">
          <legend class="sr-only">Credentials</legend>

          <label class="auth-field" :class="{ 'auth-field--active': focused === 'user', 'auth-field--filled': form.userId }">
            <span class="auth-field-label">Email or username</span>
            <span class="auth-field-wrap">
              <span class="auth-field-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </span>
              <BaseInput
                v-model.trim="form.userId"
                name="userId"
                type="text"
                placeholder="admin@acoblighting.com"
                autocomplete="username"
                autofocus
                @focus="focused = 'user'"
                @blur="focused = ''"
              />
            </span>
          </label>

          <label class="auth-field" :class="{ 'auth-field--active': focused === 'pass', 'auth-field--filled': form.password }">
            <span class="auth-field-label">Password</span>
            <span class="auth-field-wrap">
              <span class="auth-field-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              </span>
              <BaseInput
                v-model="form.password"
                name="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Enter your password"
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
          </label>
        </fieldset>

        <div class="auth-row">
          <BaseCheckbox v-model="rememberUsername" class="auth-remember">Remember me</BaseCheckbox>
          <BaseButton class="auth-link" variant="ghost" size="sm" type="button" @click="forgotPassword">
            Forgot password?
          </BaseButton>
        </div>

        <BaseButton
          class="auth-submit"
          variant="primary"
          native-type="submit"
          :loading="loading"
        >
          <span v-if="!loading" class="auth-submit-inner">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            Sign In
          </span>
          <span v-else class="auth-submit-inner">
            <span class="auth-spinner" aria-hidden="true"></span>
            Signing in…
          </span>
        </BaseButton>

        <footer class="auth-card-foot">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Protected staff workspace · Beverly CRM
        </footer>
      </form>
    </section>
  </main>
</template>

<script>
import { login } from "../services/api";
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
      sessionMessage: "",
      maintenanceNotice: "",
      focused: "",
      form: {
        userId: "",
        password: "",
        verifycode: "s3b9"
      }
    };
  },
  created() {
    const rememberedUser = localStorage.getItem(rememberedUserKey);
    if (rememberedUser) this.form.userId = rememberedUser;
    if (window.location.hash.includes("timeout=true"))
      this.sessionMessage = "Session expired. Please sign in again.";
    this.maintenanceNotice = import.meta.env?.VITE_AUTH_NOTICE || "";
  },
  methods: {
    async submit() {
      this.error = "";
      if (!this.form.userId) { this.error = "Username is required."; return; }
      if (!this.form.password) { this.error = "Password is required."; return; }
      this.loading = true;
      try {
        await login({ userId: this.form.userId, password: this.form.password });
        if (this.rememberUsername) localStorage.setItem(rememberedUserKey, this.form.userId);
        else localStorage.removeItem(rememberedUserKey);
        this.$emit("logged-in");
      } catch (err) {
        this.error = err?.message || "Sign in failed.";
      } finally {
        this.loading = false;
      }
    },
    forgotPassword() {
      this.error = "Contact your Beverly administrator to reset access.";
    }
  }
};
</script>
