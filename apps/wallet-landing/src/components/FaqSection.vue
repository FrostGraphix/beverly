<script setup lang="ts">
import { ref } from 'vue';
import IconSvg from './IconSvg.vue';
import { FAQS } from '../content';

const open = ref<number>(0);
function toggle(i: number) {
    open.value = open.value === i ? -1 : i;
}
</script>

<template>
  <section id="faq" class="lp-section lp-faq">
    <div class="lp-section-head" v-reveal>
      <span class="lp-eyebrow">Questions</span>
      <h2 class="lp-section-title">Frequently asked.</h2>
    </div>

    <div class="lp-faq-list">
      <div
        v-for="(f, i) in FAQS"
        :key="f.q"
        :class="['lp-faq-item', open === i && 'lp-faq-item--open']"
        v-reveal="i * 50"
      >
        <button class="lp-faq-q" type="button" :aria-expanded="open === i" @click="toggle(i)">
          <span>{{ f.q }}</span>
          <span class="lp-faq-icon"><IconSvg name="arrow" /></span>
        </button>
        <div class="lp-faq-a">
          <p>{{ f.a }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
