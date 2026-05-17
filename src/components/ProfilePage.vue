<template>
  <div class="profile-overlay" @click.self="$emit('close')">
    <div class="profile-panel">
      <div class="profile-panel-header">
        <div class="profile-panel-title">
          <div class="profile-panel-icon">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
          </div>
          <div>
            <div class="profile-panel-name">Profile</div>
            <div class="profile-panel-role">{{ userName }} - {{ roleName }}</div>
          </div>
        </div>
        <BaseIconButton class="profile-close-btn" @click="$emit('close')" aria-label="Close profile">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </BaseIconButton>
      </div>

      <div class="profile-hero">
        <div class="profile-avatar-wrap">
          <div class="profile-avatar">{{ initials }}</div>
        </div>
        <div class="profile-hero-info">
          <div class="profile-hero-name">{{ userName }}</div>
          <div class="profile-hero-meta">
            <span class="profile-badge">
              <svg viewBox="0 0 24 24" fill="currentColor" style="width:10px;height:10px" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg>
              Active
            </span>
            <span class="profile-hero-sep">-</span>
            <span>{{ roleName }}</span>
            <span class="profile-hero-sep">-</span>
            <span>Beverly CRM</span>
          </div>
        </div>
        <div class="profile-hero-stats">
          <div class="profile-stat">
            <span class="profile-stat-val">{{ sessionDays }}</span>
            <span class="profile-stat-label">Days Active</span>
          </div>
          <div class="profile-stat-div"></div>
          <div class="profile-stat">
            <span class="profile-stat-val">{{ permissions }}</span>
            <span class="profile-stat-label">Permissions</span>
          </div>
        </div>
      </div>

      <div class="profile-body">
        <div class="profile-section">
          <div class="profile-section-title">Personal Information</div>
          <div class="profile-form-grid">
            <div class="profile-field">
              <label class="profile-label">Full Name</label>
              <BaseInput class="profile-input" v-model="form.name" placeholder="Enter your name" />
            </div>
            <div class="profile-field">
              <label class="profile-label">Username / ID</label>
              <BaseInput class="profile-input profile-input-readonly" :value="userName" readonly />
            </div>
            <div class="profile-field">
              <label class="profile-label">Email Address</label>
              <BaseInput class="profile-input" v-model="form.email" type="email" placeholder="Enter email" />
            </div>
            <div class="profile-field">
              <label class="profile-label">Phone Number</label>
              <BaseInput class="profile-input" v-model="form.phone" placeholder="+234 000 000 0000" />
            </div>
            <div class="profile-field profile-field-full">
              <label class="profile-label">Organisation</label>
              <BaseInput class="profile-input profile-input-readonly" value="Beverly Energy Systems" readonly />
            </div>
            <div class="profile-field profile-field-full">
              <label class="profile-label">Role</label>
              <BaseInput class="profile-input profile-input-readonly" :value="roleName" readonly />
            </div>
          </div>
          <div class="profile-form-actions">
            <BaseButton class="profile-btn-outline" @click="resetForm">Discard</BaseButton>
            <BaseButton class="profile-btn-primary" variant="primary" :loading="saving" @click="saveProfile">
              <span v-if="saving" class="profile-spinner"></span>
              {{ saving ? 'Saving...' : 'Save Changes' }}
            </BaseButton>
          </div>
          <div class="profile-save-notice" v-if="saveSuccess">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            Profile updated successfully
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import BaseButton from "./base/BaseButton.vue";
import BaseIconButton from "./base/BaseIconButton.vue";
import BaseInput from "./base/BaseInput.vue";
import { loadProfileState, updateRemoteProfile } from "../services/profile-store.mjs";

export default {
  name: "ProfilePage",
  components: { BaseButton, BaseIconButton, BaseInput },
  props: {
    userName: { type: String, default: "ACB(admin)" },
    roleId: { type: String, default: "super-admin" }
  },
  data() {
    const saved = loadProfileState(this.userName);
    return {
      saving: false,
      saveSuccess: false,
      form: { name: saved.name || this.userName, email: saved.email || "", phone: saved.phone || "" }
    };
  },
  computed: {
    initials() {
      return (this.userName || "U").split(/[\s()_-]+/).filter(Boolean).map((word) => word[0].toUpperCase()).slice(0, 2).join("");
    },
    roleName() {
      const map = { "super-admin": "Super Admin", "operations-manager": "Operations Manager", account: "Account Officer", vendor: "Vendor" };
      return map[this.roleId] || this.roleId;
    },
    sessionDays() {
      return 42;
    },
    permissions() {
      const map = { "super-admin": "Full", "operations-manager": "Ops", account: "Read", vendor: "Token" };
      return map[this.roleId] || "-";
    }
  },
  methods: {
    resetForm() {
      const saved = loadProfileState(this.userName);
      this.form = { name: saved.name || this.userName, email: saved.email || "", phone: saved.phone || "" };
    },
    async saveProfile() {
      this.saving = true;
      await updateRemoteProfile(this.form);
      this.saving = false;
      this.saveSuccess = true;
      setTimeout(() => { this.saveSuccess = false; }, 3000);
    }
  }
};
</script>
