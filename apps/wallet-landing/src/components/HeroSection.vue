<script setup lang="ts">
import IconSvg from './IconSvg.vue';
import { PORTALS, STATS } from '../content';

defineEmits<{ (e: 'launch'): void }>();
</script>

<template>
  <section id="top" class="lp-hero">
    <div class="lp-hero-mesh" aria-hidden="true">
      <span class="lp-orb lp-orb--1" />
      <span class="lp-orb lp-orb--2" />
      <span class="lp-orb lp-orb--3" />
      <div class="lp-grid-overlay" />
    </div>

    <div class="lp-hero-inner">
      <div class="lp-hero-copy">
        <span class="lp-pill" v-reveal>
          <span class="lp-pill-dot" />
          E-WALLET &middot; ELECTRICITY &middot; PAYMENTS
        </span>

        <h1 class="lp-hero-title" v-reveal="60">
          The Future of<br>
          <span class="lp-grad">Digital Payments!</span>
        </h1>

        <p class="lp-hero-sub" v-reveal="120">
          Buy prepaid electricity tokens in seconds. Power your home, run your
          vending business, and manage every meter from one intelligent wallet.
        </p>

        <div class="lp-hero-cta" v-reveal="180">
          <button class="lp-btn lp-btn--primary lp-btn--lg" type="button" @click="$emit('launch')">
            Get started free <IconSvg name="arrow" />
          </button>
          <a class="lp-btn lp-btn--glass lp-btn--lg" :href="PORTALS.vendor.login">
            <IconSvg name="store" /> Vendor portal
          </a>
        </div>

        <!-- Social proof row -->
        <div class="lp-hero-social" v-reveal="240">
          <div class="lp-avatars">
            <span class="lp-avatar lp-avatar--a">AO</span>
            <span class="lp-avatar lp-avatar--b">EN</span>
            <span class="lp-avatar lp-avatar--c">FA</span>
            <span class="lp-avatar lp-avatar--d">CE</span>
          </div>
          <div class="lp-social-meta">
            <div class="lp-stars">
              <span v-for="i in 5" :key="i" class="lp-star">★</span>
            </div>
            <span class="lp-social-copy"><strong>8.5</strong> / 10 — from 2,400+ users</span>
          </div>
        </div>

        <ul class="lp-hero-trust" v-reveal="280">
          <li><IconSvg name="check" /> No setup fees</li>
          <li><IconSvg name="check" /> Tokens in &lt;15 seconds</li>
          <li><IconSvg name="check" /> Bank-grade security</li>
        </ul>
      </div>

      <div class="lp-hero-art" v-reveal="200">
        <div class="lp-phone" aria-label="Beverly Wallet app">
          <span class="lp-phone-side lp-phone-side--action" aria-hidden="true" />
          <span class="lp-phone-side lp-phone-side--volume" aria-hidden="true" />
          <span class="lp-phone-side lp-phone-side--power" aria-hidden="true" />
          <span class="lp-phone-side lp-phone-side--camera" aria-hidden="true" />
          <div class="lp-phone-island" aria-hidden="true">
            <span class="lp-phone-camera" />
          </div>

          <div class="lp-phone-screen">
            <div class="lp-ios-status" aria-hidden="true">
              <span>9:41</span>
              <span class="lp-ios-signals"><i /><i /><i /></span>
            </div>

            <div class="lp-app-bar">
              <span class="lp-app-brand"><span class="lp-app-mark"><IconSvg name="bolt" /></span> Beverly</span>
              <span class="lp-app-status">Live</span>
            </div>

            <div class="lp-balance-card">
              <div class="lp-balance-head">
                <span class="lp-balance-label">Wallet balance</span>
                <span class="lp-app-avatar">A</span>
              </div>
              <span class="lp-balance-value">&#8358;24,500<sup>.00</sup></span>
              <span class="lp-balance-meta"><IconSvg name="spark" /> +&#8358;5,000 today</span>
            </div>

            <div class="lp-buy-row">
              <div class="lp-buy-field">
                <small>Meter</small>
                <strong>4521 7790 233</strong>
              </div>
              <div class="lp-buy-field">
                <small>Amount</small>
                <strong>&#8358;5,000</strong>
              </div>
            </div>

            <div class="lp-token">
              <div class="lp-token-head">
                <span class="lp-token-label"><IconSvg name="check" /> Delivered</span>
                <span>68.4 kWh</span>
              </div>
              <span class="lp-token-value">4829 1075 6634 2218 9051</span>
              <span class="lp-token-units">Receipt saved</span>
            </div>

            <div class="lp-phone-dock">
              <button class="lp-phone-dock-item" type="button"><IconSvg name="wallet" /> Wallet</button>
              <button class="lp-app-cta" type="button">Buy <IconSvg name="arrow" /></button>
            </div>
          </div>
        </div>
        <div class="lp-art-chip lp-art-chip--a"><IconSvg name="clock" /> &lt; 15s delivery</div>
        <div class="lp-art-chip lp-art-chip--b"><IconSvg name="lock" /> MFA secured</div>
      </div>
    </div>

    <div class="lp-stats" v-reveal>
      <div v-for="s in STATS" :key="s.label" class="lp-stat">
        <strong>{{ s.value }}</strong>
        <span>{{ s.label }}</span>
      </div>
    </div>
  </section>
</template>
