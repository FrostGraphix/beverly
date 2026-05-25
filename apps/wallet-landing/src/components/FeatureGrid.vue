<script setup lang="ts">
import IconSvg from './IconSvg.vue';
import { FEATURES } from '../content';
</script>

<template>
  <section id="features" class="lp-section">
    <div class="lp-section-head" v-reveal>
      <span class="lp-eyebrow">Why Beverly</span>
      <h2 class="lp-section-title">Built for speed, trust, and scale.</h2>
      <p class="lp-section-sub">Everything you need to buy or sell power, with none of the friction.</p>
    </div>

    <div class="lp-feature-grid">
      <article v-for="(f, i) in FEATURES" :key="f.title" class="lp-feature" v-reveal="(i % 3) * 90">
        <span class="lp-feature-ic"><IconSvg :name="f.icon" /></span>
        <h3>{{ f.title }}</h3>
        <p>{{ f.body }}</p>
      </article>
    </div>
  </section>
</template>
