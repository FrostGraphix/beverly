<template>
  <div id="app-root">
  <LoginPage v-if="isLogin" @logged-in="goDashboard" />
  <BeverlyLoader v-else-if="!isRoleReady" label="Verifying session" />
  <div
    v-else
    :class="['app-page', deviceClass, sidebarOpen ? 'openSidebar' : '']"
    :style="{ '--layout-sidebar-width': `${sidebarWidth}px` }"
  >

    <div class="drawer-bg" @click="closeSidebar"></div>
    <aside
      class="sidebar-container"
      aria-label="Primary navigation"
      :inert="width <= 1024 && !sidebarOpen ? '' : null"
    >
      <div class="sidebar-logo">
        <span class="sidebar-logo-icon" aria-hidden="true"></span>
        <span class="sidebar-logo-text sidebar-brand-copy">
          <span class="sidebar-logo-wordmark" role="img" aria-label="Beverly"></span>
        </span>
        <BaseIconButton ref="sidebarCloseButton" v-if="width <= 1024" class="sidebar-mobile-close" @click.stop="closeSidebar" aria-label="Close sidebar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </BaseIconButton>
      </div>
      <div class="sidebar-find" @click="focusSidebarFilter">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
        <input
          ref="sidebarSearchInput"
          v-model="sidebarQuery"
          type="search"
          aria-label="Filter navigation links"
          placeholder="Filter pages"
          @keydown.esc.stop="sidebarQuery = ''"
        />
        <kbd>/</kbd>
      </div>
      <nav class="sidebar-menu" aria-label="Main navigation" @click="closeSidebar">
        <template v-for="group in sidebarGroups" :key="`section-${group.name}`">
          <a
            v-if="group.routes.length === 1"
            :class="sidebarClass(group.routes[0], false)"
            :href="group.routes[0].external ? resolveExternalUrl(group.routes[0]) : group.routes[0].hash"
            :target="group.routes[0].external ? '_blank' : null"
            :rel="group.routes[0].external ? 'noopener noreferrer' : null"
            :title="group.routes[0].title"
            @click="closeSidebar"
          >
            <span class="sidebar-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="routeIconPath(group.routes[0])"/></svg>
            </span>
            <span class="sidebar-label">{{ group.routes[0].title }}</span>
          </a>
          <template v-else>
            <BaseButton
              variant="quiet"
              :class="sidebarGroupClass(group)"
              :title="group.name"
              :aria-expanded="String(Boolean(expandedGroups[group.name]))"
              @click.stop="toggleGroup(group.name)"
            >
              <span class="sidebar-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="routeIconPath({ group: group.name, title: group.name })"/></svg>
              </span>
              <span class="sidebar-label">{{ group.name }}</span>
              <svg class="sidebar-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>
            </BaseButton>
            <div v-show="sidebarQuery || expandedGroups[group.name]" class="sidebar-submenu">
              <a
                v-for="route in group.routes"
                :key="route.hash"
                :class="sidebarClass(route, true)"
                :href="route.external ? resolveExternalUrl(route) : route.hash"
                :target="route.external ? '_blank' : null"
                :rel="route.external ? 'noopener noreferrer' : null"
                :title="route.title"
                @click="closeSidebar"
              >
                <span class="sidebar-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="routeIconPath(route)"/></svg>
                </span>
                <span class="sidebar-label">{{ route.title }}</span>
                <svg v-if="route.external" class="sidebar-external" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1 2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </a>
            </div>
          </template>
        </template>
        <p v-if="sidebarQuery && !sidebarGroups.length" class="sidebar-search-empty">No matching pages</p>
      </nav>
      <div class="sidebar-footer">
        <BaseButton class="sidebar-signout" variant="ghost" title="Sign Out" @click="handleSignOut">
          <span class="sidebar-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          </span>
          <span class="sidebar-label">Sign Out</span>
        </BaseButton>
      </div>
      <div
        v-if="width > 1024 && !collapsed"
        class="sidebar-resizer"
        role="separator"
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        :aria-valuemin="sidebarMinWidth"
        :aria-valuemax="sidebarMaxWidth"
        :aria-valuenow="sidebarWidth"
        tabindex="0"
        @pointerdown="startSidebarResize"
        @keydown="resizeSidebarWithKeyboard"
        @dblclick="resetSidebarWidth"
      ></div>
    </aside>
    <section
      :class="['main-container', { 'main-container--account-menu-open': userDropdownOpen && width <= 1024 }]"
      :inert="width <= 1024 && sidebarOpen ? '' : null"
    >
      <div
        v-if="userDropdownOpen && width <= 1024"
        class="bw-account-scrim"
        @click="closeUserMenu"
      ></div>
      <header class="fixed-header">
        <div class="navbar" :aria-label="`${activePageTitle} ${currentUserName}`">
          <BaseIconButton ref="sidebarToggleButton" class="hamburger-container" :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'" :aria-pressed="String(collapsed)" @click="toggleSidebar">
            <span class="hamburger-lines">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </BaseIconButton>
          <a class="top-route" :href="route.hash" :aria-current="'page'">{{ activePageTitle }}</a>
          <div class="right-menu">
            <BaseButton variant="quiet" class="toolbar-search" aria-label="Search Beverly" aria-keyshortcuts="Control+K Meta+K" @click="openGlobalSearch">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
              <span>Search</span>
              <kbd>Ctrl K</kbd>
            </BaseButton>
            <StationAlertsBell />
            <div class="bw-account-menu" ref="accountMenuWrap">
              <BaseButton
                ref="userMenuButton"
                variant="quiet"
                class="bw-user-chip bw-user-chip-btn"
                @click="openUserMenu"
                :aria-label="`User menu for ${currentUserName}`"
                aria-haspopup="menu"
                :aria-expanded="String(userDropdownOpen)"
                aria-controls="beverly-account-menu"
              >
                <span class="bw-avatar green bw-avatar-shell">
                  <img v-if="profilePictureUrl" :src="profilePictureUrl" alt="Staff profile" class="bw-avatar-image" />
                  <template v-else>{{ userInitials }}</template>
                </span>
                <span class="bw-user-meta">
                  <strong>{{ currentUserFirstName }}</strong>
                  <span>{{ currentRoleName }}</span>
                </span>
                <svg class="bw-user-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="m6 9 6 6 6-6"></path>
                </svg>
              </BaseButton>
              <transition name="dropdown">
                <div
                  id="beverly-account-menu"
                  ref="userMenu"
                  v-show="userDropdownOpen"
                  class="bw-user-dropdown"
                  role="menu"
                  aria-label="Beverly account menu"
                  @keydown="handleUserMenuKeydown"
                >
                  <div class="bw-user-dropdown-brand">
                    <span class="bw-user-dropdown-logo bw-user-dropdown-logo--avatar">
                      <img v-if="profilePictureUrl" :src="profilePictureUrl" alt="Staff profile" class="bw-avatar-image" />
                    </span>
                    <span>
                      <strong>Beverly</strong>
                      <small>{{ displayUserName }} - {{ currentRoleName }}</small>
                    </span>
                  </div>
                  <BaseButton variant="quiet" class="bw-user-menu-item" role="menuitem" @click="openProfile">
                    <svg class="bw-user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <path d="M20 21a8 8 0 0 0-16 0"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span>Profile</span>
                  </BaseButton>
                  <BaseButton variant="quiet" class="bw-user-menu-item" role="menuitem" @click="openSettings">
                    <svg class="bw-user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z"></path>
                      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .92V20a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-.92 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.92-1H4a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 .92-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.92V4a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 .92 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.13.36.43.69.92 1H20a2 2 0 1 1 0 4h-.09c-.49.31-.79.64-.51 1z"></path>
                    </svg>
                    <span>Settings</span>
                  </BaseButton>
                  <BaseButton v-if="currentRoleId === 'super-admin'" variant="quiet" class="bw-user-menu-item" role="menuitem" @click="switchOem">
                    <svg class="bw-user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <rect x="3" y="3" width="7" height="7" rx="1.5"></rect>
                      <rect x="14" y="3" width="7" height="7" rx="1.5"></rect>
                      <rect x="3" y="14" width="7" height="7" rx="1.5"></rect>
                      <rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
                    </svg>
                    <span>Switch OEM</span>
                  </BaseButton>
                  <div class="user-theme-submenu">
                    <BaseButton
                      variant="quiet"
                      class="bw-user-menu-item"
                      role="menuitem"
                      :aria-expanded="String(userThemePanelOpen)"
                      @click="userThemePanelOpen = !userThemePanelOpen"
                    >
                      <svg class="bw-user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                        <path d="M12 21C7 16 5 11 6 5c6-1 11 1 13 6-4 1-7 4-9 8"></path>
                        <path d="M6 19c3-5 7-8 13-8"></path>
                      </svg>
                      <span>Theme</span>
                      <svg class="bw-user-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="m9 18 6-6-6-6"></path>
                      </svg>
                    </BaseButton>
                    <div v-show="userThemePanelOpen" class="user-theme-panel" role="group" aria-label="Theme choices">
                      <BaseButton
                        v-for="theme in themeOptions"
                        :key="theme.id"
                        variant="quiet"
                        :class="['user-theme-choice', { active: currentTheme === theme.id }]"
                        role="menuitemradio"
                        :aria-checked="String(currentTheme === theme.id)"
                        @click="setTheme(theme.id)"
                      >
                        <strong>{{ theme.label }}</strong>
                      </BaseButton>
                    </div>
                  </div>
                  <div class="bw-user-menu-separator"></div>
                  <BaseButton variant="quiet" class="bw-user-menu-item" role="menuitem" @click="openSearchFromMenu">
                    <svg class="bw-user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <circle cx="11" cy="11" r="7"></circle>
                      <path d="m21 21-4.3-4.3"></path>
                    </svg>
                    <span>Global search</span>
                    <kbd>Ctrl K</kbd>
                  </BaseButton>
                  <BaseButton variant="quiet" class="bw-user-menu-item" role="menuitem" @click="openFullscreenFromMenu">
                    <svg class="bw-user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3"></path>
                      <path d="M16 3h3a2 2 0 0 1 2 2v3"></path>
                      <path d="M8 21H5a2 2 0 0 1-2-2v-3"></path>
                      <path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>
                    </svg>
                    <span>Fullscreen</span>
                  </BaseButton>
                  <div class="bw-user-menu-separator"></div>
                  <BaseButton variant="quiet" class="bw-user-menu-item bw-user-menu-item--danger" role="menuitem" @click="handleSignOut">
                    <svg class="bw-user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                      <path d="m16 17 5-5-5-5"></path>
                      <path d="M21 12H9"></path>
                    </svg>
                    <span>Sign Out</span>
                  </BaseButton>
                </div>
              </transition>
            </div>
          </div>
        </div>
      </header>
        <main :class="['content-page', route.hash === '#/dashboard' ? 'dashboard-editor-container' : '']">
          <ProfilePage
            v-if="profileOpen"
            :user-name="currentUserName"
            :role-id="currentRoleId"
            :profile-picture-url="profilePictureUrl"
            @close="profileOpen = false"
          />
          <SettingsPage
            v-else-if="settingsOpen"
            :user-name="currentUserName"
            :role-id="currentRoleId"
            :initial-tab="settingsInitialTab"
            @theme-change="setTheme"
            @close="settingsOpen = false"
          />
          <OemHubPage v-else-if="showOemHub" @oem-selected="handleOemSelected" />
          <DashboardPage v-else-if="route.hash === '#/dashboard'" />
          <ReportsPage v-else-if="route.customComponent === 'ReportsPage'" />
          <DailyDataMeterPage v-else-if="route.hash === '#/prepay-report/daily-data-meter'" :route="route" />
          <OnboardingStudioPage v-else-if="route.customComponent === 'OnboardingStudioPage'" :route="route" />
          <AutomationCommandPage v-else-if="route.customComponent === 'AutomationCommandPage'" />
          <ConsumptionStatisticsPage v-else-if="route.customComponent === 'ConsumptionStatisticsPage'" :route="route" />
          <AbnormalAlarmPage v-else-if="route.customComponent === 'AbnormalAlarmPage'" />
          <MeterKeyChangePage v-else-if="route.customComponent === 'MeterKeyChangePage'" :route="route" />
          <DisputesPage v-else-if="route.customComponent === 'DisputesPage'" :route="route" />
          <RefundsPage v-else-if="route.customComponent === 'RefundsPage'" :route="route" />
          <SettlementPage v-else-if="route.customComponent === 'SettlementPage'" :route="route" />
          <ReconciliationPage v-else-if="route.customComponent === 'ReconciliationPage'" :route="route" />
          <WalletFundingPage v-else-if="route.customComponent === 'WalletFundingPage'" :route="route" />
          <VendingMonitorPage v-else-if="route.customComponent === 'VendingMonitorPage'" :route="route" />
          <StationConsumptionPage v-else-if="route.customComponent === 'StationConsumptionPage'" :route="route" :hash="hash" :role-id="currentRoleId" />
          <TablePage v-else :route="route" />
        </main>
    </section>
    <ToastNotification />

    <!-- Global Search Overlay -->
    <div v-if="searchOpen" class="search-overlay" @click.self="searchOpen = false">
      <div class="search-overlay-box" role="dialog" aria-modal="true" aria-label="Search Beverly">
        <div class="search-overlay-input-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
          <input
            ref="searchInput"
            class="search-overlay-input"
            v-model="searchQuery"
            aria-label="Search pages and features"
            placeholder="Search pages and features"
            @keydown.esc="searchOpen = false"
            @keydown.enter="goFirstSearchResult"
          />
          <kbd>Esc</kbd>
        </div>
        <div class="search-overlay-results" v-if="searchResults.length">
          <div v-for="group in searchResults" :key="group.group">
            <div class="search-result-group">{{ group.group }}</div>
            <a
              v-for="r in group.routes"
              :key="r.hash"
              class="search-result-item"
              :href="r.hash"
              @click="searchOpen = false; searchQuery = ''"
            >{{ r.title }}</a>
          </div>
        </div>
        <div class="search-result-empty" v-else-if="searchQuery.length > 0">No results for "{{ searchQuery }}"</div>
        <div class="search-overlay-hint" v-else>
          <span>Search every Beverly workspace.</span>
          <span><kbd>Enter</kbd> opens first result.</span>
        </div>
      </div>
    </div>
  </div>
  </div>
</template>

<script>
import DashboardPage from "./components/DashboardPage.vue";
import LoginPage from "./components/LoginPage.vue";
import AutomationCommandPage from "./components/AutomationCommandPage.vue";
import ConsumptionStatisticsPage from "./components/ConsumptionStatisticsPage.vue";
import AbnormalAlarmPage from "./components/AbnormalAlarmPage.vue";
import DailyDataMeterPage from "./components/DailyDataMeterPage.vue";
import OnboardingStudioPage from "./components/OnboardingStudioPage.vue";
import StationConsumptionPage from "./components/StationConsumptionPage.vue";
import MeterKeyChangePage from "./components/MeterKeyChangePage.vue";
import TablePage from "./components/TablePage.vue";
import ProfilePage from "./components/ProfilePage.vue";
import SettingsPage from "./components/SettingsPage.vue";
import ToastNotification from "./components/ToastNotification.vue";
import BaseButton from "./components/base/BaseButton.vue";
import BaseIconButton from "./components/base/BaseIconButton.vue";
import DisputesPage from "./components/wallet/DisputesPage.vue";
import RefundsPage from "./components/wallet/RefundsPage.vue";
import SettlementPage from "./components/wallet/SettlementPage.vue";
import ReconciliationPage from "./components/wallet/ReconciliationPage.vue";
import WalletFundingPage from "./components/wallet/WalletFundingPage.vue";

const sidebarDefaultWidth = 252;
const sidebarMinWidth = 220;
const sidebarMaxWidth = 420;
const sidebarWidthKey = "beverly-sidebar-width";

function savedSidebarWidth() {
  const value = Number(localStorage.getItem(sidebarWidthKey));
  return Number.isFinite(value) ? Math.min(sidebarMaxWidth, Math.max(sidebarMinWidth, value)) : sidebarDefaultWidth;
}
import VendingMonitorPage from "./components/wallet/VendingMonitorPage.vue";
import ReportsPage from "./components/ReportsPage.vue";
import StationAlertsBell from "./components/StationAlertsBell.vue";
import OemHubPage from "./components/oem-hub/OemHubPage.vue";
import BeverlyLoader from "@beverly/tokens/BeverlyLoader.vue";
import { useOemStore } from "./stores/oem-store";
import { warmAllOems } from "./services/oem-prefetch.mjs";
import { clearSessionCookies, currentUserInfo, getCookie, isSessionExpired, readSessionState, refreshLiveWriteStatus, setCookie, setRuntimeLiveWritesAllowed, touchSession } from "./services/api";
import { loadProfileState } from "./services/profile-store.mjs";
import { findRoute, normalizeHash, routeGroups, visibleRoutes } from "./data/route-manifest";
import { groupIcons, routeIconOverrides, routeIconPaths, sidebarSectionLabels } from "./data/shell-chrome.mjs";
import { playLoginVoice } from "./utils/voice.js";

const supportedThemeChoices = ["system", "light", "executive", "contrast"];

function normalizeThemeChoice(theme) {
  if (theme === "dark") return "executive";
  if (theme === "ocean") return "light";
  return supportedThemeChoices.includes(theme) ? theme : "system";
}

export default {
  name: "App",
  components: { AbnormalAlarmPage, AutomationCommandPage, BaseButton, BaseIconButton, BeverlyLoader, ConsumptionStatisticsPage, DashboardPage, DailyDataMeterPage, DisputesPage, LoginPage, MeterKeyChangePage, OemHubPage, OnboardingStudioPage, ProfilePage, ReconciliationPage, RefundsPage, ReportsPage, SettingsPage, SettlementPage, StationAlertsBell, StationConsumptionPage, TablePage, ToastNotification, VendingMonitorPage, WalletFundingPage },
  data() {
    return {
      hash: window.location.hash || "#/login?redirect=%2Fdashboard",
      sidebarOpen: window.innerWidth > 1024,
      collapsed: false,
      sidebarWidth: savedSidebarWidth(),
      sidebarMinWidth,
      sidebarMaxWidth,
      sidebarQuery: "",
      resizingSidebar: false,
      width: window.innerWidth,
      currentRoleId: null,
      currentUserName: getCookie("userName") || null,
      profilePictureUrl: "",
      expandedGroups: {},
      currentTheme: normalizeThemeChoice(localStorage.getItem('acob-theme') || 'system'),
      themeDropdownOpen: false,
      userDropdownOpen: false,
      userThemePanelOpen: false,
      searchOpen: false,
      searchQuery: '',
      profileOpen: false,
      settingsOpen: false,
      settingsInitialTab: 'security',
      mediaQuery: null,
      sessionTimer: null,
      lastSessionTouchAt: 0
    };
  },
  computed: {
    oemStore() {
      return useOemStore();
    },
    showOemHub() {
      return this.currentRoleId === "super-admin" && !this.oemStore.currentOemId;
    },
    isLogin() {
      return this.hash.startsWith("#/login") || !this.hash;
    },
    isRoleReady() {
      return !["", "null", "undefined"].includes(String(this.currentRoleId || "").trim().toLowerCase());
    },
    currentOemCapabilities() {
      // Only gate the sidebar/routes when a super-admin has entered a specific OEM's
      // workspace. Returns null otherwise → visibleRoutes/routeGroups/findRoute apply
      // no capability filtering, preserving the full single-tenant manifest exactly.
      const oem = this.oemStore.currentOem;
      return oem ? (oem.capabilities || {}) : null;
    },
    route() {
      return findRoute(this.hash, this.currentRoleId, this.currentOemCapabilities);
    },
    activePageTitle() {
      if (this.profileOpen) return "Profile";
      if (this.settingsOpen) return "Settings";
      if (this.showOemHub) return "OEM Hub";
      return this.route.title;
    },
    groups() {
      return routeGroups(this.currentRoleId, this.currentOemCapabilities);
    },
    sidebarGroups() {
      const query = this.sidebarQuery.trim().toLowerCase();
      if (!query) return this.groups;
      return this.groups
        .map((group) => ({
          ...group,
          routes: group.routes.filter((route) => group.name.toLowerCase().includes(query) || route.title.toLowerCase().includes(query))
        }))
        .filter((group) => group.routes.length);
    },
    breadcrumb() {
      return this.route.group === "Dashboard" ? "Dashboard" : `${this.route.group} / ${this.route.title}`;
    },
    deviceClass() {
      if (this.width <= 1024) return "mobile";
      if (this.collapsed) return "hideSidebar";
      return "";
    },
    userInitials() {
      return this.displayUserName.split(/[\s()_-]+/).filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('') || "U";
    },
    displayUserName() {
      const name = String(this.currentUserName || "").trim();
      return name && !["null", "undefined"].includes(name.toLowerCase()) ? name : "User";
    },
    currentUserFirstName() {
      return this.displayUserName.split(/[\s(]+/)[0] || "User";
    },
    searchResults() {
      const q = this.searchQuery.trim().toLowerCase();
      if (!q) return [];
      const results = [];
      for (const group of this.groups) {
        const matched = group.routes.filter(r => r.title.toLowerCase().includes(q) || group.name.toLowerCase().includes(q));
        if (matched.length) results.push({ group: group.name, routes: matched });
      }
      return results;
    },
    firstSearchResult() {
      return this.searchResults.length ? this.searchResults[0].routes[0] : null;
    },
    themeOptions() {
      return [
        { id: "system", label: "System" },
        { id: "light", label: "Light" },
        { id: "executive", label: "Executive" },
        { id: "contrast", label: "Contrast" }
      ];
    },
    themeIcon() {
      if (this.currentTheme === "light") return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path></svg>';
      if (this.currentTheme === "executive") return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><path d="M5 21V7l7-4 7 4v14"></path><path d="M9 21v-8h6v8"></path></svg>';
      if (this.currentTheme === "contrast") return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2v20"></path></svg>';
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>';
    },
    currentRoleName() {
      const labels = {
        "super-admin": "Super Admin",
        "operations-manager": "Operations Manager",
        account: "Account Officer",
        vendor: "Vendor",
        vendor_user: "Vendor User",
        "finance-checker": "Finance Checker"
      };
      const roleId = String(this.currentRoleId || "").trim();
      if (!roleId || ["null", "undefined"].includes(roleId.toLowerCase())) return "User";
      return labels[roleId] || roleId.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
    },
    primaryCreateTarget() {
      const routes = visibleRoutes(this.currentRoleId, this.currentOemCapabilities);
      return routes.find((route) => route.actions?.includes("Add Task"))
        || routes.find((route) => route.actions?.includes("Recharge"))
        || routes.find((route) => route.actions?.includes("Add"))
        || null;
    }
  },
  watch: {
    searchOpen(val) {
      if (val) this.$nextTick(() => this.$refs.searchInput && this.$refs.searchInput.focus());
      else this.searchQuery = '';
    },
    hash(newHash, oldHash) {
      if (newHash !== oldHash && this.width <= 1024) {
        this.sidebarOpen = false;
      }
      if (newHash !== oldHash) this.closeUserMenu();
    }
  },
  created() {
    window.addEventListener("hashchange", this.syncHash);
    window.addEventListener("resize", this.syncWidth);
    window.addEventListener("keydown", this.handleGlobalKeydown);
    window.addEventListener("pointerdown", this.handleOutsideMenus, true);
    window.addEventListener("pointerdown", this.bumpSessionActivity, { passive: true });
    window.addEventListener("mousemove", this.bumpSessionActivity, { passive: true });
    window.addEventListener("scroll", this.bumpSessionActivity, { passive: true });
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.mediaQuery.addEventListener('change', this.applyTheme);
    this.currentTheme = normalizeThemeChoice(this.currentTheme);
    this.syncProfileIdentity();
    this.applyTheme();
    this.armSessionTimer();
    this.loadUser();
  },
  beforeUnmount() {
    window.removeEventListener("hashchange", this.syncHash);
    window.removeEventListener("resize", this.syncWidth);
    window.removeEventListener("keydown", this.handleGlobalKeydown);
    window.removeEventListener("pointerdown", this.handleOutsideMenus, true);
    window.removeEventListener("pointerdown", this.bumpSessionActivity);
    window.removeEventListener("mousemove", this.bumpSessionActivity);
    window.removeEventListener("scroll", this.bumpSessionActivity);
    if (this.mediaQuery) this.mediaQuery.removeEventListener('change', this.applyTheme);
    if (this.sessionTimer) window.clearInterval(this.sessionTimer);
    this.stopSidebarResize();
  },
  methods: {
    setSidebarWidth(value) {
      this.sidebarWidth = Math.min(this.sidebarMaxWidth, Math.max(this.sidebarMinWidth, Math.round(value)));
    },
    startSidebarResize(event) {
      if (event.button !== 0) return;
      event.preventDefault();
      this.resizingSidebar = true;
      document.body.classList.add("sidebar-is-resizing");
      window.addEventListener("pointermove", this.resizeSidebar);
      window.addEventListener("pointerup", this.stopSidebarResize, { once: true });
    },
    resizeSidebar(event) {
      if (this.resizingSidebar) this.setSidebarWidth(event.clientX);
    },
    stopSidebarResize() {
      if (!this.resizingSidebar) return;
      this.resizingSidebar = false;
      document.body.classList.remove("sidebar-is-resizing");
      window.removeEventListener("pointermove", this.resizeSidebar);
      window.removeEventListener("pointerup", this.stopSidebarResize);
      localStorage.setItem(sidebarWidthKey, String(this.sidebarWidth));
    },
    resizeSidebarWithKeyboard(event) {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") this.setSidebarWidth(this.sidebarMinWidth);
      else if (event.key === "End") this.setSidebarWidth(this.sidebarMaxWidth);
      else this.setSidebarWidth(this.sidebarWidth + (event.key === "ArrowRight" ? 8 : -8));
      localStorage.setItem(sidebarWidthKey, String(this.sidebarWidth));
    },
    resetSidebarWidth() {
      this.setSidebarWidth(sidebarDefaultWidth);
      localStorage.setItem(sidebarWidthKey, String(this.sidebarWidth));
    },
    focusSidebarFilter() {
      if (this.width > 1024 && this.collapsed) this.collapsed = false;
      this.$nextTick(() => this.$refs.sidebarSearchInput?.focus());
    },
    bumpSessionActivity() {
      // readSessionState() is the authoritative "logged in" signal after Phase 7.
      // token is now an HttpOnly cookie — getCookie("token") always returns "".
      if (this.isLogin || !readSessionState()) return;
      const now = Date.now();
      if (now - this.lastSessionTouchAt < 15000) return;
      this.lastSessionTouchAt = now;
      touchSession();
    },
    armSessionTimer() {
      if (this.sessionTimer) window.clearInterval(this.sessionTimer);
      this.sessionTimer = window.setInterval(() => {
        // readSessionState() replaces getCookie("token") — token is now HttpOnly.
        if (!this.isLogin && readSessionState() && isSessionExpired()) {
          this.expireSession();
        }
      }, 15000);
    },
    expireSession() {
      clearSessionCookies();
      this.closeUserMenu();
      this.searchOpen = false;
      window.location.hash = "#/login?timeout=true";
      this.syncHash();
    },
    setTheme(theme) {
      const nextTheme = this.themeOptions.some((option) => option.id === theme) ? theme : normalizeThemeChoice(theme);
      this.currentTheme = nextTheme;
      localStorage.setItem('acob-theme', nextTheme);
      this.themeDropdownOpen = false;
      this.userThemePanelOpen = false;
      this.applyTheme();
    },
    applyTheme() {
      this.currentTheme = normalizeThemeChoice(this.currentTheme);
      const systemTheme = this.mediaQuery && this.mediaQuery.matches ? "executive" : "light";
      const resolvedTheme = this.currentTheme === "system" ? systemTheme : this.currentTheme;
      document.documentElement.setAttribute("data-theme", resolvedTheme);
      document.documentElement.setAttribute("data-theme-choice", this.currentTheme);
      localStorage.setItem('acob-theme', this.currentTheme);
    },
    nextRoute(hash) {
      return findRoute(hash, this.currentRoleId, this.currentOemCapabilities);
    },
    routeExists(hash) {
      const normalizedHash = normalizeHash(hash);
      return visibleRoutes(this.currentRoleId, this.currentOemCapabilities).some((route) => route.hash === normalizedHash);
    },
    async loadUser() {
      if (this.isLogin) return;
      if (!readSessionState()) {
        this.currentRoleId = null;
        this.currentUserName = null;
        window.location.hash = "#/login";
        this.syncHash();
        return;
      }
      try {
        // Primary: use /api/auth/me which validates the HttpOnly bev_token cookie server-side.
        // Falls back to currentUserInfo() if /api/auth/me is not yet available (during cutover).
        const meRes = await fetch("/api/auth/me", { credentials: "include" });
        if (meRes.status === 401) {
          // No valid session — clear local state and redirect.
          clearSessionCookies();
          this.currentRoleId = null;
          this.currentUserName = null;
          if (!this.isLogin) window.location.hash = "#/login";
          this.syncHash();
          return;
        }
        const meJson = await meRes.json().catch(() => null);
        if (meJson?.code === 0 && meJson?.data) {
          this.currentRoleId = meJson.data.roleId || null;
          this.currentUserName = meJson.data.userName || meJson.data.name || meJson.data.email || meJson.data.userId || null;
          // Keep display cookies in sync for components that read them directly.
          if (meJson.data.userId) setCookie("userId", meJson.data.userId);
          if (meJson.data.userName) setCookie("userName", meJson.data.userName);
          if (meJson.data.roleId) setCookie("roleId", meJson.data.roleId);
        } else {
          // /api/auth/me responded but with unexpected shape — fall back to currentUserInfo.
          const response = await currentUserInfo();
          this.currentRoleId = response.data?.roleId || null;
          this.currentUserName = response.data?.name || response.data?.userName || null;
        }
        try {
          await refreshLiveWriteStatus();
        } catch {
          setRuntimeLiveWritesAllowed(false);
        }
        this.syncProfileIdentity();
        this.oemStore.restoreSelection();
        // Super-admins work inside an OEM-scoped workspace; load the registry so the
        // sidebar can gate routes by the current OEM's capabilities (and so the Hub
        // is warm). Non-super-admin roles never pick an OEM and keep the full manifest.
        if (this.currentRoleId === "super-admin") {
          if (!this.oemStore.hasOems) this.oemStore.loadOems().catch(() => {});
          // Fire-and-forget: warm every active OEM's dashboard in the background so
          // clicking a Hub card is instant. Never awaited, never blocks login.
          warmAllOems(this.oemStore).catch(() => {});
        }
        this.syncHash();
      } catch (error) {
        // On any auth failure, fail closed — do not keep a stale super-admin role.
        this.currentRoleId = null;
        clearSessionCookies();
        if (!this.isLogin) window.location.hash = "#/login";
        this.syncHash();
      }
    },
    syncHash() {
      const nextHash = window.location.hash || "#/login?redirect=%2Fdashboard";
      if (normalizeHash(nextHash).startsWith("#/wallet/admin/")) {
        const configured = String(import.meta.env?.VITE_ADMIN_URL || "").trim();
        const adminUrl = configured || (import.meta.env?.DEV
          ? `${window.location.protocol}//${window.location.hostname}:5175/`
          : `${window.location.origin}/wallet-admin/`);
        window.location.assign(adminUrl);
        return;
      }
      if (normalizeHash(nextHash) === "#/prepay-report/site-consumption") {
        window.location.hash = "#/prepay-report/station-consumption";
        return;
      }
      if (normalizeHash(nextHash) === "#/system/live-probing") {
        window.location.hash = "#/system/automation-command";
        return;
      }
      this.hash = nextHash.startsWith("#/login")
        ? nextHash
        : (this.routeExists(nextHash) ? nextHash : this.nextRoute(nextHash).hash);
      if (!this.hash.startsWith("#/login") && window.location.hash !== this.hash) window.location.hash = this.hash;
      document.title = `${this.route.title} - Beverly`;

      if (this.route && this.route.group && this.route.group !== "Dashboard") {
        this.expandedGroups[this.route.group] = true;
      }
    },
    syncWidth() {
      const wasDesktop = this.width > 1024;
      this.width = window.innerWidth;
      if (wasDesktop && this.width <= 1024) this.sidebarOpen = false;
    },
    async goDashboard() {
      this.currentRoleId = null;
      this.currentUserName = null;
      this.hash = "#/dashboard";
      window.location.hash = "#/dashboard";
      await this.loadUser();
    },
    handleOemSelected() {
      playLoginVoice();
      this.hash = "#/dashboard";
      window.location.hash = "#/dashboard";
    },
    switchOem() {
      this.userDropdownOpen = false;
      this.oemStore.clearSelection();
    },
    syncProfileIdentity() {
      const profile = loadProfileState(this.currentUserName);
      if (profile.name) this.currentUserName = profile.name;
      this.profilePictureUrl = profile.profilePictureUrl || "";
    },
    toggleSidebar() {
      if (this.width <= 1024) {
        this.sidebarOpen = !this.sidebarOpen;
        if (this.sidebarOpen) {
          this.closeUserMenu();
          this.$nextTick(() => this.$refs.sidebarCloseButton?.$el?.focus());
        }
        return;
      }
      this.collapsed = !this.collapsed;
    },
    closeSidebar() {
      if (this.width <= 1024) this.sidebarOpen = false;
    },
    toggleGroup(groupName) {
      if (this.width > 1024 && this.collapsed) this.collapsed = false;
      this.expandedGroups[groupName] = !this.expandedGroups[groupName];
    },
    groupIcon(groupName) {
      return groupIcons[groupName] || groupIcons.Management;
    },
    sidebarSectionLabel(groupName) {
      return sidebarSectionLabels[groupName] || groupName;
    },
    routeIconPath(route) {
      const directIcon = routeIconOverrides[route?.hash];
      if (directIcon) {
        return directIcon;
      }
      const text = `${route?.group || ""} ${route?.title || ""} ${route?.hash || ""}`.toLowerCase();
      let icon = "meter";
      if (text.includes("dashboard")) icon = "dashboard";
      else if (text.includes("report") || text.includes("consumption") || text.includes("nonpurchase") || text.includes("abnormal") || text.includes("interval")) icon = "reports";
      else if (text.includes("remote") && text.includes("task")) icon = "task";
      else if (text.includes("meter reading")) icon = "reading";
      else if (text.includes("meter control")) icon = "control";
      else if (text.includes("token record") || text.includes("record")) icon = "record";
      else if (text.includes("token")) icon = "token";
      else if (text.includes("customer")) icon = "customer";
      else if (text.includes("gateway")) icon = "gateway";
      else if (text.includes("tariff")) icon = "tariff";
      else if (text.includes("account") || text.includes("debt")) icon = "account";
      else if (text.includes("user") || text.includes("role") || text.includes("log")) icon = "users";
      else if (text.includes("station")) icon = "station";
      else if (text.includes("protocol") || text.includes("dlms") || text.includes("dlt645")) icon = "protocol";
      else if (text.includes("support") || text.includes("gprs") || text.includes("firmware") || text.includes("profile") || text.includes("event") || text.includes("upload")) icon = "support";
      else if (text.includes("system") || text.includes("automation")) icon = "system";
      return routeIconPaths[icon];
    },
    sidebarClass(route, indent) {
      return ["sidebar-item", indent ? "indent" : "", `sidebar-tone-${this.routeTone(route)}`, route.hash === this.route.hash ? "active" : ""];
    },
    sidebarGroupClass(group) {
      return [
        "sidebar-item",
        "sidebar-group-toggle",
        `sidebar-tone-${this.routeTone({ group: group.name, title: group.name })}`,
        this.route.group === group.name ? "active" : "",
        this.expandedGroups[group.name] ? "expanded" : ""
      ];
    },
    routeTone(route) {
      const text = `${route?.group || ""} ${route?.title || ""}`.toLowerCase();
      if (text.includes("token")) return "violet";
      if (text.includes("remote")) return "blue";
      if (text.includes("report") || text.includes("consumption")) return "orange";
      if (text.includes("management") || text.includes("customer") || text.includes("gateway")) return "cyan";
      if (text.includes("admin") || text.includes("user") || text.includes("role") || text.includes("station")) return "rose";
      if (text.includes("protocol")) return "amber";
      if (text.includes("support") || text.includes("gprs")) return "indigo";
      if (text.includes("system") || text.includes("automation")) return "slate";
      return "emerald";
    },
    async handleSignOut() {
      clearSessionCookies();
      this.currentRoleId = null;
      this.currentUserName = null;
      window.location.hash = "#/login";
      this.closeUserMenu();
      this.syncHash();
    },
    openUserMenu() {
      this.userDropdownOpen = !this.userDropdownOpen;
      this.themeDropdownOpen = false;
      if (!this.userDropdownOpen) {
        this.userThemePanelOpen = false;
        return;
      }
      if (this.width <= 1024) this.sidebarOpen = false;
      this.$nextTick(() => this.$refs.userMenu?.querySelector('[role="menuitem"]')?.focus());
    },
    closeUserMenu() {
      this.userDropdownOpen = false;
      this.userThemePanelOpen = false;
    },
    handleOutsideMenus(event) {
      if (!this.userDropdownOpen) return;
      const accountMenu = this.$refs.accountMenuWrap;
      if (accountMenu && accountMenu.contains(event.target)) return;
      this.closeUserMenu();
    },
    openProfile() {
      this.closeUserMenu();
      this.settingsOpen = false;
      this.profileOpen = true;
    },
    openSettings() {
      this.settingsInitialTab = 'security';
      this.closeUserMenu();
      this.profileOpen = false;
      this.settingsOpen = true;
    },
    openPrimaryCreate() {
      if (!this.primaryCreateTarget) return;
      window.location.hash = this.primaryCreateTarget.hash;
      this.themeDropdownOpen = false;
      this.closeUserMenu();
      this.searchOpen = false;
    },
    openSearchFromMenu() {
      this.closeUserMenu();
      this.searchOpen = true;
    },
    openGlobalSearch() {
      this.closeSidebar();
      this.searchOpen = true;
    },
    openFullscreenFromMenu() {
      this.closeUserMenu();
      this.toggleFullscreen();
    },
    handleGlobalKeydown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); this.searchOpen = !this.searchOpen; }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !/input|textarea|select/i.test(e.target?.tagName || '')) {
        e.preventDefault();
        this.focusSidebarFilter();
      }
      if (e.key === 'Escape') {
        const restoreUserMenu = this.userDropdownOpen;
        const restoreSidebar = this.width <= 1024 && this.sidebarOpen;
        this.searchOpen = false;
        this.themeDropdownOpen = false;
        this.closeUserMenu();
        this.closeSidebar();
        this.$nextTick(() => {
          if (restoreUserMenu) this.$refs.userMenuButton?.$el?.focus();
          else if (restoreSidebar) this.$refs.sidebarToggleButton?.$el?.focus();
        });
      }
    },
    handleUserMenuKeydown(e) {
      const items = [...this.$refs.userMenu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')]
        .filter((item) => item.offsetParent !== null);
      if (!items.length) return;
      const current = Math.max(0, items.indexOf(document.activeElement));
      let next = current;
      if (e.key === 'ArrowDown') next = (current + 1) % items.length;
      else if (e.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = items.length - 1;
      else return;
      e.preventDefault();
      items[next].focus();
    },
    goFirstSearchResult() {
      if (this.firstSearchResult) {
        window.location.hash = this.firstSearchResult.hash;
        this.searchOpen = false;
        this.searchQuery = '';
      }
    },
    toggleFullscreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn('Fullscreen error:', err.message);
        });
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    },
    resolveExternalUrl(route) {
      const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      return isLocal ? (route.devExternalUrl || route.externalUrl) : route.externalUrl;
    }
  }
};
</script>

<style scoped>
.main-container {
  position: relative;
}

.fixed-header:has(.station-alerts--open) {
  z-index: 1102;
}

.main-container::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  z-index: 949;
  background:
    radial-gradient(circle at 88% 7%, color-mix(in srgb, var(--primary) 18%, transparent), transparent 17rem),
    linear-gradient(180deg, color-mix(in srgb, var(--bg-page) 18%, transparent), color-mix(in srgb, var(--bg-page) 34%, transparent));
  backdrop-filter: blur(0) saturate(100%);
  -webkit-backdrop-filter: blur(0) saturate(100%);
  transition:
    opacity var(--transition-fast),
    backdrop-filter var(--transition-fast),
    -webkit-backdrop-filter var(--transition-fast);
}

.bw-account-scrim {
  position: fixed;
  inset: 0;
  z-index: 950;
  background: transparent;
}

.main-container--account-menu-open::before {
  opacity: 1;
  backdrop-filter: blur(4px) saturate(108%);
  -webkit-backdrop-filter: blur(4px) saturate(108%);
}

.main-container--account-menu-open :deep(.content-page) {
  filter: saturate(0.94) brightness(0.97);
  transition: filter var(--transition-fast);
}

.main-container--account-menu-open :deep(.fixed-header .breadcrumb),
.main-container--account-menu-open :deep(.fixed-header .tags-view-container),
.main-container--account-menu-open :deep(.fixed-header .right-menu > :not(.bw-account-menu)) {
  filter: saturate(0.92) brightness(0.96);
  transition: filter var(--transition-fast);
}

.main-container--account-menu-open :deep(.fixed-header .navbar) {
  position: relative;
  z-index: 1005;
}

.main-container--account-menu-open :deep(.fixed-header .tags-view-container) {
  position: relative;
  z-index: 960;
}

.main-container--account-menu-open :deep(.fixed-header) {
  z-index: 1002;
}

.main-container--account-menu-open :deep(.bw-account-menu) {
  position: relative;
  z-index: 1003;
}

.main-container--account-menu-open :deep(.bw-user-dropdown) {
  z-index: 1004;
}

@media (min-width: 1025px) {
  .main-container::before,
  .bw-account-scrim {
    display: none;
  }

  .main-container--account-menu-open :deep(.content-page) {
    filter: none;
  }
}

/* ── Recharge wizard backdrop — mirrors account-menu-open blur effect ── */
</style>
