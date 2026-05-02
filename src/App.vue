<template>
  <LoginPage v-if="isLogin" @logged-in="goDashboard" />
  <div v-else :class="['app-page', deviceClass, sidebarOpen ? 'openSidebar' : '']">
    <div class="drawer-bg" @click="sidebarOpen = false"></div>
    <aside class="sidebar-container">
      <div class="sidebar-logo">
        <span class="sidebar-logo-icon">B</span>
        <span class="sidebar-logo-text">Beverly</span>
      </div>
      <nav class="sidebar-menu" aria-label="Main navigation">
        <template v-for="group in groups">
          <a
            v-if="group.name === 'Dashboard'"
            :key="'dash-' + group.name"
            :class="sidebarClass(group.routes[0], false)"
            :href="group.routes[0].hash"
          >
            <span class="sidebar-icon" v-html="groupIcon(group.name)"></span>
            <span class="sidebar-label">Dashboard</span>
          </a>
          <div v-else :key="'group-' + group.name">
            <div class="sidebar-item" @click="toggleGroup(group.name)" style="cursor: pointer;">
              <span class="sidebar-icon" v-html="groupIcon(group.name)"></span>
              <span class="sidebar-label">{{ group.name }}</span>
              <span class="sidebar-caret" :style="{ transform: expandedGroups[group.name] ? 'rotate(90deg)' : 'rotate(0deg)' }">&#8250;</span>
            </div>
            <transition name="collapse">
              <div class="sidebar-submenu" v-show="expandedGroups[group.name]">
                <a v-for="route in group.routes" :key="route.hash" :class="sidebarClass(route, true)" :href="route.hash">
                  <span class="sidebar-dot"></span>
                  <span class="sidebar-label">{{ route.title }}</span>
                </a>
              </div>
            </transition>
          </div>
        </template>
      </nav>
      <div class="sidebar-footer">
        <button class="sidebar-signout" @click="handleSignOut">
          <span class="sidebar-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          </span>
          <span class="sidebar-label">Sign Out</span>
        </button>
      </div>
    </aside>
    <section class="main-container">
      <header class="fixed-header">
        <div class="navbar" :aria-label="`${route.title} ${currentUserName}`">
          <button class="hamburger-container" type="button" aria-label="Toggle sidebar" @click="toggleSidebar">
            <span class="hamburger-lines">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </button>
          <div class="breadcrumb">{{ breadcrumb }}</div>
          <div class="right-menu">
            <span class="topbar-tool" v-html="topbarIcon('search')"></span>
            <span class="topbar-tool" v-html="topbarIcon('fullscreen')"></span>
            <span class="topbar-tool" v-html="topbarIcon('user')"></span>
            <span>{{ currentUserName }}</span>
          </div>
        </div>
        <div class="tags-view-container"><a class="tags-view-item" :href="route.hash">{{ route.title }}</a></div>
      </header>
      <main :class="['content-page', route.hash === '#/dashboard' ? 'dashboard-editor-container' : '']">
        <DashboardPage v-if="route.hash === '#/dashboard'" />
        <TablePage v-else :route="route" />
      </main>
    </section>
    <ToastNotification />
  </div>
</template>

<script>
import DashboardPage from "./components/DashboardPage.vue";
import LoginPage from "./components/LoginPage.vue";
import TablePage from "./components/TablePage.vue";
import ToastNotification from "./components/ToastNotification.vue";
import { currentUserInfo, getCookie, setCookie } from "./services/api";
import { findRoute, routeGroups } from "./data/route-manifest";

const groupIcons = {
  Dashboard: '<svg viewBox="0 0 128 100" aria-hidden="true"><path d="M27.429 63.638c0-2.508-.893-4.65-2.679-6.424-1.786-1.775-3.94-2.662-6.464-2.662-2.524 0-4.679.887-6.465 2.662-1.785 1.774-2.678 3.916-2.678 6.424 0 2.508.893 4.65 2.678 6.424 1.786 1.775 3.94 2.662 6.465 2.662 2.524 0 4.678-.887 6.464-2.662 1.786-1.775 2.679-3.916 2.679-6.424zm44.285 2.342 7.215-27.116c.285-1.23.107-2.378-.536-3.443-.643-1.064-1.56-1.762-2.75-2.094-1.19-.33-2.333-.177-3.429.462-1.095.639-1.81 1.573-2.143 2.804l-7.214 27.116c-2.857.237-5.405 1.266-7.643 3.088-2.238 1.822-3.738 4.152-4.5 6.992-.952 3.644-.476 7.098 1.429 10.364 1.905 3.265 4.69 5.37 8.357 6.317 3.667.947 7.143.474 10.429-1.42 3.285-1.892 5.404-4.66 6.357-8.305.762-2.84.619-5.607-.429-8.305-1.047-2.697-2.762-4.85-5.143-6.46zM128 63.638c0 12.351-3.357 23.78-10.071 34.286-.905 1.372-2.19 2.058-3.858 2.058H13.93c-1.667 0-2.953-.686-3.858-2.058C3.357 87.465 0 76.037 0 63.638c0-8.613 1.69-16.847 5.071-24.703C8.452 31.08 13 24.312 18.714 18.634c5.715-5.68 12.524-10.199 20.429-13.559C47.048 1.715 55.333.035 64 .035c8.667 0 16.952 1.68 24.857 5.04 7.905 3.36 14.714 7.88 20.429 13.559 5.714 5.678 10.262 12.446 13.643 20.301 3.38 7.856 5.071 16.09 5.071 24.703z"/></svg>',
  "Token Generate": '<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M84.068 23.784c-1.02 0-1.877-.32-2.572-.96a8.588 8.588 0 0 1-1.738-2.237 11.524 11.524 0 0 1-1.042-2.621c-.232-.895-.348-1.641-.348-2.238V0h.278c.834 0 1.622.085 2.363.256.742.17 1.645.575 2.711 1.214 1.066.64 2.363 1.535 3.892 2.686 1.53 1.15 3.453 2.664 5.77 4.54 2.502 2.045 4.494 3.771 5.977 5.178 1.483 1.406 2.618 2.6 3.406 3.58.787.98 1.274 1.812 1.46 2.494.185.682.277 1.278.277 1.79v2.046H84.068zM78.23 95.902c2.038 0 3.752-.511 5.143-1.534l-26.969 25.83H18.037c-1.761 0-3.684-.47-5.77-1.407a24.549 24.549 0 0 1-5.838-3.709 21.373 21.373 0 0 1-4.518-5.306c-1.204-2.003-1.807-4.07-1.807-6.202V16.495c0-1.79.44-3.665 1.32-5.626A18.41 18.41 0 0 1 5.04 5.562a21.798 21.798 0 0 1 5.213-3.964C12.198.533 14.237 0 16.37 0h53.24v15.984c0 1.62.278 3.367.834 5.242a16.704 16.704 0 0 0 2.572 5.179c1.159 1.577 2.665 2.898 4.518 3.964 1.853 1.066 4.078 1.598 6.673 1.598h20.295v42.325L85.458 92.45c1.02-1.364 1.529-2.856 1.529-4.476 0-2.216-.857-4.113-2.572-5.69-1.714-1.577-3.776-2.366-6.186-2.366H26.1c-2.409 0-4.448.789-6.116 2.366-1.668 1.577-2.502 3.474-2.502 5.69 0 2.217.834 4.092 2.502 5.626 1.668 1.535 3.707 2.302 6.117 2.302h52.13z"/></svg>',
  "Token Record": '<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M0 0h30v52H0zm49 0h30v80H49zm49 0h30v128H98zM0 71h30v57H0zm49 57h30v-30H49zm49 0h30v-11H98z"/></svg>',
  "Remote Operation": '<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M31.652 93.206h33.401c1.44 2.418 3.077 4.663 4.93 6.692h-38.33v-6.692zm0-17.274H59.39c.288-2.286.714-4.532 1.34-6.687H31.65v6.687zm0-17.27H59.39c.288-2.286.714-4.532 1.34-6.687H31.65v6.687zm53.913 51.528v5.85c0 2.798-2.095 5.075-4.667 5.075h-70.07c-2.576 0-4.663-2.277-4.663-5.075V31.26l23.22-20.96v22.25H17.16v6.688h18.39V6.688h45.348c2.576 0 4.667 2.277 4.667 5.066v20.009c1.987-.675 4.053-1.128 6.17-1.445v-18.56C91.738 5.28 86.874 0 80.902 0H31.15L0 28.118v87.917c0 6.48 4.859 11.759 10.832 11.759h70.07c5.974 0 10.837-5.27 10.837-11.759v-4.41c-2.117-.312-4.183-.765-6.17-1.435h-.004zM128 70.978c0-18.632-13.97-33.782-31.147-33.782-17.168 0-31.135 15.155-31.135 33.782 0 18.628 13.97 33.783 31.135 33.783 17.172 0 31.143-15.15 31.143-33.783H128z"/></svg>',
  "Remote Operation Task": '<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M44.8 0h79.543C126.78 0 128 1.422 128 4.267v23.466c0 2.845-1.219 4.267-3.657 4.267H44.8c-2.438 0-3.657-1.422-3.657-4.267V4.267C41.143 1.422 42.362 0 44.8 0zm22.857 48h56.686c2.438 0 3.657 1.422 3.657 4.267v23.466c0 2.845-1.219 4.267-3.657 4.267H67.657C65.22 80 64 78.578 64 75.733V52.267C64 49.422 65.219 48 67.657 48zm0 48h56.686c2.438 0 3.657 1.422 3.657 4.267v23.466c0 2.845-1.219 4.267-3.657 4.267H67.657C65.22 128 64 126.578 64 123.733v-23.466C64 97.422 65.219 96 67.657 96zM50.286 68.267c2.02 0 3.657-1.91 3.657-4.267 0-2.356-1.638-4.267-3.657-4.267H17.37V32h6.4c2.02 0 3.658-1.91 3.658-4.267V4.267C27.429 1.91 25.79 0 23.77 0H3.657C1.637 0 0 1.91 0 4.267v23.466C0 30.09 1.637 32 3.657 32h6.4v80c0 2.356 1.638 4.267 3.657 4.267h36.572c2.02 0 3.657-1.91 3.657-4.267 0-2.356-1.638-4.267-3.657-4.267H17.37V68.267h32.915z"/></svg>',
  "Data Report": '<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M96.258 57.462h31.421C124.794 27.323 100.426 2.956 70.287.07v31.422a32.856 32.856 0 0 1 25.971 25.97zm-38.796-25.97V.07C27.323 2.956 2.956 27.323.07 57.462h31.422a32.856 32.856 0 0 1 25.97-25.97zm12.825 64.766v31.421c30.46-2.885 54.507-27.253 57.713-57.712H96.579c-2.886 13.466-13.146 23.726-26.292 26.291zM31.492 70.287H.07c2.886 30.46 27.253 54.507 57.713 57.713V96.579c-13.466-2.886-23.726-13.146-26.291-26.292z"/></svg>',
  Management: '<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M115.625 127.937H.063V12.375h57.781v12.374H12.438v90.813h90.813V70.156h12.374zM127.893 37.982h-12.375V12.375H88.706V0h39.187z"/></svg>'
};

const topbarIcons = {
  search: '<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M55 0C24.624 0 0 24.624 0 55s24.624 55 55 55c13.025 0 24.994-4.532 34.408-12.112L120.52 128 128 120.52 97.888 89.408C105.468 79.994 110 68.025 110 55 110 24.624 85.376 0 55 0zm0 10c24.853 0 45 20.147 45 45s-20.147 45-45 45-45-20.147-45-45 20.147-45 45-45z"/></svg>',
  fullscreen: '<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M49.217 41.329 49.08 6.09C49.02 3.374 46.778 1.744 44.058 1.684h-3.65c-2.712-.06-4.866 2.303-4.806 5.016l.152 19.164-24.151-23.79a6.698 6.698 0 0 0-9.499 0 6.76 6.76 0 0 0 0 9.526l23.93 23.713-18.345.074c-2.712-.069-5.228 1.813-5.64 5.02v3.462c.069 2.721 2.31 4.97 5.022 5.03l35.028-.207h2.457a4.626 4.626 0 0 0 3.436-1.38c.88-.874 1.205-2.096 1.169-3.462l-.262-2.465zm52.523 51.212 18.32-.073c2.713.06 5.224-1.609 5.64-4.815v-3.462c-.068-2.722-2.317-4.97-5.021-5.04l-34.58.21h-2.451a4.64 4.64 0 0 0-3.445 1.381c-.885.868-1.201 2.094-1.174 3.46l.27 2.46.141 34.697c.069 2.713 2.31 4.338 5.022 4.397l3.45.006c2.705.062 4.867-2.31 4.8-5.026l-.153-18.752 24.151 23.946a6.69 6.69 0 0 0 9.494 0 6.747 6.747 0 0 0 0-9.523L101.74 92.54z"/></svg>',
  user: '<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M95.648 118.762c0 5.035-3.563 9.121-7.979 9.121H7.98c-4.416 0-7.979-4.086-7.979-9.121C0 100.519 15.408 83.47 31.152 76.75c-9.099-6.43-15.216-17.863-15.216-30.987v-9.128c0-20.16 14.293-36.518 31.893-36.518s31.894 16.358 31.894 36.518v9.122c0 13.137-6.123 24.556-15.216 30.993 15.738 6.726 31.141 23.769 31.141 42.012z"/></svg>'
};

export default {
  name: "App",
  components: { DashboardPage, LoginPage, TablePage, ToastNotification },
  data() {
    return {
      hash: window.location.hash || "#/login?redirect=%2Fdashboard",
      sidebarOpen: false,
      collapsed: window.innerWidth <= 1024,
      width: window.innerWidth,
      currentRoleId: getCookie("roleId") || "super-admin",
      currentUserName: getCookie("userName") || "ACB(admin)",
      expandedGroups: {}
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
      if (this.width <= 550) return "mobile hideSidebar";
      if (this.width <= 1024 || this.collapsed) return "hideSidebar";
      return "";
    }
  },
  created() {
    setCookie("roleId", "super-admin");
    window.addEventListener("hashchange", this.syncHash);
    window.addEventListener("resize", this.syncWidth);
    this.loadUser();
  },
  beforeDestroy() {
    window.removeEventListener("hashchange", this.syncHash);
    window.removeEventListener("resize", this.syncWidth);
  },
  methods: {
    nextRoute(hash) {
      return findRoute(hash, this.currentRoleId);
    },
    async loadUser() {
      if (this.isLogin) return;
      const response = await currentUserInfo();
      this.currentRoleId = response.data?.roleId || this.currentRoleId;
      this.currentUserName = response.data?.name || this.currentUserName;
      this.syncHash();
    },
    syncHash() {
      const nextHash = window.location.hash || "#/login?redirect=%2Fdashboard";
      this.hash = nextHash.startsWith("#/login") ? nextHash : this.nextRoute(nextHash).hash;
      if (!this.hash.startsWith("#/login") && window.location.hash !== this.hash) window.location.hash = this.hash;
      document.title = `${this.route.title} - Beverly`;

      if (this.route && this.route.group && this.route.group !== "Dashboard") {
        this.$set(this.expandedGroups, this.route.group, true);
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
      if (this.width <= 550) this.sidebarOpen = !this.sidebarOpen;
      else this.collapsed = !this.collapsed;
    },
    toggleGroup(groupName) {
      this.$set(this.expandedGroups, groupName, !this.expandedGroups[groupName]);
    },
    groupIcon(groupName) {
      return groupIcons[groupName] || groupIcons.Management;
    },
    topbarIcon(name) {
      return topbarIcons[name] || "";
    },
    sidebarClass(route, indent) {
      return ["sidebar-item", indent ? "indent" : "", route.hash === this.route.hash ? "active" : ""];
    },
    handleSignOut() {
      document.cookie = "roleId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      document.cookie = "userName=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      window.location.hash = "#/login";
      this.syncHash();
    }
  }
};
</script>
