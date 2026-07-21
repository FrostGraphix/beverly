<template>
  <section :class="['wallet-admin-shell', `wallet-admin-shell--${activePage}`]" aria-label="Wallet admin workspace">
    <aside class="wallet-admin-sidebar" aria-label="Wallet admin navigation">
      <div class="wallet-brand-block">
        <span class="wallet-brand-mark" aria-hidden="true">B</span>
        <span><strong>Beverly</strong><small>Wallet Admin</small></span>
      </div>
      <label class="wallet-quick-search">
        <span aria-hidden="true">S</span>
        <BaseInput v-model="globalQuery" placeholder="Quick search" aria-label="Quick search wallet admin" />
        <kbd>Ctrl K</kbd>
      </label>
      <nav class="wallet-nav-groups">
        <div v-for="section in walletNavSections" :key="section.label" class="wallet-nav-section">
          <p>{{ section.label }}</p>
          <a v-for="item in section.items" :key="item.page" :href="item.hash" :class="['wallet-nav-item', activePage === item.page ? 'active' : '']">
            <span class="wallet-nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path :d="item.icon"/></svg>
            </span>
            <span>{{ item.label }}</span>
            <b v-if="item.count">{{ item.count }}</b>
          </a>
        </div>
      </nav>
      <a class="wallet-back-link" href="#/dashboard"><span>&lt;-</span><span>Back to CRM</span></a>
    </aside>

    <div class="wallet-admin-main">
      <header class="wallet-admin-topbar">
        <div class="wallet-breadcrumb"><span>Wallet</span><span>/</span><strong>{{ navTitle }}</strong></div>
        <label class="wallet-global-search">
          <span aria-hidden="true">S</span>
          <BaseInput v-model="globalQuery" placeholder="Search vendors, customers, orders..." aria-label="Search wallet operations" />
          <kbd>Ctrl K</kbd>
        </label>
        <div class="wallet-topbar-actions">
          <BaseButton class="wallet-icon-button" aria-label="Toggle theme">T</BaseButton>
          <BaseButton class="wallet-icon-button" aria-label="Help">?</BaseButton>
          <BaseButton class="wallet-icon-button wallet-notify" aria-label="Notifications">!</BaseButton>
          <BaseButton class="wallet-user-chip" aria-label="Wallet admin profile"><span>AS</span><strong>A. Samad</strong><small>Finance Lead</small></BaseButton>
        </div>
      </header>

      <div class="wallet-admin-scroll">
        <header class="wallet-page-head">
          <div>
            <p class="breadcrumb-line">Beverly CRM / Vending Wallet / <strong>{{ pageTitle }}</strong></p>
            <h1>{{ pageTitle }} <span class="live-badge">Live</span></h1>
            <p>{{ pageSubtitle }}</p>
          </div>
          <div class="head-actions">
            <div class="wallet-date-range" role="group" aria-label="Wallet report date range">
              <BaseButton v-for="preset in rangePresets" :key="preset.id" :class="['wallet-range-chip', selectedRange === preset.id ? 'active' : '']" @click="applyPresetRange(preset.id)">{{ preset.label }}</BaseButton>
              <label><span>From</span><BaseInput v-model="dateRangeStart" type="date" @input="selectedRange = 'custom'" /></label>
              <label><span>To</span><BaseInput v-model="dateRangeEnd" type="date" @input="selectedRange = 'custom'" /></label>
            </div>
            <BaseButton class="quiet-button wallet-export-button" :disabled="!reportRowsInRange.length" @click="exportCurrentView">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export
            </BaseButton>
            <a v-if="activePage === 'vendors'" class="primary-button" href="#/wallet/admin/vendors/create">Create Vendor</a>
            <BaseButton v-else-if="activePage === 'users'" class="primary-button" variant="primary" @click="inviteUser">Invite User</BaseButton>
            <BaseButton v-else-if="activePage === 'verification'" class="primary-button" variant="primary" @click="$refs.verification && $refs.verification.confirmDecision()">Confirm Decision</BaseButton>
            <a v-else class="primary-button" href="#/wallet/admin/funding-credits">Manual Credit</a>
          </div>
        </header>

        <AdminWalletDashboard v-if="activePage === 'dashboard'" :query="query" :date-range="reportDateRange" @audit="pushAudit" />
        <AdminWalletVendors v-else-if="activePage === 'vendors'" :vendors="vendors" :query="query" :date-range="reportDateRange" @audit="pushAudit" />
        <AdminWalletCreateVendor v-else-if="activePage === 'createVendor'" :date-range="reportDateRange" @vendor-created="onVendorCreated" />
        <AdminWalletUsers v-else-if="activePage === 'users'" :users="users" :query="query" :date-range="reportDateRange" @audit="pushAudit" />
        <AdminWalletVerification v-else-if="activePage === 'verification'" ref="verification" :date-range="reportDateRange" @audit="pushAudit" />
        <AdminWalletBalances v-else-if="activePage === 'wallets'" :wallet-cards="walletCards" :date-range="reportDateRange" />
        <AdminWalletFundingQueue v-else-if="activePage === 'funding'" :funding-rows="fundingRows" :query="query" :date-range="reportDateRange" @audit="pushAudit" />
        <AdminWalletPurchase v-else-if="activePage === 'purchase'" :purchases="purchases" :query="query" :date-range="reportDateRange" @audit="pushAudit" />
        <AdminWalletCases v-else-if="activePage === 'reversals' || activePage === 'disputes'" :case-rows="caseRows" :query="query" :active-page="activePage" :date-range="reportDateRange" />
        <AdminWalletSettlement v-else-if="activePage === 'settlement'" :settlements="settlements" :date-range="reportDateRange" />
        <AdminWalletReports v-else-if="activePage === 'reports'" :reports="reports" :date-range="reportDateRange" @audit="pushAudit" />
        <AdminWalletAuditLog v-else :audit-rows="auditRows" :query="query" :date-range="reportDateRange" />
      </div>
    </div>
  </section>
</template>

<script>
import BaseButton from "../base/BaseButton.vue";
import BaseInput from "../base/BaseInput.vue";
import AdminWalletDashboard from "./AdminWalletDashboard.vue";
import AdminWalletVendors from "./AdminWalletVendors.vue";
import AdminWalletCreateVendor from "./AdminWalletCreateVendor.vue";
import AdminWalletUsers from "./AdminWalletUsers.vue";
import AdminWalletVerification from "./AdminWalletVerification.vue";
import AdminWalletBalances from "./AdminWalletBalances.vue";
import AdminWalletFundingQueue from "./AdminWalletFundingQueue.vue";
import AdminWalletPurchase from "./AdminWalletPurchase.vue";
import AdminWalletCases from "./AdminWalletCases.vue";
import AdminWalletSettlement from "./AdminWalletSettlement.vue";
import AdminWalletReports from "./AdminWalletReports.vue";
import AdminWalletAuditLog from "./AdminWalletAuditLog.vue";
import {
  downloadTextFile,
  exportReportExcelXml
} from "../../services/import-export.mjs";

const money = (value) => `NGN ${Number(value).toLocaleString("en-NG")}`;
const todayIso = () => new Date().toISOString().slice(0, 10);
const daysAgoIso = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

export default {
  name: "AdminWalletOperationsPage",
  components: {
    BaseButton,
    BaseInput,
    AdminWalletDashboard,
    AdminWalletVendors,
    AdminWalletCreateVendor,
    AdminWalletUsers,
    AdminWalletVerification,
    AdminWalletBalances,
    AdminWalletFundingQueue,
    AdminWalletPurchase,
    AdminWalletCases,
    AdminWalletSettlement,
    AdminWalletReports,
    AdminWalletAuditLog
  },
  data() {
    return {
      currentHash: window.location.hash,
      globalQuery: "",
      selectedRange: "7d",
      dateRangeStart: daysAgoIso(6),
      dateRangeEnd: todayIso(),
      rangePresets: [
        { id: "today", label: "Today", days: 0 },
        { id: "7d", label: "7D", days: 6 },
        { id: "30d", label: "30D", days: 29 },
        { id: "90d", label: "90D", days: 89 },
        { id: "ytd", label: "YTD", days: null }
      ],
      vendors: [
        { name: "FreshStop Mart", code: "VND-0543", contact: "Emily Rodriguez", email: "emily@freshstop.com", kyc: "Verified", kycTone: "good", balance: money(125450.6), held: money(2340), limit: "Standard", limitTone: "good", status: "Active", statusTone: "good" },
        { name: "QuickVend Inc.", code: "VND-09765", contact: "Michael Chen", email: "michael@quickvend.io", kyc: "Verified", kycTone: "good", balance: money(85230), held: money(0), limit: "Premium", limitTone: "info", status: "Active", statusTone: "good" },
        { name: "VendoPlus", code: "VND-03111", contact: "David Lee", email: "david@vendoplus.com", kyc: "Under Review", kycTone: "warn", balance: money(12150), held: money(1150), limit: "Standard", limitTone: "good", status: "Active", statusTone: "good" },
        { name: "Beverly Snacks", code: "VND-04512", contact: "Sarah Johnson", email: "sarah@beverlysnacks.com", kyc: "Verified", kycTone: "good", balance: money(210340.75), held: money(3250), limit: "Enterprise", limitTone: "info", status: "Active", statusTone: "good" },
        { name: "Metro Vending", code: "VND-08821", contact: "Daniel Kim", email: "daniel@metrovend.com", kyc: "Failed", kycTone: "danger", balance: money(0), held: money(0), limit: "Standard", limitTone: "good", status: "Inactive", statusTone: "danger" }
      ],
      users: [
        { name: "Admin User", email: "admin@beverlycrm.com", role: "Platform Admin", roleTone: "good", team: "Platform", approvalAuthority: "All", limitAuthority: "All", status: "Active", lastActive: "2 minutes ago", kind: "staff" },
        { name: "Michael Chen", email: "michael.chen@beverlycrm.com", role: "Finance Checker", roleTone: "info", team: "Finance", approvalAuthority: "Up to NGN 250,000", limitAuthority: "Up to NGN 250,000", status: "Active", lastActive: "18 minutes ago", kind: "staff" },
        { name: "Sarah Johnson", email: "sarah.johnson@beverlycrm.com", role: "Support Reviewer", roleTone: "info", team: "Support", approvalAuthority: "Up to NGN 25,000", limitAuthority: "View Only", status: "Active", lastActive: "1 hour ago", kind: "staff" },
        { name: "Emily Rodriguez", email: "emily@freshstop.com", role: "Vendor", roleTone: "warn", team: "Vendor Ops", approvalAuthority: "Up to NGN 100,000", limitAuthority: "Up to NGN 100,000", status: "Active", lastActive: "35 minutes ago", kind: "vendor" },
        { name: "David Lee", email: "david@vendoplus.com", role: "Vendor User", roleTone: "warn", team: "Vendor Ops", approvalAuthority: "Up to NGN 10,000", limitAuthority: "Up to NGN 10,000", status: "Active", lastActive: "2 hours ago", kind: "vendor" },
        { name: "Tina Patel", email: "tina.patel@beverlycrm.com", role: "Support Reviewer", roleTone: "info", team: "Support", approvalAuthority: "Up to NGN 10,000", limitAuthority: "View Only", status: "Inactive", lastActive: "3 days ago", kind: "staff" }
      ],
      fundingRows: [
        { ref: "FND-20260513-00012", vendor: "FreshStop Mart", amount: money(200000), channel: "Bank transfer", bankRef: "FBN/26051300012", submitted: "13 May, 09:15", status: "under review", tone: "warn" },
        { ref: "FND-20260513-00011", vendor: "QuickVend Inc.", amount: money(500000), channel: "Bank transfer", bankRef: "GTB/26051300011", submitted: "13 May, 08:42", status: "under review", tone: "warn" },
        { ref: "FND-20260513-00010", vendor: "Beverly Snacks", amount: money(150000), channel: "POS", bankRef: "POS/9981", submitted: "12 May, 16:00", status: "posted", tone: "good" }
      ],
      auditRows: [
        { time: "13 May 10:14:22", actor: "admin", role: "super-admin", event: "role_changed", target: "USR-001", ip: "197.211.58.14" },
        { time: "13 May 09:58:01", actor: "finance-checker", role: "finance-checker", event: "funding_approved", target: "FND-20260513-00012", ip: "197.211.58.14" },
        { time: "13 May 09:42:15", actor: "vendor.demo@acob.ng", role: "vendor_user", event: "purchase_successful", target: "PO-00291", ip: "41.203.68.22" }
      ],
      purchases: [
        { id: "PO-00291", date: "13 May, 09:42", vendor: "FreshStop", meter: "MTR-00291", delivery: "Token (20-digit)", amount: money(5000), status: "successful" },
        { id: "PO-00290", date: "13 May, 08:15", vendor: "QuickVend", meter: "MTR-00418", delivery: "Remote Send", amount: money(3000), status: "successful" },
        { id: "PO-00288", date: "12 May, 11:20", vendor: "Metro Vending", meter: "MTR-00105", delivery: "Remote Send", amount: money(2500), status: "failed" }
      ],
      walletCards: [
        { name: "FreshStop Mart", code: "VND-0543", site: "Lagos North", available: money(123110), float: money(125450.6), reserved: money(2340), risk: "LOW" },
        { name: "QuickVend Inc.", code: "VND-09765", site: "Abuja Central", available: money(85230), float: money(85230), reserved: money(0), risk: "LOW" }
      ],
      caseRows: [
        { id: "REV-001", vendor: "FreshStop Mart", customer: "Ada Okafor", amount: money(5000), status: "Pending", tone: "warn", priority: "Medium" },
        { id: "DSP-002", vendor: "Metro Vending", customer: "Daniel Kim", amount: money(2500), status: "Under Investigation", tone: "danger", priority: "High" }
      ],
      settlements: [
        { date: "12 May 2026", site: "Lagos North", txns: 42, purchases: money(1240000) },
        { date: "12 May 2026", site: "Abuja Central", txns: 31, purchases: money(890000) }
      ],
      reports: [
        { title: "Financial Reports", copy: "Funding, balances, transactions, and reconciliation." },
        { title: "Transaction Reports", copy: "Token purchase history, failed vends, and pending delivery." },
        { title: "Vendor Reports", copy: "Vendor performance, activity, KYC, and wallet state." },
        { title: "Role Audit Report", copy: "Role changes, password resets, and session revocations." }
      ]
    };
  },
  computed: {
    walletNavSections() {
      const icon = {
        dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
        pulse: "M3 12h4l3-8 4 16 3-8h4",
        users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87",
        plus: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 8v8M8 12h8",
        check: "M20 6 9 17l-5-5M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20",
        wallet: "M3 7a3 3 0 0 1 3-3h14v16H6a3 3 0 0 1-3-3V7zM16 12h4",
        money: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6",
        box: "m21 16-9 5-9-5V8l9-5 9 5v8zM3.3 7.3 12 12l8.7-4.7M12 22V12",
        flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1v19",
        chart: "M3 3v18h18m-2-12-5 5-4-4-3 3",
        audit: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
      };
      return [
        { label: "Overview", items: [
          { page: "dashboard", label: "Dashboard", hash: "#/wallet/admin/dashboard", icon: icon.dashboard, count: "12" },
          { page: "dashboard", label: "Live Pulse", hash: "#/wallet/admin/dashboard", icon: icon.pulse }
        ] },
        { label: "Vendors", items: [
          { page: "vendors", label: "Vendors", hash: "#/wallet/admin/vendors", icon: icon.users, count: String(this.vendors.length) },
          { page: "createVendor", label: "Create Vendor", hash: "#/wallet/admin/vendors/create", icon: icon.plus },
          { page: "verification", label: "Verification", hash: "#/wallet/admin/verification", icon: icon.check, count: "7" },
          { page: "users", label: "Users & Roles", hash: "#/wallet/admin/users-roles", icon: icon.users }
        ] },
        { label: "Money", items: [
          { page: "wallets", label: "Wallets", hash: "#/wallet/admin/all-wallets", icon: icon.wallet },
          { page: "funding", label: "Funding", hash: "#/wallet/admin/funding-credits", icon: icon.money, count: "23" },
          { page: "purchase", label: "Purchases", hash: "#/wallet/admin/purchase-monitor", icon: icon.box }
        ] },
        { label: "Operations", items: [
          { page: "disputes", label: "Exceptions", hash: "#/wallet/admin/exceptions", icon: icon.flag, count: "5" },
          { page: "settlement", label: "Settlement", hash: "#/wallet/admin/settlement", icon: icon.chart },
          { page: "reports", label: "Reports", hash: "#/wallet/admin/reports", icon: icon.chart },
          { page: "audit", label: "Audit Log", hash: "#/wallet/admin/audit-log", icon: icon.audit }
        ] }
      ];
    },
    navTitle() {
      const sections = this.walletNavSections.flatMap((section) => section.items);
      return sections.find((item) => item.page === this.activePage)?.label || this.pageTitle;
    },
    reportDateRange() {
      return { start: this.dateRangeStart, end: this.dateRangeEnd, preset: this.selectedRange };
    },
    reportColumns() {
      return [
        { key: "dataset", label: "Dataset" },
        { key: "sourceDate", label: "Source Date" },
        { key: "reference", label: "Reference" },
        { key: "name", label: "Name" },
        { key: "type", label: "Type" },
        { key: "status", label: "Status" },
        { key: "amount", label: "Amount" },
        { key: "owner", label: "Owner" },
        { key: "details", label: "Details" }
      ];
    },
    sourceOfTruthRows() {
      const sourceDate = (offset) => daysAgoIso(offset);
      const mapRows = (dataset, rows, mapper) => rows.map((row, index) => ({ dataset, sourceDate: sourceDate(index % 14), ...mapper(row, index) }));
      return [
        ...mapRows("vendors", this.vendors, (row) => ({ reference: row.code, name: row.name, type: row.limit, status: row.status, amount: row.balance, owner: row.contact, details: `${row.kyc} / ${row.email}` })),
        ...mapRows("users", this.users, (row) => ({ reference: row.email, name: row.name, type: row.role, status: row.status, amount: row.approvalAuthority, owner: row.team, details: row.lastActive })),
        ...mapRows("funding", this.fundingRows, (row) => ({ reference: row.ref, name: row.vendor, type: row.channel, status: row.status, amount: row.amount, owner: row.bankRef, details: row.submitted })),
        ...mapRows("audit", this.auditRows, (row) => ({ reference: row.target, name: row.actor, type: row.event, status: row.role, amount: "", owner: row.ip, details: row.time })),
        ...mapRows("purchases", this.purchases, (row) => ({ reference: row.id, name: row.vendor, type: row.delivery, status: row.status, amount: row.amount, owner: row.meter, details: row.date })),
        ...mapRows("wallets", this.walletCards, (row) => ({ reference: row.code, name: row.name, type: row.risk, status: "active", amount: row.available, owner: row.site, details: `float ${row.float}; reserved ${row.reserved}` })),
        ...mapRows("cases", this.caseRows, (row) => ({ reference: row.id, name: row.vendor, type: row.priority, status: row.status, amount: row.amount, owner: row.customer, details: this.activePage })),
        ...mapRows("settlement", this.settlements, (row) => ({ reference: row.date, name: row.site, type: "settlement", status: `${row.txns} txns`, amount: row.purchases, owner: row.site, details: row.date })),
        ...mapRows("reports", this.reports, (row) => ({ reference: row.title, name: row.title, type: "report", status: "available", amount: "", owner: "wallet-admin", details: row.copy }))
      ];
    },
    reportRowsInRange() {
      const start = new Date(`${this.dateRangeStart}T00:00:00`);
      const end = new Date(`${this.dateRangeEnd}T23:59:59`);
      return this.sourceOfTruthRows.filter((row) => {
        const sourceDate = new Date(`${row.sourceDate}T12:00:00`);
        return sourceDate >= start && sourceDate <= end;
      });
    },
    auditExportColumns() {
      return [
        { key: "time", label: "Time" },
        { key: "actor", label: "Actor" },
        { key: "role", label: "Role" },
        { key: "event", label: "Event" },
        { key: "target", label: "Target" },
        { key: "ip", label: "IP Address" }
      ];
    },
    activePage() {
      const hash = this.currentHash;
      if (hash.includes("vendors/create")) return "createVendor";
      if (hash.includes("users-roles")) return "users";
      if (hash.includes("verification")) return "verification";
      if (hash.includes("vendors")) return "vendors";
      if (hash.includes("all-wallets")) return "wallets";
      if (hash.includes("funding-credits")) return "funding";
      if (hash.includes("purchase-monitor")) return "purchase";
      if (hash.includes("exceptions")) return "disputes";
      if (hash.includes("reversals")) return "reversals";
      if (hash.includes("disputes")) return "disputes";
      if (hash.includes("settlement")) return "settlement";
      if (hash.includes("reports")) return "reports";
      if (hash.includes("audit-log")) return "audit";
      return "dashboard";
    },
    pageTitle() {
      return {
        dashboard: "Wallet Admin Dashboard",
        vendors: "Vendors",
        createVendor: "Create Vendor",
        users: "Users & Roles",
        verification: "Vendor Verification",
        wallets: "Wallet Balances",
        funding: "Funding & Manual Credits",
        purchase: "Vending Monitor",
        reversals: "Reversals",
        disputes: "Disputes",
        settlement: "Settlement",
        reports: "Reports",
        audit: "Audit Log"
      }[this.activePage];
    },
    pageSubtitle() {
      return {
        dashboard: "Real-time overview of Beverly Vending Wallet operations.",
        vendors: "Manage vendor organizations, verification status, and wallet readiness.",
        createVendor: "Onboard a new vendor with identity verification and temporaryPassword access handoff.",
        users: "Role & Permissions Matrix for wallet platform users, roles, and fine-grained permissions.",
        verification: "Review vendor information, documents, and verification results before approval.",
        wallets: "Monitor wallet balances, holds, limits, freezes, and ledger readiness.",
        funding: "Review vendor funding requests and maker-checker manual credit queues.",
        purchase: "Monitor token generation, remote-send delivery, receipts, and failures.",
        reversals: "Review compensating-entry requests and reversal evidence.",
        disputes: "Manage disputes, escalations, and support review outcomes.",
        settlement: "Daily settlement batches and commission summaries.",
        reports: "Generate wallet, vendor, audit, settlement, and reconciliation reports.",
        audit: "Immutable append-only record of wallet system events."
      }[this.activePage];
    },
    query() {
      return this.globalQuery.toLowerCase();
    }
  },
  mounted() {
    window.addEventListener("hashchange", this.syncHash);
  },
  beforeUnmount() {
    window.removeEventListener("hashchange", this.syncHash);
  },
  methods: {
    syncHash() {
      this.currentHash = window.location.hash;
    },
    pushAudit(entry) {
      this.auditRows.unshift(entry);
    },
    applyPresetRange(presetId) {
      this.selectedRange = presetId;
      const preset = this.rangePresets.find((item) => item.id === presetId);
      const now = new Date();
      if (presetId === "ytd") {
        this.dateRangeStart = `${now.getFullYear()}-01-01`;
        this.dateRangeEnd = todayIso();
        return;
      }
      this.dateRangeStart = daysAgoIso(preset?.days ?? 6);
      this.dateRangeEnd = todayIso();
    },
    exportCurrentView() {
      const metadata = [
        ["Source", "Wallet Admin Source of Truth"],
        ["Date Range", `${this.dateRangeStart} to ${this.dateRangeEnd}`],
        ["Preset", this.selectedRange],
        ["Active View", this.pageTitle],
        ["Rows In Range", this.reportRowsInRange.length]
      ];
      const base = `beverly-wallet-source-of-truth_${this.dateRangeStart}_${this.dateRangeEnd}`;
      const workbook = exportReportExcelXml("Wallet Admin Source of Truth", this.reportColumns, this.reportRowsInRange, metadata);
      downloadTextFile(`${base}.xls`, workbook, "application/vnd.ms-excel");
      this.auditRows.unshift({ time: new Date().toLocaleString("en-NG"), actor: "admin", role: "super-admin", event: "wallet_source_of_truth_exported", target: `${this.dateRangeStart}_${this.dateRangeEnd}`, ip: "local" });
    },
    inviteUser() {
      this.users.push({ name: "New Invite", email: "pending.invite@beverlycrm.com", role: "Support Reviewer", roleTone: "info", team: "Support", approvalAuthority: "View Only", limitAuthority: "View Only", status: "Active", lastActive: "just now", kind: "staff" });
      this.auditRows.unshift({ time: "13 May 10:31:00", actor: "admin", role: "super-admin", event: "wallet_user_invited", target: "pending.invite@beverlycrm.com", ip: "local" });
    },
    onVendorCreated({ draft }) {
      const code = `VND-${String(this.vendors.length + 543).padStart(5, "0")}`;
      this.vendors.unshift({ name: draft.name, code, contact: draft.contact, email: draft.email, kyc: "Under Review", kycTone: "warn", balance: money(0), held: money(0), limit: draft.limit, limitTone: "info", status: "Pending", statusTone: "warn" });
      this.users.push({ name: draft.contact, email: draft.contactEmail, role: "Vendor", roleTone: "warn", team: "Vendor Ops", approvalAuthority: "Up to NGN 100,000", limitAuthority: "Up to NGN 100,000", status: "Active", lastActive: "invite sent", kind: "vendor" });
      this.auditRows.unshift({ time: "13 May 10:35:00", actor: "admin", role: "super-admin", event: "vendor_account_created_temp_password", target: code, ip: "local" });
    }
  }
};
</script>

<style>
.wallet-admin-shell {
  --wallet-status-available: var(--success);
  --wallet-status-held: var(--warning);
  --wallet-status-pending: var(--warning);
  --wallet-status-approved: var(--success);
  --wallet-status-rejected: var(--danger);
  --wallet-status-frozen: var(--info);
  --wallet-status-failed: var(--danger);
  --wallet-status-reversed: var(--info);
  --wallet-status-disputed: var(--warning);
  display: grid;
  grid-template-columns: 264px minmax(0, 1fr);
  min-height: 100vh;
  color: var(--text-strong);
  font-family: var(--font-family);
  font-size: 12px;
  background:
    radial-gradient(circle at 18% 12%, color-mix(in srgb, var(--success) 12%, transparent), transparent 28%),
    var(--bg-page);
}
.wallet-admin-sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 18px;
  padding: 28px 23px 22px;
  overflow: hidden;
  background: linear-gradient(180deg, color-mix(in srgb, var(--bev-color-slate-900) 92%, var(--success)), var(--bev-color-green-950));
  border-right: 1px solid color-mix(in srgb, var(--success) 12%, transparent);
  color: color-mix(in srgb, var(--bev-color-white) 72%, var(--success));
}
.wallet-brand-block {
  display: flex;
  align-items: center;
  gap: 14px;
}
.wallet-brand-mark {
  display: block;
  width: 54px;
  height: 54px;
  border-radius: 14px;
  background: var(--brand-mark-url, url("/brand/beverly-mark-light.png")) center / contain no-repeat;
  box-shadow: 0 16px 42px color-mix(in srgb, var(--success) 26%, transparent);
  color: transparent;
  font-size: 0;
}
.wallet-brand-block strong {
  display: block;
  color: var(--text-inverse);
  font-size: 22px;
  line-height: 1;
}
.wallet-brand-block small,
.wallet-nav-section p {
  display: block;
  margin: 6px 0 0;
  color: color-mix(in srgb, currentColor 62%, transparent);
  font-size: 11px;
  font-weight: 850;
  letter-spacing: .14em;
  text-transform: uppercase;
}
.wallet-quick-search,
.wallet-global-search {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 54px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-card) 8%, transparent);
  color: var(--text-muted);
}
.wallet-quick-search input,
.wallet-global-search input {
  min-height: auto;
  flex: 1;
  width: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  outline: 0;
}
.wallet-quick-search kbd,
.wallet-global-search kbd {
  min-width: 31px;
  padding: 4px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, currentColor 10%, transparent);
  color: inherit;
  font-family: var(--font-mono);
  font-size: 11px;
  text-align: center;
}
.wallet-nav-groups {
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}
.wallet-nav-section {
  display: grid;
  gap: 6px;
  margin-bottom: 24px;
}
.wallet-nav-section p {
  margin: 0 0 8px 6px;
}
.wallet-nav-item {
  position: relative;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 46px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 12px;
  color: color-mix(in srgb, var(--bev-color-white) 62%, transparent);
  font-size: 15px;
  font-weight: 750;
  transition: transform var(--transition-fast), background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
}
.wallet-nav-item:hover {
  transform: translateX(3px);
  color: var(--text-inverse);
  background: color-mix(in srgb, var(--bev-color-white) 7%, transparent);
}
.wallet-nav-item.active {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 14%, transparent);
  border-color: color-mix(in srgb, var(--success) 18%, transparent);
  box-shadow: inset 4px 0 0 var(--success);
}
.wallet-nav-icon,
.wallet-nav-icon svg {
  width: 20px;
  height: 20px;
}
.wallet-nav-item b {
  min-width: 30px;
  padding: 4px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--success) 20%, transparent);
  color: var(--text-inverse);
  text-align: center;
  font-size: 12px;
}
.wallet-back-link {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 0 18px;
  border: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-card) 8%, transparent);
  color: color-mix(in srgb, var(--bev-color-white) 74%, transparent);
  font-weight: 800;
}
.wallet-admin-main {
  min-width: 0;
  min-height: 100vh;
  display: grid;
  grid-template-rows: 88px minmax(0, 1fr);
}
.wallet-admin-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: minmax(170px, auto) minmax(280px, 420px) auto;
  gap: 24px;
  align-items: center;
  padding: 16px 42px;
  border-bottom: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-card) 86%, transparent);
  backdrop-filter: blur(18px);
}
.wallet-breadcrumb {
  display: flex;
  gap: 12px;
  align-items: center;
  color: var(--text-muted);
  font-size: 15px;
}
.wallet-breadcrumb strong {
  color: var(--text-strong);
}
.wallet-global-search {
  color: var(--text-muted);
  background: color-mix(in srgb, var(--bg-page) 72%, var(--bg-card));
}
.wallet-topbar-actions {
  display: flex;
  justify-content: flex-end;
  gap: 14px;
  align-items: center;
}
.wallet-icon-button {
  position: relative;
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  color: var(--text-main);
  cursor: pointer;
  font-weight: 900;
}
.wallet-notify::after {
  content: "";
  position: absolute;
  top: 11px;
  right: 12px;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--danger);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 18%, transparent);
}
.wallet-user-chip {
  display: grid;
  grid-template-columns: 42px auto;
  column-gap: 11px;
  align-items: center;
  min-height: 56px;
  padding: 6px 18px 6px 7px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-strong);
  cursor: pointer;
  text-align: left;
}
.wallet-user-chip span {
  grid-row: span 2;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--info), var(--success));
  color: var(--text-inverse);
  font-weight: 900;
}
.wallet-user-chip strong,
.wallet-user-chip small {
  display: block;
  line-height: 1.1;
}
.wallet-user-chip small {
  color: var(--text-muted);
}
.wallet-admin-scroll {
  min-width: 0;
  padding: 42px;
  overflow: auto;
}
.wallet-admin-scroll > * + * {
  margin-top: 28px;
}
.live-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  margin-left: 12px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--success) 28%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--success) 18%, transparent);
  color: var(--success);
  font-size: 14px;
  line-height: 1;
  text-transform: uppercase;
}
.live-badge::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: currentColor;
}
.wallet-date-range {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 54px;
  padding: 6px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-card) 84%, var(--bg-page));
}
.wallet-range-chip {
  min-height: 40px;
  padding: 0 14px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--text-muted);
  font-weight: 900;
  cursor: pointer;
}
.wallet-range-chip.active {
  background: var(--bg-card);
  color: var(--text-strong);
  box-shadow: var(--shadow-sm);
}
.wallet-date-range label {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 9px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
}
.wallet-date-range input {
  width: 132px;
  min-height: 34px;
  border-radius: 8px;
  background: var(--bg-card);
}
.wallet-export-button svg {
  width: 17px;
  height: 17px;
  margin-right: 8px;
}
.wallet-admin-shell .wallet-page-head,
.wallet-admin-shell .panel-head,
.wallet-admin-shell .decision-head,
.wallet-admin-shell .table-head,
.wallet-admin-shell .wallet-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.wallet-admin-shell .wallet-page-head h1 {
  margin: 0;
  font-size: 30px;
  line-height: 1.1;
  font-weight: 900;
  letter-spacing: 0;
}
.wallet-admin-shell .wallet-page-head p,
.wallet-admin-shell .breadcrumb-line,
.wallet-admin-shell small {
  color: var(--text-muted);
}
.wallet-admin-shell .breadcrumb-line strong { color: var(--success); }
.wallet-admin-shell .head-actions,
.wallet-admin-shell .filter-row,
.wallet-admin-shell .tab-row,
.wallet-admin-shell .row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.wallet-admin-shell .search-field,
.wallet-admin-shell .mini-select,
.wallet-admin-shell input,
.wallet-admin-shell select,
.wallet-admin-shell textarea {
  min-height: var(--field-height);
  border: 1px solid var(--border-color);
  border-radius: var(--field-radius);
  background: var(--bg-card);
  color: var(--text-main);
  font: inherit;
  padding: 0 12px;
}
.wallet-admin-shell .search-field { width: min(420px, 40vw); }
.wallet-admin-shell textarea { padding: 12px; resize: vertical; }
.wallet-admin-shell .page-stack { display: grid; gap: 16px; animation: wallet-enter 220ms ease both; }
.wallet-admin-shell .wallet-crm-table-page { gap: 0; }
.wallet-admin-shell .wallet-table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-bottom: 0;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}
.wallet-admin-shell .wallet-table-toolbar .tab-row { margin-right: auto; }
.wallet-admin-shell .wallet-crm-table-page .wallet-table-card { border-radius: 0 0 var(--radius-lg) var(--radius-lg); }
.wallet-admin-shell .kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.wallet-admin-shell .kpi-grid--six { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.wallet-admin-shell .dashboard-grid,
.wallet-admin-shell .content-grid,
.wallet-admin-shell .create-grid,
.wallet-admin-shell .verification-grid {
  display: grid;
  gap: 16px;
}
.wallet-admin-shell .dashboard-grid { grid-template-columns: minmax(0, 1.7fr) 230px 250px 280px; align-items: stretch; }
.wallet-admin-shell .content-grid { grid-template-columns: minmax(0, 1fr) 300px; align-items: start; }
.wallet-admin-shell .create-grid { grid-template-columns: minmax(0, 1fr) 270px; align-items: start; }
.wallet-admin-shell .verification-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) 340px; align-items: start; }
.wallet-admin-shell .dashboard-grid > *,
.wallet-admin-shell .content-grid > *,
.wallet-admin-shell .create-grid > *,
.wallet-admin-shell .verification-grid > * { min-width: 0; }
.wallet-admin-shell .panel,
.wallet-admin-shell .wallet-table-card,
.wallet-admin-shell .kpi-card,
.wallet-admin-shell .settlement-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}
.wallet-admin-shell .panel,
.wallet-admin-shell .settlement-card,
.wallet-admin-shell .wallet-table-card { padding: 16px; }
.wallet-admin-shell .wallet-table-card { overflow: hidden; }
.wallet-admin-shell :deep(.kpi-card) {
  position: relative;
  display: grid;
  gap: 6px;
  min-height: 104px;
  padding: 17px 14px 14px 64px;
  align-content: center;
}
.wallet-admin-shell :deep(.kpi-card .kpi-icon) {
  position: absolute;
  left: 15px;
  top: 18px;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: var(--success-bg);
}
.wallet-admin-shell :deep(.kpi-card .kpi-icon::before) {
  content: "";
  display: block;
  width: 14px;
  height: 14px;
  margin: 13px auto;
  border: 2px solid var(--text-muted);
  border-radius: 4px;
}
.wallet-admin-shell :deep(.kpi-card span),
.wallet-admin-shell th {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .04em;
  text-transform: uppercase;
}
.wallet-admin-shell :deep(.kpi-card strong) { color: var(--text-strong); font-size: 21px; font-weight: 900; }
.wallet-admin-shell :deep(.kpi-card.good strong), .wallet-admin-shell .tone-good { color: var(--success); }
.wallet-admin-shell :deep(.kpi-card.warn strong), .wallet-admin-shell .tone-warn { color: var(--warning); }
.wallet-admin-shell :deep(.kpi-card.danger strong), .wallet-admin-shell .tone-danger { color: var(--danger); }
.wallet-admin-shell :deep(.kpi-card.info strong), .wallet-admin-shell .tone-info { color: var(--info); }
.wallet-admin-shell .tone-muted { color: var(--text-muted); }
.wallet-admin-shell .kpi-card--interactive,
.wallet-admin-shell :deep(.kpi-card--interactive) {
  cursor: pointer;
  isolation: isolate;
  overflow: hidden;
  transition: transform var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
}
.wallet-admin-shell :deep(.kpi-card--interactive::after) {
  content: "";
  position: absolute;
  inset: auto 12px 10px 56px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--success), transparent);
  opacity: 0;
  transform: scaleX(.35);
  transform-origin: left;
  transition: opacity var(--transition-fast), transform var(--transition-fast);
}
.wallet-admin-shell :deep(.kpi-card--interactive:hover),
.wallet-admin-shell :deep(.kpi-card--interactive:focus-visible) {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--success) 45%, var(--border-color));
  box-shadow: var(--shadow-glow-sm);
  outline: none;
}
.wallet-admin-shell :deep(.kpi-card--active) {
  border-color: var(--success);
  background: radial-gradient(circle at 92% 12%, color-mix(in srgb, var(--success) 18%, transparent), transparent 36%), var(--bg-card);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--success) 35%, transparent), var(--shadow-sm);
}
.wallet-admin-shell :deep(.kpi-card--active::after) { opacity: 1; transform: scaleX(1); }
.wallet-admin-shell :deep(.kpi-card-action) { align-self: end; color: var(--success); font-style: normal; font-weight: 850; }
.wallet-admin-shell :deep(.kpi-card-metric) { color: var(--text-muted); }
.wallet-admin-shell .kpi-drilldown {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px auto;
  align-items: center;
  gap: 16px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--success) 12%, transparent), transparent 44%), var(--bg-card);
}
.wallet-admin-shell .kpi-drilldown h2 { margin: 10px 0 6px; font-size: 20px; }
.wallet-admin-shell .kpi-drilldown p { margin: 0; color: var(--text-muted); }
.wallet-admin-shell .drilldown-meter {
  display: grid;
  gap: 4px;
  justify-items: start;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-page);
}
.wallet-admin-shell .drilldown-meter span,
.wallet-admin-shell .drilldown-meter small { color: var(--text-muted); font-size: 11px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
.wallet-admin-shell .drilldown-meter b { color: var(--text-strong); font-size: 24px; }
.wallet-admin-shell .operations-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.wallet-admin-shell .operations-grid .panel { min-width: 0; }
.wallet-admin-shell .operations-grid h2 { display: flex; align-items: center; gap: 8px; margin: 0; }
.wallet-admin-shell .operations-grid p { margin: 8px 0 0; color: var(--text-muted); }
.wallet-admin-shell .live-pulse-panel,
.wallet-admin-shell .top-vendors-panel,
.wallet-admin-shell .attention-panel { display: grid; gap: 12px; align-content: start; }
.wallet-admin-shell .pulse-row {
  display: grid;
  grid-template-columns: 76px 54px minmax(0, .8fr) minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 34px;
  border-bottom: 1px dashed var(--border-color);
}
.wallet-admin-shell .pulse-row code,
.wallet-admin-shell .pulse-row span { color: var(--text-muted); }
.wallet-admin-shell .pulse-row strong,
.wallet-admin-shell .pulse-row b { white-space: nowrap; }
.wallet-admin-shell .pulse-row b { font-family: var(--font-mono); }
.wallet-admin-shell .top-vendor-row {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) 76px;
  gap: 10px;
  align-items: center;
  min-height: 54px;
  border-bottom: 1px solid var(--border-color);
}
.wallet-admin-shell .top-vendor-row > span { color: var(--warning); font-family: var(--font-mono); font-weight: 900; }
.wallet-admin-shell .top-vendor-row strong { display: block; }
.wallet-admin-shell .top-vendor-row em { display: inline-flex; margin-left: 6px; padding: 2px 6px; border-radius: 5px; background: var(--success-bg); color: var(--success); font-size: 11px; font-style: normal; }
.wallet-admin-shell .top-vendor-row i { display: block; height: 4px; margin-top: 8px; border-radius: 999px; background: var(--border-color); overflow: hidden; }
.wallet-admin-shell .top-vendor-row i b { display: block; height: 100%; border-radius: inherit; background: var(--success); }
.wallet-admin-shell .top-vendor-row small { text-align: right; }
.wallet-admin-shell .attention-row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  min-height: 70px;
  padding-left: 14px;
  border-left: 4px solid var(--warning);
  border-bottom: 1px solid var(--border-color);
}
.wallet-admin-shell .attention-row.danger { border-left-color: var(--danger); }
.wallet-admin-shell .attention-row.info { border-left-color: var(--info); }
.wallet-admin-shell .attention-row small { display: block; margin-top: 5px; color: var(--text-muted); }
.wallet-admin-shell .attention-row a { color: var(--success); font-weight: 900; letter-spacing: .04em; text-decoration: none; text-transform: uppercase; }
.wallet-admin-shell .side-stack,
.wallet-admin-shell .check-list,
.wallet-admin-shell .verification-card,
.wallet-admin-shell .verification-decision { display: grid; gap: 10px; }
.wallet-admin-shell .activity-item,
.wallet-admin-shell .document-row,
.wallet-admin-shell .check-row,
.wallet-admin-shell .funnel-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  min-height: 38px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-main);
}
.wallet-admin-shell .funnel-row b { border-radius: 999px; padding: 3px 8px; background: var(--success-bg); }
.wallet-admin-shell .operational-queues-panel { display: grid; gap: 12px; align-content: start; }
.wallet-admin-shell .operational-queues-panel .panel-head { align-items: center; }
.wallet-admin-shell .operational-queues-panel .panel-head p { margin: 4px 0 0; color: var(--text-muted); }
.wallet-admin-shell .operational-queues-panel .panel-head a { color: var(--success); font-weight: 850; text-decoration: none; }
.wallet-admin-shell .queue-card {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 54px;
  gap: 14px;
  align-items: center;
  min-height: 76px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-page) 82%, var(--bg-card));
  color: var(--text-main);
  text-decoration: none;
  transition: transform var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast);
}
.wallet-admin-shell .queue-card:hover { transform: translateX(2px); border-color: color-mix(in srgb, var(--success) 35%, var(--border-color)); background: var(--bg-card); }
.wallet-admin-shell .queue-card strong,
.wallet-admin-shell .queue-card small { display: block; }
.wallet-admin-shell .queue-card small { margin-top: 4px; color: var(--text-muted); }
.wallet-admin-shell .queue-card b { display: grid; place-items: center; min-height: 36px; border-radius: 8px; background: var(--bg-card); font-family: var(--font-mono); }
.wallet-admin-shell .queue-icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 10px; background: var(--success-bg); color: var(--success); font-weight: 900; }
.wallet-admin-shell .queue-card.warn .queue-icon { background: var(--warning-bg); color: var(--warning); }
.wallet-admin-shell .queue-card.info .queue-icon { background: var(--info-bg); color: var(--info); }
.wallet-admin-shell .queue-card.danger .queue-icon { background: var(--danger-bg); color: var(--danger); }
.wallet-admin-shell .queue-card.good .queue-icon { background: var(--success-bg); color: var(--success); }
.wallet-admin-shell .recent-activity-panel { overflow: hidden; padding: 0; }
.wallet-admin-shell .recent-activity-panel > .panel-head { padding: 18px 24px; align-items: center; }
.wallet-admin-shell .recent-activity-panel > .panel-head p { margin: 6px 0 0; color: var(--text-muted); }
.wallet-admin-shell .activity-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  padding: 10px 24px;
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-page);
}
.wallet-admin-shell .activity-tabs,
.wallet-admin-shell .activity-filters,
.wallet-admin-shell .activity-pages { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.wallet-admin-shell .activity-tab { min-height: 32px; border-radius: 8px; color: var(--text-muted); }
.wallet-admin-shell .activity-tab b { color: var(--success); }
.wallet-admin-shell .activity-tab.active { background: var(--success-bg); border-color: color-mix(in srgb, var(--success) 32%, var(--border-color)); color: var(--text-strong); }
.wallet-admin-shell .activity-table-wrap { overflow-x: auto; }
.wallet-admin-shell .activity-table { min-width: 1180px; }
.wallet-admin-shell .activity-table code { color: var(--text-muted); font-family: var(--font-mono); font-weight: 850; }
.wallet-admin-shell .activity-vendor { display: grid; grid-template-columns: 32px minmax(0, 1fr); column-gap: 10px; align-items: center; }
.wallet-admin-shell .activity-vendor > span { grid-row: span 2; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, var(--success), var(--info)); color: var(--text-inverse); font-weight: 900; }
.wallet-admin-shell .activity-vendor small { color: var(--text-muted); }
.wallet-admin-shell .activity-type-pill { display: inline-flex; align-items: center; min-height: 24px; padding: 0 9px; border-radius: 6px; font-size: 11px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }
.wallet-admin-shell .activity-type-pill.good { background: var(--success-bg); color: var(--success); }
.wallet-admin-shell .activity-type-pill.warn { background: var(--warning-bg); color: var(--warning); }
.wallet-admin-shell .activity-type-pill.info { background: var(--info-bg); color: var(--info); }
.wallet-admin-shell .activity-type-pill.danger { background: var(--danger-bg); color: var(--danger); }
.wallet-admin-shell .activity-footer { display: flex; justify-content: space-between; gap: 14px; align-items: center; padding: 14px 24px; color: var(--text-muted); }
.wallet-admin-shell .dot { display: inline-flex; width: 9px; height: 9px; border-radius: 999px; background: var(--text-faint); }
.wallet-admin-shell .dot.good { background: var(--success); }
.wallet-admin-shell .dot.warn { background: var(--warning); }
.wallet-admin-shell .dot.danger { background: var(--danger); }
.wallet-admin-shell .table-head { align-items: center; margin-bottom: 12px; }
.wallet-admin-shell .table-head h2 { margin: 0; }
.wallet-admin-shell .wallet-table-card .table-command-strip { margin-bottom: 12px; border: 1px solid var(--border-color); border-radius: var(--radius-md); }
.wallet-admin-shell .table-wrap { overflow: auto; border: 1px solid var(--border-color); border-radius: 8px 8px 0 0; }
.wallet-admin-shell table { width: 100%; min-width: 980px; border-collapse: collapse; }
.wallet-admin-shell th,
.wallet-admin-shell td { padding: 11px 12px; text-align: left; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
.wallet-admin-shell th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-page);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .04em;
  text-transform: uppercase;
}
.wallet-admin-shell tbody tr { cursor: pointer; transition: background var(--transition-fast), box-shadow var(--transition-fast); }
.wallet-admin-shell tbody tr:hover,
.wallet-admin-shell tbody tr.selected { background: var(--primary-light); }
.wallet-admin-shell tbody tr.selected { box-shadow: inset 3px 0 0 var(--primary); }
.wallet-admin-shell td strong,
.wallet-admin-shell td small { display: block; }
.wallet-admin-shell .empty-cell { color: var(--text-muted); text-align: center; }
.wallet-admin-shell .wallet-pagination { border-radius: 0 0 var(--radius-md) var(--radius-md); }
.wallet-admin-shell .primary-button,
.wallet-admin-shell .quiet-button,
.wallet-admin-shell .danger-button,
.wallet-admin-shell .mini-button,
.wallet-admin-shell .filter-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--button-height-md);
  border-radius: var(--button-radius);
  padding: 0 14px;
  cursor: pointer;
  font: inherit;
  font-weight: var(--button-font-weight);
  text-decoration: none;
}
.wallet-admin-shell .primary-button { border: 1px solid var(--success); background: var(--success); color: var(--text-inverse); box-shadow: var(--shadow-glow-sm); }
.wallet-admin-shell .quiet-button,
.wallet-admin-shell .mini-button,
.wallet-admin-shell .filter-pill { border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-main); }
.wallet-admin-shell .danger-button { border: 1px solid var(--danger); background: var(--danger-bg); color: var(--danger); }
.wallet-admin-shell .filter-pill.active { border-color: var(--success); color: var(--success); box-shadow: inset 0 -2px 0 var(--success); }
.wallet-admin-shell .status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  font-size: 11px;
  font-weight: 800;
}
.wallet-admin-shell .status-pill.good { color: var(--success); background: var(--success-bg); border-color: color-mix(in srgb, var(--success) 30%, transparent); }
.wallet-admin-shell .status-pill.warn { color: var(--warning); background: var(--warning-bg); border-color: color-mix(in srgb, var(--warning) 30%, transparent); }
.wallet-admin-shell .status-pill.danger { color: var(--danger); background: var(--danger-bg); border-color: color-mix(in srgb, var(--danger) 30%, transparent); }
.wallet-admin-shell .status-pill.info { color: var(--info); background: var(--info-bg); border-color: color-mix(in srgb, var(--info) 30%, transparent); }
.wallet-admin-shell .stepper {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
}
.wallet-admin-shell .stepper button { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 6px; align-items: center; min-height: 68px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-card); text-align: left; font: inherit; }
.wallet-admin-shell .stepper button.active { border-color: var(--success); box-shadow: inset 0 0 0 1px var(--success); }
.wallet-admin-shell .stepper b { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 999px; background: var(--success); color: var(--text-inverse); }
.wallet-admin-shell .stepper small { grid-column: 2; }
.wallet-admin-shell .form-panel h2 { margin-top: 0; }
.wallet-admin-shell .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.wallet-admin-shell .form-grid label { display: grid; gap: 7px; font-weight: 800; }
.wallet-admin-shell .span-2 { grid-column: span 2; }
.wallet-admin-shell .password-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--success-bg);
}
.wallet-admin-shell .completion-ring { display: grid; place-items: center; width: 116px; height: 116px; margin: 12px auto; border-radius: 999px; border: 10px solid var(--success); }
.wallet-admin-shell .proof-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.wallet-admin-shell .proof-card { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--border-color); border-radius: var(--radius-md); }
.wallet-admin-shell .document-preview { display: grid; place-items: center; min-height: 96px; border-radius: var(--radius-sm); background: var(--success-bg); color: var(--success); font-weight: 900; }
.wallet-admin-shell .verification-decision label { display: flex; gap: 12px; padding: 12px; border: 1px solid var(--border-color); border-radius: var(--radius-md); cursor: pointer; }
.wallet-admin-shell .verification-decision label.active { border-color: var(--success); background: var(--success-bg); }
.wallet-admin-shell .timeline-steps { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.wallet-admin-shell .timeline-steps span { display: grid; gap: 6px; justify-items: center; text-align: center; color: var(--text-muted); }
.wallet-admin-shell .timeline-steps b { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 999px; background: var(--success); color: var(--text-inverse); }
.wallet-admin-shell .timeline-steps .current b { background: var(--bg-card); color: var(--success); border: 2px solid var(--success); }
.wallet-admin-shell .report-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.wallet-admin-shell .report-card { display: grid; gap: 10px; align-content: start; }
.wallet-admin-shell .policy-banner,
.wallet-admin-shell .info-banner { padding: 14px 16px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--success-bg); }
.wallet-admin-shell .wallet-stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
.wallet-admin-shell .wallet-tabs-row { display: flex; gap: 28px; min-height: 42px; align-items: end; border-bottom: 1px solid var(--border-color); }
.wallet-admin-shell .wallet-tabs-row a { height: 42px; color: var(--text-main); font-weight: 800; text-decoration: none; }
.wallet-admin-shell .wallet-tabs-row a.active { color: var(--success); border-bottom: 2px solid var(--success); }
.wallet-admin-shell .alert-row { display: grid; gap: 3px; padding: 11px 0 11px 12px; border-left: 3px solid var(--info); border-bottom: 1px solid var(--border-color); }
.wallet-admin-shell .alert-row.danger { border-left-color: var(--danger); }
.wallet-admin-shell .alert-row.warn { border-left-color: var(--warning); }
.wallet-admin-shell .alert-row.good { border-left-color: var(--success); }
.wallet-admin-shell .alert-row span,
.wallet-admin-shell .alert-row small { color: var(--text-muted); }
.wallet-admin-shell .trend-panel :deep(.echart-panel) { min-height: 260px; }
.wallet-admin-shell--verification .verification-decision {
  grid-column: 4;
  grid-row: 1 / span 3;
  position: sticky;
  top: 76px;
}
.wallet-admin-shell--verification .verification-grid .panel--wide { grid-column: span 2; }
@keyframes wallet-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (max-width: 1280px) {
  .wallet-admin-shell { grid-template-columns: 236px minmax(0, 1fr); }
  .wallet-admin-topbar { grid-template-columns: minmax(0, 1fr); align-items: stretch; }
  .wallet-topbar-actions { justify-content: flex-start; flex-wrap: wrap; }
  .wallet-admin-scroll { padding: 28px; }
  .wallet-admin-shell .kpi-grid,
  .wallet-admin-shell .kpi-grid--six,
  .wallet-admin-shell .dashboard-grid,
  .wallet-admin-shell .operations-grid,
  .wallet-admin-shell .content-grid,
  .wallet-admin-shell .create-grid,
  .wallet-admin-shell .verification-grid,
  .wallet-admin-shell .report-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .wallet-admin-shell { grid-template-columns: 1fr; }
  .wallet-admin-sidebar { position: relative; height: auto; padding: 18px; }
  .wallet-nav-groups { display: grid; grid-template-columns: 1fr; overflow: visible; }
  .wallet-admin-main { grid-template-rows: auto minmax(0, 1fr); }
  .wallet-admin-topbar,
  .wallet-admin-scroll { padding: 18px; }
  .wallet-date-range { flex-wrap: wrap; }
  .wallet-date-range label,
  .wallet-date-range input { width: 100%; }
  .wallet-admin-shell .wallet-page-head,
  .wallet-admin-shell .head-actions,
  .wallet-admin-shell .kpi-grid,
  .wallet-admin-shell .kpi-grid--six,
  .wallet-admin-shell .dashboard-grid,
  .wallet-admin-shell .operations-grid,
  .wallet-admin-shell .content-grid,
  .wallet-admin-shell .create-grid,
  .wallet-admin-shell .verification-grid,
  .wallet-admin-shell .form-grid,
  .wallet-admin-shell .stepper,
  .wallet-admin-shell .proof-grid,
  .wallet-admin-shell .timeline-steps,
  .wallet-admin-shell .report-grid { grid-template-columns: 1fr; }
  .wallet-admin-shell .panel--wide,
  .wallet-admin-shell .span-2 { grid-column: span 1; }
  .wallet-admin-shell .search-field { width: 100%; }
  .wallet-admin-shell .kpi-drilldown { grid-template-columns: 1fr; }
  .wallet-admin-shell .activity-toolbar,
  .wallet-admin-shell .activity-footer { align-items: stretch; flex-direction: column; }
  .wallet-admin-shell .activity-filters:not(.open) { display: none; }
  .wallet-admin-shell .recent-activity-panel > .panel-head { align-items: flex-start; flex-direction: column; }
  .wallet-admin-shell .pulse-row { grid-template-columns: 1fr auto; }
  .wallet-admin-shell .pulse-row span,
  .wallet-admin-shell .pulse-row strong { grid-column: 1; }
}
</style>
