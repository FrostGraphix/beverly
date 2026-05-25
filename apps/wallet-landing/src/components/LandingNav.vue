<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { toggleTheme } from '@beverly/tokens';
import IconSvg from './IconSvg.vue';
import { PORTALS } from '../content';

const emit = defineEmits<{ (e: 'launch'): void }>();

const scrolled = ref(false);
const menuOpen = ref(false);
const isDark = ref(true);

function onScroll() {
    scrolled.value = window.scrollY > 12;
}
function onTheme() {
    toggleTheme();
    isDark.value = document.documentElement.getAttribute('data-theme') !== 'light';
}
function go(id: string) {
    menuOpen.value = false;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

onMounted(() => {
    onScroll();
    isDark.value = document.documentElement.getAttribute('data-theme') !== 'light';
    window.addEventListener('scroll', onScroll, { passive: true });
});
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll));
</script>

<template>
  <header :class="['lp-nav', scrolled && 'lp-nav--solid']">
    <div class="lp-nav-inner">
      <a class="lp-brand" href="#top" @click.prevent="go('top')">
        <span class="lp-brand-mark"><IconSvg name="bolt" /></span>
        <span class="lp-brand-text">Beverly<em>Wallet</em></span>
      </a>

      <nav class="lp-nav-links">
        <button type="button" @click="go('how')">How it works</button>
        <button type="button" @click="go('features')">Features</button>
        <button type="button" @click="go('portals')">Portals</button>
        <button type="button" @click="go('faq')">FAQ</button>
      </nav>

      <div class="lp-nav-actions">
        <button class="lp-icon-toggle" type="button" :aria-label="isDark ? 'Switch to light' : 'Switch to dark'" @click="onTheme">
          <IconSvg :name="isDark ? 'sun' : 'moon'" />
        </button>
        <a class="lp-btn lp-btn--ghost lp-nav-signin" :href="PORTALS.customer.login">Sign in</a>
        <button class="lp-icon-toggle lp-icon-toggle--primary lp-nav-launch" type="button" aria-label="Get started" title="Get started" @click="emit('launch')">
          <IconSvg name="user" />
        </button>
        <button class="lp-burger" type="button" aria-label="Menu" @click="menuOpen = !menuOpen">
          <span /><span /><span />
        </button>
      </div>
    </div>

    <transition name="lp-fade">
      <div v-if="menuOpen" class="lp-mobile-menu">
        <button type="button" @click="go('how')">How it works</button>
        <button type="button" @click="go('features')">Features</button>
        <button type="button" @click="go('portals')">Portals</button>
        <button type="button" @click="go('faq')">FAQ</button>
        <a class="lp-btn lp-btn--ghost" :href="PORTALS.customer.login">Sign in</a>
        <button class="lp-btn lp-btn--primary" type="button" @click="menuOpen = false; emit('launch')">Get started</button>
      </div>
    </transition>
  </header>
</template>
