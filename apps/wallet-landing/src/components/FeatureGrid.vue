<script setup lang="ts">
import IconSvg from './IconSvg.vue';
import { FEATURES } from '../content';
import { useI18n } from '@beverly/tokens/i18n.js';
const { t } = useI18n();
</script>

<template>
  <section id="features" class="lp-section">
    <div class="lp-section-head" v-reveal>
      <span class="lp-eyebrow">{{ t('landing.features.eyebrow') }}</span>
      <h2 class="lp-section-title">{{ t('landing.features.title') }}</h2>
      <p class="lp-section-sub">{{ t('landing.features.subtitle') }}</p>
    </div>

    <div class="lp-feature-grid">
      <article v-for="(f, i) in FEATURES" :key="f.title" class="lp-feature" v-reveal="(i % 3) * 90">
        <span class="lp-feature-ic"><IconSvg :name="f.icon" /></span>
        <h3>{{ t(f.title) }}</h3>
        <p>{{ t(f.body) }}</p>
      </article>
    </div>
  </section>
</template>
