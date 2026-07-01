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
      <!-- Cinematic directional beam, light source behind the phone -->
      <div class="lp-hero-beam" />
      <!-- Power-on flash, fires once on load -->
      <div class="lp-hero-flash" />
    </div>

    <div class="lp-hero-inner lp-hero-inner--showcase">
      <div class="lp-hero-copy lp-hero-copy--poster">
        <span class="lp-pill" v-reveal="150">
          <span class="lp-pill-dot" /> Live across 5 Nasarawa sites
        </span>

        <!-- Cinema clip-reveal title. -->
        <h1 class="lp-hero-title" aria-label="Electricity, instantly.">
          <span class="lp-title-clip">
            <span class="lp-title-word lp-title-word--1">Electricity,</span>
          </span>
          <span class="lp-title-clip lp-title-clip--grad">
            <span class="lp-title-word lp-title-word--2">
              <span class="lp-grad lp-grad--live">instantly.</span>
            </span>
          </span>
        </h1>

        <p class="lp-hero-sub" v-reveal="380">
          Beverly Wallet is the fastest way to buy prepaid electricity
          tokens and run a vending business from one wallet.
        </p>

        <div class="lp-hero-cta" v-reveal="480">
          <button class="lp-btn lp-btn--primary lp-btn--lg" type="button" @click="$emit('launch')">
            Get started free <IconSvg name="arrow" />
          </button>
          <a class="lp-btn lp-btn--glass lp-btn--lg" :href="PORTALS.vendor.login">
            <IconSvg name="store" /> I'm a vendor
          </a>
        </div>

        <ul class="lp-hero-trust" v-reveal="600">
          <li><IconSvg name="check" /> No setup fees</li>
          <li><IconSvg name="check" /> Tokens in seconds</li>
          <li><IconSvg name="check" /> Bank-grade security</li>
        </ul>
      </div>

      <!-- Phone art, CSS animation-only. -->
      <div class="lp-hero-art lp-hero-art--showcase">
        <div class="lp-device-scene lp-device-scene--showcase">
          <!-- Electricity streaks -->
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

          <!-- Enhanced iPhone-style device. -->
          <div class="lp-device" aria-label="Enhanced Beverly Wallet device preview">
            <span class="lp-device-aura" aria-hidden="true" />
            <span class="lp-device-rail lp-device-rail--left" aria-hidden="true" />
            <span class="lp-device-rail lp-device-rail--right" aria-hidden="true" />
            <div class="lp-device-frame">
              <span class="lp-device-camera" aria-hidden="true" />
              <div class="lp-device-screen">
                <div class="lp-device-status" aria-hidden="true">
                  <span>9:41</span>
                  <span class="lp-device-bars"><i /><i /><i /></span>
                </div>

                <section class="lp-device-balance">
                  <div class="lp-device-brand">
                    <span class="lp-device-mark"><IconSvg name="bolt" /></span>
                    <span>Beverly</span>
                  </div>
                  <span class="lp-device-live">Live</span>
                  <span class="lp-device-balance-label">Wallet balance</span>
                  <strong>₦24,500</strong>
                  <small>+₦5,000 today</small>
                </section>

                <div class="lp-device-metrics">
                  <span><small>Meter</small><b>4521 7790 233</b></span>
                  <span><small>Amount</small><b>₦5,000</b></span>
                  <span><small>Units</small><b>68.4 kWh</b></span>
                </div>

                <section class="lp-device-token">
                  <div class="lp-device-token-head">
                    <span><IconSvg name="check" /> Delivered</span>
                    <small><IconSvg name="clock" /> 12s</small>
                  </div>
                  <div class="lp-device-token-code" aria-label="Token: 4829 1075 6634 2218 9051">
                    <span>4829</span>
                    <span>1075</span>
                    <span>6634</span>
                    <span>2218</span>
                    <span>9051</span>
                  </div>
                  <div class="lp-device-token-foot">
                    <button type="button">Copy token</button>
                    <span>Receipt saved</span>
                  </div>
                </section>

                <div class="lp-device-dock">
                  <button type="button"><IconSvg name="wallet" /> Wallet</button>
                  <button type="button">Buy <IconSvg name="arrow" /></button>
                </div>
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
