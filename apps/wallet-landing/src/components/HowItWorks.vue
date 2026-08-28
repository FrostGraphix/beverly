<script setup lang="ts">
import { computed, ref } from 'vue';
import IconSvg from './IconSvg.vue';
import { CUSTOMER_STEPS, VENDOR_STEPS, PORTALS } from '../content';
import { useI18n } from '@beverly/tokens/i18n.js';

const { t } = useI18n();

const mode = ref<'customer' | 'vendor'>('customer');
const steps = computed(() => (mode.value === 'customer' ? CUSTOMER_STEPS : VENDOR_STEPS));
const cta = computed(() =>
    mode.value === 'customer'
        ? { label: t('landing.how.customerCta'), href: PORTALS.customer.signup }
        : { label: t('landing.how.vendorCta'), href: PORTALS.vendor.login },
);
</script>

<template>
  <section id="how" class="lp-section lp-how">
    <div class="lp-section-head" v-reveal>
      <span class="lp-eyebrow">{{ t('landing.nav.how') }}</span>
      <h2 class="lp-section-title">{{ t('landing.how.title') }}</h2>
    </div>

    <div class="lp-toggle" v-reveal role="tablist" :aria-label="t('landing.how.audience')">
      <button
        id="tab-customer"
        :class="['lp-toggle-btn', mode === 'customer' && 'lp-toggle-btn--on']"
        type="button"
        role="tab"
        :aria-selected="mode === 'customer'"
        aria-controls="tabpanel-steps"
        @click="mode = 'customer'"
      >
        <IconSvg name="user" /> {{ t('landing.how.customers') }}
      </button>
      <button
        id="tab-vendor"
        :class="['lp-toggle-btn', mode === 'vendor' && 'lp-toggle-btn--on']"
        type="button"
        role="tab"
        :aria-selected="mode === 'vendor'"
        aria-controls="tabpanel-steps"
        @click="mode = 'vendor'"
      >
        <IconSvg name="store" /> {{ t('landing.how.vendors') }}
      </button>
    </div>

    <div
      id="tabpanel-steps"
      role="tabpanel"
      :aria-labelledby="mode === 'customer' ? 'tab-customer' : 'tab-vendor'"
      tabindex="0"
    >
      <div class="lp-steps">
        <article v-for="(s, i) in steps" :key="s.n" class="lp-step" v-reveal="i * 90">
          <span class="lp-step-n">{{ s.n }}</span>
          <div class="lp-step-body">
            <h3>{{ t(s.title) }}</h3>
            <p>{{ t(s.body) }}</p>
          </div>
          <span v-if="i < steps.length - 1" class="lp-step-arrow" aria-hidden="true"><IconSvg name="arrow" /></span>
        </article>
      </div>
    </div>

    <div class="lp-how-cta" v-reveal>
      <a class="lp-btn lp-btn--primary lp-btn--lg" :href="cta.href">{{ cta.label }} <IconSvg name="arrow" /></a>
    </div>
  </section>
</template>
