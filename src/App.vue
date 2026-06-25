<template>
  <div id="app-root">
  <LoginPage v-if="isLogin" @logged-in="goDashboard" />
  <div v-else :class="['app-page', deviceClass, sidebarOpen ? 'openSidebar' : '']">

    <div class="drawer-bg" @click="closeSidebar"></div>
    <aside class="sidebar-container">
      <div class="sidebar-logo">
        <span class="sidebar-logo-icon">B</span>
        <span class="sidebar-logo-text"><strong>Beverly</strong></span>
        <BaseIconButton v-if="width <= 1024" class="sidebar-mobile-close" @click.stop="closeSidebar" aria-label="Close sidebar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </BaseIconButton>
      </div>
      <nav class="sidebar-menu" aria-label="Main navigation">
        <template v-for="group in groups">
          <a
            v-if="group.name === 'Dashboard'"
            :key="'dash-' + group.name"
            :class="sidebarClass(group.routes[0], false)"
            :href="group.routes[0].hash"
            @click="closeSidebar"
          >
            <span class="sidebar-icon" v-html="groupIcon(group.name)"></span>
            <span class="sidebar-label">Dashboard</span>
          </a>
          <a
            v-else-if="group.routes.length === 1 && group.routes[0].external"
            :key="'ext-' + group.name"
            class="sidebar-item"
            :href="resolveExternalUrl(group.routes[0])"
            target="_blank"
            rel="noopener noreferrer"
            @click="closeSidebar"
          >
            <span class="sidebar-icon" v-html="groupIcon(group.name)"></span>
            <span class="sidebar-label">{{ group.name }}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;margin-left:auto;opacity:0.45;flex-shrink:0" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
          <div v-else :key="'group-' + group.name">
            <div class="sidebar-item" @click="toggleGroup(group.name)" style="cursor: pointer;">
              <span class="sidebar-icon" v-html="groupIcon(group.name)"></span>
              <span class="sidebar-label">{{ group.name }}</span>
              <span class="sidebar-caret" :style="{ transform: expandedGroups[group.name] ? 'rotate(90deg)' : 'rotate(0deg)' }">&#8250;</span>
            </div>
            <transition name="collapse">
              <div class="sidebar-submenu" v-show="expandedGroups[group.name]">
                <a v-for="route in group.routes" :key="route.hash" :class="sidebarClass(route, true)" :href="route.hash" @click="closeSidebar">
                  <span class="sidebar-dot"></span>
                  <span class="sidebar-label">{{ route.title }}</span>
                </a>
              </div>
            </transition>
          </div>
        </template>
      </nav>
      <div class="sidebar-footer">
        <BaseButton class="sidebar-signout" variant="ghost" @click="handleSignOut">
          <span class="sidebar-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          </span>
          <span class="sidebar-label">Sign Out</span>
        </BaseButton>
      </div>
    </aside>
    <section class="main-container">
      <header class="fixed-header">
        <div class="navbar" :aria-label="`${route.title} ${currentUserName}`">
          <BaseIconButton class="hamburger-container" aria-label="Toggle sidebar" @click="toggleSidebar">
            <span class="hamburger-lines">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </BaseIconButton>
          <div class="breadcrumb">{{ breadcrumb }}</div>
          <div class="right-menu">
            <div class="theme-dropdown-container" ref="accountMenuWrap">
              <BaseButton class="topbar-create" variant="ghost" :disabled="!primaryCreateTarget" @click="openPrimaryCreate" aria-label="Create Beverly task">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M12 5v14"></path>
                  <path d="M5 12h14"></path>
                </svg>
                <span>Create Task</span>
              </BaseButton>
              <BaseButton
                class="user-avatar-button"
                variant="ghost"
                @click="openUserMenu"
                :aria-label="`User menu for ${currentUserName}`"
                aria-haspopup="menu"
                :aria-expanded="String(userDropdownOpen)"
              >
                <span class="user-avatar">{{ userInitials }}</span>
              </BaseButton>
              <transition name="dropdown">
                <div v-show="userDropdownOpen" class="theme-dropdown user-dropdown" role="menu" aria-label="Beverly account menu">
                  <div class="user-dropdown-brand">
                    <span class="user-dropdown-logo">B</span>
                    <span>
                      <strong>Beverly</strong>
                      <small>{{ currentUserName }} - {{ currentRoleName }}</small>
                    </span>
                  </div>
                  <button type="button" class="user-menu-item active" role="menuitem" @click="openProfile">
                    <svg class="user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <path d="M20 21a8 8 0 0 0-16 0"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span>Profile</span>
                  </button>
                  <button type="button" class="user-menu-item" role="menuitem" @click="openSettings">
                    <svg class="user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z"></path>
                      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .92V20a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-.92 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.92-1H4a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 .92-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.92V4a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 .92 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.13.36.43.69.92 1H20a2 2 0 1 1 0 4h-.09c-.49.31-.79.64-.51 1z"></path>
                    </svg>
                    <span>Settings</span>
                  </button>
                  <button
                    type="button"
                    class="user-menu-item"
                    role="menuitem"
                    :aria-expanded="String(userThemePanelOpen)"
                    @click="userThemePanelOpen = !userThemePanelOpen"
                  >
                    <svg class="user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <path d="M12 21C7 16 5 11 6 5c6-1 11 1 13 6-4 1-7 4-9 8"></path>
                      <path d="M6 19c3-5 7-8 13-8"></path>
                    </svg>
                    <span>Theme</span>
                    <svg class="user-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="m9 18 6-6-6-6"></path>
                    </svg>
                  </button>
                  <div v-show="userThemePanelOpen" class="user-theme-panel" role="group" aria-label="Theme choices">
                    <button
                      v-for="theme in themeOptions"
                      :key="theme.id"
                      type="button"
                      :class="['user-theme-choice', { active: currentTheme === theme.id }]"
                      role="menuitemradio"
                      :aria-checked="String(currentTheme === theme.id)"
                      @click="setTheme(theme.id)"
                    >
                      <span class="theme-swatch" :style="{ background: theme.swatch }"></span>
                      <span>
                        <strong>{{ theme.label }}</strong>
                        <small>{{ theme.description }}</small>
                      </span>
                    </button>
                  </div>
                  <div class="user-menu-separator"></div>
                  <button type="button" class="user-menu-item" role="menuitem" @click="openSearchFromMenu">
                    <svg class="user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <path d="M15 6H9a3 3 0 0 0 0 6h6a3 3 0 0 0 0-6z"></path>
                      <path d="M9 12a3 3 0 0 0 0 6h6a3 3 0 0 0 0-6"></path>
                    </svg>
                    <span>Keyboard shortcuts</span>
                    <kbd>Ctrl K</kbd>
                  </button>
                  <button type="button" class="user-menu-item" role="menuitem" @click="openSearchFromMenu">
                    <svg class="user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <circle cx="11" cy="11" r="7"></circle>
                      <path d="m21 21-4.3-4.3"></path>
                    </svg>
                    <span>Global search</span>
                  </button>
                  <button type="button" class="user-menu-item" role="menuitem" @click="openFullscreenFromMenu">
                    <svg class="user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3"></path>
                      <path d="M16 3h3a2 2 0 0 1 2 2v3"></path>
                      <path d="M8 21H5a2 2 0 0 1-2-2v-3"></path>
                      <path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>
                    </svg>
                    <span>Fullscreen</span>
                  </button>
                  <button type="button" class="user-menu-item user-menu-item--danger" role="menuitem" @click="handleSignOut">
                    <svg class="user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                      <path d="m16 17 5-5-5-5"></path>
                      <path d="M21 12H9"></path>
                    </svg>
                    <span>Sign Out</span>
                  </button>
                </div>
              </transition>
            </div>
          </div>
        </div>
        <div class="tags-view-container">
          <a class="tags-view-item active" :href="route.hash">{{ route.title }}</a>
        </div>
      </header>
        <main :class="['content-page', route.hash === '#/dashboard' ? 'dashboard-editor-container' : '']">
          <DashboardPage v-if="route.hash === '#/dashboard'" />
          <DailyDataMeterPage v-else-if="route.hash === '#/prepay-report/daily-data-meter'" :route="route" />
          <OnboardingStudioPage v-else-if="route.customComponent === 'OnboardingStudioPage'" :route="route" />
          <AutomationCommandPage v-else-if="route.customComponent === 'AutomationCommandPage'" />
          <ConsumptionStatisticsPage v-else-if="route.customComponent === 'ConsumptionStatisticsPage'" :route="route" />
          <SiteConsumptionPage v-else-if="route.isCustomPage" :route="route" :hash="hash" :role-id="currentRoleId" />
          <TablePage v-else :route="route" />
        </main>
    </section>
    <ToastNotification />

    <!-- Profile Panel -->
    <ProfilePage
      v-if="profileOpen"
      :user-name="currentUserName"
      :role-id="currentRoleId"
      @close="profileOpen = false"
    />
    <SettingsPage
      v-if="settingsOpen"
      :user-name="currentUserName"
      :role-id="currentRoleId"
      :initial-tab="settingsInitialTab"
      @close="settingsOpen = false"
      @theme-change="setTheme"
    />

    <!-- Global Search Overlay -->
    <div v-if="searchOpen" class="search-overlay" @click.self="searchOpen = false">
      <div class="search-overlay-box">
        <div class="search-overlay-input-row">
          <svg viewBox="0 0 128 128" aria-hidden="true"><path d="M55 0C24.624 0 0 24.624 0 55s24.624 55 55 55c13.025 0 24.994-4.532 34.408-12.112L120.52 128 128 120.52 97.888 89.408C105.468 79.994 110 68.025 110 55 110 24.624 85.376 0 55 0zm0 10c24.853 0 45 20.147 45 45s-20.147 45-45 45-45-20.147-45-45 20.147-45 45-45z"/></svg>
          <input
            ref="searchInput"
            class="search-overlay-input"
            v-model="searchQuery"
            placeholder="Search pages & features..."
            @keydown.esc="searchOpen = false"
            @keydown.enter="goFirstSearchResult"
          />
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
        <div class="search-overlay-hint" v-else>Start typing to search pages and features</div>
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
import SiteConsumptionPage from "./components/SiteConsumptionPage.vue";
import TablePage from "./components/TablePage.vue";
import ProfilePage from "./components/ProfilePage.vue";
import SettingsPage from "./components/SettingsPage.vue";
import ToastNotification from "./components/ToastNotification.vue";
import BaseButton from "./components/base/BaseButton.vue";
import BaseIconButton from "./components/base/BaseIconButton.vue";
import { clearSessionCookies, currentUserInfo, getCookie, isSessionExpired, touchSession } from "./services/api";
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

const supportedThemeChoices = ["system", "light", "executive", "contrast"];

function normalizeThemeChoice(theme) {
  if (theme === "dark") return "executive";
  if (theme === "ocean") return "light";
  return supportedThemeChoices.includes(theme) ? theme : "system";
}

export default {
  name: "App",
  components: { AutomationCommandPage, BaseButton, BaseIconButton, ConsumptionStatisticsPage, DashboardPage, DailyDataMeterPage, LoginPage, OnboardingStudioPage, ProfilePage, SettingsPage, SiteConsumptionPage, TablePage, ToastNotification },
  data() {
    return {
      hash: window.location.hash || "#/login?redirect=%2Fdashboard",
      sidebarOpen: window.innerWidth > 1024,
      collapsed: false,
      width: window.innerWidth,
      currentRoleId: getCookie("roleId") || "super-admin",
      currentUserName: getCookie("userName") || "ACB(admin)",
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
    route() {
      return findRoute(this.hash, this.currentRoleId);
    },
    groups() {
      return routeGroups(this.currentRoleId);
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
      return (this.currentUserName || 'U').split(/[\s()_-]+/).filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('');
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
        { id: "system", label: "System", description: "Follow device", swatch: "linear-gradient(135deg, #10b981, #0f172a)" },
        { id: "light", label: "Light", description: "Clean operations", swatch: "linear-gradient(135deg, #ecfdf5, #ffffff)" },
        { id: "executive", label: "Executive", description: "Maximum legibility in green", swatch: "linear-gradient(135deg, #020202, #22c55e)" },
        { id: "contrast", label: "Contrast", description: "Maximum legibility", swatch: "linear-gradient(135deg, #000000, #facc15)" }
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
        vendor_manager: "Vendor Manager",
        "finance-checker": "Finance Checker"
      };
      return labels[this.currentRoleId] || String(this.currentRoleId || "User").replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
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
  },
  methods: {
    bumpSessionActivity() {
      if (this.isLogin || !getCookie("token")) return;
      const now = Date.now();
      if (now - this.lastSessionTouchAt < 15000) return;
      this.lastSessionTouchAt = now;
      touchSession();
    },
    armSessionTimer() {
      if (this.sessionTimer) window.clearInterval(this.sessionTimer);
      this.sessionTimer = window.setInterval(() => {
        if (!this.isLogin && getCookie("token") && isSessionExpired()) {
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
      if (this.isLogin || !getCookie("token")) return;
      try {
        const response = await currentUserInfo();
        this.currentRoleId = response.data?.roleId || this.currentRoleId;
        this.currentUserName = response.data?.name || this.currentUserName;
        this.syncHash();
      } catch (error) {
        if ((error?.message || "").includes("Session expired")) {
          this.expireSession();
          return;
        }
        throw error;
      }
    },
    syncHash() {
      const nextHash = window.location.hash || "#/login?redirect=%2Fdashboard";
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
      this.width = window.innerWidth;
    },
    goDashboard() {
      this.currentRoleId = getCookie("roleId") || "super-admin";
      this.currentUserName = getCookie("userName") || "ACB(admin)";
      window.location.hash = this.nextRoute("#/dashboard").hash;
      this.syncHash();
    },
    toggleSidebar() {
      if (this.width <= 1024) this.sidebarOpen = !this.sidebarOpen;
      else this.collapsed = !this.collapsed;
    },
    closeSidebar() {
      if (this.width <= 1024) this.sidebarOpen = false;
    },
    toggleGroup(groupName) {
      this.expandedGroups[groupName] = !this.expandedGroups[groupName];
    },
    groupIcon(groupName) {
      return groupIcons[groupName] || groupIcons.Management;
    },
    sidebarClass(route, indent) {
      return ["sidebar-item", indent ? "indent" : "", route.hash === this.route.hash ? "active" : ""];
    },
    handleSignOut() {
      clearSessionCookies();
      window.location.hash = "#/login";
      this.closeUserMenu();
      this.syncHash();
    },
    openUserMenu() {
      this.userDropdownOpen = !this.userDropdownOpen;
      this.themeDropdownOpen = false;
      if (!this.userDropdownOpen) this.userThemePanelOpen = false;
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
    openFullscreenFromMenu() {
      this.closeUserMenu();
      this.toggleFullscreen();
    },
    handleGlobalKeydown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); this.searchOpen = !this.searchOpen; }
      if (e.key === 'Escape') {
        this.searchOpen = false;
        this.themeDropdownOpen = false;
        this.closeUserMenu();
      }
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
