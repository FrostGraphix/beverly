<template>
  <section class="page-stack">
    <article class="panel form-panel vendor-create-bridge">
      <div>
        <p class="eyebrow">Canonical onboarding</p>
        <h2>Create Vendor</h2>
        <p>
          Vendor creation now runs through Wallet Admin.
          It uses backend onboarding, permissions, audit logs, and one-time temporary password handling.
        </p>
      </div>
      <div class="bridge-actions">
        <a class="primary-button" :href="vendorCreateUrl">Open Wallet Admin</a>
        <a class="quiet-button" :href="vendorListUrl">Review vendors</a>
      </div>
    </article>
  </section>
</template>

<script>
export default {
  name: "AdminWalletCreateVendor",
  computed: {
    adminBaseUrl() {
      const configured = String(import.meta.env?.VITE_ADMIN_URL || "").trim();
      if (configured) return configured.replace(/\/+$/, "");
      if (import.meta.env?.DEV) {
        return `${window.location.protocol}//${window.location.hostname}:5175`;
      }
      return `${window.location.origin}/wallet-admin`;
    },
    vendorCreateUrl() {
      return `${this.adminBaseUrl}/vendors/new`;
    },
    vendorListUrl() {
      return `${this.adminBaseUrl}/vendors`;
    }
  }
};
</script>
