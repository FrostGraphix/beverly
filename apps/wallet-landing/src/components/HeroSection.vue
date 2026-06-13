<script setup lang="ts">
import { ref, computed } from 'vue';
import IconSvg from './IconSvg.vue';
import { PORTALS, STATS } from '../content';

defineEmits<{ (e: 'launch'): void }>();

// Interactive Consumption Usage Modes
const activeConsumptionMode = ref<'hourly' | 'daily' | 'live'>('hourly');
const tokenCopied = ref(false);

const consumptionModes = [
  { id: 'hourly', label: 'Hourly', value: '68.4 kWh', sub: 'Peak load 3.2 kW', path: 'M0 32 L30 25 L60 28 L90 14 L120 18 L150 8 L180 12 L200 4' },
  { id: 'daily',  label: 'Daily',  value: '412.8 kWh', sub: 'Avg 13.7 kWh/day', path: 'M0 28 L30 22 L60 16 L90 20 L120 10 L150 14 L180 6 L200 8' },
  { id: 'live',   label: 'Live kW', value: '2.45 kW',   sub: '3 Phase active', path: 'M0 35 L30 30 L60 12 L90 26 L120 8 L150 22 L180 5 L200 12' },
] as const;

const currentModeData = computed(() => {
  return consumptionModes.find(m => m.id === activeConsumptionMode.value) || consumptionModes[0];
});

function copyTokenCode() {
  tokenCopied.value = true;
  if (navigator.clipboard) {
    navigator.clipboard.writeText('48291075663422189051').catch(() => {});
  }
  setTimeout(() => {
    tokenCopied.value = false;
  }, 2400);
}

// 3D Tilt interaction
const tiltX = ref(0);
const tiltY = ref(0);

function handleMouseMove(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const x = e.clientX - rect.left - rect.width / 2;
  const y = e.clientY - rect.top - rect.height / 2;
  tiltX.value = (y / rect.height) * -16;
  tiltY.value = (x / rect.width) * 16;
}

function handleMouseLeave() {
  tiltX.value = 0;
  tiltY.value = 0;
}
</script>

<template>
  <section id="top" class="lp-hero" @mousemove="handleMouseMove" @mouseleave="handleMouseLeave">
    <div class="lp-hero-mesh" aria-hidden="true">
      <span class="lp-orb lp-orb--1" />
      <span class="lp-orb lp-orb--3" />
      <div class="lp-grid-overlay" />
      <!-- Cinematic directional beam -->
      <div class="lp-hero-beam" />
      <!-- Power-on flash -->
      <div class="lp-hero-flash" />
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

        <div class="lp-hero-cta" v-reveal="480">
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
              <div class="lp-bento-body">
                <span class="lp-bento-label">Active balance</span>
                <strong class="lp-bento-amount">₦24,500.00</strong>
                <div class="lp-bento-sub">+₦5,000 top up completed</div>
              </div>
            </div>

            <!-- Card 2: Instant 20-Digit STS Token Delivery -->
            <div class="lp-bento-card lp-bento-card--token lp-bento-float-2">
              <div class="lp-bento-head">
                <span class="lp-bento-tag"><IconSvg name="check" /> Token Delivered</span>
                <small><IconSvg name="clock" /> &lt;15s</small>
              </div>
              <div class="lp-bento-token-code" aria-label="Token Code: 4829 1075 6634 2218 9051">
                <span>4829</span>
                <span>1075</span>
                <span>6634</span>
                <span>2218</span>
                <span>9051</span>
              </div>
              <div class="lp-bento-foot">
                <button
                  type="button"
                  :class="['lp-bento-copy', tokenCopied && 'lp-bento-copy--active']"
                  @click="copyTokenCode"
                >
                  <IconSvg :name="tokenCopied ? 'check' : 'copy'" />
                  <span>{{ tokenCopied ? 'Copied to clipboard!' : 'Copy 20-digit token' }}</span>
                </button>
                <span class="lp-bento-receipt">Receipt saved</span>
              </div>
            </div>

            <!-- Card 3: Interactive Meter Telemetry & Consumption Switcher -->
            <div class="lp-bento-card lp-bento-card--meter lp-bento-float-3">
              <div class="lp-bento-meter-head">
                <div>
                  <span class="lp-bento-label">Connected Meter</span>
                  <strong class="lp-bento-meter-id">4521 7790 233</strong>
                </div>
                <div class="lp-bento-mode-tabs" role="tablist">
                  <button
                    v-for="mode in consumptionModes"
                    :key="mode.id"
                    type="button"
                    :class="['lp-bento-tab', activeConsumptionMode === mode.id && 'lp-bento-tab--active']"
                    @click="activeConsumptionMode = mode.id"
                  >
                    {{ mode.label }}
                  </button>
                </div>
              </div>

              <div class="lp-bento-consumption-active">
                <div class="lp-bento-unit-display">
                  <span class="lp-bento-label">Consumption usage</span>
                  <strong class="lp-bento-unit-val">{{ currentModeData.value }}</strong>
                </div>
                <span class="lp-bento-sub-metric">{{ currentModeData.sub }}</span>
              </div>

              <div class="lp-bento-sparkline" aria-hidden="true">
                <svg viewBox="0 0 200 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    :d="currentModeData.path"
                    stroke="oklch(70% 0.19 145)"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="lp-sparkline-path"
                  />
                  <circle cx="200" cy="4" r="4" fill="oklch(70% 0.19 145)" class="lp-sparkline-pulse" />
                  <defs>
                    <linearGradient id="sparkline-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="oklch(70% 0.19 145)"/>
                      <stop offset="100%" stop-color="oklch(70% 0.19 145)" stop-opacity="0"/>
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
          </div>
        </div>
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
