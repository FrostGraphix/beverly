<template>
  <section class="vendor-wallet-pro" aria-label="Vendor wallet portal">
    <header class="wallet-hero">
      <div>
        <p class="eyebrow">Beverly vendor wallet</p>
        <h1>Sell power without slowing customers down.</h1>
        <p class="hero-copy">Fund once. Vend tokens. Send remote credit. Keep every receipt traceable.</p>
      </div>
      <div class="hero-balance">
        <span>Available balance</span>
        <strong>{{ moneyMinor(summary.availableBalanceMinor) }}</strong>
        <small>{{ summary.wallet?.walletNumber || "Wallet pending activation" }}</small>
      </div>
    </header>

    <div v-if="notice" class="status-banner" role="status">{{ notice }}</div>
    <div v-if="error" class="status-banner status-banner--error" role="alert">{{ error }}</div>

    <nav class="wallet-tabs" aria-label="Vendor wallet sections">
      <BaseButton v-for="item in tabs" :key="item.id" :class="{ active: activeTab === item.id }" @click="activeTab = item.id">
        <span>{{ item.label }}</span>
        <small>{{ item.hint }}</small>
      </BaseButton>
    </nav>

    <section v-if="activeTab === 'dashboard'" class="dashboard-grid">
      <article class="command-card command-card--wide">
        <div class="card-head">
          <div>
            <p class="eyebrow">Operating cockpit</p>
            <h2>Wallet health</h2>
          </div>
          <BaseButton class="ghost-pill" variant="ghost" @click="refresh">Refresh</BaseButton>
        </div>
        <div class="metric-grid">
          <div v-for="metric in metrics" :key="metric.label" class="metric-tile">
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
            <small>{{ metric.help }}</small>
          </div>
        </div>
        <div class="limit-rail">
          <span :style="{ width: dailyUsagePercent + '%' }"></span>
        </div>
        <p class="rail-copy">Daily limit used: {{ dailyUsagePercent }}%</p>
      </article>

      <article class="command-card">
        <div class="card-head">
          <div>
            <p class="eyebrow">Fast actions</p>
            <h2>Next best move</h2>
          </div>
        </div>
        <div class="action-stack">
          <BaseButton @click="activeTab = 'buy'">Buy unit for customer</BaseButton>
          <BaseButton @click="activeTab = 'fund'">Request wallet top-up</BaseButton>
          <BaseButton @click="activeTab = 'receipts'">Retrieve token receipt</BaseButton>
        </div>
      </article>

      <article class="command-card command-card--wide">
        <div class="card-head">
          <div>
            <p class="eyebrow">Recent movement</p>
            <h2>Funding and vending</h2>
          </div>
        </div>
        <div class="timeline-list">
          <div v-for="item in activityFeed" :key="item.id" class="timeline-row">
            <span :class="['timeline-dot', item.kind]"></span>
            <div>
              <strong>{{ item.title }}</strong>
              <small>{{ item.subtitle }}</small>
            </div>
            <b>{{ item.value }}</b>
          </div>
        </div>
      </article>
    </section>

    <section v-else-if="activeTab === 'buy'" class="purchase-studio">
      <aside class="customer-panel">
        <label class="field-block">
          <span>Customer or meter</span>
          <BaseInput v-model.trim="customerSearch" type="search" placeholder="Search name, phone, or meter" />
        </label>
        <div class="customer-list" role="listbox" aria-label="Customers">
          <BaseButton v-for="customer in filteredCustomers" :key="customer.meterId" :class="{ active: selectedCustomer.meterId === customer.meterId }" @click="selectCustomer(customer)">
            <strong>{{ customer.name }}</strong>
            <small>{{ customer.meterId }} · {{ customer.station }}</small>
            <span>{{ customer.phone }}</span>
          </BaseButton>
        </div>
      </aside>

      <article class="purchase-card">
        <div class="card-head">
          <div>
            <p class="eyebrow">Token delivery</p>
            <h2>{{ selectedCustomer.name }}</h2>
          </div>
          <span class="status-chip">{{ selectedCustomer.tariff }}</span>
        </div>

        <div class="mode-grid">
          <BaseButton :class="{ active: purchaseMode === 'token' }" @click="purchaseMode = 'token'">Generate token</BaseButton>
          <BaseButton :class="{ active: purchaseMode === 'remote' }" @click="purchaseMode = 'remote'">Remote send</BaseButton>
          <BaseButton :class="{ active: buyerMode === 'vendor' }" @click="buyerMode = 'vendor'">Vendor wallet</BaseButton>
          <BaseButton :class="{ active: buyerMode === 'direct' }" @click="buyerMode = 'direct'">Customer direct</BaseButton>
        </div>

        <div class="purchase-form">
          <label class="field-block">
            <span>Amount</span>
            <BaseInput v-model.number="purchase.amount" type="number" min="100" step="100" />
          </label>
          <label class="field-block">
            <span>Meter number</span>
            <BaseInput v-model.trim="purchase.meterId" type="text" />
          </label>
        </div>

        <div class="quote-panel">
          <div>
            <span>Estimated units</span>
            <strong>{{ estimatedUnits }} kWh</strong>
          </div>
          <div>
            <span>Settlement path</span>
            <strong>{{ buyerMode === "vendor" ? "Wallet debit" : "Customer checkout" }}</strong>
          </div>
          <div>
            <span>Delivery</span>
            <strong>{{ purchaseMode === "token" ? "Visible token" : "Remote credit" }}</strong>
          </div>
        </div>

        <BaseButton class="primary-action" variant="primary" :disabled="busy || buyerMode === 'direct'" @click="submitPurchase">
          {{ buyerMode === "direct" ? "Customer direct is next phase" : purchaseMode === "token" ? "Generate token" : "Send remotely" }}
        </BaseButton>
      </article>
    </section>

    <section v-else-if="activeTab === 'fund'" class="funding-grid">
      <article class="command-card">
        <div class="card-head">
          <div>
            <p class="eyebrow">Manual funding</p>
            <h2>Request top-up</h2>
          </div>
        </div>
        <label class="field-block">
          <span>Amount</span>
          <BaseInput v-model.number="funding.amount" type="number" min="1000" step="500" />
        </label>
        <label class="field-block">
          <span>Channel</span>
          <BaseSelect v-model="funding.channel">
            <option value="bank_transfer">Bank transfer</option>
            <option value="pos">POS</option>
            <option value="cash_deposit">Cash deposit</option>
          </BaseSelect>
        </label>
        <label class="field-block">
          <span>Proof reference</span>
          <BaseInput v-model.trim="funding.proofReference" type="text" placeholder="Receipt, teller, or transfer ref" />
        </label>
        <BaseButton class="primary-action" variant="primary" :disabled="busy" @click="submitFunding">Request top-up</BaseButton>
      </article>

      <article class="command-card command-card--wide">
        <div class="card-head">
          <div>
            <p class="eyebrow">Finance review</p>
            <h2>Pending funding</h2>
          </div>
        </div>
        <div class="queue-list">
          <div v-for="request in fundingRows" :key="request.id" class="queue-row">
            <div>
              <strong>{{ moneyMinor(request.amountMinor) }}</strong>
              <small>{{ request.channel }} · {{ request.status }}</small>
            </div>
            <span>{{ request.reference || request.id }}</span>
          </div>
        </div>
      </article>
    </section>

    <section v-else class="history-grid">
      <article class="command-card command-card--wide">
        <div class="card-head">
          <div>
            <p class="eyebrow">{{ activeTab === "receipts" ? "Receipts" : "Ledger" }}</p>
            <h2>{{ activeTab === "receipts" ? "Token retrieval" : "Purchase history" }}</h2>
          </div>
        </div>
        <div class="queue-list">
          <div v-for="order in purchaseRows" :key="order.id" class="queue-row queue-row--receipt">
            <div>
              <strong>{{ order.targetMeter }}</strong>
              <small>{{ order.deliveryMode }} · {{ order.status }}</small>
            </div>
            <code>{{ order.tokenValue || order.remoteReference || "Pending delivery" }}</code>
            <BaseButton class="ghost-pill" variant="ghost" @click="setReceipt(order)">View receipt</BaseButton>
          </div>
        </div>
      </article>

      <aside class="receipt-card" aria-label="Receipt preview">
        <p class="eyebrow">Receipt</p>
        <h2>{{ receipt ? receipt.targetMeter : "No receipt selected" }}</h2>
        <code>{{ receipt?.tokenValue || receipt?.remoteReference || "Select a transaction" }}</code>
        <BaseButton class="primary-action" variant="primary" :disabled="!receipt" @click="copyReceipt">Copy token</BaseButton>
      </aside>
    </section>
  </section>
</template>

<script>
import {
  createFundingRequest,
  listFundingRequests,
  uploadFundingProof
} from "../../services/vendor-funding-service.mjs";
import BaseButton from "../base/BaseButton.vue";
import BaseInput from "../base/BaseInput.vue";
import BaseSelect from "../base/BaseSelect.vue";
import {
  completeRemoteSend,
  completeTokenPurchase,
  createRemoteSendPurchase,
  createTokenPurchase,
  listPurchaseOrders,
  markRemoteSendPending
} from "../../services/vendor-purchase-service.mjs";
import {
  approveVendorOrganization,
  createVendorOrganization
} from "../../services/vendor-onboarding-service.mjs";
import { loadWalletSummary } from "../../services/vendor-wallet-service.mjs";

const fallbackCustomers = [
  { name: "Ada Okafor", phone: "+234 801 222 1100", meterId: "MTR-100", station: "Lagos North", tariff: "R2 Residential", rate: 82 },
  { name: "Musa Bello Stores", phone: "+234 803 550 7812", meterId: "MTR-245", station: "Abuja Central", tariff: "C1 Commercial", rate: 96 },
  { name: "Eko Cold Room", phone: "+234 705 412 0099", meterId: "MTR-330", station: "Lagos Island", tariff: "C2 Demand", rate: 112 }
];

export default {
  name: "VendorWalletPage",
  components: { BaseButton, BaseInput, BaseSelect },
  data() {
    return {
      activeTab: "dashboard",
      busy: false,
      notice: "",
      error: "",
      customerSearch: "",
      buyerMode: "vendor",
      purchaseMode: "token",
      selectedCustomer: fallbackCustomers[0],
      customers: fallbackCustomers,
      summary: {
        wallet: { walletNumber: "" },
        availableBalanceMinor: 0,
        heldBalanceMinor: 0,
        currency: "NGN",
        dailyLimit: 500000,
        dailySpent: 0
      },
      funding: { amount: 50000, channel: "bank_transfer", proofReference: "" },
      purchase: { amount: 10000, meterId: "MTR-100" },
      fundingRows: [],
      purchaseRows: [],
      receipt: null
    };
  },
  computed: {
    tabs() {
      return [
        { id: "dashboard", label: "Dashboard", hint: "Wallet health" },
        { id: "buy", label: "Buy units", hint: "Token or remote" },
        { id: "fund", label: "Fund wallet", hint: "Manual review" },
        { id: "history", label: "History", hint: "Ledger trail" },
        { id: "receipts", label: "Receipts", hint: "Token retrieval" }
      ];
    },
    metrics() {
      return [
        { label: "Available", value: this.moneyMinor(this.summary.availableBalanceMinor), help: "Ready for vending" },
        { label: "On hold", value: this.moneyMinor(this.summary.heldBalanceMinor), help: "Reserved orders" },
        { label: "Daily limit", value: this.money(this.summary.dailyLimit), help: "Risk gated" },
        { label: "Orders", value: String(this.purchaseRows.length), help: "Token receipts" }
      ];
    },
    dailyUsagePercent() {
      const limit = Number(this.summary.dailyLimit || 0);
      if (!limit) return 0;
      return Math.min(100, Math.round((Number(this.summary.dailySpent || 0) / limit) * 100));
    },
    estimatedUnits() {
      const rate = Number(this.selectedCustomer.rate || 1);
      return (Number(this.purchase.amount || 0) / rate).toFixed(2);
    },
    filteredCustomers() {
      const query = this.customerSearch.toLowerCase();
      if (!query) return this.customers;
      return this.customers.filter((customer) => `${customer.name} ${customer.phone} ${customer.meterId}`.toLowerCase().includes(query));
    },
    activityFeed() {
      const funding = this.fundingRows.slice(0, 3).map((row) => ({
        id: `funding-${row.id}`,
        kind: "funding",
        title: `Funding ${row.status}`,
        subtitle: row.reference || row.channel,
        value: this.moneyMinor(row.amountMinor)
      }));
      const purchases = this.purchaseRows.slice(0, 3).map((row) => ({
        id: `purchase-${row.id}`,
        kind: "purchase",
        title: `${row.deliveryMode || "token"} ${row.status}`,
        subtitle: row.targetMeter,
        value: this.moneyMinor(row.amountMinor)
      }));
      return [...funding, ...purchases].slice(0, 5);
    }
  },
  async mounted() {
    this.activeTab = this.initialTabFromHash();
    await this.bootstrap();
  },
  methods: {
    initialTabFromHash() {
      if (window.location.hash.includes("/buy")) return "buy";
      if (window.location.hash.includes("/receipts")) return "receipts";
      if (window.location.hash.includes("/vendor")) return "fund";
      return "dashboard";
    },
    money(value) {
      return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value || 0));
    },
    moneyMinor(value) {
      return this.money(Number(value || 0) / 100);
    },
    selectCustomer(customer) {
      this.selectedCustomer = customer;
      this.purchase.meterId = customer.meterId;
    },
    async bootstrap() {
      this.busy = true;
      try {
        await this.ensureDemoWallet();
        await this.refresh();
      } catch (error) {
        this.error = error.message || "Wallet could not load.";
      } finally {
        this.busy = false;
      }
    },
    async ensureDemoWallet() {
      const organization = await createVendorOrganization({
        legalName: "Bright Future Electrical Ltd",
        displayName: "Bright Future",
        siteCode: "SITE_001",
        primaryContactName: "John Adeyemi",
        phone: "+2348012345678",
        email: "vendor.demo@acob.ng",
        createdBy: "demo-admin"
      });
      await approveVendorOrganization({
        organizationId: organization.id || organization.organizationId,
        approvedBy: "demo-finance",
        dailyLimit: 500000,
        perTransactionLimit: 100000,
        riskRating: "low",
        note: "Demo vendor wallet activated"
      });
    },
    async refresh() {
      const [summary, fundingRows, purchaseRows] = await Promise.all([
        loadWalletSummary(),
        listFundingRequests(),
        listPurchaseOrders()
      ]);
      this.summary = { ...this.summary, ...summary };
      this.fundingRows = fundingRows;
      this.purchaseRows = purchaseRows;
      this.receipt = this.receipt || purchaseRows.find((row) => row.tokenValue || row.remoteReference) || null;
    },
    async submitFunding() {
      this.busy = true;
      this.error = "";
      try {
        const request = await createFundingRequest(this.funding);
        if (this.funding.proofReference) {
          await uploadFundingProof({
            fundingRequestId: request.id,
            metadata: { reference: this.funding.proofReference, uploadedFrom: "vendor-portal" }
          });
        }
        this.notice = "Funding request submitted for finance review.";
        await this.refresh();
      } catch (error) {
        this.error = error.message || "Funding request failed.";
      } finally {
        this.busy = false;
      }
    },
    async submitPurchase() {
      this.busy = true;
      this.error = "";
      try {
        const payload = { amount: this.purchase.amount, meterId: this.purchase.meterId };
        if (this.purchaseMode === "token") {
          const order = await createTokenPurchase(payload);
          this.receipt = await completeTokenPurchase({ purchaseOrderId: order.id, tokenValue: this.makeToken() });
        } else {
          const order = await createRemoteSendPurchase(payload);
          await markRemoteSendPending({ purchaseOrderId: order.id, remoteReference: `RMT-${Date.now()}` });
          this.receipt = await completeRemoteSend({ purchaseOrderId: order.id, remoteReference: `RMT-${Date.now()}` });
        }
        this.notice = "Purchase completed. Receipt is ready.";
        this.activeTab = "receipts";
        await this.refresh();
      } catch (error) {
        this.error = error.message || "Purchase failed.";
      } finally {
        this.busy = false;
      }
    },
    makeToken() {
      return Array.from({ length: 4 }, () => Math.floor(1000 + Math.random() * 9000)).join("-");
    },
    setReceipt(order) {
      this.receipt = order;
    },
    async copyReceipt() {
      const value = this.receipt?.tokenValue || this.receipt?.remoteReference || "";
      if (!value) return;
      await navigator.clipboard?.writeText(value);
      this.notice = "Receipt token copied.";
    }
  }
};
</script>

<style scoped>
.vendor-wallet-pro {
  --wallet-radius: 28px;
  display: grid;
  gap: 22px;
  color: var(--text-primary);
}

.wallet-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
  gap: 24px;
  overflow: hidden;
  padding: clamp(24px, 5vw, 44px);
  border: 1px solid var(--border-color);
  border-radius: var(--wallet-radius);
  background:
    radial-gradient(circle at 85% 20%, color-mix(in srgb, var(--primary-color) 24%, transparent), transparent 32%),
    linear-gradient(135deg, color-mix(in srgb, var(--surface-elevated) 88%, transparent), color-mix(in srgb, var(--primary-color) 12%, var(--surface-base)));
}

.wallet-hero h1 {
  max-width: 720px;
  margin: 0;
  font-size: clamp(2rem, 5vw, 4.6rem);
  letter-spacing: -0.07em;
  line-height: 0.92;
}

.hero-copy {
  max-width: 620px;
  color: var(--text-secondary);
  font-size: 1.05rem;
}

.hero-balance,
.command-card,
.purchase-card,
.customer-panel,
.receipt-card {
  border: 1px solid var(--border-color);
  border-radius: var(--wallet-radius);
  background: color-mix(in srgb, var(--surface-elevated) 92%, transparent);
  box-shadow: var(--shadow-lg);
}

.hero-balance {
  display: grid;
  align-content: end;
  min-height: 220px;
  padding: 28px;
}

.hero-balance strong {
  font-size: clamp(2rem, 5vw, 3.5rem);
  letter-spacing: -0.06em;
}

.hero-balance span,
.hero-balance small,
.eyebrow,
.metric-tile span,
.metric-tile small,
.queue-row small,
.timeline-row small,
.field-block span {
  color: var(--text-secondary);
}

.eyebrow {
  margin: 0 0 8px;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.status-banner {
  padding: 14px 18px;
  border: 1px solid color-mix(in srgb, var(--primary-color) 36%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--primary-color) 12%, var(--surface-elevated));
  font-weight: 800;
}

.status-banner--error {
  border-color: color-mix(in srgb, var(--danger-color, #ef4444) 42%, transparent);
  background: color-mix(in srgb, var(--danger-color, #ef4444) 12%, var(--surface-elevated));
}

.wallet-tabs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.wallet-tabs button,
.mode-grid button,
.action-stack button,
.customer-list button,
.ghost-pill,
.primary-action {
  border: 1px solid var(--border-color);
  border-radius: 18px;
  background: var(--surface-elevated);
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
}

.wallet-tabs button {
  display: grid;
  gap: 3px;
  padding: 14px;
  text-align: left;
}

.wallet-tabs button.active,
.mode-grid button.active,
.customer-list button.active {
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 14%, var(--surface-elevated));
}

.wallet-tabs small {
  color: var(--text-secondary);
}

.dashboard-grid,
.funding-grid,
.history-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 18px;
}

.command-card,
.purchase-card,
.customer-panel,
.receipt-card {
  padding: 22px;
}

.command-card--wide {
  min-width: 0;
}

.card-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 18px;
}

.card-head h2,
.receipt-card h2 {
  margin: 0;
  letter-spacing: -0.04em;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.metric-tile {
  display: grid;
  gap: 8px;
  padding: 16px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--surface-base) 72%, transparent);
}

.metric-tile strong {
  font-size: 1.4rem;
}

.limit-rail {
  height: 12px;
  margin-top: 18px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-primary) 10%, transparent);
}

.limit-rail span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--primary-color), var(--accent-color, #f59e0b));
}

.rail-copy {
  color: var(--text-secondary);
  font-weight: 700;
}

.action-stack,
.queue-list,
.timeline-list,
.customer-list {
  display: grid;
  gap: 10px;
}

.action-stack button {
  padding: 16px;
  text-align: left;
  font-weight: 800;
}

.timeline-row,
.queue-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 18px;
  background: color-mix(in srgb, var(--surface-base) 66%, transparent);
}

.queue-row {
  grid-template-columns: minmax(0, 1fr) auto;
}

.queue-row--receipt {
  grid-template-columns: minmax(0, 1fr) auto auto;
}

.timeline-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--primary-color);
}

.timeline-dot.purchase {
  background: var(--accent-color, #f59e0b);
}

.purchase-studio {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 18px;
}

.field-block {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
  font-weight: 800;
}

.field-block input,
.field-block select {
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--surface-base);
  color: var(--text-primary);
  font: inherit;
  padding: 13px 14px;
}

.customer-list button {
  display: grid;
  gap: 4px;
  padding: 14px;
  text-align: left;
}

.customer-list span {
  color: var(--text-secondary);
  font-size: 0.84rem;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}

.mode-grid button {
  padding: 13px;
  font-weight: 800;
}

.purchase-form,
.quote-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.quote-panel {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 10px 0 18px;
}

.quote-panel div {
  display: grid;
  gap: 8px;
  padding: 16px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--primary-color) 9%, var(--surface-base));
}

.quote-panel span {
  color: var(--text-secondary);
  font-size: 0.84rem;
}

.status-chip,
.ghost-pill,
.primary-action {
  padding: 10px 14px;
  font-weight: 900;
}

.status-chip {
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-color) 14%, transparent);
  color: var(--primary-color);
}

.primary-action {
  width: 100%;
  min-height: 52px;
  border-color: var(--primary-color);
  background: var(--primary-color);
  color: var(--primary-contrast, white);
}

.primary-action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.receipt-card code,
.queue-row code {
  word-break: break-word;
  color: var(--primary-color);
  font-weight: 900;
}

@media (max-width: 1120px) {
  .wallet-hero,
  .dashboard-grid,
  .funding-grid,
  .history-grid,
  .purchase-studio {
    grid-template-columns: 1fr;
  }

  .wallet-tabs,
  .metric-grid,
  .mode-grid,
  .quote-panel {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .wallet-tabs,
  .metric-grid,
  .mode-grid,
  .purchase-form,
  .quote-panel,
  .queue-row--receipt {
    grid-template-columns: 1fr;
  }
}
</style>
