<script setup lang="ts">
import IconSvg from './IconSvg.vue';

const points = [
    { icon: 'lock', title: 'Encrypted end to end', body: 'Sensitive data is encrypted at rest and in transit. We never store your raw card details.' },
    { icon: 'shield', title: 'PCI-compliant payments', body: 'Card payments are processed by certified, audited payment providers.' },
    { icon: 'user', title: 'MFA on every account', body: 'Add an extra layer with one-time codes — for customers and vendors alike.' },
    { icon: 'clock', title: 'Session protection', body: 'Idle and absolute session limits log you out automatically to keep accounts safe.' },
];
</script>

<template>
  <section class="lp-section lp-trust">
    <div class="lp-trust-inner">
      <div class="lp-trust-copy" v-reveal>
        <span class="lp-eyebrow">Security first</span>
        <h2 class="lp-section-title">Your money &amp; data, protected.</h2>
        <p class="lp-section-sub">
          Beverly is built to financial-grade standards so you can buy and sell power with total peace of mind.
        </p>
        <div class="lp-trust-badges">
          <span class="lp-badge-chip"><IconSvg name="lock" /> AES-256</span>
          <span class="lp-badge-chip"><IconSvg name="shield" /> PCI-DSS</span>
          <span class="lp-badge-chip"><IconSvg name="globe" /> 99.9% uptime</span>
        </div>
      </div>

      <div class="lp-trust-grid">
        <article v-for="(p, i) in points" :key="p.title" class="lp-trust-card" v-reveal="i * 80">
          <span class="lp-trust-ic"><IconSvg :name="p.icon" /></span>
          <h3>{{ p.title }}</h3>
          <p>{{ p.body }}</p>
        </article>
      </div>
    </div>
  </section>
</template>
