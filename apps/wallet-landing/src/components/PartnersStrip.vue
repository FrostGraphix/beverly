<script setup lang="ts">
import { PARTNER_LOGOS } from '../content';
const doubled = [...PARTNER_LOGOS, ...PARTNER_LOGOS];
</script>

<template>
  <section class="lp-partners" aria-label="Distribution companies supported">
    <div class="lp-partners-label" v-reveal>
      Powering customers across Nigeria's leading distribution companies
    </div>
    <div class="lp-marquee-wrap" aria-hidden="true">
      <div class="lp-marquee">
        <div class="lp-marquee-track">
          <span v-for="(logo, i) in doubled" :key="i" class="lp-partner-logo">
            {{ logo.abbr }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
