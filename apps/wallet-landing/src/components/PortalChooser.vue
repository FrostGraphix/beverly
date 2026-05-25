<script setup lang="ts">
import IconSvg from './IconSvg.vue';
import { PORTAL_CARDS } from '../content';
</script>

<template>
  <section id="portals" class="lp-section lp-portals">
    <div class="lp-section-head" v-reveal>
      <span class="lp-eyebrow">Choose your path</span>
      <h2 class="lp-section-title">Two portals. One powerful platform.</h2>
      <p class="lp-section-sub">
        Whether you're powering your home or building a vending business, there's a door for you.
      </p>
    </div>

    <div class="lp-portal-grid">
      <article
        v-for="(p, i) in PORTAL_CARDS"
        :key="p.key"
        :class="['lp-portal-card', `lp-portal-card--${p.accent}`]"
        v-reveal="i * 100"
      >
        <div class="lp-portal-glow" aria-hidden="true" />
        <span class="lp-portal-eyebrow">{{ p.eyebrow }}</span>
        <h3 class="lp-portal-title">{{ p.title }}</h3>
        <p class="lp-portal-tagline">{{ p.tagline }}</p>

        <ul class="lp-portal-bullets">
          <li v-for="b in p.bullets" :key="b.text">
            <span class="lp-portal-bullet-ic"><IconSvg :name="b.icon" /></span>
            {{ b.text }}
          </li>
        </ul>

        <div class="lp-portal-actions">
          <a class="lp-btn lp-btn--primary lp-btn--block" :href="p.primaryHref">
            {{ p.primaryLabel }} <IconSvg name="arrow" />
          </a>
          <a class="lp-btn lp-btn--ghost lp-btn--block" :href="p.secondaryHref">{{ p.secondaryLabel }}</a>
        </div>
      </article>
    </div>
  </section>
</template>
