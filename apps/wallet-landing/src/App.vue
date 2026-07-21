<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import BeverlyLoader from '@beverly/tokens/BeverlyLoader.vue';
import LandingNav from './components/LandingNav.vue';
import HeroSection from './components/HeroSection.vue';
import PortalChooser from './components/PortalChooser.vue';
import FeatureGrid from './components/FeatureGrid.vue';
import HowItWorks from './components/HowItWorks.vue';
import TrustSection from './components/TrustSection.vue';
import CoverageSection from './components/CoverageSection.vue';
import FaqSection from './components/FaqSection.vue';
import LandingFooter from './components/LandingFooter.vue';
import LaunchModal from './components/LaunchModal.vue';
import LegalPage from './components/LegalPage.vue';
import CompanyPage from './components/CompanyPage.vue';

// Brief branded entry screen: waits for the real window load event so it
// never outlasts actual asset loading, but holds a minimum display time so
// it never just flickers on a fast connection either.
const ready = ref(false);
const launchOpen = ref(false);
const currentHash = ref(typeof window === 'undefined' ? '#top' : window.location.hash || '#top');
let hashPoll: number | undefined;
const companyKind = computed<'about' | 'contact' | 'support' | null>(() => {
    if (currentHash.value === '#about') return 'about';
    if (currentHash.value === '#contact') return 'contact';
    if (currentHash.value === '#support') return 'support';
    return null;
});
const legalKind = computed<'privacy' | 'terms' | null>(() => {
    if (currentHash.value === '#privacy') return 'privacy';
    if (currentHash.value === '#terms') return 'terms';
    return null;
});

function syncHash() {
    currentHash.value = window.location.hash || '#top';
}

onMounted(() => {
    window.addEventListener('hashchange', syncHash);
    hashPoll = window.setInterval(syncHash, 250);

    const minDelay = new Promise<void>((resolve) => setTimeout(resolve, 700));
    const pageLoad = document.readyState === 'complete'
        ? Promise.resolve()
        : new Promise<void>((resolve) => window.addEventListener('load', () => resolve(), { once: true }));
    Promise.all([minDelay, pageLoad]).then(() => { ready.value = true; });
});
onBeforeUnmount(() => {
    window.removeEventListener('hashchange', syncHash);
    if (hashPoll !== undefined) window.clearInterval(hashPoll);
});

watch(launchOpen, (v) => {
    if (typeof document !== 'undefined') {
        document.body.style.overflow = v ? 'hidden' : '';
    }
});
</script>

<template>
  <BeverlyLoader v-if="!ready" label="Loading" />
  <div v-else class="lp-app lp-app--enter">
    <LandingNav @launch="launchOpen = true" />
    <LegalPage v-if="legalKind" :key="legalKind" :kind="legalKind" />
    <CompanyPage v-else-if="companyKind" :key="companyKind" :kind="companyKind" />
    <main v-else>
      <HeroSection @launch="launchOpen = true" />
      <PortalChooser />
      <FeatureGrid />
      <HowItWorks />
      <TrustSection />
      <CoverageSection />
      <FaqSection />
      <LandingFooter @launch="launchOpen = true" />
    </main>
    <LaunchModal :open="launchOpen" @close="launchOpen = false" />
  </div>
</template>

<style scoped>
.lp-app--enter {
  animation: lp-app-enter 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes lp-app-enter {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .lp-app--enter { animation: none; }
}
</style>
