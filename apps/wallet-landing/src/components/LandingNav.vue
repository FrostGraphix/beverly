<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { toggleTheme } from '@beverly/tokens';
import { useI18n } from '@beverly/tokens/i18n.js';
import LanguageSwitcher from '@beverly/tokens/LanguageSwitcher.vue';
import IconSvg from './IconSvg.vue';
import { PORTALS } from '../content';

const emit = defineEmits<{ (e: 'launch'): void }>();

const scrolled = ref(false);
const menuOpen = ref(false);
const isDark = ref(true);
const activeSection = ref('');
const { t } = useI18n();

const NAV_LINKS = [
    { id: 'how',      labelKey: 'landing.nav.how' },
    { id: 'features', labelKey: 'landing.nav.features' },
    { id: 'portals',  labelKey: 'landing.nav.portals' },
    { id: 'faq',      labelKey: 'landing.nav.faq' },
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

      <nav class="lp-nav-links" :aria-label="t('landing.nav.sections')">
        <button
          v-for="link in NAV_LINKS"
          :key="link.id"
          type="button"
          :class="['lp-nav-link', activeSection === link.id && 'lp-nav-link--active']"
          @click="go(link.id)"
        >
          {{ t(link.labelKey) }}
        </button>
      </nav>

      <div class="lp-nav-actions">
        <LanguageSwitcher compact />
        <button
          class="lp-icon-toggle"
          type="button"
          :aria-label="isDark ? t('landing.nav.lightMode') : t('landing.nav.darkMode')"
          @click="onTheme"
        >
          <IconSvg :name="isDark ? 'sun' : 'moon'" />
        </button>
        <button class="lp-btn lp-btn--primary lp-nav-cta" type="button" @click="emit('launch')">
          {{ t('common.getStarted') }} <IconSvg name="arrow" />
        </button>
        <button
          class="lp-burger"
          type="button"
          :aria-label="menuOpen ? t('common.closeMenu') : t('common.openMenu')"
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
          {{ t(link.labelKey) }}
        </button>
        <button class="lp-btn lp-btn--primary" type="button" @click="menuOpen = false; emit('launch')">
          {{ t('common.getStarted') }} <IconSvg name="arrow" />
        </button>
      </div>
    </transition>
  </header>
</template>
