<script setup lang="ts">
import IconSvg from './IconSvg.vue';
import { PORTALS } from '../content';

defineEmits<{ (e: 'launch'): void }>();

const year = new Date().getFullYear();
</script>

<template>
  <section class="lp-cta-banner" v-reveal>
    <div class="lp-cta-banner-inner">
      <div>
        <h2>Ready to power up?</h2>
        <p>Create a free account in under a minute — or open the vendor portal to start selling.</p>
      </div>
      <div class="lp-cta-banner-actions">
        <button class="lp-btn lp-btn--primary lp-btn--lg" type="button" @click="$emit('launch')">
          Get started <IconSvg name="arrow" />
        </button>
        <a class="lp-btn lp-btn--glass lp-btn--lg" :href="PORTALS.vendor.login">Vendor portal</a>
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
        <p>Electricity, instantly. Buy prepaid tokens or run a vending business — all in one place.</p>
        <p class="lp-footer-by">An <strong>ACOB Lighting</strong> product.</p>
      </div>

      <div class="lp-footer-cols">
        <div class="lp-footer-col">
          <h4>Customers</h4>
          <a :href="PORTALS.customer.signup">Create account</a>
          <a :href="PORTALS.customer.login">Sign in</a>
          <a href="#how">How it works</a>
          <a href="#faq">FAQ</a>
        </div>
        <div class="lp-footer-col">
          <h4>Vendors</h4>
          <a :href="PORTALS.vendor.login">Vendor portal</a>
          <a href="mailto:wallet@acoblighting.com?subject=Becoming%20a%20Beverly%20vendor">Become a vendor</a>
          <a href="#features">Features</a>
        </div>
        <div class="lp-footer-col">
          <h4>Company</h4>
          <a href="https://acoblighting.com" target="_blank" rel="noopener">About ACOB</a>
          <a href="mailto:wallet@acoblighting.com">Contact</a>
          <a href="mailto:support@acoblighting.com">Support</a>
        </div>
      </div>
    </div>

    <div class="lp-footer-base">
      <span>© {{ year }} ACOB Lighting Technology. All rights reserved.</span>
      <span class="lp-footer-legal">
        <a href="#">Privacy</a>
        <a href="#">Terms</a>
      </span>
    </div>
  </footer>
</template>
