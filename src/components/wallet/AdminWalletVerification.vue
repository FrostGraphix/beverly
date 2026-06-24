<template>
  <section class="page-stack">
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
        <p v-for="line in card.lines" :key="line">
          <span>{{ line.split(':')[0] }}</span><strong>{{ line.split(':').slice(1).join(':') }}</strong>
        </p>
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
        <label
          v-for="choice in decisionChoices"
          :key="choice.value"
          :class="{ active: verificationDecision === choice.value }"
          @click="verificationDecision = choice.value"
        >
          <span><strong>{{ choice.label }}</strong><small>{{ choice.help }}</small></span>
        </label>
        <textarea v-model="verificationComment" rows="5" placeholder="Visible vendor comment"></textarea>
        <textarea v-model="verificationInternalNote" rows="4" placeholder="Internal note"></textarea>
        <BaseButton class="primary-button" variant="primary" @click="confirmDecision">Confirm Decision</BaseButton>
      </article>
      <article class="panel panel--wide">
        <h2>Verification Timeline</h2>
        <div class="timeline-steps">
          <span v-for="step in verificationTimeline" :key="step.label" :class="step.tone">
            <b>{{ step.index }}</b>{{ step.label }}<small>{{ step.meta }}</small>
          </span>
        </div>
      </article>
    </div>
  </section>
</template>

<script>
import BaseButton from "../base/BaseButton.vue";

export default {
  name: "AdminWalletVerification",
  components: { BaseButton },
  emits: ["audit"],
  data() {
    return {
      verificationDecision: "approve",
      verificationComment: "Your verification looks good. We are approving your vendor account.",
      verificationInternalNote: "Strong documents and clean screening. Approved for standard operating limits."
    };
  },
  computed: {
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
    }
  },
  methods: {
    confirmDecision() {
      this.$emit("audit", { time: "13 May 10:36:00", actor: "finance-checker", role: "finance-checker", event: `verification_${this.verificationDecision}`, target: "GreenMart LLC", ip: "local" });
    }
  }
};
</script>
