<template>
  <section :class="['wallet-admin-shell', `wallet-admin-shell--${activePage}`]" aria-label="Wallet admin workspace">
    <header class="wallet-page-head">
      <div>
        <p class="breadcrumb-line">Beverly CRM / Vending Wallet / <strong>{{ pageTitle }}</strong></p>
        <h1>{{ pageTitle }}</h1>
        <p>{{ pageSubtitle }}</p>
      </div>
      <div class="head-actions">
        <BaseButton class="quiet-button" @click="exportCurrentView">Export</BaseButton>
        <a v-if="activePage === 'vendors'" class="primary-button" href="#/wallet/admin/vendors/create">Create Vendor</a>
        <BaseButton v-else-if="activePage === 'users'" class="primary-button" variant="primary" @click="inviteUser">Invite User</BaseButton>
        <BaseButton v-else-if="activePage === 'verification'" class="primary-button" variant="primary" @click="confirmVerificationDecision">Confirm Decision</BaseButton>
      </div>
    </header>

    <section v-if="activePage === 'dashboard'" class="page-stack">
      <div class="kpi-grid kpi-grid--six">
        <KpiCard label="Total Vendors" value="1,248" tone="good" note="+12.4% vs last week" />
        <KpiCard label="Active Wallets" value="98,765" tone="good" note="+8.7% this month" />
        <KpiCard label="Pending Funding" value="NGN 3.84M" tone="warn" note="253 approval items" />
        <KpiCard label="Today's Purchases" value="NGN 12.74M" tone="good" note="47 successful vends" />
        <KpiCard label="Frozen Wallets" value="312" tone="info" note="4.1% reduction" />
        <KpiCard label="Failed Transactions" value="1,274" tone="danger" note="needs review" />
      </div>
      <div class="dashboard-grid">
        <article class="panel trend-panel">
          <div class="panel-head">
            <h2>Wallet Balance Trend</h2>
            <BaseSelect v-model="chartMode" class="mini-select"><option>Daily</option><option>Weekly</option></BaseSelect>
          </div>
          <EChartPanel :option="walletTrendOption" />
        </article>
        <article class="panel">
          <h2>Operational Queues</h2>
          <a v-for="queue in operationalQueues" :key="queue.label" :href="queue.hash" class="queue-link">
            <span>{{ queue.label }}</span><b :class="queue.tone">{{ queue.count }}</b>
          </a>
        </article>
        <article class="panel alerts-panel">
          <div class="panel-head"><h2>Alerts</h2><a href="#/wallet/admin/exceptions">View all</a></div>
          <div v-for="alert in walletAlerts" :key="alert.title" :class="['alert-row', alert.tone]">
            <strong>{{ alert.title }}</strong>
            <span>{{ alert.copy }}</span>
            <small>{{ alert.time }}</small>
          </div>
        </article>
      </div>
      <WalletTable title="Recent Activities" :columns="activityColumns" :rows="filteredActivities">
        <template #row="{ row }">
          <td>{{ row.time }}</td>
          <td><strong>{{ row.activity }}</strong></td>
          <td>{{ row.entity }}</td>
          <td :class="row.amount.startsWith('-') ? 'tone-danger' : 'tone-good'">{{ row.amount }}</td>
          <td><span :class="['status-pill', row.tone]">{{ row.status }}</span></td>
          <td>{{ row.actor }}</td>
          <td><BaseButton class="icon-action" size="sm" @click="openAudit(row)">...</BaseButton></td>
        </template>
      </WalletTable>
    </section>

    <section v-else-if="activePage === 'vendors'" class="page-stack">
      <div class="kpi-grid">
        <KpiCard label="Total Vendors" value="1,248" tone="good" note="+12.4% vs May 11 - May 17" />
        <KpiCard label="Verified Vendors" value="982" tone="good" note="+15.6% verified" />
        <KpiCard label="Pending Verification" value="186" tone="warn" note="-4.2% this week" />
        <KpiCard label="Frozen Vendors" value="80" tone="danger" note="+3.1% watched" />
      </div>
      <div class="filter-toolbar wallet-table-toolbar">
        <BaseSelect v-model="vendorStatusFilter" class="mini-select"><option value="">All Statuses</option><option>Active</option><option>Pending</option><option>Inactive</option></BaseSelect>
        <BaseSelect v-model="vendorKycFilter" class="mini-select"><option value="">All KYC</option><option>Verified</option><option>Under Review</option><option>Pending</option><option>Failed</option></BaseSelect>
        <BaseButton class="quiet-button" @click="clearFilters">Clear all</BaseButton>
      </div>
      <div class="content-grid">
        <WalletTable title="Vendor Directory" :columns="vendorColumns" :rows="filteredVendors">
          <template #row="{ row }">
            <td><strong>{{ row.name }}</strong><small>{{ row.email }}</small></td>
            <td><code>{{ row.code }}</code></td>
            <td>{{ row.contact }}</td>
            <td><span :class="['status-pill', row.kycTone]">{{ row.kyc }}</span></td>
            <td><strong>{{ row.balance }}</strong></td>
            <td>{{ row.held }}</td>
            <td><span :class="['status-pill', row.limitTone]">{{ row.limit }}</span></td>
            <td><span :class="['status-pill', row.statusTone]">{{ row.status }}</span></td>
            <td class="row-actions"><a class="mini-button" href="#/wallet/admin/verification">Review</a><BaseButton class="mini-button" size="sm" @click="freezeVendor(row)">Freeze</BaseButton></td>
          </template>
        </WalletTable>
        <aside class="side-stack">
          <article class="panel">
            <h2>Onboarding Funnel</h2>
            <div v-for="step in onboardingFunnel" :key="step.label" class="funnel-row">
              <span>{{ step.label }}</span><b>{{ step.count }}</b>
            </div>
            <strong class="tone-good">45.5% conversion</strong>
          </article>
          <article class="panel">
            <h2>Recent Vendor Activities</h2>
            <div v-for="item in vendorActivity" :key="item.text" class="activity-item">
              <span :class="['dot', item.tone]"></span>
              <p>{{ item.text }}<small>{{ item.time }}</small></p>
            </div>
          </article>
        </aside>
      </div>
    </section>

    <section v-else-if="activePage === 'createVendor'" class="page-stack">
      <nav class="stepper" aria-label="Create vendor steps">
        <BaseButton v-for="step in vendorSteps" :key="step.id" :class="{ active: createVendorStep === step.id }" @click="createVendorStep = step.id">
          <b>{{ step.id }}</b><span>{{ step.label }}</span><small>{{ step.hint }}</small>
        </BaseButton>
      </nav>
      <div class="create-grid">
        <article class="panel form-panel">
          <h2>Business Identity</h2>
          <div class="form-grid">
            <label><span>Legal Business Name</span><BaseInput v-model="vendorDraft.name" type="text" /></label>
            <label><span>CAC Registration Number</span><BaseInput v-model="vendorDraft.registration" type="text" /></label>
            <label><span>Business Type</span><BaseSelect v-model="vendorDraft.businessType"><option>Private Limited Company</option><option>Registered Business Name</option></BaseSelect></label>
            <label><span>Email</span><BaseInput v-model="vendorDraft.email" type="email" /></label>
            <label><span>Phone</span><BaseInput v-model="vendorDraft.phone" type="tel" /></label>
            <label class="span-2"><span>Address</span><BaseInput v-model="vendorDraft.address" type="text" /></label>
            <label><span>Operating Sites</span><BaseInput v-model="vendorDraft.sites" type="text" /></label>
            <label><span>Limit Profile</span><BaseSelect v-model="vendorDraft.limit"><option>Standard</option><option>Premium</option><option>Enterprise</option></BaseSelect></label>
          </div>
          <h2>Primary Admin Contact</h2>
          <div class="form-grid">
            <label><span>Full Name</span><BaseInput v-model="vendorDraft.contact" type="text" /></label>
            <label><span>Contact Email</span><BaseInput v-model="vendorDraft.contactEmail" type="email" /></label>
            <label><span>Job Title</span><BaseInput v-model="vendorDraft.jobTitle" type="text" /></label>
            <label><span>Access Method</span><BaseSelect v-model="vendorDraft.accessMethod"><option>Temporary Password</option><option>Invite Link</option></BaseSelect></label>
          </div>
          <div class="password-box">
            <div>
              <span>Temporary Password</span>
              <strong>{{ vendorDraft.temporaryPassword }}</strong>
              <small>Vendor must change this after first login.</small>
            </div>
            <BaseButton class="quiet-button" @click="regeneratePassword">Regenerate Password</BaseButton>
            <BaseButton class="primary-button" variant="primary" @click="createVendorAccount">Create Account</BaseButton>
          </div>
        </article>
        <aside class="side-stack">
          <article class="panel">
            <h2>Required Information</h2>
            <div class="completion-ring"><strong>100%</strong><span>Complete</span></div>
            <ul class="check-list">
              <li v-for="item in requiredVendorInfo" :key="item">Verified: {{ item }}</li>
            </ul>
          </article>
          <article class="panel">
            <h2>Document Requirements</h2>
            <div v-for="doc in documentRequirements" :key="doc.name" class="document-row">
              <span>{{ doc.name }}</span><b :class="doc.required ? 'tone-danger' : 'tone-muted'">{{ doc.required ? "Required" : "Optional" }}</b>
            </div>
          </article>
        </aside>
      </div>
    </section>

    <section v-else-if="activePage === 'users'" class="page-stack wallet-crm-table-page">
      <div class="filter-toolbar wallet-table-toolbar">
        <div class="tab-row"><BaseButton :class="['filter-pill', userTab === 'staff' ? 'active' : '']" @click="userTab = 'staff'">Wallet Staff Users</BaseButton><BaseButton :class="['filter-pill', userTab === 'vendor' ? 'active' : '']" @click="userTab = 'vendor'">Vendor Users</BaseButton></div>
        <BaseSelect v-model="userRoleFilter" class="mini-select"><option value="">All Roles</option><option>Platform Admin</option><option>Finance Checker</option><option>Support Reviewer</option><option>Vendor Manager</option><option>Vendor User</option></BaseSelect>
        <BaseSelect v-model="userStatusFilter" class="mini-select"><option value="">All Statuses</option><option>Active</option><option>Suspended</option><option>Inactive</option></BaseSelect>
      </div>
      <WalletTable title="Users" :columns="userColumns" :rows="filteredUsers">
        <template #row="{ row }">
          <td><strong>{{ row.name }}</strong><small>{{ row.team }}</small></td>
          <td>{{ row.email }}</td>
          <td><span :class="['status-pill', row.roleTone]">{{ row.role }}</span></td>
          <td>{{ row.approvalAuthority }}</td>
          <td>{{ row.limitAuthority }}</td>
          <td><span :class="['status-pill', row.status === 'Suspended' ? 'danger' : 'good']">{{ row.status }}</span></td>
          <td>{{ row.lastActive }}</td>
          <td class="row-actions"><BaseButton class="mini-button" size="sm" @click="suspendUser(row)">Suspend</BaseButton><BaseButton class="mini-button" size="sm" @click="resetUser(row)">Reset</BaseButton><BaseButton class="mini-button" size="sm" @click="openAudit(row)">Audit</BaseButton></td>
        </template>
      </WalletTable>
      <article class="panel role-matrix-panel">
        <h2>Role & Permissions Matrix</h2>
        <table class="matrix-table">
          <thead><tr><th>Permission Area</th><th v-for="role in roleMatrix" :key="role.role">{{ role.role }}</th></tr></thead>
          <tbody>
            <tr v-for="area in permissionAreas" :key="area"><td>{{ area }}</td><td v-for="role in roleMatrix" :key="role.role + area" :class="role.permissions[area].tone">{{ role.permissions[area].value }}</td></tr>
          </tbody>
        </table>
      </article>
    </section>

    <section v-else-if="activePage === 'verification'" class="page-stack">
      <div class="decision-head">
        <span class="status-pill warn">Pending Review</span>
        <BaseButton class="quiet-button" @click="verificationDecision = 'request_more_info'">Request More Info</BaseButton>
        <BaseButton class="danger-button" variant="danger" @click="verificationDecision = 'reject'">Reject</BaseButton>
        <BaseButton class="primary-button" variant="primary" @click="verificationDecision = 'approve'">Approve</BaseButton>
      </div>
      <nav class="wallet-tabs-row" aria-label="Verification sections">
        <a class="active" href="#/wallet/admin/verification">Overview</a>
        <a href="#/wallet/admin/verification">Documents</a>
        <a href="#/wallet/admin/verification">Checklist</a>
        <a href="#/wallet/admin/verification">Timeline</a>
        <a href="#/wallet/admin/verification">Activity Log</a>
      </nav>
      <div class="verification-grid">
        <article v-for="card in verificationCards" :key="card.title" class="panel verification-card">
          <h2>{{ card.title }}</h2>
          <p v-for="line in card.lines" :key="line"><span>{{ line.split(':')[0] }}</span><strong>{{ line.split(':').slice(1).join(':') }}</strong></p>
          <a href="#/wallet/admin/vendors">View details</a>
        </article>
        <article class="panel panel--wide">
          <h2>Document Proofs</h2>
          <div class="proof-grid">
            <div v-for="doc in proofDocuments" :key="doc.name" class="proof-card">
              <span class="document-preview">{{ doc.short }}</span>
              <strong>{{ doc.name }}</strong>
              <small :class="doc.tone">{{ doc.status }}</small>
            </div>
          </div>
        </article>
        <article class="panel">
          <h2>Verification Checklist</h2>
          <div v-for="item in verificationChecklist" :key="item.label" class="check-row">
            <span>{{ item.label }}</span><b :class="item.tone">{{ item.status }}</b>
          </div>
        </article>
        <article class="panel verification-decision">
          <h2>Review Decision</h2>
          <label v-for="choice in decisionChoices" :key="choice.value" :class="{ active: verificationDecision === choice.value }" @click="verificationDecision = choice.value">
            <span><strong>{{ choice.label }}</strong><small>{{ choice.help }}</small></span>
          </label>
          <textarea v-model="verificationComment" rows="5" placeholder="Visible vendor comment"></textarea>
          <textarea v-model="verificationInternalNote" rows="4" placeholder="Internal note"></textarea>
          <BaseButton class="primary-button" variant="primary" @click="confirmVerificationDecision">Confirm Decision</BaseButton>
        </article>
        <article class="panel panel--wide">
          <h2>Verification Timeline</h2>
          <div class="timeline-steps">
            <span v-for="step in verificationTimeline" :key="step.label" :class="step.tone"><b>{{ step.index }}</b>{{ step.label }}<small>{{ step.meta }}</small></span>
          </div>
        </article>
      </div>
    </section>

    <section v-else-if="activePage === 'wallets'" class="page-stack">
      <div class="kpi-grid">
        <KpiCard label="Total Float" value="NGN 2.01M" tone="good" />
        <KpiCard label="Total Reserved" value="NGN 165K" tone="warn" />
        <KpiCard label="Active Wallets" value="4 / 5" tone="good" />
        <KpiCard label="Frozen Wallets" value="1" tone="danger" />
      </div>
      <div class="policy-banner"><strong>Admin Credit Policy:</strong> balances are never edited directly. Credits post through approved funding, maker-checker manual credits, or compensating entries.</div>
      <WalletTable title="Wallet Balances" :columns="walletColumns" :rows="walletCards">
        <template #row="{ row }">
          <td><strong>{{ row.name }}</strong><small>{{ row.code }} / {{ row.site }}</small></td>
          <td>{{ row.available }}</td>
          <td>{{ row.float }}</td>
          <td>{{ row.reserved }}</td>
          <td><span class="status-pill good">{{ row.risk }}</span></td>
          <td class="row-actions"><BaseButton class="mini-button" size="sm">Ledger</BaseButton><BaseButton class="mini-button" size="sm">Transactions</BaseButton><BaseButton class="danger-button" variant="danger" size="sm">Freeze</BaseButton></td>
        </template>
      </WalletTable>
    </section>

    <section v-else-if="activePage === 'funding'" class="page-stack">
      <div class="tab-row"><BaseButton class="filter-pill active">Funding Requests</BaseButton><BaseButton class="filter-pill">Manual Credits</BaseButton></div>
      <WalletTable title="Funding Approval Queue" :columns="fundingColumns" :rows="filteredFundingRows">
        <template #row="{ row }">
          <td><code>{{ row.ref }}</code></td>
          <td><strong>{{ row.vendor }}</strong></td>
          <td>{{ row.amount }}</td>
          <td>{{ row.channel }}</td>
          <td>{{ row.bankRef }}</td>
          <td>{{ row.submitted }}</td>
          <td><span :class="['status-pill', row.tone]">{{ row.status }}</span></td>
          <td class="row-actions"><BaseButton class="mini-button" size="sm" @click="openProof(row)">Proof</BaseButton><BaseButton class="primary-button" variant="primary" size="sm" @click="approveFunding(row)">Approve</BaseButton><BaseButton class="danger-button" variant="danger" size="sm" @click="rejectFunding(row)">Reject</BaseButton></td>
        </template>
      </WalletTable>
    </section>

    <section v-else-if="activePage === 'purchase'" class="page-stack">
      <WalletTable title="Vending Monitor" :columns="purchaseColumns" :rows="filteredPurchases">
        <template #row="{ row }">
          <td><code>{{ row.id }}</code></td>
          <td>{{ row.date }}</td>
          <td>{{ row.vendor }}</td>
          <td><code>{{ row.meter }}</code></td>
          <td><span :class="['status-pill', row.delivery === 'Remote Send' ? 'info' : 'good']">{{ row.delivery }}</span></td>
          <td>{{ row.amount }}</td>
          <td><span :class="['status-pill', row.status === 'failed' ? 'danger' : 'good']">{{ row.status }}</span></td>
          <td><BaseButton class="mini-button" size="sm" @click="openReceipt(row)">Receipt</BaseButton></td>
        </template>
      </WalletTable>
    </section>

    <section v-else-if="activePage === 'reversals' || activePage === 'disputes'" class="page-stack">
      <WalletTable :title="activePage === 'reversals' ? 'Reversal Requests' : 'Disputes'" :columns="caseColumns" :rows="filteredCases">
        <template #row="{ row }">
          <td><code>{{ row.id }}</code></td><td>{{ row.vendor }}</td><td>{{ row.customer }}</td><td>{{ row.amount }}</td><td><span :class="['status-pill', row.tone]">{{ row.status }}</span></td><td>{{ row.priority }}</td><td><BaseButton class="mini-button" size="sm">Review</BaseButton></td>
        </template>
      </WalletTable>
    </section>

    <section v-else-if="activePage === 'settlement'" class="page-stack">
      <article v-for="batch in settlements" :key="batch.site" class="settlement-card">
        <div class="wallet-title"><div><h2>{{ batch.date }} - {{ batch.site }}</h2><p>Commission 0.00% pending activation / {{ batch.txns }} txns</p></div><span class="status-pill good">locked</span></div>
        <div class="wallet-stat-grid"><KpiCard label="Purchases" :value="batch.purchases" /><KpiCard label="Commission" value="NGN 0.00" /><KpiCard label="Transactions" :value="String(batch.txns)" /><KpiCard label="Exceptions" value="0" tone="good" /></div>
      </article>
    </section>

    <section v-else-if="activePage === 'reports'" class="page-stack report-grid">
      <article v-for="report in reports" :key="report.title" class="panel report-card"><h2>{{ report.title }}</h2><p>{{ report.copy }}</p><BaseButton class="mini-button" size="sm" @click="generateReport(report)">Generate</BaseButton></article>
    </section>

    <section v-else class="page-stack">
      <div class="info-banner">No policy permits UPDATE or DELETE on financial evidence. Role, password, approval, and ledger actions appear as immutable audit events.</div>
      <WalletTable title="Audit Log" :columns="auditColumns" :rows="filteredAuditRows">
        <template #row="{ row }">
          <td><code>{{ row.time }}</code></td><td>{{ row.actor }}</td><td><span class="status-pill info">{{ row.role }}</span></td><td><code>{{ row.event }}</code></td><td>{{ row.target }}</td><td>{{ row.ip }}</td>
        </template>
      </WalletTable>
    </section>
  </section>
</template>

<script>
import { h } from "vue";
import BaseButton from "../base/BaseButton.vue";
import BaseInput from "../base/BaseInput.vue";
import BaseSelect from "../base/BaseSelect.vue";
import EChartPanel from "../EChartPanel.vue";
import { createBarOption, dashboardSeries } from "../../services/dashboard-chart-options.mjs";

const KpiCard = {
  props: { label: String, value: String, note: String, tone: String },
  render() {
    const children = [
      h("span", this.label),
      h("i", { class: "kpi-icon", "aria-hidden": "true" }),
      h("strong", this.value)
    ];
    if (this.note) children.push(h("small", this.note));
    return h("article", { class: ["kpi-card", this.tone] }, children);
  }
};

const WalletTable = {
  props: { title: String, columns: Array, rows: Array },
  data() {
    return {
      currentPage: 1,
      pageSize: 10,
      selectedKey: ""
    };
  },
  computed: {
    filteredTotal() {
      return this.rows.length;
    },
    pageCount() {
      return Math.max(1, Math.ceil(this.filteredTotal / this.pageSize));
    },
    pages() {
      return Array.from({ length: this.pageCount }, (_, index) => index + 1).slice(0, 5);
    },
    visibleRows() {
      const start = (this.currentPage - 1) * this.pageSize;
      return this.rows.slice(start, start + this.pageSize);
    },
    visibleStart() {
      return this.filteredTotal ? (this.currentPage - 1) * this.pageSize + 1 : 0;
    },
    visibleEnd() {
      return Math.min(this.currentPage * this.pageSize, this.filteredTotal);
    }
  },
  watch: {
    rows() {
      this.currentPage = Math.min(this.currentPage, this.pageCount);
      if (!this.rows.some((row) => this.keyForRow(row) === this.selectedKey)) this.selectedKey = "";
    }
  },
  methods: {
    keyForRow(row) {
      return row.id || row.code || row.ref || row.email || row.name || JSON.stringify(row);
    },
    goToPage(page) {
      this.currentPage = Math.min(Math.max(1, page), this.pageCount);
    },
    changePageSize(event) {
      this.pageSize = Number(event.target.value) || 10;
      this.currentPage = 1;
    }
  },
  render() {
    return h("article", { class: "wallet-table-card" }, [
      h("div", { class: "table-head" }, [
        h("h2", this.title),
        h("span", `${this.filteredTotal} results`)
      ]),
      h("div", { class: "table-command-strip", "aria-live": "polite" }, [
        h("div", [h("span", `${this.filteredTotal} visible`)]),
        h("div", { class: "table-command-meta" }, [
          h("span", `Page ${this.currentPage} / ${this.pageCount}`),
          h("span", `${this.pageSize}/page`)
        ])
      ]),
      h("div", { class: "table-wrap" }, [
        h("table", [
          h("thead", [h("tr", this.columns.map((column) => h("th", { key: column }, column)))]),
          h("tbody", this.visibleRows.length ? this.visibleRows.map((row) => {
            const rowKey = this.keyForRow(row);
            return h("tr", {
              key: rowKey,
              class: { selected: this.selectedKey === rowKey },
              onClick: () => { this.selectedKey = rowKey; }
            }, this.$slots.row({ row }));
          }) : [
            h("tr", [h("td", { colspan: this.columns.length, class: "empty-cell" }, "No matching records")])
          ])
        ])
      ]),
      h("div", { class: "pagination wallet-pagination" }, [
        h("span", `Showing ${this.visibleStart} to ${this.visibleEnd} of ${this.filteredTotal} results`),
        h("select", {
          class: "sort-select",
          value: this.pageSize,
          "aria-label": "Page size",
          onChange: this.changePageSize
        }, [10, 25, 50, 100].map((option) => h("option", { key: option, value: option }, `${option}/page`))),
        h("button", { class: "page-chip", type: "button", disabled: this.currentPage === 1, onClick: () => this.goToPage(this.currentPage - 1) }, "\u2039"),
        ...this.pages.map((page) => h("button", {
          key: page,
          class: ["page-chip", page === this.currentPage ? "active" : ""],
          type: "button",
          onClick: () => this.goToPage(page)
        }, String(page))),
        h("button", { class: "page-chip", type: "button", disabled: this.currentPage === this.pageCount, onClick: () => this.goToPage(this.currentPage + 1) }, "\u203A"),
        h("span", "Go to")
      ])
    ]);
  }
};

const money = (value) => `NGN ${Number(value).toLocaleString("en-NG")}`;

export default {
  name: "AdminWalletOperationsPage",
  components: { BaseButton, BaseInput, BaseSelect, EChartPanel, KpiCard, WalletTable },
  data() {
    return {
      currentHash: window.location.hash,
      globalQuery: "",
      vendorStatusFilter: "",
      vendorKycFilter: "",
      userTab: "staff",
      userRoleFilter: "",
      userStatusFilter: "",
      chartMode: "Daily",
      createVendorStep: 1,
      verificationDecision: "approve",
      verificationComment: "Your verification looks good. We are approving your vendor account.",
      verificationInternalNote: "Strong documents and clean screening. Approved for standard operating limits.",
      vendorDraft: {
        name: "GreenMart Vending Solutions Ltd.",
        registration: "RC 1234567",
        businessType: "Private Limited Company",
        email: "hello@greenmartvending.com",
        phone: "+234 801 234 5678",
        address: "12 Adeola Odeku Street, Victoria Island",
        sites: "Lagos, Ogun, Oyo",
        limit: "Enterprise",
        contact: "Sarah Johnson",
        contactEmail: "sarah.johnson@greenmartvending.com",
        jobTitle: "Operations Manager",
        accessMethod: "Temporary Password",
        temporaryPassword: "Bv@7kLm!2Qp#9tZx"
      },
      vendorColumns: ["Vendor", "Organization ID", "Contact", "KYC", "Wallet Balance", "Held", "Limit", "Status", "Actions"],
      userColumns: ["Name", "Email", "Role", "Approval Authority", "Limits Authority", "Status", "Last Active", "Actions"],
      fundingColumns: ["Reference", "Vendor", "Amount", "Channel", "Bank Ref", "Submitted", "Status", "Actions"],
      purchaseColumns: ["Order ID", "Date", "Vendor", "Meter SN", "Delivery", "Amount", "Status", "Receipt"],
      walletColumns: ["Wallet", "Available", "Posted Float", "Reserved", "Risk", "Actions"],
      activityColumns: ["Time", "Activity", "Entity", "Amount", "Status", "Initiated By", "Actions"],
      caseColumns: ["Case ID", "Vendor", "Customer", "Amount", "Status", "Priority", "Action"],
      auditColumns: ["Time (WAT)", "Actor", "Role", "Event", "Target", "IP"],
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
        { name: "Emily Rodriguez", email: "emily@freshstop.com", role: "Vendor Manager", roleTone: "warn", team: "Vendor Ops", approvalAuthority: "Up to NGN 100,000", limitAuthority: "Up to NGN 100,000", status: "Active", lastActive: "35 minutes ago", kind: "vendor" },
        { name: "David Lee", email: "david@vendoplus.com", role: "Vendor User", roleTone: "warn", team: "Vendor Ops", approvalAuthority: "Up to NGN 10,000", limitAuthority: "Up to NGN 10,000", status: "Active", lastActive: "2 hours ago", kind: "vendor" },
        { name: "Tina Patel", email: "tina.patel@beverlycrm.com", role: "Support Reviewer", roleTone: "info", team: "Support", approvalAuthority: "Up to NGN 10,000", limitAuthority: "View Only", status: "Inactive", lastActive: "3 days ago", kind: "staff" }
      ],
      fundingRows: [
        { ref: "FND-20260513-00012", vendor: "FreshStop Mart", amount: money(200000), channel: "Bank transfer", bankRef: "FBN/26051300012", submitted: "13 May, 09:15", status: "under review", tone: "warn" },
        { ref: "FND-20260513-00011", vendor: "QuickVend Inc.", amount: money(500000), channel: "Bank transfer", bankRef: "GTB/26051300011", submitted: "13 May, 08:42", status: "under review", tone: "warn" },
        { ref: "FND-20260513-00010", vendor: "Beverly Snacks", amount: money(150000), channel: "POS", bankRef: "POS/9981", submitted: "12 May, 16:00", status: "posted", tone: "good" }
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
      auditRows: [
        { time: "13 May 10:14:22", actor: "admin", role: "super-admin", event: "role_changed", target: "USR-001", ip: "197.211.58.14" },
        { time: "13 May 09:58:01", actor: "finance-checker", role: "finance-checker", event: "funding_approved", target: "FND-20260513-00012", ip: "197.211.58.14" },
        { time: "13 May 09:42:15", actor: "vendor.demo@acob.ng", role: "vendor_user", event: "purchase_successful", target: "PO-00291", ip: "41.203.68.22" }
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
        createVendor: "Onboard a new vendor with identity verification and temporary-password access.",
        users: "Manage wallet platform users, roles, and fine-grained permissions.",
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
    },
    filteredVendors() {
      return this.vendors.filter((row) => this.matches(row) && (!this.vendorStatusFilter || row.status === this.vendorStatusFilter) && (!this.vendorKycFilter || row.kyc === this.vendorKycFilter));
    },
    filteredUsers() {
      return this.users.filter((row) => row.kind === this.userTab && this.matches(row) && (!this.userRoleFilter || row.role === this.userRoleFilter) && (!this.userStatusFilter || row.status === this.userStatusFilter));
    },
    filteredFundingRows() {
      return this.fundingRows.filter((row) => this.matches(row));
    },
    filteredPurchases() {
      return this.purchases.filter((row) => this.matches(row));
    },
    filteredAuditRows() {
      return this.auditRows.filter((row) => this.matches(row));
    },
    filteredCases() {
      return this.caseRows.filter((row) => this.matches(row));
    },
    filteredActivities() {
      return this.auditRows.map((row) => ({
        time: row.time,
        activity: row.event.replaceAll("_", " "),
        entity: row.target,
        amount: row.event.includes("purchase") ? "-NGN 5,000" : "+NGN 125,000",
        status: row.event.includes("approved") || row.event.includes("successful") ? "Approved" : "Recorded",
        tone: row.event.includes("successful") || row.event.includes("approved") ? "good" : "info",
        actor: row.actor
      })).filter((row) => this.matches(row));
    },
    operationalQueues() {
      return [
        { label: "Funding Approvals", count: 253, tone: "warn", hash: "#/wallet/admin/funding-credits" },
        { label: "Manual Credits", count: 87, tone: "good", hash: "#/wallet/admin/funding-credits" },
        { label: "Reversal Requests", count: 41, tone: "warn", hash: "#/wallet/admin/reversals" },
        { label: "Disputes", count: 23, tone: "danger", hash: "#/wallet/admin/disputes" }
      ];
    },
    walletAlerts() {
      return [
        { title: "High failure rate detected", copy: "1,274 failures in selected period.", time: "10m ago", tone: "danger" },
        { title: "KYC verification pending", copy: "132 vendors awaiting verification.", time: "25m ago", tone: "warn" },
        { title: "Large pending funding", copy: "NGN 3.84M awaiting approval.", time: "35m ago", tone: "good" },
        { title: "Settlement window open", copy: "May 2026 settlement is active.", time: "1h ago", tone: "info" }
      ];
    },
    trendPoints() {
      return this.chartMode === "Daily" ? [22, 31, 26, 49, 42, 56, 47, 44, 54, 68] : [34, 42, 58, 66, 73, 64];
    },
    trendLabels() {
      return this.chartMode === "Daily"
        ? ["May 15", "May 16", "May 17", "May 18", "May 19", "May 20", "May 21", "May 22", "May 23", "May 24"]
        : ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6"];
    },
    walletChartTheme() {
      return {
        primary: "var(--primary)",
        primaryDeep: "var(--primary-deep)",
        primaryLight: "var(--primary-light)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        textMuted: "var(--text-muted)",
        textFaint: "var(--text-faint)",
        border: "var(--border-color)",
        surface: "var(--bg-card)",
        tooltip: "var(--bg-card)",
        tooltipText: "var(--text-strong)"
      };
    },
    walletTrendOption() {
      return createBarOption(
        dashboardSeries(this.trendLabels, this.trendPoints),
        "Wallet Balance Trend",
        this.walletChartTheme
      );
    },
    vendorSteps() {
      return [
        { id: 1, label: "Organization Details", hint: "Business identity" },
        { id: 2, label: "Contact Person", hint: "Primary contact" },
        { id: 3, label: "Operating Sites", hint: "Site scope" },
        { id: 4, label: "Bank Details", hint: "Payout confirmation" },
        { id: 5, label: "Documents", hint: "KYC uploads" },
        { id: 6, label: "Limits & Risk", hint: "Exposure limits" },
        { id: 7, label: "Review", hint: "Submit" }
      ];
    },
    requiredVendorInfo() {
      return ["legal business name", "CAC registration number", "business type", "email address", "phone number", "address", "sites of operation", "primary admin", "access method"];
    },
    documentRequirements() {
      return [
        { name: "CAC Certificate", required: true },
        { name: "Tax Identification", required: true },
        { name: "Utility Bill", required: false },
        { name: "Means of ID", required: true }
      ];
    },
    roleMatrix() {
      const full = { value: "Full Access", tone: "tone-good" };
      const limited = (value) => ({ value, tone: "tone-warn" });
      const view = { value: "View Only", tone: "tone-info" };
      const none = { value: "No Access", tone: "tone-danger" };
      return [
        { role: "Platform Admin", permissions: { "Route Permissions": full, "API Permissions": full, "Approval Authority": full, "Limits Authority": full, "Impersonation / Testing": full } },
        { role: "Finance Checker", permissions: { "Route Permissions": limited("Limited"), "API Permissions": view, "Approval Authority": limited("Up to NGN 250,000"), "Limits Authority": limited("Up to NGN 250,000"), "Impersonation / Testing": limited("Limited") } },
        { role: "Support Reviewer", permissions: { "Route Permissions": view, "API Permissions": view, "Approval Authority": limited("Up to NGN 25,000"), "Limits Authority": view, "Impersonation / Testing": limited("Limited") } },
        { role: "Vendor Manager", permissions: { "Route Permissions": limited("Limited"), "API Permissions": limited("Limited"), "Approval Authority": limited("Up to NGN 100,000"), "Limits Authority": limited("Up to NGN 100,000"), "Impersonation / Testing": none } },
        { role: "Vendor User", permissions: { "Route Permissions": view, "API Permissions": none, "Approval Authority": limited("Up to NGN 10,000"), "Limits Authority": limited("Up to NGN 10,000"), "Impersonation / Testing": none } }
      ];
    },
    permissionAreas() {
      return ["Route Permissions", "API Permissions", "Approval Authority", "Limits Authority", "Impersonation / Testing"];
    },
    verificationCards() {
      return [
        { title: "Business Profile", lines: ["Business Name: GreenMart LLC", "Registration Number: RC 1234567", "CAC Status: Verified"] },
        { title: "Contact Details", lines: ["Contact Person: Michael Chen", "Email: michael.chen@greenmart.com", "Phone: +234 801 234 5678"] },
        { title: "Limit Profile", lines: ["Transaction Limit: NGN 10,000,000", "Daily Limit: NGN 2,000,000", "Wallet Balance: NGN 1,245,730.50"] },
        { title: "Risk Notes", lines: ["Risk Rating: Low", "PEP Status: No Match", "Sanctions Screening: Clear"] }
      ];
    },
    proofDocuments() {
      return [
        { name: "CAC Certificate", short: "CAC", status: "Verified", tone: "tone-good" },
        { name: "Address Proof", short: "ADR", status: "Verified", tone: "tone-good" },
        { name: "ID - Director", short: "ID", status: "Pending Review", tone: "tone-warn" },
        { name: "Tax Clearance", short: "TAX", status: "Pending", tone: "tone-warn" }
      ];
    },
    verificationChecklist() {
      return [
        { label: "Business Registration", status: "Verified", tone: "tone-good" },
        { label: "Tax Identification", status: "Verified", tone: "tone-good" },
        { label: "Address Verification", status: "Verified", tone: "tone-good" },
        { label: "ID Verification", status: "Pending", tone: "tone-warn" },
        { label: "AML / KYC Screening", status: "Verified", tone: "tone-good" }
      ];
    },
    verificationTimeline() {
      return [
        { index: 1, label: "Application Submitted", meta: "May 20, by vendor", tone: "done" },
        { index: 2, label: "Documents Uploaded", meta: "May 20, by vendor", tone: "done" },
        { index: 3, label: "Initial Screening", meta: "May 21, by system", tone: "done" },
        { index: 4, label: "Under Review", meta: "May 23, by admin", tone: "done" },
        { index: 5, label: "Decision Pending", meta: "May 24", tone: "current" }
      ];
    },
    decisionChoices() {
      return [
        { value: "approve", label: "Approve", help: "Vendor meets all requirements and can be onboarded." },
        { value: "request_more_info", label: "Request More Info", help: "Additional information is required." },
        { value: "reject", label: "Reject", help: "Vendor does not meet requirements." }
      ];
    },
    onboardingFunnel() {
      return [
        { label: "Invited", count: 312 },
        { label: "Profile Created", count: 246 },
        { label: "KYC Submitted", count: 198 },
        { label: "Verified", count: 142 }
      ];
    },
    vendorActivity() {
      return [
        { text: "FreshStop Mart wallet funded successfully", time: "10:42 AM", tone: "good" },
        { text: "QuickVend KYC verified successfully", time: "10:21 AM", tone: "good" },
        { text: "SnackHub KYC submission pending", time: "08:54 AM", tone: "warn" },
        { text: "Metro Vending vendor was frozen", time: "08:31 AM", tone: "danger" }
      ];
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
    matches(row) {
      if (!this.query) return true;
      return JSON.stringify(row).toLowerCase().includes(this.query);
    },
    clearFilters() {
      this.vendorStatusFilter = "";
      this.vendorKycFilter = "";
      this.globalQuery = "";
    },
    exportCurrentView() {
      this.auditRows.unshift({ time: "13 May 10:30:00", actor: "admin", role: "super-admin", event: `exported_${this.activePage}`, target: this.pageTitle, ip: "local" });
    },
    inviteUser() {
      this.users.push({ name: "New Invite", email: "pending.invite@beverlycrm.com", role: "Support Reviewer", roleTone: "info", team: "Support", approvalAuthority: "View Only", limitAuthority: "View Only", status: "Active", lastActive: "just now", kind: "staff" });
      this.auditRows.unshift({ time: "13 May 10:31:00", actor: "admin", role: "super-admin", event: "wallet_user_invited", target: "pending.invite@beverlycrm.com", ip: "local" });
    },
    suspendUser(row) {
      row.status = "Suspended";
      this.auditRows.unshift({ time: "13 May 10:32:00", actor: "admin", role: "super-admin", event: "wallet_user_suspended", target: row.email, ip: "local" });
    },
    resetUser(row) {
      this.auditRows.unshift({ time: "13 May 10:33:00", actor: "admin", role: "super-admin", event: "temporary_password_generated", target: row.email, ip: "local" });
    },
    freezeVendor(row) {
      row.status = "Inactive";
      row.statusTone = "danger";
      this.auditRows.unshift({ time: "13 May 10:34:00", actor: "admin", role: "super-admin", event: "wallet_frozen", target: row.code, ip: "local" });
    },
    regeneratePassword() {
      this.vendorDraft.temporaryPassword = `Bv@${Math.random().toString(36).slice(2, 8)}#${Math.random().toString(36).slice(2, 6)}`;
    },
    createVendorAccount() {
      const code = `VND-${String(this.vendors.length + 543).padStart(5, "0")}`;
      this.vendors.unshift({ name: this.vendorDraft.name, code, contact: this.vendorDraft.contact, email: this.vendorDraft.email, kyc: "Under Review", kycTone: "warn", balance: money(0), held: money(0), limit: this.vendorDraft.limit, limitTone: "info", status: "Pending", statusTone: "warn" });
      this.users.push({ name: this.vendorDraft.contact, email: this.vendorDraft.contactEmail, role: "Vendor Manager", roleTone: "warn", team: "Vendor Ops", approvalAuthority: "Up to NGN 100,000", limitAuthority: "Up to NGN 100,000", status: "Active", lastActive: "invite sent", kind: "vendor" });
      this.auditRows.unshift({ time: "13 May 10:35:00", actor: "admin", role: "super-admin", event: "vendor_account_created_temp_password", target: code, ip: "local" });
      window.location.hash = "#/wallet/admin/verification";
    },
    confirmVerificationDecision() {
      this.auditRows.unshift({ time: "13 May 10:36:00", actor: "finance-checker", role: "finance-checker", event: `verification_${this.verificationDecision}`, target: "GreenMart LLC", ip: "local" });
    },
    approveFunding(row) {
      row.status = "posted";
      row.tone = "good";
      this.auditRows.unshift({ time: "13 May 10:37:00", actor: "finance-checker", role: "finance-checker", event: "funding_approved", target: row.ref, ip: "local" });
    },
    rejectFunding(row) {
      row.status = "rejected";
      row.tone = "danger";
      this.auditRows.unshift({ time: "13 May 10:38:00", actor: "finance-checker", role: "finance-checker", event: "funding_rejected", target: row.ref, ip: "local" });
    },
    openProof(row) { this.openAudit(row); },
    openReceipt(row) { this.openAudit(row); },
    openAudit(row) {
      this.auditRows.unshift({ time: "13 May 10:39:00", actor: "admin", role: "super-admin", event: "viewed_record", target: row.id || row.ref || row.email || row.target || row.code, ip: "local" });
    },
    generateReport(report) {
      this.auditRows.unshift({ time: "13 May 10:40:00", actor: "admin", role: "super-admin", event: "report_generated", target: report.title, ip: "local" });
    }
  }
};
</script>

<style scoped>
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
  gap: 18px;
  color: var(--text-strong);
  font-family: var(--font-family);
  font-size: 12px;
}
.wallet-page-head,
.panel-head,
.decision-head,
.table-head,
.wallet-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.wallet-page-head h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.1;
  font-weight: 850;
}
.wallet-page-head p,
.breadcrumb-line,
small {
  color: var(--text-muted);
}
.breadcrumb-line strong { color: var(--success); }
.head-actions,
.filter-row,
.tab-row,
.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.search-field,
.mini-select,
input,
select,
textarea {
  min-height: var(--field-height);
  border: 1px solid var(--border-color);
  border-radius: var(--field-radius);
  background: var(--bg-card);
  color: var(--text-main);
  font: inherit;
  padding: 0 12px;
}
.search-field { width: min(420px, 40vw); }
textarea { padding: 12px; resize: vertical; }
.page-stack { display: grid; gap: 18px; animation: wallet-enter 220ms ease both; }
.wallet-crm-table-page {
  gap: 0;
}
.wallet-table-toolbar {
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
.wallet-table-toolbar .tab-row {
  margin-right: auto;
}
.wallet-crm-table-page .wallet-table-card {
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
}
.kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.kpi-grid--six { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.dashboard-grid,
.content-grid,
.create-grid,
.verification-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 16px;
}
.dashboard-grid { grid-template-columns: minmax(0, 1fr) 300px; align-items: stretch; }
.verification-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.content-grid .panel--wide,
.create-grid .panel--wide,
.verification-grid .panel--wide { grid-column: span 2; }
.panel,
.wallet-table-card,
.kpi-card,
.settlement-card {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}
.panel,
.settlement-card,
.wallet-table-card { padding: 16px; }
:deep(.kpi-card) {
  position: relative;
  display: grid;
  gap: 6px;
  min-height: 96px;
  padding: 18px 18px 16px 72px;
}
:deep(.kpi-card .kpi-icon) {
  position: absolute;
  left: 18px;
  top: 20px;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: var(--success-bg);
}
:deep(.kpi-card .kpi-icon::before) {
  content: "";
  display: block;
  width: 14px;
  height: 14px;
  margin: 12px auto;
  border: 2px solid var(--text-muted);
  border-radius: 4px;
}
:deep(.kpi-card span),
th {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .04em;
  text-transform: uppercase;
}
:deep(.kpi-card strong) { font-size: 22px; font-weight: 850; }
:deep(.kpi-card.good strong), .tone-good { color: var(--success); }
:deep(.kpi-card.warn strong), .tone-warn { color: var(--warning); }
:deep(.kpi-card.danger strong), .tone-danger { color: var(--danger); }
:deep(.kpi-card.info strong), .tone-info { color: var(--info); }
.tone-muted { color: var(--text-muted); }
.line-chart {
  display: flex;
  align-items: end;
  gap: 10px;
  height: 220px;
  padding-top: 20px;
}
.line-chart span {
  flex: 1;
  min-width: 20px;
  border-radius: 8px 8px 0 0;
  background: linear-gradient(180deg, color-mix(in srgb, var(--success) 85%, white), color-mix(in srgb, var(--success) 18%, transparent));
}
.donut-chart {
  display: grid;
  place-items: center;
  align-content: center;
  width: 180px;
  height: 180px;
  margin: 20px auto;
  border-radius: 999px;
  background: conic-gradient(var(--success) 0 86%, var(--danger) 86% 90%, var(--warning) 90% 100%);
  box-shadow: inset 0 0 0 34px var(--bg-card);
}
.donut-chart strong { font-size: 24px; }
.donut-chart span { color: var(--text-muted); }
.axis-row,
.legend-list,
.side-stack,
.check-list,
.verification-card,
.verification-decision {
  display: grid;
  gap: 10px;
}
.queue-link,
.activity-item,
.document-row,
.check-row,
.funnel-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  min-height: 38px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-main);
  text-decoration: none;
}
.queue-link b,
.funnel-row b { border-radius: 999px; padding: 3px 8px; background: var(--success-bg); }
.dot {
  display: inline-flex;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--text-faint);
}
.dot.good { background: var(--success); }
.dot.warn { background: var(--warning); }
.dot.danger { background: var(--danger); }
.table-head { align-items: center; margin-bottom: 12px; }
.table-head h2 { margin: 0; }
.wallet-table-card .table-command-strip {
  margin-bottom: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}
.table-wrap { overflow: auto; border: 1px solid var(--border-color); border-radius: var(--radius-md) var(--radius-md) 0 0; }
table { width: 100%; min-width: 980px; border-collapse: collapse; }
th, td { padding: 12px; text-align: left; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
th {
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
tbody tr {
  cursor: pointer;
  transition: background var(--transition-fast), box-shadow var(--transition-fast);
}
tbody tr:hover,
tbody tr.selected {
  background: var(--primary-light);
}
tbody tr.selected {
  box-shadow: inset 3px 0 0 var(--primary);
}
td strong, td small { display: block; }
.empty-cell { color: var(--text-muted); text-align: center; }
.wallet-pagination {
  border-radius: 0 0 var(--radius-md) var(--radius-md);
}
.primary-button,
.quiet-button,
.danger-button,
.mini-button,
.filter-pill {
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
.primary-button { border: 1px solid var(--success); background: var(--success); color: var(--text-inverse); box-shadow: var(--shadow-glow-sm); }
.quiet-button,
.mini-button,
.filter-pill { border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-main); }
.danger-button { border: 1px solid var(--danger); background: var(--danger-bg); color: var(--danger); }
.filter-pill.active { border-color: var(--success); color: var(--success); box-shadow: inset 0 -2px 0 var(--success); }
.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  font-size: 11px;
  font-weight: 800;
}
.status-pill.good { color: var(--success); background: var(--success-bg); border-color: color-mix(in srgb, var(--success) 30%, transparent); }
.status-pill.warn { color: var(--warning); background: var(--warning-bg); border-color: color-mix(in srgb, var(--warning) 30%, transparent); }
.status-pill.danger { color: var(--danger); background: var(--danger-bg); border-color: color-mix(in srgb, var(--danger) 30%, transparent); }
.status-pill.info { color: var(--info); background: var(--info-bg); border-color: color-mix(in srgb, var(--info) 30%, transparent); }
.stepper {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
}
.stepper button {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  min-height: 68px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  text-align: left;
  font: inherit;
}
.stepper button.active { border-color: var(--success); box-shadow: inset 0 0 0 1px var(--success); }
.stepper b {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: var(--success);
  color: var(--text-inverse);
}
.stepper small { grid-column: 2; }
.form-panel h2 { margin-top: 0; }
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.form-grid label { display: grid; gap: 7px; font-weight: 800; }
.span-2 { grid-column: span 2; }
.password-box {
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
.completion-ring {
  display: grid;
  place-items: center;
  width: 116px;
  height: 116px;
  margin: 12px auto;
  border-radius: 999px;
  border: 10px solid var(--success);
}
.proof-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.proof-card {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}
.document-preview {
  display: grid;
  place-items: center;
  min-height: 96px;
  border-radius: var(--radius-sm);
  background: var(--success-bg);
  color: var(--success);
  font-weight: 900;
}
.verification-decision label {
  display: flex;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}
.verification-decision label.active { border-color: var(--success); background: var(--success-bg); }
.timeline-steps {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}
.timeline-steps span {
  display: grid;
  gap: 6px;
  justify-items: center;
  text-align: center;
  color: var(--text-muted);
}
.timeline-steps b {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: var(--success);
  color: var(--text-inverse);
}
.timeline-steps .current b { background: var(--bg-card); color: var(--success); border: 2px solid var(--success); }
.report-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.report-card { display: grid; gap: 10px; align-content: start; }
.policy-banner,
.info-banner {
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--success-bg);
}
.wallet-admin-shell {
  gap: 16px;
  background: var(--bg-page);
}
.wallet-page-head h1 {
  font-size: 30px;
  font-weight: 900;
  letter-spacing: 0;
}
.page-stack { gap: 16px; }
.kpi-grid--six { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.dashboard-grid { grid-template-columns: minmax(0, 1.7fr) 230px 250px 280px; align-items: stretch; }
.content-grid { grid-template-columns: minmax(0, 1fr) 300px; align-items: start; }
.create-grid { grid-template-columns: minmax(0, 1fr) 270px; align-items: start; }
.verification-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) 340px; align-items: start; }
.dashboard-grid > *,
.content-grid > *,
.create-grid > *,
.verification-grid > * { min-width: 0; }
.wallet-admin-shell--verification .verification-decision {
  grid-column: 4;
  grid-row: 1 / span 3;
  position: sticky;
  top: 76px;
}
.wallet-admin-shell--verification .verification-grid .panel--wide {
  grid-column: span 2;
}
.panel,
.wallet-table-card,
.kpi-card,
.settlement-card {
  border-radius: 8px;
  box-shadow: var(--shadow-sm);
}
.wallet-table-card { overflow: hidden; }
:deep(.kpi-card) {
  min-height: 104px;
  padding: 17px 14px 14px 64px;
  align-content: center;
}
:deep(.kpi-card .kpi-icon) {
  left: 15px;
  top: 18px;
  width: 40px;
  height: 40px;
  border-radius: 999px;
}
:deep(.kpi-card strong) {
  color: var(--text-strong);
  font-size: 21px;
  font-weight: 900;
}
.trend-panel :deep(.echart-panel) { min-height: 260px; }
.axis-row {
  grid-template-columns: repeat(7, minmax(0, 1fr));
  color: var(--text-muted);
}
.legend-list span {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}
.table-wrap { border-radius: 8px 8px 0 0; }
th, td { padding: 11px 12px; }
tbody tr:hover,
tbody tr.selected { background: var(--primary-light); }
.stepper {
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
}
.wallet-tabs-row {
  display: flex;
  gap: 28px;
  min-height: 42px;
  align-items: end;
  border-bottom: 1px solid var(--border-color);
}
.wallet-tabs-row a {
  height: 42px;
  color: var(--text-main);
  font-weight: 800;
  text-decoration: none;
}
.wallet-tabs-row a.active {
  color: var(--success);
  border-bottom: 2px solid var(--success);
}
.alert-row {
  display: grid;
  gap: 3px;
  padding: 11px 0 11px 12px;
  border-left: 3px solid var(--info);
  border-bottom: 1px solid var(--border-color);
}
.alert-row.danger { border-left-color: var(--danger); }
.alert-row.warn { border-left-color: var(--warning); }
.alert-row.good { border-left-color: var(--success); }
.alert-row span,
.alert-row small { color: var(--text-muted); }
@keyframes wallet-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (max-width: 1280px) {
  .kpi-grid,
  .kpi-grid--six,
  .dashboard-grid,
  .content-grid,
  .create-grid,
  .verification-grid,
  .report-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .wallet-page-head,
  .head-actions,
  .kpi-grid,
  .kpi-grid--six,
  .dashboard-grid,
  .content-grid,
  .create-grid,
  .verification-grid,
  .form-grid,
  .stepper,
  .proof-grid,
  .timeline-steps,
  .report-grid { grid-template-columns: 1fr; }
  .panel--wide,
  .span-2 { grid-column: span 1; }
  .search-field { width: 100%; }
}
</style>
