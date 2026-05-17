<template>
  <main class="vendor-auth-page" aria-label="Vendor authentication">
    <a class="home-link" href="#/login">Back to Beverly CRM</a>
    <section class="auth-stage">
      <div class="brand-mark">
        <span>B</span>
        <strong>Beverly Vendor Wallet</strong>
      </div>
      <article v-if="mode === 'login'" class="auth-card">
        <h1>Welcome Back</h1>
        <p>Use the vendor credentials issued by Beverly Wallet Admin.</p>
        <label>
          <span>Email</span>
          <BaseInput v-model.trim="email" type="email" autocomplete="email" placeholder="vendor@company.com" />
        </label>
        <label>
          <span>Temporary or Current Password</span>
          <BaseInput v-model.trim="password" type="password" autocomplete="current-password" placeholder="Enter password" />
        </label>
        <div class="auth-row">
          <BaseCheckbox v-model="remember" class="check-line">Remember me</BaseCheckbox>
          <BaseButton class="link-button" variant="ghost" size="sm" @click="mode = 'reset'">Forgot password?</BaseButton>
        </div>
        <BaseButton class="primary-auth" variant="primary" @click="signInVendor">Sign in</BaseButton>
        <BaseButton class="quiet-auth" @click="mode = 'reset'">I have a temporary password</BaseButton>
        <p class="auth-foot">Vendor access is separate from internal CRM access.</p>
      </article>

      <article v-else class="auth-card">
        <h1>Change Temporary Password</h1>
        <p>Before entering the wallet, set a secure password for your vendor account.</p>
        <label>
          <span>Vendor Email</span>
          <BaseInput v-model.trim="email" type="email" autocomplete="email" />
        </label>
        <label>
          <span>Temporary Password</span>
          <BaseInput v-model.trim="password" type="password" autocomplete="one-time-code" />
        </label>
        <label>
          <span>New Password</span>
          <BaseInput v-model.trim="newPassword" type="password" autocomplete="new-password" />
        </label>
        <label>
          <span>Confirm New Password</span>
          <BaseInput v-model.trim="confirmPassword" type="password" autocomplete="new-password" />
        </label>
        <div v-if="error" class="auth-error" role="alert">{{ error }}</div>
        <BaseButton class="primary-auth" variant="primary" @click="completePasswordChange">Change password and continue</BaseButton>
        <BaseButton class="link-button" variant="ghost" @click="mode = 'login'">Return to sign in</BaseButton>
      </article>
    </section>
  </main>
</template>

<script>
import BaseButton from "../base/BaseButton.vue";
import BaseCheckbox from "../base/BaseCheckbox.vue";
import BaseInput from "../base/BaseInput.vue";
import { demoLogin, setCookie } from "../../services/api";

export default {
  name: "VendorAuthPage",
  components: { BaseButton, BaseCheckbox, BaseInput },
  emits: ["vendor-authenticated"],
  data() {
    return {
      mode: window.location.hash.includes("password-reset") ? "reset" : "login",
      email: "vendor.demo@acob.ng",
      password: "Bv@7kLm!2Qp#9tZx",
      newPassword: "",
      confirmPassword: "",
      remember: true,
      error: ""
    };
  },
  methods: {
    signInVendor() {
      this.error = "";
      if (!this.email || !this.password) {
        this.error = "Email and password are required.";
        return;
      }
      if (this.password.includes("Bv@") || window.location.hash.includes("password-reset")) {
        this.mode = "reset";
        return;
      }
      this.writeVendorSession(false);
    },
    completePasswordChange() {
      this.error = "";
      if (this.newPassword.length < 8) {
        this.error = "Use at least 8 characters.";
        return;
      }
      if (this.newPassword !== this.confirmPassword) {
        this.error = "Passwords do not match.";
        return;
      }
      this.writeVendorSession(false);
    },
    writeVendorSession(passwordResetRequired) {
      demoLogin("vendor");
      setCookie("vendorOrganizationId", "vendor-demo-org");
      setCookie("walletStatus", "active");
      setCookie("onboardingStatus", "approved");
      setCookie("passwordResetRequired", String(passwordResetRequired));
      this.$emit("vendor-authenticated");
    }
  }
};
</script>

<style scoped>
.vendor-auth-page {
  min-height: 100vh;
  padding: clamp(24px, 5vw, 64px);
  background:
    radial-gradient(circle at 50% 90%, color-mix(in srgb, var(--info) 28%, transparent), transparent 28%),
    linear-gradient(120deg, #4ea1ff 0%, #6670f2 38%, #d8eef4 100%);
  color: var(--text-strong);
  font-family: var(--font-family);
}
.home-link {
  display: inline-flex;
  color: white;
  text-decoration: none;
  font-weight: 800;
  margin-bottom: 44px;
}
.auth-stage {
  display: grid;
  justify-items: center;
  gap: 20px;
}
.brand-mark {
  display: flex;
  gap: 10px;
  align-items: center;
  color: white;
  font-weight: 900;
}
.brand-mark span {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: rgba(255,255,255,.18);
}
.auth-card {
  display: grid;
  gap: 14px;
  width: min(420px, 100%);
  padding: 32px;
  border-radius: 20px;
  background: white;
  box-shadow: 0 32px 80px rgba(15, 23, 42, .22);
}
.auth-card h1 {
  margin: 0;
  text-align: center;
  font-size: 22px;
}
.auth-card p {
  margin: 0;
  color: var(--text-muted);
  text-align: center;
}
.auth-card label {
  display: grid;
  gap: 8px;
  font-weight: 800;
}
.auth-card :deep(.base-input) {
  min-height: 42px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  padding: 0 12px;
  font: inherit;
}
.auth-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}
.check-line {
  display: inline-flex !important;
  grid-template-columns: auto 1fr;
  align-items: center;
  color: var(--text-muted);
  font-weight: 600 !important;
}
.link-button {
  border: 0;
  background: transparent;
  color: var(--info);
  cursor: pointer;
  font: inherit;
  font-weight: 800;
}
.primary-auth,
.quiet-auth {
  min-height: 46px;
  border-radius: 10px;
  border: 1px solid #5f6df6;
  background: #5f6df6;
  color: white;
  font: inherit;
  font-weight: 900;
  cursor: pointer;
}
.quiet-auth {
  border-color: var(--border-color);
  background: white;
  color: var(--text-main);
}
.auth-error {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--danger-bg);
  color: var(--danger);
  font-weight: 800;
}
.auth-foot {
  font-size: 12px;
}
</style>
