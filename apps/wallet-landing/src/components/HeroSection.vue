<script setup lang="ts">
import IconSvg from './IconSvg.vue';
import { PORTALS, STATS } from '../content';

defineEmits<{ (e: 'launch'): void }>();
</script>

<template>
  <section id="top" class="lp-hero">
    <div class="lp-hero-mesh" aria-hidden="true">
      <span class="lp-orb lp-orb--1" />
      <span class="lp-orb lp-orb--3" />
      <div class="lp-grid-overlay" />
    </div>

    <div class="lp-hero-inner">
      <div class="lp-hero-copy">
        <span class="lp-pill" v-reveal>
          <span class="lp-pill-dot" /> Live across 5+ discos
        </span>
        <h1 class="lp-hero-title" v-reveal="60">
          Electricity,
          <span class="lp-grad">instantly.</span>
        </h1>
        <p class="lp-hero-sub" v-reveal="120">
          Beverly Wallet is the fastest way to buy prepaid electricity tokens —
          and the smartest way to run a vending business. One platform, two front doors.
        </p>

        <div class="lp-hero-cta" v-reveal="180">
          <button class="lp-btn lp-btn--primary lp-btn--lg" type="button" @click="$emit('launch')">
            Get started free <IconSvg name="arrow" />
          </button>
          <a class="lp-btn lp-btn--glass lp-btn--lg" :href="PORTALS.vendor.login">
            <IconSvg name="store" /> I'm a vendor
          </a>
        </div>

        <ul class="lp-hero-trust" v-reveal="240">
          <li><IconSvg name="check" /> No setup fees</li>
          <li><IconSvg name="check" /> Tokens in seconds</li>
          <li><IconSvg name="check" /> Bank-grade security</li>
        </ul>
      </div>

      <div class="lp-hero-art" v-reveal="200">
        <div class="lp-phone-scene">
          <!-- Floating electricity streaks -->
          <div class="lp-streaks" aria-hidden="true">
            <svg class="lp-streak lp-streak--1" width="10" height="26" viewBox="0 0 10 26" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 0L2 12h3.5L1 26l9-15H6L7 0z" fill="currentColor"/>
            </svg>
            <svg class="lp-streak lp-streak--2" width="8" height="20" viewBox="0 0 8 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5.5 0L1 9h3L0 20l7-12H4.5L5.5 0z" fill="currentColor"/>
            </svg>
            <svg class="lp-streak lp-streak--3" width="13" height="32" viewBox="0 0 13 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 0L3 15h5L1 32l12-19H8.5L9 0z" fill="currentColor"/>
            </svg>
            <svg class="lp-streak lp-streak--4" width="7" height="18" viewBox="0 0 7 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 0L1 8h2.5L0 18l6-11H3.5L5 0z" fill="currentColor"/>
            </svg>
            <svg class="lp-streak lp-streak--5" width="9" height="24" viewBox="0 0 9 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6.5 0L2 11h3.5L1 24l8-14H5.5L6.5 0z" fill="currentColor"/>
            </svg>
            <svg class="lp-streak lp-streak--6" width="6" height="16" viewBox="0 0 6 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 0L1 7h2L0 16l5-9H3L4 0z" fill="currentColor"/>
            </svg>
          </div>

          <!-- iPhone 17 mockup -->
          <div class="lp-phone" aria-label="Beverly Wallet on iPhone 17">
            <!-- Physical frame sides -->
            <span class="lp-phone-side lp-phone-side--action" aria-hidden="true" />
            <span class="lp-phone-side lp-phone-side--volume" aria-hidden="true" />
            <span class="lp-phone-side lp-phone-side--power" aria-hidden="true" />
            <span class="lp-phone-side lp-phone-side--camera" aria-hidden="true" />
            <!-- Dynamic Island -->
            <div class="lp-phone-island" aria-hidden="true">
              <span class="lp-phone-camera" />
            </div>

            <!-- Back face shown during spin -->
            <div class="lp-phone-back" aria-hidden="true">
              <div class="lp-phone-cam-module">
                <div class="lp-phone-cam-lens lp-phone-cam-lens--main"></div>
                <div class="lp-phone-cam-lens lp-phone-cam-lens--ultra"></div>
                <div class="lp-phone-cam-flash"></div>
              </div>
              <div class="lp-phone-back-mark">B</div>
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
                <span class="lp-balance-value">₦24,500</span>
                <span class="lp-balance-meta"><IconSvg name="spark" /> +₦5,000 today</span>
              </div>

              <div class="lp-buy-row">
                <div class="lp-buy-field">
                  <small>Meter</small>
                  <strong>4521 7790 233</strong>
                </div>
                <div class="lp-buy-field">
                  <small>Amount</small>
                  <strong>₦5,000</strong>
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
