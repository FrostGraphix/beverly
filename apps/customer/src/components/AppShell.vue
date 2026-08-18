<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { RouterLink, useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { api } from '../lib/api';
import {
    toggleTheme, isInstallDismissed, dismissInstallPrompt, isIosInstallable, isStandalone,
    getDeferredInstallPrompt, onInstallPromptChange, triggerInstallPrompt, onNotificationCountChange,
} from '@beverly/tokens';

defineProps<{ title?: string; hideTabbar?: boolean }>();
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const userMenuOpen = ref(false);
const accountMenuWrap = ref<HTMLElement | null>(null);

// PWA install prompt
const installPrompt    = ref<any>(null);
const installDismissed = ref(isInstallDismissed());
const showIosInstall   = ref(false);

// Notification bell
const unreadCount = ref(0);
let bellPoll: ReturnType<typeof setInterval> | null = null;

function isTabActive(to: string): boolean {
    const path = route.path;
    if (path === to) return true;
    if (to === '/buy-token' && (path === '/buy-meter' || path.startsWith('/buy-token'))) return true;
    if (to === '/meters' && (path === '/onboard-meter' || path.startsWith('/meters'))) return true;
    if (to === '/wallet' && (path.startsWith('/wallet/fund') || path.startsWith('/wallet/funding'))) return true;
    return false;
}

const initials = computed(() => {
    const name = auth.customer?.full_name ?? auth.customer?.email ?? auth.customer?.phone ?? 'C';
    return name.slice(0, 2).toUpperCase();
});
const profilePictureUrl = computed(() => auth.customer?.profile_picture_url?.trim() || '');
const displayName = computed(() => auth.customer?.full_name?.split(' ')[0] || 'Customer');

async function fetchUnread() {
    if (!auth.isAuthenticated) return;
    try {
        const r = await api.get<{ unreadCount: number }>('/api/v1/customer/notifications?limit=1');
        unreadCount.value = r.unreadCount ?? 0;
    } catch { /* best-effort */ }
}

let unsubscribeInstallPrompt: (() => void) | null = null;
let unsubscribeNotificationCount: (() => void) | null = null;

function handleAppInstalled() {
    showIosInstall.value = false;
    dismissInstallPrompt(365); // installed — don't ask again
    if (auth.isAuthenticated) {
        api.post('/api/v1/customer/pwa-installed', {}).catch(() => { /* best-effort */ });
    }
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
    bellPoll = setInterval(fetchUnread, 60_000); // poll every minute
});

onUnmounted(() => {
    unsubscribeInstallPrompt?.();
    unsubscribeNotificationCount?.();
    document.removeEventListener('pointerdown', handleDocumentPointerDown);
    if (bellPoll) clearInterval(bellPoll);
});

async function promptInstall() {
    await triggerInstallPrompt();
}

function dismissInstall() {
    installDismissed.value = true;
    showIosInstall.value = false;
    dismissInstallPrompt();
}

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

async function signOut() {
    closeUserMenu();
    await auth.logout();
    await router.push('/login');
}
</script>

<template>
  <div class="bw-mobile-shell">
    <!-- PWA install banner -->
    <div v-if="installPrompt && !installDismissed" class="bw-install-toast" role="status">
      <span class="bw-install-logo" aria-hidden="true"></span>
      <span class="bw-install-copy">
        <strong>Install Beverly</strong>
        <small>Keep your customer wallet nearby.</small>
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

    <!-- App bar -->
    <header class="bw-appbar">
      <RouterLink to="/" class="bw-appbar-brand">
        <div class="bw-mark" style="width:28px; height:28px; border-radius: var(--r-md)" aria-hidden="true"></div>
        <span>Beverly</span>
      </RouterLink>
      <span class="bw-appbar-spacer"></span>
      <slot name="appbar-end" />
      <div class="bw-appbar-actions">
      <!-- Help -->
      <RouterLink to="/help" class="bw-bell" aria-label="Help & support">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
          <path d="M5 13h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2Z" />
          <path d="M19 13h-2a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1" />
          <path d="M18 19a4 4 0 0 1-4 3h-2" />
        </svg>
      </RouterLink>
      <!-- Notification bell -->
      <RouterLink to="/notifications" class="bw-bell" :aria-label="unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications, none unread'">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        <span v-if="unreadCount > 0" class="bw-bell-badge" aria-hidden="true">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
      </RouterLink>
      </div>
      <div class="bw-account-menu bw-customer-account-menu" ref="accountMenuWrap">
        <button
          type="button"
          class="bw-user-chip bw-user-chip-btn bw-customer-user-chip"
          :aria-label="`User menu for ${auth.customer?.full_name || auth.customer?.email || auth.customer?.phone || 'customer'}`"
          aria-haspopup="menu"
          :aria-expanded="userMenuOpen"
          @click="toggleUserMenu"
        >
          <div class="bw-avatar green" style="overflow:hidden">
            <img v-if="profilePictureUrl" :src="profilePictureUrl" alt="Profile" style="width:100%; height:100%; object-fit:cover" />
            <span v-else class="bw-user-dropdown-logo bw-avatar-brand-logo" aria-hidden="true"></span>
          </div>
          <div class="bw-user-meta">
            <strong>{{ displayName }}</strong>
            <span>customer</span>
          </div>
          <svg class="bw-user-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        <transition name="bw-menu">
          <div v-show="userMenuOpen" class="bw-user-dropdown" role="menu" aria-label="Customer account menu">
            <div class="bw-user-dropdown-brand">
              <span class="bw-user-dropdown-logo" aria-hidden="true"></span>
              <span>
                <strong>{{ auth.customer?.full_name || 'Beverly Customer' }}</strong>
                <small>{{ auth.customer?.email || auth.customer?.phone || 'customer wallet' }}</small>
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
            </button>            <div class="bw-user-menu-separator"></div>
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

    <!-- Main scroll -->
    <main class="bw-mobile-main">
      <div class="bw-mobile-main-inner">
        <slot />
      </div>
    </main>

    <!-- Bottom tab bar -->
    <nav v-if="!hideTabbar" class="bw-tabbar" aria-label="Customer navigation bar">
      <RouterLink to="/" :class="['bw-tab', { active: isTabActive('/') }]" :aria-current="isTabActive('/') ? 'page' : undefined">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 13l9-9 9 9M5 11v9h14v-9"/>
        </svg>
        Home
      </RouterLink>
      <RouterLink to="/buy-token" :class="['bw-tab', { active: isTabActive('/buy-token') }]" :aria-current="isTabActive('/buy-token') ? 'page' : undefined">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        Buy
      </RouterLink>
      <RouterLink to="/wallet" :class="['bw-tab', { active: isTabActive('/wallet') }]" :aria-current="isTabActive('/wallet') ? 'page' : undefined">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2"/>
          <path d="M2 10h20"/>
        </svg>
        Wallet
      </RouterLink>
      <RouterLink to="/meters" :class="['bw-tab', { active: isTabActive('/meters') }]" :aria-current="isTabActive('/meters') ? 'page' : undefined">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <path d="M12 7v5l3 2"/>
        </svg>
        Meters
      </RouterLink>
      <RouterLink to="/profile" :class="['bw-tab', { active: isTabActive('/profile') }]" :aria-current="isTabActive('/profile') ? 'page' : undefined">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 22v-2a8 8 0 0116 0v2"/>
        </svg>
        Profile
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
/* ── Tab-bar height token — consumed by ChatWidget for bubble offset ── */
:root { --bw-tabbar-height: 56px; }

.bw-install-toast {
  position: fixed;
  top: max(var(--s-3), env(safe-area-inset-top));
  left: 50%;
  z-index: var(--z-toast);
  width: min(620px, calc(100vw - 32px));
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: 10px;
  background: color-mix(in oklab, var(--glass-bg) 88%, transparent);
  border: 1px solid var(--glass-border-strong);
  border-radius: var(--r-xl);
  box-shadow: var(--glass-shine), var(--glass-shadow-float);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  animation: bw-install-arrive 280ms var(--ease-out);
}
.bw-install-logo { width:42px;height:42px;flex:0 0 42px;border-radius:var(--r-lg);background:var(--brand-mark-url) center/74% no-repeat,var(--brand-glow);border:1px solid oklch(from var(--brand) l c h / .28); }
.bw-install-copy { flex:1 1 auto;min-width:0;display:grid;gap:1px; }
.bw-install-copy strong { color:var(--text);font-size:var(--t-base); }
.bw-install-copy small { color:var(--text-dim);font-size:var(--t-xs);overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.bw-install-action,.bw-install-dismiss { flex:0 0 auto; }
@keyframes bw-install-arrive { from { opacity:0;transform:translate(-50%,-12px); } }
@media (prefers-reduced-motion: reduce) { .bw-install-toast { animation:none; } }

.bw-appbar-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* Notification bell / help icon — 44×44 touch target */
.bw-bell {
  position: relative;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: var(--r-full, 9999px);
  color: var(--text);
  text-decoration: none;
  flex-shrink: 0;
}
.bw-bell:hover { background: var(--surface-2, oklch(from var(--surface) calc(l - 0.04) c h)); }
.bw-bell.router-link-active { border-color: var(--brand); color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
.bw-bell:focus-visible { outline: 0; box-shadow: 0 0 0 3px var(--brand-glow), 0 0 0 5px var(--brand); border-radius: var(--r-full); }
.bw-bell-badge {
  position: absolute;
  top: 3px;
  right: 3px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: var(--danger, oklch(60% 0.22 25));
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 16px;
  border-radius: 99px;
  text-align: center;
  pointer-events: none;
}

.bw-customer-account-menu {
  margin-left: var(--s-1);
}

.bw-customer-user-chip {
  min-width: 52px;
  padding-inline: 4px 8px;
}

@media (max-width: 520px) {
  .bw-install-toast { top:max(8px,env(safe-area-inset-top));width:calc(100vw - 16px);gap:var(--s-2);padding:8px;border-radius:var(--r-lg); }
  .bw-install-logo { width:38px;height:38px;flex-basis:38px; }
  .bw-install-copy small { max-width:38vw; }
  .bw-appbar-actions { gap: 0; }
  .bw-bell {
    width: 44px;
    height: 44px;
  }

  .bw-customer-user-chip .bw-user-meta {
    display: none;
  }
}
</style>
