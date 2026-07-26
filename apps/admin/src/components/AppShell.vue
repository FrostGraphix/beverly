<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { useStaffAuthStore } from '../stores/auth';
import { toggleTheme } from '@beverly/tokens';

defineProps<{ title?: string }>();

const auth = useStaffAuthStore();
const router = useRouter();
const drawerOpen = ref(false);
const userMenuOpen = ref(false);
const signingOut = ref(false);
const accountMenuWrap = ref<HTMLElement | null>(null);
const navGroups = computed(() => [
    {
        label: 'Overview',
        items: [
            { to: '/', text: 'Dashboard', permission: 'wallet.dashboard.view', icon: 'dashboard' },
            { to: '/reports', text: 'Reports', permission: 'wallet.dashboard.view', icon: 'reports' },
        ],
    },
    {
        label: 'Vendors',
        items: [
            { to: '/applications', text: 'Applications', permission: 'wallet.vendors.review', icon: 'applications' },
            { to: '/vendors', text: 'Vendors', permission: 'wallet.vendors.review', icon: 'vendors' },
            { to: '/vendors/analytics', text: 'Vendor Analytics', permission: 'wallet.vendors.review', icon: 'vendor-analytics' },
            { to: '/customers', text: 'Customers', permission: 'wallet.customers.view', icon: 'customers' },
        ],
    },
    {
        label: 'Money',
        items: [
            { to: '/funding', text: 'Funding', permission: 'wallet.funding.view', icon: 'funding' },
            { to: '/funding/history', text: 'Funding History', permission: 'wallet.funding.view', icon: 'history' },
            { to: '/wallets', text: 'Wallets', permission: 'wallet.funding.view', icon: 'wallets' },
            { to: '/purchases', text: 'Purchases', permission: 'wallet.vending.monitor', icon: 'purchases' },
            { to: '/vending', text: 'Vending Monitor', permission: 'wallet.vending.monitor', icon: 'vending' },
        ],
    },
    {
        label: 'Field Ops',
        items: [
            { to: '/meter-orders', text: 'Meter Orders', permission: 'wallet.vendors.review', icon: 'meter' },
        ],
    },
    {
        label: 'Operations',
        items: [
            { to: '/disputes', text: 'Disputes', permission: 'wallet.disputes.manage', icon: 'disputes' },
            { to: '/support', text: 'Support Desk', permission: 'wallet.support.manage', icon: 'support' },
            { to: '/announcements', text: 'Announcements', permission: 'wallet.announcements.manage', icon: 'announcements' },
            { to: '/refunds', text: 'Refunds', permission: 'wallet.refunds.manage', icon: 'refunds' },
            { to: '/settlement', text: 'Settlement', permission: 'wallet.settlement.view', icon: 'settlement' },
            { to: '/reconciliation', text: 'Reconciliation', permission: 'wallet.reconciliation.run', icon: 'reconciliation' },
        ],
    },
    {
        label: 'Analytics',
        items: [
            { to: '/consumption', text: 'Consumption', permission: 'wallet.consumption.view', icon: 'consumption' },
        ],
    },
    {
        label: 'Launch',
        items: [
            { to: '/feature-flags', text: 'Feature Flags', permission: 'wallet.flags.manage', icon: 'flags' },
            { to: '/privacy', text: 'NDPR / Privacy', permission: 'wallet.privacy.review', icon: 'privacy' },
        ],
    },
    {
        label: 'Compliance',
        items: [
            { to: '/fraud', text: 'Fraud Review', permission: 'wallet.fraud.review', icon: 'fraud' },
            { to: '/audit', text: 'Audit Log', permission: 'wallet.audit.view', icon: 'audit' },
        ],
    },
    {
        label: 'Access',
        items: [
            { to: '/roles', text: 'Roles & Team', permission: 'wallet.access.manage', icon: 'roles' },
            { to: '/permissions', text: 'Permissions', permission: 'wallet.access.manage', icon: 'permissions' },
        ],
    },
    {
        label: 'Developer',
        items: [
            { to: '/dev/api-keys', text: 'API Keys', permission: 'dev.console', icon: 'dev-api-keys' },
            { to: '/dev/webhooks', text: 'Webhooks', permission: 'dev.console', icon: 'dev-webhooks' },
            { to: '/dev/api-log', text: 'API Log', permission: 'dev.console', icon: 'dev-api-log' },
            { to: '/dev/sandbox', text: 'Sandbox', permission: 'dev.console', icon: 'dev-sandbox' },
            { to: '/dev/service-health', text: 'Service Health', permission: 'dev.console', icon: 'dev-health' },
            { to: '/dev/queue-monitor', text: 'Queue Monitor', permission: 'dev.console', icon: 'dev-queue' },
            { to: '/dev/error-explorer', text: 'Error Explorer', permission: 'dev.console', icon: 'dev-errors' },
            { to: '/dev/toolkit', text: 'Dev Toolkit', permission: 'dev.console', icon: 'dev-toolkit' },
            { to: '/dev/sys-config', text: 'Sys Config', permission: 'dev.console', icon: 'dev-config' },
            { to: '/dev/schema', text: 'Schema & Matrix', permission: 'dev.console', icon: 'dev-schema' },
        ],
    },
].map((group) => ({
    ...group,
    items: group.items.filter((item) => auth.hasPermission(item.permission)),
})).filter((group) => group.items.length));

const initials = computed(() => {
    const n = auth.user?.full_name ?? auth.user?.email ?? 'ST';
    return n.slice(0, 2).toUpperCase();
});
const profilePictureUrl = computed(() => auth.user?.profile_picture_url?.trim() || '');
const isSuperAdmin = computed(() => auth.user?.role === 'super-admin');
const displayName = computed(() => auth.user?.full_name || auth.user?.email || 'Administrator');
const currentUserFirstName = computed(() => {
    const raw = auth.user?.full_name || auth.user?.email || 'Beverly';
    const name = raw.split(/[\s@.]+/)[0] || 'Beverly';
    return name.charAt(0).toUpperCase() + name.slice(1);
});
const roleLabel = computed(() => (auth.user?.role || 'admin').replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()));

const navIconPath: Record<string, string> = {
    dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
    reports: 'M3 3v18h18M7 15l4-4 3 3 5-6',
    applications: 'M14 2H6v20h12V8zM14 2v6h6M9 13h6M9 17h6',
    vendors: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8',
    customers: 'M12 12a4 4 0 100-8 4 4 0 000 8M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1',
    funding: 'M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
    history: 'M12 8v4l3 3M12 21a9 9 0 100-18 9 9 0 000 18',
    wallets: 'M2 6h20v14H2zM2 10h20M16 14h2',
    purchases: 'M3 17l6-6 4 4 8-8M14 7h7v7',
    vending: 'M5 12h14M12 5l7 7-7 7',
    meter: 'M12 21a9 9 0 100-18 9 9 0 000 18M12 7v5l3 2',
    disputes: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
    support: 'M12 21a9 9 0 100-18 9 9 0 000 18M9.1 9a3 3 0 015.8 1c0 2-3 2.5-3 4M12 17h.01',
    announcements: 'M3 11v2a4 4 0 004 4h1l4 4v-4h5a4 4 0 004-4v-2M7 7h10M7 11h7',
    refunds: 'M3 12h18M3 12l4-4M3 12l4 4M21 6v12',
    settlement: 'M2 5h20v14H2zM2 10h20',
    reconciliation: 'M9 11l3 3L22 4M21 12v7H3V5h13',
    flags: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
    privacy: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
    fraud: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    audit: 'M3 11h18v11H3zM7 11V7a5 5 0 0110 0v4',
    roles: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M22 21v-2a4 4 0 00-3-3.87',
    permissions: 'M3 11h18v11H3zM7 11V7a5 5 0 0110 0v4',
    consumption: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
    'vendor-analytics': 'M3 3v18h18M7 16l4-5 4 3 5-7',
    // Developer Console
    'dev-api-keys': 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4',
    'dev-webhooks': 'M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3',
    'dev-api-log':  'M14 2H6v20h12V8zM14 2v6h6M8 13h8M8 17h5',
    'dev-sandbox':  'M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zM9 9l6 3-6 3V9z',
    'dev-health':   'M22 12h-4l-3 9L9 3l-3 9H2',
    'dev-queue':    'M3 6h18M3 12h18M3 18h18',
    'dev-errors':   'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
    'dev-toolkit':  'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
    'dev-config':   'M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.36.44.68.91 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    'dev-schema':   'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
};

const defaultCrmBaseUrl = import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:9311`
    : 'https://acob-beverly.vercel.app';

function toCrmUrl(baseUrl: string) {
    const [urlWithoutHash] = baseUrl.split('#');
    return `${urlWithoutHash.replace(/\/+$/, '')}/`;
}

const CRM_URL = toCrmUrl(import.meta.env.VITE_CRM_URL ?? defaultCrmBaseUrl);

function openDrawer()  { drawerOpen.value = true; }
function closeDrawer() { drawerOpen.value = false; }
function toggleUserMenu() { userMenuOpen.value = !userMenuOpen.value; }
function closeUserMenu() { userMenuOpen.value = false; }

function handleDocumentPointerDown(event: PointerEvent) {
    if (!accountMenuWrap.value?.contains(event.target as Node)) closeUserMenu();
}

function openProfile() {
    closeUserMenu();
    void router.push('/profile');
}

function openSettings() {
    closeUserMenu();
    void router.push('/settings');
}

function openSecurity() {
    closeUserMenu();
    void router.push('/security');
}

async function signOut() {
    if (signingOut.value) return;
    signingOut.value = true;
    closeUserMenu();
    closeDrawer();
    try {
        auth.logout();
        await router.push('/login');
    } finally {
        signingOut.value = false;
    }
}

onMounted(() => document.addEventListener('pointerdown', handleDocumentPointerDown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', handleDocumentPointerDown));
</script>

<template>
  <div class="bw-shell">
    <!-- Mobile scrim -->
    <div :class="['bw-scrim', { open: drawerOpen }]" @click="closeDrawer" />

    <!-- Sidebar -->
    <aside :class="['bw-sidebar', { open: drawerOpen }]">
      <div class="bw-brand">
        <div class="bw-mark" aria-hidden="true"></div>
        <div class="bw-brand-text">
          <strong>Beverly</strong>
          <span>Wallet Admin</span>
        </div>
      </div>

      <nav class="bw-nav">
        <template v-for="group in navGroups" :key="group.label">
          <div v-if="group.label === 'Developer'" class="bw-nav-dev-divider" />
          <div :class="['bw-nav-section', { 'bw-nav-section-dev': group.label === 'Developer' }]">
            {{ group.label }}
            <span v-if="group.label === 'Developer'" class="bw-nav-dev-badge">DEV</span>
          </div>
          <RouterLink v-for="item in group.items" :key="item.to" :to="item.to" class="bw-nav-item" @click="closeDrawer">
            <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path :d="navIconPath[item.icon]" />
            </svg>
            {{ item.text }}
          </RouterLink>
        </template>
      </nav>

      <footer v-if="isSuperAdmin" class="bw-sidebar-foot">
        <a :href="CRM_URL" class="bw-back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to CRM
        </a>
        <div class="sidebar-account-card">
          <div class="sidebar-avatar" aria-hidden="true">
            <img v-if="profilePictureUrl" :src="profilePictureUrl" alt="" />
            <span v-else>{{ initials }}</span>
          </div>
          <div class="sidebar-account-meta">
            <strong>{{ displayName }}</strong>
            <span>{{ roleLabel }}</span>
          </div>
          <button type="button" class="bw-btn sidebar-signout" :disabled="signingOut" @click="signOut">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            <span>{{ signingOut ? 'Signing out...' : 'Sign out' }}</span>
          </button>
        </div>
      </footer>
    </aside>

    <!-- Main column -->
    <div :class="['bw-main-col', { 'bw-main-col--menu-open': userMenuOpen }]">
      <header class="bw-topbar">
        <button class="bw-hamburger" @click="openDrawer" aria-label="Open menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>

        <div class="bw-crumb">
          <strong>{{ title || 'Dashboard' }}</strong>
        </div>

        <span class="bw-spacer" />

        <slot name="topbar-end" />

        <!-- Theme toggle -->
        <button class="bw-icon-btn" @click="toggleTheme" title="Toggle theme" style="border: none">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        </button>

        <!-- User chip -->
        <div class="bw-account-menu" ref="accountMenuWrap">
          <button
            type="button"
            class="bw-user-chip bw-user-chip-btn"
            :aria-label="`User menu for ${displayName}`"
            aria-haspopup="menu"
            :aria-expanded="userMenuOpen"
            @click="toggleUserMenu"
          >
            <div class="bw-avatar green" style="overflow:hidden">
              <img v-if="profilePictureUrl" :src="profilePictureUrl" alt="Staff profile" style="width:100%; height:100%; object-fit:cover" />
              <span v-else class="bw-user-dropdown-logo bw-avatar-brand-logo" aria-hidden="true"></span>
            </div>
            <div class="bw-user-meta">
              <strong>{{ currentUserFirstName }}</strong>
              <span>{{ roleLabel }}</span>
            </div>
            <svg class="bw-user-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          <transition name="bw-menu">
            <div v-show="userMenuOpen" class="bw-user-dropdown" role="menu" aria-label="Beverly admin account menu">
              <div class="bw-user-dropdown-brand">
                <span class="bw-user-dropdown-logo" aria-hidden="true"></span>
                <span>
                  <strong>Beverly</strong>
                  <small>{{ displayName }} - {{ roleLabel }}</small>
                </span>
              </div>
              <button type="button" class="bw-user-menu-item" role="menuitem" @click="openProfile">
                <svg class="bw-user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path d="M20 21a8 8 0 0 0-16 0" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span>Profile</span>
              </button>
              <button type="button" class="bw-user-menu-item" role="menuitem" @click="openSecurity">
                <svg class="bw-user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>Security &amp; 2FA</span>
              </button>
              <button type="button" class="bw-user-menu-item" role="menuitem" @click="openSettings">
                <svg class="bw-user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z" />
                  <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .92V20a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-.92 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.92-1H4a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 .92-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.92V4a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 .92 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.13.36.43.69.92 1H20a2 2 0 1 1 0 4h-.09c-.49.31-.79.64-.51 1z" />
                </svg>
                <span>Settings</span>
              </button>
              <button type="button" class="bw-user-menu-item" role="menuitem" @click="toggleTheme">
                <svg class="bw-user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path d="M12 21C7 16 5 11 6 5c6-1 11 1 13 6-4 1-7 4-9 8" />
                  <path d="M6 19c3-5 7-8 13-8" />
                </svg>
                <span>Theme</span>
              </button>
              <div v-if="isSuperAdmin" class="bw-user-menu-separator"></div>
              <a v-if="isSuperAdmin" :href="CRM_URL" class="bw-user-menu-item" role="menuitem" @click="closeUserMenu">
                <svg class="bw-user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path d="M19 12H5" />
                  <path d="m12 19-7-7 7-7" />
                </svg>
                <span>Back to CRM</span>
              </a>
              <button type="button" class="bw-user-menu-item bw-user-menu-item--danger" role="menuitem" @click="signOut">
                <svg class="bw-user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="m16 17 5-5-5-5" />
                  <path d="M21 12H9" />
                </svg>
                <span>Sign Out</span>
              </button>
            </div>
          </transition>
        </div>
      </header>

      <main class="bw-content">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.bw-main-col {
  position: relative;
}

.bw-main-col::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  z-index: calc(var(--z-dropdown) - 1);
  background:
    radial-gradient(circle at 82% 9%, oklch(from var(--brand-500) l c h / 0.18), transparent 24rem),
    linear-gradient(135deg, oklch(from var(--surface) l c h / 0.12), oklch(from var(--surface-2) l c h / 0.32));
  backdrop-filter: blur(0) saturate(100%);
  -webkit-backdrop-filter: blur(0) saturate(100%);
  transition:
    opacity var(--dur-base) var(--ease-out),
    backdrop-filter var(--dur-base) var(--ease-out);
}

.bw-main-col--menu-open::before {
  opacity: 1;
  backdrop-filter: blur(5px) saturate(120%);
  -webkit-backdrop-filter: blur(5px) saturate(120%);
}

.bw-main-col--menu-open .bw-content {
  filter: blur(3px) saturate(72%) brightness(0.82);
  transform: scale(0.996);
  transform-origin: top center;
  transition:
    filter var(--dur-base) var(--ease-out),
    transform var(--dur-base) var(--ease-out);
}

.bw-content {
  transition:
    filter var(--dur-base) var(--ease-out),
    transform var(--dur-base) var(--ease-out);
}

.bw-topbar {
  z-index: var(--z-dropdown);
}
</style>
