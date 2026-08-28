<script setup lang="ts">
import IconSvg from './IconSvg.vue';
import { PORTALS } from '../content';
import { useI18n } from '@beverly/tokens/i18n.js';

defineEmits<{ (e: 'launch'): void }>();

const year = new Date().getFullYear();
const { t } = useI18n();
</script>

<template>
  <section class="lp-cta-banner" v-reveal>
    <div class="lp-cta-banner-inner">
      <div>
        <h2>{{ t('landing.footer.ctaTitle') }}</h2>
        <p>{{ t('landing.footer.ctaBody') }}</p>
      </div>
      <div class="lp-cta-banner-actions">
        <button class="lp-btn lp-btn--primary lp-cta-btn" type="button" @click="$emit('launch')">
          {{ t('common.getStarted') }} <IconSvg name="arrow" />
        </button>
        <a class="lp-btn lp-btn--glass lp-cta-btn" :href="PORTALS.vendor.login">{{ t('landing.footer.vendorPortal') }}</a>
        <a class="lp-btn lp-btn--ghost lp-cta-btn" href="#support">SOP</a>
      </div>
    </div>
  </section>

  <footer class="lp-footer">
    <div class="lp-footer-inner">
      <div class="lp-footer-brand">
        <a class="lp-brand" href="#top">
          <span class="lp-brand-mark"><IconSvg name="bolt" /></span>
          <span class="lp-brand-text">Beverly<em>Wallet</em></span>
        </a>
        <p>{{ t('landing.portal.tagline') }}</p>
        <p class="lp-footer-by">{{ t('landing.footer.productBy') }} <strong>ACOB Lighting Technology Limited</strong>.</p>
      </div>

      <div class="lp-footer-cols">
        <div class="lp-footer-col">
          <h4>{{ t('landing.footer.customers') }}</h4>
          <a :href="PORTALS.customer.signup">{{ t('landing.footer.createAccount') }}</a>
          <a :href="PORTALS.customer.login">{{ t('common.signIn') }}</a>
          <a href="#how">{{ t('landing.nav.how') }}</a>
          <a href="#faq">{{ t('landing.nav.faq') }}</a>
        </div>
        <div class="lp-footer-col">
          <h4>{{ t('landing.footer.vendors') }}</h4>
          <a :href="PORTALS.vendor.login">{{ t('landing.footer.vendorPortal') }}</a>
          <a href="mailto:wallet@acoblighting.com?subject=Becoming%20a%20Beverly%20vendor">{{ t('landing.how.vendorCta') }}</a>
          <a href="#features">{{ t('landing.nav.features') }}</a>
          <a href="#coverage">{{ t('landing.coverage.eyebrow') }}</a>
        </div>
        <div class="lp-footer-col">
          <h4>{{ t('landing.footer.resources') }}</h4>
          <a href="#how">{{ t('landing.nav.how') }}</a>
          <a href="#portals">{{ t('landing.footer.choosePortal') }}</a>
          <a href="#support">{{ t('landing.footer.supportCenter') }}</a>
          <a href="mailto:support@acoblighting.com">{{ t('landing.footer.emailSupport') }}</a>
        </div>
        <div class="lp-footer-col">
          <h4>{{ t('landing.footer.company') }}</h4>
          <a href="#about">{{ t('landing.footer.about') }}</a>
          <a href="#contact">{{ t('landing.footer.contact') }}</a>
          <a href="#privacy">{{ t('landing.footer.privacyPolicy') }}</a>
          <a href="#terms">{{ t('landing.footer.termsService') }}</a>
        </div>
      </div>
    </div>

    <div class="lp-footer-base">
      <span>© {{ year }} ACOB Lighting Technology Limited. {{ t('landing.footer.rights') }}</span>
      <span class="lp-footer-legal">
        <a href="#privacy">{{ t('landing.footer.privacy') }}</a>
        <a href="#terms">{{ t('landing.footer.terms') }}</a>
      </span>
    </div>
  </footer>
</template>
