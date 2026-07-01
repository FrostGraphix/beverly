<script setup lang="ts">
import IconSvg from './IconSvg.vue';
import { DISCOS, PORTALS } from '../content';
</script>

<template>
  <section id="coverage" class="lp-section lp-coverage">
    <div class="lp-section-head" v-reveal>
      <span class="lp-eyebrow">Coverage</span>
      <h2 class="lp-section-title">All five sites. One wallet.</h2>
      <p class="lp-section-sub">
        Beverly covers all supported sites — Musha, Kyakale, Umaisha, Tunga, and Ogufa. Enter your meter number and we route it automatically.
      </p>
    </div>

    <div class="lp-disco-grid">
      <article
        v-for="(d, i) in DISCOS"
        :key="d.code"
        class="lp-disco-card"
        v-reveal="i * 60"
      >
        <span class="lp-disco-code">{{ d.code }}</span>
        <div class="lp-disco-info">
          <strong>{{ d.name }}</strong>
          <span><IconSvg name="globe" /> {{ d.region }}</span>
        </div>
        <span class="lp-disco-live" aria-label="Live"><span class="lp-disco-dot" />Live</span>
      </article>
    </div>

    <div class="lp-coverage-foot" v-reveal>
      <p>More sites are added as coverage expands. Your meter number is validated automatically before any token is generated.</p>
      <a class="lp-btn lp-btn--ghost" :href="PORTALS.customer.signup">
        Check your meter <IconSvg name="arrow" />
      </a>
    </div>
  </section>
</template>

<style scoped>
.lp-coverage {
  max-width: var(--lp-max);
  margin: 0 auto;
  padding: clamp(64px, 9vw, 120px) var(--lp-gutter);
}

.lp-disco-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
  margin-top: 8px;
}

.lp-disco-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border-radius: var(--r-xl);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(12px);
  transition: border-color 220ms var(--ease-out), background 220ms var(--ease-out),
              transform 220ms var(--ease-out), box-shadow 220ms var(--ease-out);
}
.lp-disco-card:hover {
  border-color: oklch(70% 0.19 145 / 0.35);
  background: var(--glass-bg-strong);
  transform: translateY(-2px);
  box-shadow: var(--glass-shadow-card);
}

.lp-disco-code {
  flex-shrink: 0;
  width: 58px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: var(--r-md);
  background: var(--brand-glow);
  border: 1px solid oklch(70% 0.19 145 / 0.22);
  color: var(--brand-300);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.lp-disco-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.lp-disco-info strong {
  font-size: var(--t-md);
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lp-disco-info span {
  font-size: var(--t-sm);
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lp-disco-info :deep(.lp-ico) { font-size: 12px; }

.lp-disco-live {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--t-xs);
  font-weight: 600;
  color: var(--brand-300);
  background: var(--brand-glow);
  border-radius: var(--r-full);
  padding: 3px 8px;
}

.lp-disco-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--brand);
  animation: lp-coverage-pulse 2.2s ease-in-out infinite;
}
@keyframes lp-coverage-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.lp-coverage-foot {
  margin-top: 36px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.lp-coverage-foot p {
  margin: 0;
  font-size: var(--t-lg);
  color: var(--text-dim);
  max-width: 480px;
  line-height: 1.55;
}

@media (prefers-reduced-motion: reduce) {
  .lp-disco-dot { animation: none; }
  .lp-disco-card:hover { transform: none; }
}

/* ── Light theme: brand-300 (80% L) fails on white — use brand-800 (42% L) ── */
:root[data-theme="light"] .lp-disco-code,
:root[data-theme="light"] .lp-disco-live {
  color: oklch(42% 0.12 145);
}
</style>
