<script setup lang="ts">
import { computed, ref } from 'vue';
import IconSvg from './IconSvg.vue';
import { CUSTOMER_STEPS, VENDOR_STEPS, PORTALS } from '../content';

const mode = ref<'customer' | 'vendor'>('customer');
const steps = computed(() => (mode.value === 'customer' ? CUSTOMER_STEPS : VENDOR_STEPS));
const cta = computed(() =>
    mode.value === 'customer'
        ? { label: 'Start buying', href: PORTALS.customer.signup }
        : { label: 'Become a vendor', href: PORTALS.vendor.login },
);
</script>

<template>
  <section id="how" class="lp-section lp-how">
    <div class="lp-section-head" v-reveal>
      <span class="lp-eyebrow">How it works</span>
      <h2 class="lp-section-title">Up and running in three steps.</h2>
    </div>

    <div class="lp-toggle" v-reveal role="tablist" aria-label="Audience">
      <button
        :class="['lp-toggle-btn', mode === 'customer' && 'lp-toggle-btn--on']"
        type="button"
        role="tab"
        :aria-selected="mode === 'customer'"
        @click="mode = 'customer'"
      >
        <IconSvg name="user" /> For customers
      </button>
      <button
        :class="['lp-toggle-btn', mode === 'vendor' && 'lp-toggle-btn--on']"
        type="button"
        role="tab"
        :aria-selected="mode === 'vendor'"
        @click="mode = 'vendor'"
      >
        <IconSvg name="store" /> For vendors
      </button>
    </div>

    <div class="lp-steps">
      <article v-for="(s, i) in steps" :key="s.n" class="lp-step" v-reveal="i * 90">
        <span class="lp-step-n">{{ s.n }}</span>
        <div class="lp-step-body">
          <h3>{{ s.title }}</h3>
          <p>{{ s.body }}</p>
        </div>
        <span v-if="i < steps.length - 1" class="lp-step-arrow" aria-hidden="true"><IconSvg name="arrow" /></span>
      </article>
    </div>

    <div class="lp-how-cta" v-reveal>
      <a class="lp-btn lp-btn--primary lp-btn--lg" :href="cta.href">{{ cta.label }} <IconSvg name="arrow" /></a>
    </div>
  </section>
</template>
