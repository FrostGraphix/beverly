<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getWalletGreeting } from './index.js';

const props = defineProps<{
  audience: string;
  name: string;
  detail: string;
}>();

const greeting = computed(() => getWalletGreeting());
const activeIndex = ref(0);
const greetings = computed(() => [greeting.value.english, greeting.value.yoruba, greeting.value.hausa]);
const activeGreeting = computed(() => greetings.value[activeIndex.value % greetings.value.length]);
let rotateTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  rotateTimer = setInterval(() => {
    activeIndex.value = (activeIndex.value + 1) % greetings.value.length;
  }, 3000);
});

onUnmounted(() => {
  if (rotateTimer) clearInterval(rotateTimer);
});
</script>

<template>
  <section class="bw-greeting-card" aria-label="Wallet greeting">
    <Transition name="bw-greeting-slide" mode="out-in">
      <h2 :key="activeGreeting" class="bw-greeting-title">
        {{ activeGreeting }}, {{ props.name }}
        <span class="bw-greeting-hand" aria-label="waving hand">👋</span>
      </h2>
    </Transition>
  </section>
</template>
