<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { RouterLink, useRouter, useRoute } from 'vue-router';
import { useVendorAuthStore } from '../stores/auth';
import {
    toggleTheme, isInstallDismissed, dismissInstallPrompt, isIosInstallable, isStandalone,
    getDeferredInstallPrompt, onInstallPromptChange, triggerInstallPrompt, onNotificationCountChange,
} from '@beverly/tokens';
import { PORTAL_URLS } from '../lib/portals';
import { api } from '../lib/api';
import { syncDeviceNotifications } from '../lib/push-notifications';
defineProps<{ title?: string }>();

const auth = useVendorAuthStore();
const router = useRouter();
const route = useRoute();
const drawerOpen = ref(false);
const userMenuOpen = ref(false);
const signingOut = ref(false);
const accountMenuWrap = ref<HTMLElement | null>(null);
const navRef = ref<HTMLElement | null>(null);
const unreadCount = ref(0);
let bellPoll: ReturnType<typeof setInterval> | null = null;

function scrollToActiveLink() {
    void nextTick(() => {
        const activeEl = navRef.value?.querySelector('.bw-nav-item.active, [aria-current="page"]');
        if (activeEl && typeof activeEl.scrollIntoView === 'function') {
            activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    });
}

watch(() => route.path, () => scrollToActiveLink());
watch(drawerOpen, (isOpen) => {
    if (isOpen) scrollToActiveLink();
});

function isItemActive(to: string): boolean {
    const path = route.path;
    if (path === to) return true;
    if (to !== '/' && path.startsWith(to)) {
        if (to === '/wallet' && (path.startsWith('/wallet/fund') || path.startsWith('/wallet/funding'))) return false;
        if (to === '/meter-orders' && path === '/meter-orders/new') return true;
        return true;
    }
    return false;
}

function isSectionActive(sectionRoutes: string[]): boolean {
    return sectionRoutes.some((r) => isItemActive(r));
}

// PWA install prompt
const installPrompt    = ref<any>(null);
const installDismissed = ref(isInstallDismissed());
const showIosInstall   = ref(false);

const initials = computed(() => {
    const name = auth.user?.organization_name ?? auth.user?.full_name ?? auth.user?.email ?? 'V';
    return name.slice(0, 2).toUpperCase();
});
const profilePictureUrl = computed(() => auth.user?.profile_picture_url?.trim() || '');
const displayName = computed(() => auth.user?.full_name || auth.user?.organization_name || auth.user?.email || 'Vendor');
const roleLabel = computed(() => auth.user?.role === 'vendor_user' ? 'Vendor User' : 'Vendor');

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
    if (signingOut.value) return;
    signingOut.value = true;
    closeUserMenu();
    closeDrawer();
    try {
        await auth.logout();
        await router.push('/login');
    } finally {
        signingOut.value = false;
    }
}

let unsubscribeInstallPrompt: (() => void) | null = null;
let unsubscribeNotificationCount: (() => void) | null = null;

function handleAppInstalled() {
    showIosInstall.value = false;
    dismissInstallPrompt(365); // installed — don't ask again
    if (auth.isAuthenticated) {
        api.post('/api/v1/vendor/pwa-installed', {}).catch(() => { /* best-effort */ });
    }
}

async function promptInstall() {
    await triggerInstallPrompt();
}

function dismissInstall() {
    installDismissed.value = true;
    showIosInstall.value = false;
    dismissInstallPrompt();
}

onMounted(() => {
    unsubscribeNotificationCount = onNotificationCountChange((count) => { unreadCount.value = count; });
    installPrompt.value = getDeferredInstallPrompt();
    unsubscribeInstallPrompt = onInstallPromptChange((e) => {
        installPrompt.value = e;
        if (!e) handleAppInstalled();
    });
    showIosInstall.value = isIosInstallable() && !isStandalone();
    document.addEventListener('pointerdown', handleDocumentPointerDown);
    void fetchUnread();
    void syncDeviceNotifications().catch(() => { /* best-effort */ });
    bellPoll = setInterval(fetchUnread, 60_000);
    scrollToActiveLink();
});
onBeforeUnmount(() => {
    unsubscribeInstallPrompt?.();
    unsubscribeNotificationCount?.();
    document.removeEventListener('pointerdown', handleDocumentPointerDown);
    if (bellPoll) clearInterval(bellPoll);
});
</script>

<template>
  <div class="bw-shell">
    <!-- PWA install banner -->
    <div v-if="installPrompt && !installDismissed" class="bw-install-toast" role="status">
      <span class="bw-install-logo" aria-hidden="true"></span>
      <span class="bw-install-copy">
        <strong>Install Beverly</strong>
        <small>Keep your vendor wallet nearby.</small>
      </span>
      <button class="bw-btn primary sm bw-install-action" @click="promptInstall">Install</button>
      <button class="bw-icon-btn bw-install-dismiss" @click="dismissInstall" aria-label="Dismiss install prompt">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div v-else-if="showIosInstall && !installDismissed" class="bw-install-toast" role="status">
      <span class="bw-install-logo" aria-hidden="true"></span>
      <span class="bw-install-copy">
        <strong>Install Beverly</strong>
        <small>Tap Share, then Add Home.</small>
      </span>
      <button class="bw-icon-btn bw-install-dismiss" @click="dismissInstall" aria-label="Dismiss install prompt">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- Mobile scrim -->
    <div :class="['bw-scrim', { open: drawerOpen }]" @click="closeDrawer" />

    <!-- Sidebar -->
    <aside :class="['bw-sidebar', { open: drawerOpen }]" aria-label="Vendor primary navigation">
      <div class="bw-brand">
        <div class="bw-mark" aria-hidden="true"></div>
        <div class="bw-brand-text">
          <strong>Beverly</strong>
          <span>Vendor</span>
        </div>
      </div>

      <nav ref="navRef" class="bw-nav" aria-label="Vendor primary navigation">
        <div :class="['bw-nav-section', { active: isSectionActive(['/', '/vend', '/meter-orders', '/remote-send']) }]">Vending</div>
        <RouterLink to="/" :class="['bw-nav-item', { active: isItemActive('/') }]" :aria-current="isItemActive('/') ? 'page' : undefined" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
          Dashboard
        </RouterLink>
        <RouterLink to="/vend" :class="['bw-nav-item', { active: isItemActive('/vend') }]" :aria-current="isItemActive('/vend') ? 'page' : undefined" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>
          Buy Token
        </RouterLink>
        <RouterLink to="/meter-orders" :class="['bw-nav-item', { active: isItemActive('/meter-orders') }]" :aria-current="isItemActive('/meter-orders') ? 'page' : undefined" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7H4"/><path d="M20 12H4"/><path d="M20 17H4"/><path d="M8 7v10"/></svg>
          Meter Orders
        </RouterLink>
        <RouterLink to="/remote-send" :class="['bw-nav-item', { active: isItemActive('/remote-send') }]" :aria-current="isItemActive('/remote-send') ? 'page' : undefined" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          Remote Send
        </RouterLink>

        <div :class="['bw-nav-section', { active: isSectionActive(['/wallet', '/wallet/fund', '/wallet/funding', '/statement', '/consumption', '/notifications']) }]">Wallet</div>
        <RouterLink to="/wallet" :class="['bw-nav-item', { active: isItemActive('/wallet') }]" :aria-current="isItemActive('/wallet') ? 'page' : undefined" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/></svg>
          Wallet
        </RouterLink>
        <RouterLink to="/wallet/fund" :class="['bw-nav-item', { active: isItemActive('/wallet/fund') }]" :aria-current="isItemActive('/wallet/fund') ? 'page' : undefined" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          Fund Wallet
        </RouterLink>
        <RouterLink to="/wallet/funding" :class="['bw-nav-item', { active: isItemActive('/wallet/funding') }]" :aria-current="isItemActive('/wallet/funding') ? 'page' : undefined" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>
          Funding History
        </RouterLink>
        <RouterLink to="/statement" :class="['bw-nav-item', { active: isItemActive('/statement') }]" :aria-current="isItemActive('/statement') ? 'page' : undefined" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>
          Statement
        </RouterLink>
        <RouterLink to="/consumption" :class="['bw-nav-item', { active: isItemActive('/consumption') }]" :aria-current="isItemActive('/consumption') ? 'page' : undefined" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V4m0 16h16M8 15l3-4 3 2 4-6"/></svg>
          Consumption
        </RouterLink>
        <RouterLink to="/notifications" :class="['bw-nav-item', { active: isItemActive('/notifications') }]" :aria-current="isItemActive('/notifications') ? 'page' : undefined" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
          Notifications
        </RouterLink>

        <div :class="['bw-nav-section', { active: isSectionActive(['/transactions', '/receipts']) }]">Records</div>
        <RouterLink to="/transactions" :class="['bw-nav-item', { active: isItemActive('/transactions') }]" :aria-current="isItemActive('/transactions') ? 'page' : undefined" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          Transactions
        </RouterLink>
        <RouterLink to="/receipts" :class="['bw-nav-item', { active: isItemActive('/receipts') }]" :aria-current="isItemActive('/receipts') ? 'page' : undefined" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5L3 5v16l3-2 3 2 3-2 3 2 3-2 3 2V5z"/></svg>
          Receipts
        </RouterLink>

        <div :class="['bw-nav-section', { active: isSectionActive(['/help', '/disputes']) }]">Support</div>
        <RouterLink to="/help" :class="['bw-nav-item', { active: isItemActive('/help') }]" :aria-current="isItemActive('/help') ? 'page' : undefined" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4"/><path d="M12 17h.01"/></svg>
          Help &amp; FAQ
        </RouterLink>
        <RouterLink to="/disputes" :class="['bw-nav-item', { active: isItemActive('/disputes') }]" :aria-current="isItemActive('/disputes') ? 'page' : undefined" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          Disputes
        </RouterLink>

        <div :class="['bw-nav-section', { active: isSectionActive(['/profile', '/security', '/vend-access']) }]">Account</div>
        <RouterLink to="/profile" :class="['bw-nav-item', { active: isItemActive('/profile') }]" :aria-current="isItemActive('/profile') ? 'page' : undefined" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0116 0v2"/></svg>
          Profile
        </RouterLink>
        <RouterLink to="/security" :class="['bw-nav-item', { active: isItemActive('/security') }]" :aria-current="isItemActive('/security') ? 'page' : undefined" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          Security
        </RouterLink>
        <RouterLink to="/vend-access" :class="['bw-nav-item', { active: isItemActive('/vend-access') }]" :aria-current="isItemActive('/vend-access') ? 'page' : undefined" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v.01"/><path d="M7 10V7a5 5 0 0110 0v3"/><rect x="5" y="10" width="14" height="11" rx="2"/></svg>
          Vend Authorization
        </RouterLink>
      </nav>

      <footer class="bw-sidebar-foot sidebar-account">
        <div class="sidebar-account-card">
          <div class="sidebar-avatar" aria-hidden="true">
            <img v-if="profilePictureUrl" :src="profilePictureUrl" alt="" />
            <span v-else>{{ initials }}</span>
          </div>
          <div class="sidebar-account-meta">
            <strong>{{ displayName }}</strong>
            <span>{{ roleLabel }}</span>
          </div>
          <button type="button" class="bw-btn danger sidebar-signout" :disabled="signingOut" @click="signOut">
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

        <RouterLink to="/notifications" class="bw-icon-btn bw-notification-btn" :aria-label="unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications, none unread'">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
          <span v-if="unreadCount > 0" class="bw-bell-badge" aria-hidden="true">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
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
              <span v-else class="bw-user-dropdown-logo bw-avatar-brand-logo" aria-hidden="true"></span>
            </div>
            <div class="bw-user-meta">
              <strong>{{ auth.user?.organization_name?.split(' ')[0] || auth.user?.full_name?.split(' ')[0] || 'Vendor' }}</strong>
              <span>{{ roleLabel }}</span>
            </div>
            <svg class="bw-user-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          <transition name="bw-menu">
            <div v-show="userMenuOpen" class="bw-user-dropdown" role="menu" aria-label="Vendor account menu">
              <div class="bw-user-dropdown-brand">
                <span class="bw-user-dropdown-logo" aria-hidden="true"></span>
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
.bw-install-toast {
  position: fixed;
  top: max(var(--s-3), env(safe-area-inset-top));
  left: 50%;
  z-index: var(--z-toast);
  width: min(620px, calc(100vw - 32px));
  min-height: 64px;
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: 10px 12px;
  transform: translateX(-50%);
  background:
    linear-gradient(135deg, var(--brand-glow), transparent 58%),
    var(--glass-bg-strong);
  border: 1px solid var(--glass-border-strong);
  border-radius: var(--r-xl);
  box-shadow: var(--glass-shine), var(--glass-shadow-float);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  animation: bw-install-arrive 280ms var(--ease-out);
}
.bw-install-logo {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  border-radius: var(--r-lg);
  background: var(--brand-mark-url) center / 74% no-repeat, var(--brand-glow);
  border: 1px solid oklch(from var(--brand) l c h / 0.28);
  box-shadow: inset 0 1px 0 oklch(100% 0 0 / 0.18);
}
.bw-install-copy {
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  gap: 1px;
}
.bw-install-copy strong {
  color: var(--text);
  font-size: var(--t-base);
}
.bw-install-copy small {
  color: var(--text-dim);
  font-size: var(--t-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bw-install-action { flex: 0 0 auto; }
.bw-install-dismiss { flex: 0 0 auto; }

@keyframes bw-install-arrive {
  from { opacity: 0; transform: translate(-50%, -12px); }
}

@media (prefers-reduced-motion: reduce) {
  .bw-install-toast { animation: none; }
}

@media (max-width: 480px) {
  .bw-install-toast {
    top: max(8px, env(safe-area-inset-top));
    width: calc(100vw - 16px);
    gap: var(--s-2);
    padding: 8px;
    border-radius: var(--r-lg);
  }
  .bw-install-logo {
    width: 38px;
    height: 38px;
    flex-basis: 38px;
  }
  .bw-install-copy small { max-width: 42vw; }
}

.bw-notification-btn {
    position: relative;
    text-decoration: none;
}
.bw-notification-btn.router-link-active {
    border-color: color-mix(in srgb, var(--brand) 55%, var(--glass-border));
    color: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-glow);
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
