<script setup lang="ts">
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useVendorAuthStore } from '../stores/auth';
import { toggleTheme } from '@beverly/tokens';

defineProps<{ title?: string }>();

const auth = useVendorAuthStore();
const drawerOpen = ref(false);

const initials = computed(() => {
    const name = auth.user?.organization_name ?? auth.user?.full_name ?? auth.user?.email ?? 'V';
    return name.slice(0, 2).toUpperCase();
});

function openDrawer()  { drawerOpen.value = true; }
function closeDrawer() { drawerOpen.value = false; }
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
        <RouterLink to="/statement" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>
          Statement
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

        <div class="bw-nav-section">Account</div>
        <RouterLink to="/profile" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0116 0v2"/></svg>
          Profile
        </RouterLink>
        <RouterLink to="/security" class="bw-nav-item" @click="closeDrawer">
          <svg class="bw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          Security
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
          <span class="bw-crumb-link">{{ auth.user?.organization_name || 'Vendor' }}</span>
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
        <div class="bw-user-chip">
          <div class="bw-avatar green">{{ initials }}</div>
          <div class="bw-user-meta">
            <strong>{{ auth.user?.organization_name?.split(' ')[0] || 'Vendor' }}</strong>
            <span>{{ auth.user?.role || 'portal' }}</span>
          </div>
        </div>
      </header>

      <main class="bw-content">
        <slot />
      </main>
    </div>
  </div>
</template>
