<script setup lang="ts">
import { ref, watch } from 'vue';
import LandingNav from './components/LandingNav.vue';
import HeroSection from './components/HeroSection.vue';
import PortalChooser from './components/PortalChooser.vue';
import FeatureGrid from './components/FeatureGrid.vue';
import HowItWorks from './components/HowItWorks.vue';
import TrustSection from './components/TrustSection.vue';
import FaqSection from './components/FaqSection.vue';
import LandingFooter from './components/LandingFooter.vue';
import LaunchModal from './components/LaunchModal.vue';

const launchOpen = ref(false);

watch(launchOpen, (v) => {
    if (typeof document !== 'undefined') {
        document.body.style.overflow = v ? 'hidden' : '';
    }
});
</script>

<template>
  <div class="lp-app">
    <LandingNav @launch="launchOpen = true" />
    <main>
      <HeroSection @launch="launchOpen = true" />
      <PortalChooser />
      <FeatureGrid />
      <HowItWorks />
      <TrustSection />
      <FaqSection />
      <LandingFooter @launch="launchOpen = true" />
    </main>
    <LaunchModal :open="launchOpen" @close="launchOpen = false" />
  </div>
</template>
