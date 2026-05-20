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
const accountMenuWrap = ref<HTMLElement | null>(null);

const initials = computed(() => {
    const n = auth.user?.full_name ?? auth.user?.email ?? 'ST';
    return n.slice(0, 2).toUpperCase();
});

const defaultCrmBaseUrl = import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:5173`
    : 'https://beverly.acoblighting.com';

function toCrmDashboardUrl(baseUrl: string) {
    const [urlWithoutHash] = baseUrl.split('#');
    return `${urlWithoutHash.replace(/\/+$/, '')}/#/dashboard`;
}

const CRM_URL = toCrmDashboardUrl(import.meta.env.VITE_CRM_URL ?? defaultCrmBaseUrl);

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
    closeUserMenu();
    auth.logout();
    await router.push('/login');
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
        <div class="bw-mark">B</div>
        <div class="bw-brand-text">
          <strong>Beverly</strong>
          <span>Wallet Admin</span>
        </div>
      </div>

      <nav class="bw-nav">
        <div class="bw-nav-section">Overview</div>
        <RouterLink to="/" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
          Dashboard
        </RouterLink>
        <RouterLink to="/reports" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>
          Reports
        </RouterLink>

        <div class="bw-nav-section">Vendors</div>
        <RouterLink to="/applications" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>
          Applications
        </RouterLink>
        <RouterLink to="/vendors" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          Vendors
        </RouterLink>
        <RouterLink to="/customers" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1"/></svg>
          Customers
        </RouterLink>

        <div class="bw-nav-section">Money</div>
        <RouterLink to="/funding" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          Funding
        </RouterLink>
        <RouterLink to="/wallets" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M16 14h2"/></svg>
          Wallets
        </RouterLink>
        <RouterLink to="/purchases" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>
          Purchases
        </RouterLink>

        <div class="bw-nav-section">Field Ops</div>
        <RouterLink to="/meter-orders" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          Meter Orders
        </RouterLink>

        <div class="bw-nav-section">Operations</div>
        <RouterLink to="/disputes" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          Disputes
        </RouterLink>
        <RouterLink to="/refunds" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18M3 12l4-4M3 12l4 4M21 6v12"/></svg>
          Refunds
        </RouterLink>
        <RouterLink to="/settlement" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
          Settlement
        </RouterLink>
        <RouterLink to="/reconciliation" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
          Reconciliation
        </RouterLink>

        <div class="bw-nav-section">Launch</div>
        <RouterLink to="/feature-flags" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
          Feature Flags
        </RouterLink>
        <RouterLink to="/privacy" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
          NDPR / Privacy
        </RouterLink>

        <div class="bw-nav-section">Compliance</div>
        <RouterLink to="/fraud" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Fraud Review
        </RouterLink>
        <RouterLink to="/audit" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          Audit Log
        </RouterLink>

        <div class="bw-nav-section">Access</div>
        <RouterLink to="/roles" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          Roles &amp; Team
        </RouterLink>
        <RouterLink to="/permissions" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          Permissions
        </RouterLink>
      </nav>

      <div class="bw-sidebar-foot">
        <a :href="CRM_URL" class="bw-back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to CRM
        </a>
      </div>
    </aside>

    <!-- Main column -->
    <div class="bw-main-col">
      <header class="bw-topbar">
        <button class="bw-hamburger" @click="openDrawer" aria-label="Open menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>

        <div class="bw-crumb">
          <span class="bw-crumb-link">Wallet Admin</span>
          <span class="bw-crumb-sep">/</span>
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
            :aria-label="`User menu for ${auth.user?.full_name || auth.user?.email || 'staff'}`"
            aria-haspopup="menu"
            :aria-expanded="userMenuOpen"
            @click="toggleUserMenu"
          >
            <div class="bw-avatar green">{{ initials }}</div>
            <div class="bw-user-meta">
              <strong>{{ auth.user?.full_name?.split(' ')[0] || 'Staff' }}</strong>
              <span>{{ auth.user?.role || 'admin' }}</span>
            </div>
            <svg class="bw-user-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          <transition name="bw-menu">
            <div v-show="userMenuOpen" class="bw-user-dropdown" role="menu" aria-label="Beverly admin account menu">
              <div class="bw-user-dropdown-brand">
                <span class="bw-user-dropdown-logo">B</span>
                <span>
                  <strong>Beverly</strong>
                  <small>{{ auth.user?.full_name || auth.user?.email || 'Staff user' }} - {{ auth.user?.role || 'admin' }}</small>
                </span>
              </div>
              <button type="button" class="bw-user-menu-item active" role="menuitem" @click="openProfile">
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
              <div class="bw-user-menu-separator"></div>
              <a :href="CRM_URL" class="bw-user-menu-item" role="menuitem" @click="closeUserMenu">
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
