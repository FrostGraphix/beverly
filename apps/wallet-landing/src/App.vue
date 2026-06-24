<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
  <div class="lp-app">
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
