<template>
  <div id="app-root">
  <LoginPage v-if="isLogin" @logged-in="goDashboard" />
  <div v-else-if="!isRoleReady" class="app-role-loading" role="status" aria-label="Authenticating">
    <div class="app-role-loading-spinner" aria-hidden="true"></div>
    <p class="app-role-loading-text">Verifying session&hellip;</p>
  </div>
  <div
    v-else
    :class="['app-page', deviceClass, sidebarOpen ? 'openSidebar' : '']"
    :style="{ '--layout-sidebar-width': `${sidebarWidth}px` }"
  >

    <div class="drawer-bg" @click="closeSidebar"></div>
    <aside
      class="sidebar-container"
      aria-label="Primary navigation"
      :aria-hidden="width <= 1024 && !sidebarOpen ? 'true' : 'false'"
      :inert="width <= 1024 && !sidebarOpen ? '' : null"
    >
      <div class="sidebar-logo">
        <span class="sidebar-logo-icon">B</span>
        <span class="sidebar-logo-text sidebar-brand-copy">
          <strong>Beverly</strong>
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
                      <template v-else>B</template>
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
          />
          <DashboardPage v-else-if="route.hash === '#/dashboard'" />
          <ReportsPage v-else-if="route.customComponent === 'ReportsPage'" />
          <DailyDataMeterPage v-else-if="route.hash === '#/prepay-report/daily-data-meter'" :route="route" />
          <OnboardingStudioPage v-else-if="route.customComponent === 'OnboardingStudioPage'" :route="route" />
          <AutomationCommandPage v-else-if="route.customComponent === 'AutomationCommandPage'" />
          <ConsumptionStatisticsPage v-else-if="route.customComponent === 'ConsumptionStatisticsPage'" :route="route" />
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
import { clearSessionCookies, currentUserInfo, getCookie, isSessionExpired, readSessionState, refreshLiveWriteStatus, setCookie, setRuntimeLiveWritesAllowed, touchSession } from "./services/api";
import { loadProfileState } from "./services/profile-store.mjs";
import { findRoute, normalizeHash, routeGroups, visibleRoutes } from "./data/route-manifest";

const groupIcons = {
  Dashboard: '<svg viewBox="0 0 128 100" aria-hidden="true"><path d="M27.429 63.638c0-2.508-.893-4.65-2.679-6.424-1.786-1.775-3.94-2.662-6.464-2.662-2.524 0-4.679.887-6.465 2.662-1.785 1.774-2.678 3.916-2.678 6.424 0 2.508.893 4.65 2.678 6.424 1.786 1.775 3.94 2.662 6.465 2.662 2.524 0 4.678-.887 6.464-2.662 1.786-1.775 2.679-3.916 2.679-6.424zm44.285 2.342 7.215-27.116c.285-1.23.107-2.378-.536-3.443-.643-1.064-1.56-1.762-2.75-2.094-1.19-.33-2.333-.177-3.429.462-1.095.639-1.81 1.573-2.143 2.804l-7.214 27.116c-2.857.237-5.405 1.266-7.643 3.088-2.238 1.822-3.738 4.152-4.5 6.992-.952 3.644-.476 7.098 1.429 10.364 1.905 3.265 4.69 5.37 8.357 6.317 3.667.947 7.143.474 10.429-1.42 3.285-1.892 5.404-4.66 6.357-8.305.762-2.84.619-5.607-.429-8.305-1.047-2.697-2.762-4.85-5.143-6.46zM128 63.638c0 12.351-3.357 23.78-10.071 34.286-.905 1.372-2.19 2.058-3.858 2.058H13.93c-1.667 0-2.953-.686-3.858-2.058C3.357 87.465 0 76.037 0 63.638c0-8.613 1.69-16.847 5.071-24.703C8.452 31.08 13 24.312 18.714 18.634c5.715-5.68 12.524-10.199 20.429-13.559C47.048 1.715 55.333.035 64 .035c8.667 0 16.952 1.68 24.857 5.04 7.905 3.36 14.714 7.88 20.429 13.559 5.714 5.678 10.262 12.446 13.643 20.301 3.38 7.856 5.071 16.09 5.071 24.703z"/></svg>',
  "Token Generate": '<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M84.068 23.784c-1.02 0-1.877-.32-2.572-.96a8.588 8.588 0 0 1-1.738-2.237 11.524 11.524 0 0 1-1.042-2.621c-.232-.895-.348-1.641-.348-2.238V0h.278c.834 0 1.622.085 2.363.256.742.17 1.645.575 2.711 1.214 1.066.64 2.363 1.535 3.892 2.686 1.53 1.15 3.453 2.664 5.77 4.54 2.502 2.045 4.494 3.771 5.977 5.178 1.483 1.406 2.618 2.6 3.406 3.58.787.98 1.274 1.812 1.46 2.494.185.682.277 1.278.277 1.79v2.046H84.068zM78.23 95.902c2.038 0 3.752-.511 5.143-1.534l-26.969 25.83H18.037c-1.761 0-3.684-.47-5.77-1.407a24.549 24.549 0 0 1-5.838-3.709 21.373 21.373 0 0 1-4.518-5.306c-1.204-2.003-1.807-4.07-1.807-6.202V16.495c0-1.79.44-3.665 1.32-5.626A18.41 18.41 0 0 1 5.04 5.562a21.798 21.798 0 0 1 5.213-3.964C12.198.533 14.237 0 16.37 0h53.24v15.984c0 1.62.278 3.367.834 5.242a16.704 16.704 0 0 0 2.572 5.179c1.159 1.577 2.665 2.898 4.518 3.964 1.853 1.066 4.078 1.598 6.673 1.598h20.295v42.325L85.458 92.45c1.02-1.364 1.529-2.856 1.529-4.476 0-2.216-.857-4.113-2.572-5.69-1.714-1.577-3.776-2.366-6.186-2.366H26.1c-2.409 0-4.448.789-6.116 2.366-1.668 1.577-2.502 3.474-2.502 5.69 0 2.217.834 4.092 2.502 5.626 1.668 1.535 3.707 2.302 6.117 2.302h52.13z"/></svg>',
  "Token Record": '<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M0 0h30v52H0zm49 0h30v80H49zm49 0h30v128H98zM0 71h30v57H0zm49 57h30v-30H49zm49 0h30v-11H98z"/></svg>',
  "Remote Operation": '<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M31.652 93.206h33.401c1.44 2.418 3.077 4.663 4.93 6.692h-38.33v-6.692zm0-17.274H59.39c.288-2.286.714-4.532 1.34-6.687H31.65v6.687zm0-17.27H59.39c.288-2.286.714-4.532 1.34-6.687H31.65v6.687zm53.913 51.528v5.85c0 2.798-2.095 5.075-4.667 5.075h-70.07c-2.576 0-4.663-2.277-4.663-5.075V31.26l23.22-20.96v22.25H17.16v6.688h18.39V6.688h45.348c2.576 0 4.667 2.277 4.667 5.066v20.009c1.987-.675 4.053-1.128 6.17-1.445v-18.56C91.738 5.28 86.874 0 80.902 0H31.15L0 28.118v87.917c0 6.48 4.859 11.759 10.832 11.759h70.07c5.974 0 10.837-5.27 10.837-11.759v-4.41c-2.117-.312-4.183-.765-6.17-1.435h-.004zM128 70.978c0-18.632-13.97-33.782-31.147-33.782-17.168 0-31.135 15.155-31.135 33.782 0 18.628 13.97 33.783 31.135 33.783 17.172 0 31.143-15.15 31.143-33.783H128z"/></svg>',
  "Remote Operation Task": '<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M44.8 0h79.543C126.78 0 128 1.422 128 4.267v23.466c0 2.845-1.219 4.267-3.657 4.267H44.8c-2.438 0-3.657-1.422-3.657-4.267V4.267C41.143 1.422 42.362 0 44.8 0zm22.857 48h56.686c2.438 0 3.657 1.422 3.657 4.267v23.466c0 2.845-1.219 4.267-3.657 4.267H67.657C65.22 80 64 78.578 64 75.733V52.267C64 49.422 65.219 48 67.657 48zm0 48h56.686c2.438 0 3.657 1.422 3.657 4.267v23.466c0 2.845-1.219 4.267-3.657 4.267H67.657C65.22 128 64 126.578 64 123.733v-23.466C64 97.422 65.219 96 67.657 96zM50.286 68.267c2.02 0 3.657-1.91 3.657-4.267 0-2.356-1.638-4.267-3.657-4.267H17.37V32h6.4c2.02 0 3.658-1.91 3.658-4.267V4.267C27.429 1.91 25.79 0 23.77 0H3.657C1.637 0 0 1.91 0 4.267v23.466C0 30.09 1.637 32 3.657 32h6.4v80c0 2.356 1.638 4.267 3.657 4.267h36.572c2.02 0 3.657-1.91 3.657-4.267 0-2.356-1.638-4.267-3.657-4.267H17.37V68.267h32.915z"/></svg>',
  "Data Report": '<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M96.258 57.462h31.421C124.794 27.323 100.426 2.956 70.287.07v31.422a32.856 32.856 0 0 1 25.971 25.97zm-38.796-25.97V.07C27.323 2.956 2.956 27.323.07 57.462h31.422a32.856 32.856 0 0 1 25.97-25.97zm12.825 64.766v31.421c30.46-2.885 54.507-27.253 57.713-57.712H96.579c-2.886 13.466-13.146 23.726-26.292 26.291zM31.492 70.287H.07c2.886 30.46 27.253 54.507 57.713 57.713V96.579c-13.466-2.886-23.726-13.146-26.291-26.292z"/></svg>',
  Management: '<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M115.625 127.937H.063V12.375h57.781v12.374H12.438v90.813h90.813V70.156h12.374zM127.893 37.982h-12.375V12.375H88.706V0h39.187z"/></svg>',
  Wallet: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a3 3 0 0 1 3-3h14v16H6a3 3 0 0 1-3-3V7z"></path><path d="M16 12h4"></path><path d="M6 8h14"></path></svg>',
  Administration: '<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M64 0C46.327 0 32 14.327 32 32s14.327 32 32 32 32-14.327 32-32S81.673 0 64 0zM9.6 128C4.298 128 0 123.702 0 118.4c0-28.277 22.923-51.2 51.2-51.2h25.6C105.077 67.2 128 90.123 128 118.4c0 5.302-4.298 9.6-9.6 9.6H9.6z"/></svg>',
  Protocol: '<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M0 16h128v16H0zm0 40h128v16H0zm0 40h128v16H0zM16 0h16v128H16zm80 0h16v128H96z"/></svg>',
  "Remote Support": '<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M64 0C28.654 0 0 28.654 0 64s28.654 64 64 64 64-28.654 64-64S99.346 0 64 0zm0 112C36.394 112 16 91.606 16 64S36.394 16 64 16s48 20.394 48 48-20.394 48-48 48zm-8-72h16v16H56zm0 32h16v24H56z"/></svg>',
  System: '<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M10 20h108v28H10zm0 60h108v28H10zm18-42h18v-8H28zm54 60h18v-8H82z"/></svg>'
};

const sidebarSectionLabels = {
  Dashboard: "Overview",
  "Data Report": "Insights",
  "Token Generate": "Token Operations",
  "Token Record": "Token Records",
  "Remote Operation": "Remote Operations",
  "Remote Operation Task": "Task Queue",
  Management: "Management",
  Administration: "Administration",
  Protocol: "Protocol",
  "Remote Support": "Remote Support",
  System: "System"
};

const routeIconPaths = {
  dashboard: "M4 4h6v7H4zM14 4h6v4h-6zM14 12h6v8h-6zM4 15h6v5H4z",
  reports: "M4 20V4m0 16h16M7 15l4-4 3 3 5-7",
  token: "M12 2a5 5 0 0 0-5 5v3H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-2V7a5 5 0 0 0-5-5zm0 4a1 1 0 0 1 1 1v3h-2V7a1 1 0 0 1 1-1z",
  record: "M14 3H6v18h12V9zm0 0v6h6M9 14h6M9 18h4",
  reading: "M4 19V5m0 14h16M8 15l3-4 3 2 3-5",
  control: "M12 2v10m5.66-5.66A8 8 0 1 1 6.34 6.34",
  task: "M9 11l3 3L22 4M21 12v7H3V5h13",
  customer: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-1a8 8 0 0 1 16 0v1",
  gateway: "M5 18h14M7 14h10M9 10h6M11 6h2",
  tariff: "M5 4h14v16H5zm4 4h6m-6 4h6m-6 4h4",
  account: "M3 7h18v12H3zm0 4h18m-5 4h2",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87",
  station: "M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6z",
  meter: "M3 3h18v18H3zm4 5h10m-7 4h4m-5 4h6",
  protocol: "M4 5h16M4 12h16M4 19h16M8 3v18m8-18v18",
  support: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm-3-9h6m-3-3v6",
  system: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm7.4-.5a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.36.44.68.91 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
};

const routeIconOverrides = {
  "#/dashboard": routeIconPaths.dashboard,
  "#/admin/reports": routeIconPaths.reports,
  "#/prepay-report/long-nonpurchase-situation": "M6 2h12M6 22h12M8 2v5a4 4 0 0 0 8 0V2m0 15a4 4 0 0 0-8 0v5",
  "#/prepay-report/low-purchase-situation": "M4 4v16h16M8 8l4 4 3-3 3 3M18 15v-3h-3",
  "#/prepay-report/consumption-statistics": "M12 3a9 9 0 1 0 9 9h-9V3zm3 12h6a9 9 0 0 1-6 6v-6z",
  "#/prepay-report/daily-data-meter": "M5 3v3m14-3v3M4 8h16M5 5h14v16H5zM8 12h3m2 0h3m-8 4h3",
  "#/prepay-report/abnormal-alarm": "M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4m0 4h.01",
  "#/prepay-report/station-consumption": "M4 21V7l8-4 8 4v14M8 21v-5h8v5M8 10h.01M12 10h.01M16 10h.01",
  "#/token-generate/credit-token": "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  "#/token-generate/change-meter-key": "M15.5 7.5a4 4 0 1 1-5.7 5.6L3 20v1h5l1-1v-2h2l1-1v-2l3.5-3.5z",
  "#/token-generate/clear-tamper-token": "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
  "#/token-generate/clear-credit-token": "M20 11a8 8 0 1 0 2 5.5M20 4v7h-7",
  "#/token-generate/set-maximum-power-limit-token": "M13 2 3 14h8l-1 8 10-12h-8l1-8z",
  "#/token-record/credit-token-record": "M14 2H6v20h12V8zm0 0v6h6M9 13h6M9 17h6",
  "#/token-record/clear-tamper-token-record": "M14 2H6v20h12V8zm0 0v6h6M9 14l2 2 4-4",
  "#/token-record/clear-credit-token-record": "M14 2H6v20h12V8zm0 0v6h6M9 15h6M9 19h4M7 11l2-2",
  "#/token-record/set-maximum-power-limit-token-record": "M14 2H6v20h12V8zm0 0v6h6M12 11v7m-3-3h6",
  "#/remote-operation/remote-meter-reading": "M4 19V5m0 14h16M8 15l3-4 3 2 3-5",
  "#/remote-operation/remote-meter-control": "M12 2v10m5.66-5.66A8 8 0 1 1 6.34 6.34",
  "#/remote-operation/remote-meter-token": "M5 12h12m-4-4 4 4-4 4M3 5h18v14H3z",
  "#/remote-operation-record/remote-meter-reading-task": "M9 11l3 3L22 4M21 12v7H3V5h13M7 9h2",
  "#/remote-operation-record/remote-meter-control-task": "M4 4h16v16H4zM8 9h8M8 15h5m3-1 2 2 3-4",
  "#/remote-operation-record/remote-meter-token-task": "M5 3h14v18H5zM8 8h8M8 12h5m2 4 4-4-4-4",
  "#/management/gateway": "M4 18h16M7 14h10M9 10h6M11 6h2",
  "#/management/customer": "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-1a8 8 0 0 1 16 0v1",
  "#/management/tariff": "M20 12 12 20 4 12l8-8 8 8zM8 12h.01",
  "#/management/account": "M3 7h18v12H3zm0 4h18m-5 4h2",
  "#/admin/user": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87",
  "#/admin/role": "M3 11h18v10H3zM7 11V7a5 5 0 0 1 10 0v4M12 15v2",
  "#/admin/log": "M6 3h12v18H6zM9 7h6M9 11h6M9 15h4",
  "#/admin/station": "M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6z",
  "#/admin/item": "M3 7 12 2l9 5v10l-9 5-9-5V7zm0 0 9 5 9-5M12 12v10",
  "#/admin/meter": "M3 3h18v18H3zm4 5h10m-7 4h4m-5 4h6",
  "#/admin/debt": "M3 3h18v18H3zm4 5h10m-7 5h8m-8 4h5",
  "#/wallet": "M4 7h15a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12v4M16 12h5v5h-5a2.5 2.5 0 0 1 0-5z",
  "#/protocol/dlms": "M4 4h16v16H4zM8 8h8M8 12h8M8 16h5",
  "#/protocol/dlt645": "M4 5h16M4 12h16M4 19h16M8 3v18m8-18v18",
  "#/remote-support/gprs-tasks": "M12 20v-8m0-4v.01M5.6 5.6a9 9 0 0 1 12.8 0M2.8 2.8a13 13 0 0 1 18.4 0",
  "#/remote-support/gprs-online-status": "M3 12h4l3-8 4 16 3-8h4",
  "#/remote-support/load-profile": "M4 20V4m0 16h16M7 16l3-5 3 2 4-6",
  "#/remote-support/event-notification": "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  "#/remote-support/firmware-update": "M12 3v12m-4-4 4 4 4-4M5 21h14",
  "#/remote-support/file-upload": "M14 2H6v20h12V8zm0 0v6h6M12 18v-7m-3 3 3-3 3 3",
  "#/system/station-onboarding-studio": "M13 2 3 14h7l-1 8 12-14h-7l-1-6z",
  "#/system/automation-command": "M8 4h8M9 4V2m6 2V2M5 8h14v10H5zM8 12h.01M16 12h.01M9 18v3m6-3v3M3 12H1m22 0h-2"
};

const supportedThemeChoices = ["system", "light", "executive", "contrast"];

function normalizeThemeChoice(theme) {
  if (theme === "dark") return "executive";
  if (theme === "ocean") return "light";
  return supportedThemeChoices.includes(theme) ? theme : "system";
}

export default {
  name: "App",
  components: { AutomationCommandPage, BaseButton, BaseIconButton, ConsumptionStatisticsPage, DashboardPage, DailyDataMeterPage, DisputesPage, LoginPage, MeterKeyChangePage, OnboardingStudioPage, ProfilePage, ReconciliationPage, RefundsPage, ReportsPage, SettingsPage, SettlementPage, StationAlertsBell, StationConsumptionPage, TablePage, ToastNotification, VendingMonitorPage, WalletFundingPage },
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
    isLogin() {
      return this.hash.startsWith("#/login") || !this.hash;
    },
    isRoleReady() {
      return !["", "null", "undefined"].includes(String(this.currentRoleId || "").trim().toLowerCase());
    },
    route() {
      return findRoute(this.hash, this.currentRoleId);
    },
    activePageTitle() {
      if (this.profileOpen) return "Profile";
      if (this.settingsOpen) return "Settings";
      return this.route.title;
    },
    groups() {
      return routeGroups(this.currentRoleId);
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
      const routes = visibleRoutes(this.currentRoleId);
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
      return findRoute(hash, this.currentRoleId);
    },
    routeExists(hash) {
      const normalizedHash = normalizeHash(hash);
      return visibleRoutes(this.currentRoleId).some((route) => route.hash === normalizedHash);
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


/* Security loading screen — shown while server-side role is being confirmed */
.app-role-loading {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  background: var(--color-bg, #0a0f0a);
  z-index: 9999;
}

.app-role-loading-spinner {
  width: 2.5rem;
  height: 2.5rem;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: var(--color-accent, #22c55e);
  border-radius: 50%;
  animation: app-spin 0.75s linear infinite;
}

.app-role-loading-text {
  font-size: 0.875rem;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.45));
  letter-spacing: 0.02em;
}

@keyframes app-spin {
  to { transform: rotate(360deg); }
}
</style>
