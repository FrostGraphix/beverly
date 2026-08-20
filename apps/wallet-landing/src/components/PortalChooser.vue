<script setup lang="ts">
import { ref, onMounted } from 'vue';
import IconSvg from './IconSvg.vue';
import { PORTAL_CARDS } from '../content';
import { PORTAL_URLS } from '../portals';

const hasCustomerSession = ref(false);
const hasVendorSession = ref(false);
const hasStaffSession = ref(false);

onMounted(() => {
    try {
        hasCustomerSession.value = !!(
            localStorage.getItem('beverly.customer.access_token') ||
            sessionStorage.getItem('beverly.customer.access_token') ||
            localStorage.getItem('beverly.access_token') ||
            sessionStorage.getItem('beverly.access_token')
        );
        hasVendorSession.value = !!(
            localStorage.getItem('beverly.vendor.access_token') ||
            sessionStorage.getItem('beverly.vendor.access_token')
        );
        hasStaffSession.value = !!(
            localStorage.getItem('beverly.staff.access_token') ||
            sessionStorage.getItem('beverly.staff.access_token')
        );
    } catch { /* noop */ }
});

function getPrimaryHref(key: 'customer' | 'vendor', fallback: string): string {
    if (hasStaffSession.value) return PORTAL_URLS.admin;
    if (key === 'customer' && hasCustomerSession.value) return PORTAL_URLS.customer;
    if (key === 'vendor' && hasVendorSession.value) return PORTAL_URLS.vendor;
    return fallback;
}

function getPrimaryLabel(key: 'customer' | 'vendor', fallback: string): string {
    if (hasStaffSession.value) return 'Open Admin CRM';
    if (key === 'customer' && hasCustomerSession.value) return 'Open Customer Dashboard';
    if (key === 'vendor' && hasVendorSession.value) return 'Open Vendor Dashboard';
    return fallback;
}
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

    <div v-if="hasStaffSession" class="lp-session-banner" style="margin-bottom: 24px; padding: 12px 18px; border-radius: 12px; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); text-align: center;">
      <strong style="color: #15803d; font-size: 14px;">👑 Staff Session Active</strong>
      <span style="margin: 0 8px; color: #475569;">|</span>
      <a :href="PORTAL_URLS.admin" style="font-weight: 600; color: #15803d; text-decoration: underline;">Launch Admin CRM Workspace &rarr;</a>
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
          <a class="lp-btn lp-btn--primary lp-btn--block" :href="getPrimaryHref(p.key, p.primaryHref)">
            {{ getPrimaryLabel(p.key, p.primaryLabel) }} <IconSvg name="arrow" />
          </a>
          <a class="lp-btn lp-btn--ghost lp-btn--block" :href="p.secondaryHref">{{ p.secondaryLabel }}</a>
        </div>
      </article>
    </div>
  </section>
</template>

