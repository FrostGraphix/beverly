<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { toggleTheme } from '@beverly/tokens';
import IconSvg from './IconSvg.vue';
import { PORTALS } from '../content';

const emit = defineEmits<{ (e: 'launch'): void }>();

const scrolled = ref(false);
const menuOpen = ref(false);
const isDark = ref(true);
const activeSection = ref('');

const NAV_LINKS = [
    { id: 'how',      label: 'How it works' },
    { id: 'features', label: 'Features' },
    { id: 'portals',  label: 'Portals' },
    { id: 'faq',      label: 'FAQ' },
] as const;

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

let observer: IntersectionObserver | null = null;

onMounted(() => {
    onScroll();
    isDark.value = document.documentElement.getAttribute('data-theme') !== 'light';
    window.addEventListener('scroll', onScroll, { passive: true });

    // Track which section is in the centre of the viewport
    observer = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    activeSection.value = entry.target.id;
                }
            }
        },
        { rootMargin: '-20% 0px -55% 0px', threshold: 0 },
    );
    NAV_LINKS.forEach(({ id }) => {
        const el = document.getElementById(id);
        if (el) observer?.observe(el);
    });
});

onBeforeUnmount(() => {
    window.removeEventListener('scroll', onScroll);
    observer?.disconnect();
});
</script>

<template>
  <header :class="['lp-nav', scrolled && 'lp-nav--solid', menuOpen && 'lp-nav--open']">
    <div class="lp-nav-inner">
      <a class="lp-brand" href="#top" @click.prevent="go('top')">
        <span class="lp-brand-mark">
          <IconSvg name="bolt" />
        </span>
        <span class="lp-brand-text">Beverly<em>Wallet</em></span>
      </a>

      <nav class="lp-nav-links" aria-label="Page sections">
        <button
          v-for="link in NAV_LINKS"
          :key="link.id"
          type="button"
          :class="['lp-nav-link', activeSection === link.id && 'lp-nav-link--active']"
          @click="go(link.id)"
        >
          {{ link.label }}
        </button>
      </nav>

      <div class="lp-nav-actions">
        <button
          class="lp-icon-toggle"
          type="button"
          :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="onTheme"
        >
          <IconSvg :name="isDark ? 'sun' : 'moon'" />
        </button>
        <a class="lp-btn lp-btn--ghost lp-nav-signin" :href="PORTALS.customer.login">Customer sign in</a>
        <a class="lp-btn lp-btn--ghost lp-nav-signin" :href="PORTALS.vendor.login">Vendor sign in</a>
        <button class="lp-btn lp-btn--primary lp-nav-cta" type="button" @click="emit('launch')">
          Get started <IconSvg name="arrow" />
        </button>
        <button
          class="lp-burger"
          type="button"
          :aria-label="menuOpen ? 'Close menu' : 'Open menu'"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen"
        >
          <span /><span /><span />
        </button>
      </div>
    </div>

    <transition name="lp-fade">
      <div v-if="menuOpen" class="lp-mobile-menu">
        <button
          v-for="link in NAV_LINKS"
          :key="link.id"
          type="button"
          @click="go(link.id)"
        >
          {{ link.label }}
        </button>
        <button class="lp-btn lp-btn--primary" type="button" @click="menuOpen = false; emit('launch')">
          Get started <IconSvg name="arrow" />
        </button>
      </div>
    </transition>
  </header>
</template>
