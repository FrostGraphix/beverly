<template>
  <section class="page-stack">
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
</template>

<script>
import BaseButton from "../base/BaseButton.vue";
import BaseInput from "../base/BaseInput.vue";
import BaseSelect from "../base/BaseSelect.vue";

export default {
  name: "AdminWalletCreateVendor",
  components: { BaseButton, BaseInput, BaseSelect },
  emits: ["vendor-created"],
  data() {
    return {
      createVendorStep: 1,
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
      }
    };
  },
  computed: {
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
    }
  },
  methods: {
    regeneratePassword() {
      this.vendorDraft.temporaryPassword = `Bv@${Math.random().toString(36).slice(2, 8)}#${Math.random().toString(36).slice(2, 6)}`;
    },
    createVendorAccount() {
      this.$emit("vendor-created", { draft: { ...this.vendorDraft } });
      window.location.hash = "#/wallet/admin/verification";
    }
  }
};
</script>
