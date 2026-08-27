<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '@beverly/tokens/i18n.js';
import IconSvg from './IconSvg.vue';

const { t } = useI18n();
const points = computed(() => ['lock', 'shield', 'user', 'clock'].map((icon, index) => ({
    icon, title: t(`landing.trust.${index + 1}.title`), body: t(`landing.trust.${index + 1}.body`),
})));
</script>

<template>
  <section class="lp-section lp-trust">
    <div class="lp-trust-inner">
      <div class="lp-trust-copy" v-reveal>
        <span class="lp-eyebrow">{{ t('landing.trust.eyebrow') }}</span>
        <h2 class="lp-section-title">{{ t('landing.trust.title') }}</h2>
        <p class="lp-section-sub">{{ t('landing.trust.subtitle') }}</p>
        <div class="lp-trust-badges">
          <span class="lp-badge-chip"><IconSvg name="lock" /> {{ t('landing.trust.badge1') }}</span>
          <span class="lp-badge-chip"><IconSvg name="shield" /> {{ t('landing.trust.badge2') }}</span>
          <span class="lp-badge-chip"><IconSvg name="globe" /> {{ t('landing.trust.badge3') }}</span>
        </div>
      </div>

      <div class="lp-trust-grid">
        <article v-for="(p, i) in points" :key="p.title" class="lp-trust-card" v-reveal="i * 80">
          <span class="lp-trust-ic"><IconSvg :name="p.icon" /></span>
          <h3>{{ p.title }}</h3>
          <p>{{ p.body }}</p>
        </article>
      </div>
    </div>
  </section>
</template>
