<script setup lang="ts">
import IconSvg from './IconSvg.vue';
import { PORTAL_CARDS } from '../content';
import { useI18n } from '@beverly/tokens/i18n.js';

const { t } = useI18n();

function getPrimaryHref(_key: 'customer' | 'vendor', fallback: string): string {
    return fallback;
}

function getPrimaryLabel(_key: 'customer' | 'vendor', fallback: string): string {
    return fallback;
}
</script>

<template>
  <section id="portals" class="lp-section lp-portals">
    <div class="lp-section-head" v-reveal>
      <span class="lp-eyebrow">{{ t('landing.portals.eyebrow') }}</span>
      <h2 class="lp-section-title">{{ t('landing.portals.title') }}</h2>
      <p class="lp-section-sub">{{ t('landing.portals.subtitle') }}</p>
    </div>

    <div class="lp-portal-grid">
      <article
        v-for="(p, i) in PORTAL_CARDS"
        :key="p.key"
        :class="['lp-portal-card', `lp-portal-card--${p.accent}`]"
        v-reveal="i * 100"
      >
        <div class="lp-portal-glow" aria-hidden="true" />
        <span class="lp-portal-eyebrow">{{ t(p.eyebrow) }}</span>
        <h3 class="lp-portal-title">{{ t(p.title) }}</h3>
        <p class="lp-portal-tagline">{{ t(p.tagline) }}</p>

        <ul class="lp-portal-bullets">
          <li v-for="b in p.bullets" :key="b.text">
            <span class="lp-portal-bullet-ic"><IconSvg :name="b.icon" /></span>
            {{ t(b.text) }}
          </li>
        </ul>

        <div class="lp-portal-actions">
          <a class="lp-btn lp-btn--primary lp-btn--block" :href="getPrimaryHref(p.key, p.primaryHref)">
            {{ t(getPrimaryLabel(p.key, p.primaryLabel)) }} <IconSvg name="arrow" />
          </a>
          <a class="lp-btn lp-btn--ghost lp-btn--block" :href="p.secondaryHref">{{ t(p.secondaryLabel) }}</a>
        </div>
      </article>
    </div>
  </section>
</template>

