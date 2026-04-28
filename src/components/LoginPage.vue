<template>
  <main class="login-page">
    <form class="login-card" @submit.prevent="submit">
      <h1 class="login-title">
        Meter System
        <button class="language-button" type="button" aria-label="Language">◎</button>
      </h1>
      <label class="login-field">
        <span class="field-icon">●</span>
        <input v-model="form.userId" name="userId" type="text" placeholder="Username" autocomplete="username">
      </label>
      <label class="login-field">
        <span class="field-icon">■</span>
        <input v-model="form.password" name="password" :type="showPassword ? 'text' : 'password'" placeholder="Password" autocomplete="current-password">
        <button class="password-eye" type="button" aria-label="Show password" @click="showPassword = !showPassword">⊘</button>
      </label>
      <div class="verification-row">
        <label class="login-field">
          <span class="field-icon">✣</span>
          <input v-model="form.verifycode" name="verifycode" type="text" placeholder="Verification Code">
        </label>
        <button class="captcha" type="button" aria-label="Refresh verification code" v-html="captcha" @click="refreshCaptcha"></button>
      </div>
      <button class="login-button" type="submit">Login</button>
    </form>
  </main>
</template>

<script>
import { login } from "../services/api";

export default {
  name: "LoginPage",
  data() {
    return {
      captcha: "",
      showPassword: false,
      form: {
        userId: "admin",
        password: "admin",
        verifycode: "s3b9"
      }
    };
  },
  created() {
    this.refreshCaptcha();
  },
  methods: {
    refreshCaptcha() {
      const chars = ["s", "3", "b", "9"];
      const dots = Array.from({ length: 45 }, (_, index) => {
        const x = (index * 29) % 112;
        const y = (index * 17) % 42;
        const color = ["#2c7be5", "#7b2cbf", "#12b886", "#ff922b"][index % 4];
        return `<circle cx="${x}" cy="${y}" r="1.2" fill="${color}"/>`;
      }).join("");
      this.captcha = `<svg viewBox="0 0 112 42" xmlns="http://www.w3.org/2000/svg"><rect width="112" height="42" fill="#f0a4ca"/>${dots}<path d="M3 31C31 7 76 48 108 13" stroke="#263445" stroke-width="1"/><path d="M8 11 102 34" stroke="#7b2cbf" stroke-width="1"/>${chars.map((c, i) => `<text x="${22 + i * 21}" y="${27 + (i % 2) * -4}" fill="#5f3dc4" font-size="24" font-family="Georgia" transform="rotate(${i % 2 ? 16 : -12} ${22 + i * 21} 21)">${c}</text>`).join("")}</svg>`;
    },
    async submit() {
      await login(this.form);
      this.$emit("logged-in");
    }
  }
};
</script>
