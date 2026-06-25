<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string;
  back?: string | null;
}>();
</script>

<template>
  <main class="auth-page">
    <div class="auth-bg-glow" aria-hidden="true" />

    <div class="auth-card">
      <!-- Brand header -->
      <div class="auth-brand">
        <div class="bw-mark auth-mark">B</div>
        <div class="auth-wordmark">
          <strong>Beverly</strong>
          <span>Electricity · Wallet</span>
        </div>
      </div>

      <!-- Back link -->
      <router-link v-if="back" :to="back" class="auth-back">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10 12L6 8l4-4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Back
      </router-link>

      <!-- Title block -->
      <div class="auth-heading">
        <h1 class="auth-title">{{ title }}</h1>
        <p v-if="subtitle" class="auth-subtitle">{{ subtitle }}</p>
      </div>

      <!-- Slot: form content -->
      <div class="auth-body">
        <slot />
      </div>
    </div>

    <p class="auth-legal">
      By continuing you agree to Beverly's
      <a href="#" class="auth-link">Terms of Service</a> &amp;
      <a href="#" class="auth-link">Privacy Policy</a>.
    </p>
  </main>
</template>

<style scoped>
.auth-page {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--s-5) var(--s-4);
  padding-bottom: max(var(--s-6), env(safe-area-inset-bottom, 0px));
  background: var(--canvas);
  position: relative;
  overflow: hidden;
}

/* Ambient brand glow in the background */
.auth-bg-glow {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 600px 400px at 50% 0%, oklch(70% 0.19 145 / 0.09) 0%, transparent 70%),
    radial-gradient(ellipse 400px 300px at 80% 100%, oklch(65% 0.18 270 / 0.06) 0%, transparent 60%);
  pointer-events: none;
}

.auth-card {
  position: relative;
  width: 100%;
  max-width: 420px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-2xl);
  padding: var(--s-6);
  box-shadow:
    0 0 0 1px oklch(100% 0 0 / 0.04) inset,
    0 4px 6px -1px oklch(0% 0 0 / 0.3),
    0 20px 40px -8px oklch(0% 0 0 / 0.4),
    0 0 60px oklch(70% 0.19 145 / 0.04);
}

/* Top glow line on card */
.auth-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 20%;
  right: 20%;
  height: 1px;
  background: linear-gradient(90deg, transparent, oklch(70% 0.19 145 / 0.5), transparent);
  border-radius: 0 0 4px 4px;
}

.auth-brand {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  margin-bottom: var(--s-6);
}

.auth-mark {
  width: 44px;
  height: 44px;
  font-size: 20px;
  flex-shrink: 0;
}

.auth-wordmark {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.auth-wordmark strong {
  font-size: var(--t-lg);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text);
}

.auth-wordmark span {
  font-size: var(--t-2xs);
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.09em;
  font-weight: 600;
}

.auth-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--text-2);
  text-decoration: none;
  margin-bottom: var(--s-4);
  transition: color var(--dur-fast);
}
.auth-back:hover { color: var(--text); }

.auth-heading {
  margin-bottom: var(--s-5);
}

.auth-title {
  font-size: var(--t-2xl);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text);
  margin: 0 0 4px;
}

.auth-subtitle {
  font-size: var(--t-sm);
  color: var(--text-2);
  margin: 0;
  line-height: 1.5;
}

.auth-body {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.auth-legal {
  margin-top: var(--s-5);
  font-size: var(--t-xs);
  color: var(--text-2);
  text-align: center;
  max-width: 320px;
  line-height: 1.6;
}

.auth-link {
  color: var(--text-2);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.auth-link:hover { color: var(--brand); }

/* Breakpoint: very narrow (small phones) */
@media (max-width: 360px) {
  .auth-card { padding: var(--s-5); border-radius: var(--r-xl); }
}
</style>
