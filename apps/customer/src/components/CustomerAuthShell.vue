<script setup lang="ts">
import { PORTAL_URLS } from '../lib/portals';

defineProps<{
  title: string;
  subtitle?: string;
  back?: string | null;
  compact?: boolean;
  hideLegal?: boolean;
}>();
</script>

<template>
  <main class="auth-page">
    <div class="auth-bg-glow" aria-hidden="true" />

    <div class="auth-card" :class="{ 'auth-card--compact': compact }">
      <!-- Brand header → back to Beverly landing -->
      <a class="auth-brand" :href="PORTAL_URLS.landing" aria-label="Beverly home">
        <div class="bw-mark auth-mark" aria-hidden="true"></div>
        <div class="auth-wordmark">
          <strong>Beverly</strong>
          <span>Your Smart Power Partner.</span>
        </div>
      </a>

      <div v-if="back || $slots['header-accessory']" class="auth-back-row">
        <router-link v-if="back" :to="back" class="auth-back">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 12L6 8l4-4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Back
        </router-link>
        <slot name="header-accessory" />
      </div>

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

    <p v-if="!hideLegal" class="auth-legal">
      <slot name="legal">
        By continuing you agree to Beverly's
        <router-link to="/terms" class="auth-link">Terms of Service</router-link> &amp;
        <router-link to="/privacy" class="auth-link">Privacy Policy</router-link>.
      </slot>
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
  background: transparent;
  position: relative;
  overflow: hidden;
}

/* Ambient brand glow in the background — sits atop the fixed body gradient */
.auth-bg-glow {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 600px 400px at 50% 0%, oklch(70% 0.19 145 / 0.07) 0%, transparent 70%),
    radial-gradient(ellipse 400px 300px at 80% 100%, oklch(65% 0.18 270 / 0.05) 0%, transparent 60%);
  pointer-events: none;
}

.auth-card {
  position: relative;
  width: 100%;
  max-width: 420px;
  background: var(--glass-bg-strong);
  border: 1px solid var(--glass-border-strong);
  border-radius: var(--r-2xl);
  padding: var(--s-6);
  backdrop-filter: blur(36px) saturate(200%);
  -webkit-backdrop-filter: blur(36px) saturate(200%);
  box-shadow: var(--glass-shine), var(--glass-shadow-float);
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
  text-decoration: none;
  cursor: pointer;
  width: max-content;
  transition: opacity var(--dur-fast);
}
.auth-brand:hover { opacity: 0.85; }

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
  letter-spacing: 0.01em;
  font-weight: 600;
}

.auth-back-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  margin-bottom: var(--s-4);
}

.auth-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--text-2);
  text-decoration: none;
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

.auth-cross {
  margin-top: var(--s-5);
  font-size: var(--t-sm);
  color: var(--text-2);
  text-align: center;
}
.auth-cross-link {
  color: var(--brand);
  font-weight: 600;
  text-decoration: none;
  margin-left: 4px;
}
.auth-cross-link:hover { text-decoration: underline; }

.auth-legal {
  margin-top: var(--s-3);
  font-size: var(--t-xs);
  color: var(--text-2);
  text-align: center;
  max-width: 520px;
  line-height: 1.6;
}

.auth-inline-link {
  color: var(--brand);
  font-weight: 600;
  text-decoration: none;
}
.auth-inline-link:hover { text-decoration: underline; }

.auth-link {
  color: var(--text-2);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.auth-link:hover { color: var(--brand); }

.auth-card--compact { padding: var(--s-5); }
.auth-card--compact .auth-brand { margin-bottom: var(--s-5); }
.auth-card--compact .auth-back-row { margin-bottom: var(--s-3); }
.auth-card--compact .auth-heading { margin-bottom: var(--s-4); }
.auth-card--compact .auth-body { gap: var(--s-3); }

/* Breakpoint: very narrow (small phones) */
@media (max-width: 360px) {
  .auth-card { padding: var(--s-5); border-radius: var(--r-xl); }
}
</style>
