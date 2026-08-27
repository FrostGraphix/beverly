<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '@beverly/tokens/i18n.js';
import IconSvg from './IconSvg.vue';

const { t } = useI18n();
const journeys = computed(() => [
  { n: '01', icon: 'user', title: t('landing.journey.step1Title'), body: t('landing.journey.step1Body') },
  { n: '02', icon: 'shield', title: t('landing.journey.step2Title'), body: t('landing.journey.step2Body') },
  { n: '03', icon: 'receipt', title: t('landing.journey.step3Title'), body: t('landing.journey.step3Body') },
]);
</script>

<template>
  <section class="lp-journey" id="testimonials">
    <div class="lp-journey-inner">
      <div class="lp-section-eyebrow" v-reveal>{{ t('landing.journey.eyebrow') }}</div>
      <div class="lp-journey-heading" v-reveal="60">
        <h2 class="lp-section-title">{{ t('landing.journey.title') }}</h2>
        <p>{{ t('landing.journey.subtitle') }}</p>
      </div>

      <div class="lp-journey-grid" v-reveal="120">
        <article v-for="journey in journeys" :key="journey.n" class="lp-journey-card">
          <div class="lp-journey-card-top">
            <span class="lp-journey-icon"><IconSvg :name="journey.icon" /></span>
            <span class="lp-journey-number">{{ journey.n }}</span>
          </div>
          <h3>{{ journey.title }}</h3>
          <p>{{ journey.body }}</p>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lp-journey { padding: clamp(68px, 9vw, 120px) var(--lp-gutter); border-block: 1px solid var(--glass-border); background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--brand) 4%, transparent), transparent); }
.lp-journey-inner { max-width: var(--lp-max); margin: 0 auto; }
.lp-journey-heading { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(260px, .75fr); align-items: end; gap: 28px; margin-bottom: clamp(30px, 5vw, 54px); }
.lp-journey-heading h2 { margin: 0; }
.lp-journey-heading p { margin: 0; color: var(--text-dim); font-size: var(--t-lg); line-height: 1.6; }
.lp-journey-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; counter-reset: journey; }
.lp-journey-card { position: relative; min-width: 0; padding: clamp(22px, 3.2vw, 34px); overflow: hidden; border: 1px solid var(--glass-border); border-radius: var(--r-2xl); background: var(--glass-bg); box-shadow: inset 0 1px 0 rgb(255 255 255 / .035); }
.lp-journey-card::after { content: ''; position: absolute; inset: auto 0 0; height: 3px; background: linear-gradient(90deg, transparent, var(--brand), transparent); opacity: .7; }
.lp-journey-card-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 36px; }
.lp-journey-icon { width: 46px; height: 46px; display: grid; place-items: center; border: 1px solid color-mix(in srgb, var(--brand) 34%, transparent); border-radius: var(--r-lg); background: var(--brand-glow); color: var(--brand-300); }
.lp-journey-icon :deep(.lp-ico) { width: 22px; height: 22px; }
.lp-journey-number { color: var(--text-muted); font-family: var(--font-mono); font-size: var(--t-sm); }
.lp-journey-card h3 { margin: 0 0 10px; color: var(--text); font-size: clamp(1.1rem, 2vw, 1.35rem); }
.lp-journey-card p { margin: 0; color: var(--text-dim); line-height: 1.65; }
@media (max-width: 760px) { .lp-journey-heading { grid-template-columns: 1fr; } .lp-journey-grid { grid-template-columns: 1fr; } .lp-journey-card-top { margin-bottom: 24px; } }
</style>
