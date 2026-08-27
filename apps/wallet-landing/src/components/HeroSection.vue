<script setup lang="ts">
import { ref, computed } from 'vue';
import IconSvg from './IconSvg.vue';
import { PORTALS, STATS } from '../content';
import { useI18n } from '@beverly/tokens/i18n.js';

defineEmits<{ (e: 'launch'): void }>();

// Interactive Consumption Usage Modes
const activeConsumptionMode = ref<'hourly' | 'daily' | 'live'>('hourly');
const tokenCopied = ref(false);
const { t } = useI18n();

const consumptionModes = [
  { id: 'hourly', labelKey: 'landing.demo.hourly', value: '68.4 kWh', subKey: 'landing.demo.peakLoad', path: 'M0 32 L30 25 L60 28 L90 14 L120 18 L150 8 L180 12 L200 4' },
  { id: 'daily',  labelKey: 'landing.demo.daily',  value: '412.8 kWh', subKey: 'landing.demo.averageDaily', path: 'M0 28 L30 22 L60 16 L90 20 L120 10 L150 14 L180 6 L200 8' },
  { id: 'live',   labelKey: 'landing.demo.liveKw', value: '2.45 kW',   subKey: 'landing.demo.threePhase', path: 'M0 35 L30 30 L60 12 L90 26 L120 8 L150 22 L180 5 L200 12' },
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

    <div class="lp-hero-inner lp-hero-inner--showcase">
      <div class="lp-hero-copy lp-hero-copy--poster">
        <span class="lp-pill" v-reveal="150">
          <span class="lp-pill-dot" /> {{ t('landing.hero.eyebrow') }}
        </span>

        <!-- Cinema clip-reveal title -->
        <h1 class="lp-hero-title" :aria-label="`${t('landing.hero.titlePrimary')} ${t('landing.hero.titleAccent')}`">
          <span class="lp-title-clip">
            <span class="lp-title-word lp-title-word--1">{{ t('landing.hero.titlePrimary') }}</span>
          </span>
          <span class="lp-title-clip lp-title-clip--grad">
            <span class="lp-title-word lp-title-word--2">
              <span class="lp-grad lp-grad--live">{{ t('landing.hero.titleAccent') }}</span>
            </span>
          </span>
        </h1>

        <p class="lp-hero-sub" v-reveal="380">
          {{ t('landing.hero.subtitle') }}
        </p>

        <div class="lp-hero-cta" v-reveal="480">
          <button class="lp-btn lp-btn--primary lp-btn--lg" type="button" @click="$emit('launch')">
            {{ t('landing.hero.customerCta') }} <IconSvg name="arrow" />
          </button>
          <a class="lp-btn lp-btn--glass lp-btn--lg" :href="PORTALS.vendor.login">
            <IconSvg name="store" /> {{ t('landing.hero.vendorCta') }}
          </a>
        </div>

        <ul class="lp-hero-trust" v-reveal="600">
          <li><IconSvg name="check" /> {{ t('landing.hero.trustOne') }}</li>
          <li><IconSvg name="check" /> {{ t('landing.hero.trustTwo') }}</li>
          <li><IconSvg name="check" /> {{ t('landing.hero.trustThree') }}</li>
        </ul>
      </div>

      <!-- Supercharged Floating & Spinning 3D Bento Grid Showcase -->
      <div class="lp-hero-art lp-hero-art--bento">
        <div class="lp-bento-orbit-stage">
          <div
            class="lp-bento-grid lp-bento-grid--3d"
            :style="{ transform: `rotateX(${tiltX}deg) rotateY(${tiltY}deg)` }"
          >
            <!-- Card 1: Balance & Live Status -->
            <div class="lp-bento-card lp-bento-card--balance lp-bento-float-1">
              <div class="lp-bento-head">
                <div class="lp-bento-brand">
                  <span class="lp-bento-icon"><IconSvg name="bolt" /></span>
                  <span>Beverly Wallet</span>
                </div>
                <span class="lp-bento-badge"><span class="lp-pill-dot" /> {{ t('landing.demo.live') }}</span>
              </div>
              <div class="lp-bento-body">
                <span class="lp-bento-label">{{ t('landing.demo.balance') }}</span>
                <strong class="lp-bento-amount">₦24,500.00</strong>
                <div class="lp-bento-sub">+₦5,000 · {{ t('landing.demo.funded') }}</div>
              </div>
            </div>

            <!-- Card 2: Instant 20-Digit STS Token Delivery -->
            <div class="lp-bento-card lp-bento-card--token lp-bento-float-2">
              <div class="lp-bento-head">
                <span class="lp-bento-tag"><IconSvg name="check" /> {{ t('landing.demo.tokenReady') }}</span>
                <small><IconSvg name="clock" /> {{ t('landing.demo.paymentConfirmed') }}</small>
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
                  <span>{{ tokenCopied ? t('landing.demo.copied') : t('landing.demo.copyToken') }}</span>
                </button>
                <span class="lp-bento-receipt">{{ t('landing.demo.receiptSaved') }}</span>
              </div>
            </div>

            <!-- Card 3: Interactive Meter Telemetry & Consumption Switcher -->
            <div class="lp-bento-card lp-bento-card--meter lp-bento-float-3">
              <div class="lp-bento-meter-head">
                <div>
                  <span class="lp-bento-label">{{ t('landing.demo.connectedMeter') }}</span>
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
                    {{ t(mode.labelKey) }}
                  </button>
                </div>
              </div>

              <div class="lp-bento-consumption-active">
                <div class="lp-bento-unit-display">
                  <span class="lp-bento-label">{{ t('landing.demo.consumption') }}</span>
                  <strong class="lp-bento-unit-val">{{ currentModeData.value }}</strong>
                </div>
                <span class="lp-bento-sub-metric">{{ t(currentModeData.subKey) }}</span>
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
        <span>{{ t(s.label) }}</span>
      </div>
    </div>
  </section>
</template>
