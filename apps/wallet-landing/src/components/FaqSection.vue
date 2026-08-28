<script setup lang="ts">
import { ref } from 'vue';
import IconSvg from './IconSvg.vue';
import { FAQS, PORTALS } from '../content';
import { useI18n } from '@beverly/tokens/i18n.js';
const { t } = useI18n();

const open = ref<number>(0);
function toggle(i: number) {
    open.value = open.value === i ? -1 : i;
}
</script>

<template>
  <section id="faq" class="lp-section lp-faq">
    <div class="lp-section-head" v-reveal>
      <span class="lp-eyebrow">{{ t('landing.faq.eyebrow') }}</span>
      <h2 class="lp-section-title">{{ t('landing.faq.title') }}</h2>
    </div>

    <div class="lp-faq-list">
      <div
        v-for="(f, i) in FAQS"
        :key="f.q"
        :class="['lp-faq-item', open === i && 'lp-faq-item--open']"
        v-reveal="i * 50"
      >
        <button class="lp-faq-q" type="button" :aria-expanded="open === i" @click="toggle(i)">
          <span>{{ t(f.q) }}</span>
          <span class="lp-faq-icon"><IconSvg name="arrow" /></span>
        </button>
        <div class="lp-faq-a">
          <p>{{ t(f.a) }}</p>
        </div>
      </div>
    </div>

    <div class="lp-faq-foot" v-reveal>
      <p>{{ t('landing.faq.footnote') }}</p>
      <div class="lp-faq-foot-actions">
        <a class="lp-btn lp-btn--primary" :href="`${PORTALS.customer.home}help`">{{ t('landing.faq.help') }} <IconSvg name="arrow" /></a>
        <a class="lp-btn lp-btn--ghost" :href="`${PORTALS.vendor.home}help`">{{ t('landing.faq.vendorSupport') }}</a>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lp-faq-foot {
  max-width: 760px;
  margin: 28px auto 0;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.lp-faq-foot p { margin: 0; color: var(--text-dim); font-size: var(--t-lg); line-height: 1.6; max-width: 560px; }
.lp-faq-foot-actions { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
</style>
