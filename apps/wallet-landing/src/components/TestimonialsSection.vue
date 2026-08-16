<script setup lang="ts">
import { ref } from 'vue';
import { TESTIMONIALS } from '../content';

const active = ref(0);
const count = TESTIMONIALS.length;

function prev() { active.value = (active.value - 1 + count) % count; }
function next() { active.value = (active.value + 1) % count; }
</script>

<template>
  <section class="lp-testimonials" id="testimonials">
    <div class="lp-testimonials-inner">
      <div class="lp-section-eyebrow" v-reveal>What our users say</div>
      <h2 class="lp-section-title" v-reveal="60">
        Trusted by thousands<br><span class="lp-grad">across Nigeria</span>
      </h2>

      <div class="lp-tcard-wrap" v-reveal="120">
        <div class="lp-tcard-track" :style="{ transform: `translateX(calc(-${active * 100}% - ${active * 24}px))` }">
          <article
            v-for="(t, i) in TESTIMONIALS"
            :key="i"
            class="lp-tcard"
            :class="{ 'lp-tcard--active': i === active }"
          >
            <div class="lp-tcard-stars">
              <span v-for="n in t.rating" :key="n" class="lp-star">★</span>
            </div>
            <blockquote class="lp-tcard-body">"{{ t.body }}"</blockquote>
            <div class="lp-tcard-author">
              <span class="lp-tcard-avatar">{{ t.avatar }}</span>
              <div>
                <p class="lp-tcard-name">{{ t.name }}</p>
                <p class="lp-tcard-role">{{ t.role }}</p>
              </div>
            </div>
          </article>
        </div>
      </div>

      <div class="lp-tcard-nav" v-reveal="160">
        <button class="lp-tcard-btn" type="button" :disabled="active === 0" @click="prev" aria-label="Previous testimonial">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="lp-tcard-dots">
          <button
            v-for="(_, i) in TESTIMONIALS"
            :key="i"
            class="lp-tcard-dot"
            :class="{ 'lp-tcard-dot--active': i === active }"
            type="button"
            :aria-label="`Testimonial ${i + 1}`"
            @click="active = i"
          />
        </div>
        <button class="lp-tcard-btn" type="button" :disabled="active === count - 1" @click="next" aria-label="Next testimonial">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  </section>
</template>
