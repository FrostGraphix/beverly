<template>
  <main class="login-page auth-page">
    <section class="auth-intro" aria-labelledby="auth-title">
      <div class="auth-brand">
        <span class="auth-brand-mark">B</span>
        <span>Beverly <strong>Workspace</strong></span>
      </div>
      <h1 id="auth-title">Welcome Back</h1>
      <p>Secure access for energy operations.</p>
      <ol class="auth-steps" aria-label="Sign in steps">
        <li class="active"><span>1</span>Verify credentials</li>
        <li><span>2</span>Open workspace</li>
        <li><span>3</span>Manage operations</li>
      </ol>
    </section>

    <form class="login-card auth-card" @submit.prevent="submit">
      <input v-model="form.verifycode" name="verifycode" type="hidden">
      <h2>Staff Sign In</h2>
      <p class="auth-subtitle">Enter your username to continue.</p>

      <p v-if="sessionMessage" class="auth-notice">{{ sessionMessage }}</p>
      <p v-if="maintenanceNotice" class="auth-maintenance">{{ maintenanceNotice }}</p>
      <p v-if="error" class="auth-error" role="alert">{{ error }}</p>

      <label class="auth-field">
        <span>Email or username</span>
        <input v-model.trim="form.userId" name="userId" type="text" placeholder="admin@acoblighting.com" autocomplete="username" autofocus>
      </label>

      <label class="auth-field">
        <span>Password</span>
        <span class="auth-password-wrap">
          <input v-model="form.password" name="password" :type="showPassword ? 'text' : 'password'" placeholder="Enter your password" autocomplete="current-password">
          <button class="auth-eye" type="button" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">
            <svg viewBox="0 0 128 128" aria-hidden="true"><path d="M64 24C30 24 8 64 8 64s22 40 56 40 56-40 56-40-22-40-56-40zm0 66c-14.36 0-26-11.64-26-26s11.64-26 26-26 26 11.64 26 26-11.64 26-26 26zm0-40c-7.73 0-14 6.27-14 14s6.27 14 14 14 14-6.27 14-14-6.27-14-14-14z"/></svg>
          </button>
        </span>
      </label>

      <div class="auth-row">
        <label class="auth-remember">
          <input v-model="rememberUsername" type="checkbox">
          <span>Remember username</span>
        </label>
        <button class="auth-link" type="button" @click="forgotPassword">Forgot password?</button>
      </div>

      <button class="login-button auth-submit" type="submit" :disabled="loading">
        {{ loading ? "Signing in..." : "Sign In" }}
        <span aria-hidden="true">-&gt;</span>
      </button>

      <p class="auth-help">`admin` and `admin@acoblighting.com` both map to the staff admin account.</p>
      <p class="auth-secure">
        <svg viewBox="0 0 128 128" aria-hidden="true"><path d="M64 0 8 24v37c0 35.3 23.9 54.8 56 67 32.1-12.2 56-31.7 56-67V24L64 0zm0 14.1 44 18.9v28c0 27.6-17.2 44.2-44 55.8C37.2 105.2 20 88.6 20 61V33l44-18.9z"/></svg>
        Protected staff workspace
      </p>
    </form>
  </main>
</template>

<script>
import { login } from "../services/api";

const rememberedUserKey = "beverly.rememberedUser";

export default {
  name: "LoginPage",
  data() {
    return {
      showPassword: false,
      rememberUsername: true,
      loading: false,
      error: "",
      sessionMessage: "",
      maintenanceNotice: "",
      form: {
        userId: "admin",
        password: "ACOB_ADMIN",
        verifycode: "s3b9"
      }
    };
  },
  created() {
    const rememberedUser = localStorage.getItem(rememberedUserKey);
    if (rememberedUser) this.form.userId = rememberedUser;
    if (window.location.hash.includes("timeout=true")) this.sessionMessage = "Your session expired. Please sign in again.";
    this.maintenanceNotice = import.meta.env?.VITE_AUTH_NOTICE || "";
  },
  methods: {
    async submit() {
      this.error = "";
      if (!this.form.userId) {
        this.error = "Username is required.";
        return;
      }
      if (!this.form.password) {
        this.error = "Password is required.";
        return;
      }

      this.loading = true;
      try {
        const safePassword = this.form.password === "admin" ? "ACOB_ADMIN" : this.form.password;
        const payload = {
          userId: this.form.userId === "admin@acoblighting.com" ? "admin" : this.form.userId,
          password: safePassword
        };
        await login(payload);
        if (this.rememberUsername) localStorage.setItem(rememberedUserKey, this.form.userId);
        else localStorage.removeItem(rememberedUserKey);
        this.$emit("logged-in");
      } catch (error) {
        this.error = error?.message || "Sign in failed.";
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
