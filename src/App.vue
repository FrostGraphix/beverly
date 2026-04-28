<template>
  <LoginPage v-if="isLogin" @logged-in="goDashboard" />
  <div v-else :class="['app-page', deviceClass, sidebarOpen ? 'openSidebar' : '']">
    <div class="drawer-bg" @click="sidebarOpen = false"></div>
    <aside class="sidebar-container">
      <div class="sidebar-logo"><span class="sidebar-logo-icon">M</span><span class="sidebar-logo-text">Meter System</span></div>
      <nav class="sidebar-menu" aria-label="Main navigation">
        <template v-for="group in groups">
          <a v-if="group.name === 'Dashboard'" :key="group.name" :class="sidebarClass(group.routes[0], false)" :href="group.routes[0].hash"><span class="svg-icon sidebar-icon">◔</span><span class="sidebar-label">Dashboard</span></a>
          <div v-else :key="group.name">
            <div class="sidebar-item"><span class="svg-icon sidebar-icon">□</span><span class="sidebar-label">{{ group.name }}</span><span class="sidebar-caret">›</span></div>
            <a v-for="route in group.routes" :key="route.hash" :class="sidebarClass(route, true)" :href="route.hash"><span class="svg-icon sidebar-icon">▪</span><span class="sidebar-label">{{ route.title }}</span></a>
          </div>
        </template>
      </nav>
    </aside>
    <section class="main-container">
      <header class="fixed-header">
        <div class="navbar" :aria-label="`${route.title} ACB(admin)`">
          <button class="hamburger-container" type="button" aria-label="Toggle sidebar" @click="toggleSidebar">☰</button>
          <div class="breadcrumb">{{ breadcrumb }}</div>
          <div class="right-menu">
            <span class="topbar-tool">⌕</span>
            <span class="topbar-tool">⛶</span>
            <span class="topbar-tool">●</span>
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
  </div>
</template>

<script>
import DashboardPage from "./components/DashboardPage.vue";
import LoginPage from "./components/LoginPage.vue";
import TablePage from "./components/TablePage.vue";
import { currentUserInfo, getCookie } from "./services/api";
import { findReferenceVisibleRoute, findRoute, referenceVisibleRouteGroups, routeGroups } from "./data/route-manifest";

export default {
  name: "App",
  components: { DashboardPage, LoginPage, TablePage },
  data() {
    return {
      hash: window.location.hash || "#/login?redirect=%2Fdashboard",
      sidebarOpen: false,
      collapsed: window.innerWidth <= 1024,
      width: window.innerWidth,
      currentRoleId: getCookie("roleId") || "super-admin",
      currentUserName: getCookie("userName") || "ACB(admin)",
      parityMode: window.localStorage.getItem("parityMode") || ""
    };
  },
  computed: {
    isLogin() {
      return this.hash.startsWith("#/login") || !this.hash;
    },
    route() {
      return this.parityMode === "visible" ? findReferenceVisibleRoute(this.hash) : findRoute(this.hash, this.currentRoleId);
    },
    groups() {
      return this.parityMode === "visible" ? referenceVisibleRouteGroups() : routeGroups(this.currentRoleId);
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
      return this.parityMode === "visible" ? findReferenceVisibleRoute(hash) : findRoute(hash, this.currentRoleId);
    },
    async loadUser() {
      if (this.isLogin) return;
      const response = await currentUserInfo();
      this.currentRoleId = response.data?.roleId || this.currentRoleId;
      this.currentUserName = response.data?.name || this.currentUserName;
      this.parityMode = window.localStorage.getItem("parityMode") || this.parityMode;
      this.syncHash();
    },
    syncHash() {
      const nextHash = window.location.hash || "#/login?redirect=%2Fdashboard";
      this.hash = nextHash.startsWith("#/login") ? nextHash : this.nextRoute(nextHash).hash;
      if (!this.hash.startsWith("#/login") && window.location.hash !== this.hash) window.location.hash = this.hash;
      document.title = `${this.route.title} - Meter System`;
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
    sidebarClass(route, indent) {
      return ["sidebar-item", indent ? "indent" : "", route.hash === this.route.hash ? "active" : ""];
    }
  }
};
</script>
