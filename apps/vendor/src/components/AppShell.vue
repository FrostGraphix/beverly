<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { useVendorAuthStore } from '../stores/auth';
import { toggleTheme } from '@beverly/tokens';
import { PORTAL_URLS } from '../lib/portals';
import { api } from '../lib/api';
import ChatWidget from './ChatWidget.vue';

defineProps<{ title?: string }>();

const auth = useVendorAuthStore();
const router = useRouter();
const drawerOpen = ref(false);
const userMenuOpen = ref(false);
const accountMenuWrap = ref<HTMLElement | null>(null);
const unreadCount = ref(0);
let bellPoll: ReturnType<typeof setInterval> | null = null;

const initials = computed(() => {
    const name = auth.user?.organization_name ?? auth.user?.full_name ?? auth.user?.email ?? 'V';
    return name.slice(0, 2).toUpperCase();
});
const profilePictureUrl = computed(() => auth.user?.profile_picture_url?.trim() || '');

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

function openSecurity() {
    closeUserMenu();
    void router.push('/security');
}

function openHelp() {
    closeUserMenu();
    void router.push('/help');
}

async function fetchUnread() {
    if (!auth.isAuthenticated) return;
    try {
        const response = await api.get<{ unreadCount: number }>('/api/v1/vendor/notifications?limit=1');
        unreadCount.value = response.unreadCount ?? 0;
    } catch {
        // Notification count is best-effort.
    }
}

async function signOut() {
    closeUserMenu();
    await auth.logout();
    await router.push('/login');
}

onMounted(() => {
    document.addEventListener('pointerdown', handleDocumentPointerDown);
    void fetchUnread();
    bellPoll = setInterval(fetchUnread, 60_000);
});
onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', handleDocumentPointerDown);
    if (bellPoll) clearInterval(bellPoll);
});
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
          <span>Vendor</span>
        </div>
      </div>

      <nav class="bw-nav">
        <div class="bw-nav-section">Vending</div>
        <RouterLink to="/" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
          Dashboard
        </RouterLink>
        <RouterLink to="/vend" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>
          Buy Token
        </RouterLink>
        <RouterLink to="/meter-orders" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7H4"/><path d="M20 12H4"/><path d="M20 17H4"/><path d="M8 7v10"/></svg>
          Meter Orders
        </RouterLink>
        <RouterLink to="/remote-send" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          Remote Send
        </RouterLink>

        <div class="bw-nav-section">Wallet</div>
        <RouterLink to="/wallet" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/></svg>
          Wallet
        </RouterLink>
        <RouterLink to="/wallet/fund" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          Fund Wallet
        </RouterLink>
        <RouterLink to="/wallet/funding" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>
          Funding History
        </RouterLink>
        <RouterLink to="/statement" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>
          Statement
        </RouterLink>
        <RouterLink to="/notifications" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
          Notifications
        </RouterLink>

        <div class="bw-nav-section">Records</div>
        <RouterLink to="/transactions" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          Transactions
        </RouterLink>
        <RouterLink to="/receipts" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5L3 5v16l3-2 3 2 3-2 3 2 3-2 3 2V5z"/></svg>
          Receipts
        </RouterLink>

        <div class="bw-nav-section">Support</div>
        <RouterLink to="/help" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4"/><path d="M12 17h.01"/></svg>
          Help &amp; FAQ
        </RouterLink>
        <RouterLink to="/disputes" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          Disputes
        </RouterLink>

        <div class="bw-nav-section">Account</div>
        <RouterLink to="/profile" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0116 0v2"/></svg>
          Profile
        </RouterLink>
        <RouterLink to="/security" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          Security
        </RouterLink>
        <RouterLink to="/vend-access" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v.01"/><path d="M7 10V7a5 5 0 0110 0v3"/><rect x="5" y="10" width="14" height="11" rx="2"/></svg>
          Vend Authorization
        </RouterLink>
      </nav>

    </aside>

    <!-- Main column -->
    <div class="bw-main-col">
      <header class="bw-topbar">
        <button class="bw-hamburger" @click="openDrawer" aria-label="Open menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>

        <div class="bw-crumb">
          <strong>{{ title || 'Dashboard' }}</strong>
        </div>

        <span class="bw-spacer" />

        <slot name="topbar-end" />

        <RouterLink to="/notifications" class="bw-icon-btn bw-notification-btn" aria-label="Notifications">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
          <span v-if="unreadCount > 0" class="bw-bell-badge">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
        </RouterLink>

        <!-- Theme toggle -->
        <button class="bw-icon-btn" @click="toggleTheme" title="Toggle theme" style="border: none">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        </button>

        <!-- User chip -->
        <div class="bw-account-menu" ref="accountMenuWrap">
          <button
            type="button"
            class="bw-user-chip bw-user-chip-btn"
            :aria-label="`User menu for ${auth.user?.organization_name || auth.user?.full_name || auth.user?.email || 'vendor'}`"
            aria-haspopup="menu"
            :aria-expanded="userMenuOpen"
            @click="toggleUserMenu"
          >
            <div class="bw-avatar green" style="overflow:hidden">
              <img v-if="profilePictureUrl" :src="profilePictureUrl" alt="Profile" style="width:100%; height:100%; object-fit:cover" />
              <template v-else>{{ initials }}</template>
            </div>
            <div class="bw-user-meta">
              <strong>{{ auth.user?.organization_name?.split(' ')[0] || auth.user?.full_name?.split(' ')[0] || 'Vendor' }}</strong>
              <span>{{ auth.user?.role || 'portal' }}</span>
            </div>
            <svg class="bw-user-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          <transition name="bw-menu">
            <div v-show="userMenuOpen" class="bw-user-dropdown" role="menu" aria-label="Vendor account menu">
              <div class="bw-user-dropdown-brand">
                <span class="bw-user-dropdown-logo">B</span>
                <span>
                  <strong>{{ auth.user?.organization_name || 'Beverly Vendor' }}</strong>
                  <small>{{ auth.user?.email || auth.user?.role || 'vendor portal' }}</small>
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
              <button type="button" class="bw-user-menu-item" role="menuitem" @click="openHelp">
                <svg class="bw-user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4" />
                  <path d="M12 17h.01" />
                </svg>
                <span>Help</span>
              </button>
              <button type="button" class="bw-user-menu-item" role="menuitem" @click="toggleTheme">
                <svg class="bw-user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path d="M12 21C7 16 5 11 6 5c6-1 11 1 13 6-4 1-7 4-9 8" />
                  <path d="M6 19c3-5 7-8 13-8" />
                </svg>
                <span>Theme</span>
              </button>
              <div class="bw-user-menu-separator"></div>
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

    <!-- Global quick-chat widget -->
    <ChatWidget />
  </div>
</template>

<style scoped>
.bw-notification-btn {
    position: relative;
    text-decoration: none;
}
.bw-bell-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    min-width: 16px;
    height: 16px;
    border-radius: 999px;
    background: var(--danger);
    color: white;
    display: grid;
    place-items: center;
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
    padding: 0 4px;
}
</style>
