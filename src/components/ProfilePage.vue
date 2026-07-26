<template>
  <div class="wallet-profile-shell">
    <ProfilePictureCropModal
      :open="cropOpen"
      :file="cropFile"
      @close="cropOpen = false"
      @done="handleCroppedImage"
    />

    <section class="wallet-profile-hero">
      <div class="wallet-profile-top">
        <div ref="avatarMenuRef" class="wallet-profile-avatar-wrap">
          <div class="wallet-profile-avatar">
            <img v-if="activeProfilePictureUrl" :src="activeProfilePictureUrl" alt="Staff profile" />
            <template v-else>{{ initials }}</template>
          </div>
          <BaseIconButton
            class="wallet-avatar-edit-btn"
            aria-label="Edit profile picture"
            title="Edit profile picture"
            :disabled="uploading"
            @click="avatarMenuOpen = !avatarMenuOpen"
          >
            <svg v-if="!uploading" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span v-else class="wallet-avatar-spinner" aria-hidden="true"></span>
          </BaseIconButton>
          <div v-if="avatarMenuOpen" class="wallet-avatar-menu">
            <BaseButton variant="ghost" class="wallet-avatar-menu-item" @click="triggerPhotoInput">
              Upload photo
            </BaseButton>
            <BaseButton
              v-if="activeProfilePictureUrl"
              variant="ghost"
              class="wallet-avatar-menu-item danger"
              @click="removePicture"
            >
              Remove photo
            </BaseButton>
          </div>
          <input ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp" style="display: none" @change="handleFileSelected" />
        </div>
        <div class="wallet-profile-copy">
          <p>Staff Identity</p>
          <h1>{{ form.name || userName }}</h1>
        </div>
        <BaseIconButton class="wallet-profile-close" aria-label="Close profile" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </BaseIconButton>
      </div>

      <div class="wallet-profile-meta">
        <div><span>Role</span><strong>{{ roleName }}</strong></div>
        <div><span>Email</span><strong>{{ form.email || "No email" }}</strong></div>
        <div><span>Session</span><strong>Active</strong></div>
      </div>
    </section>

    <div v-if="uploadError" class="wallet-profile-error" role="alert">
      {{ uploadError }}
    </div>
    <div v-if="uploadNotice" class="wallet-profile-notice" role="status">
      {{ uploadNotice }}
    </div>

    <section class="wallet-profile-grid">
      <article class="wallet-profile-card">
        <div class="wallet-profile-card-head">
          <span>Record</span>
          <h2>Profile Details</h2>
        </div>
        <dl class="wallet-profile-list">
          <div><dt>Full name</dt><dd>{{ form.name || userName }}</dd></div>
          <div><dt>Email</dt><dd>{{ form.email || "-" }}</dd></div>
          <div><dt>Phone</dt><dd>{{ form.phone || "-" }}</dd></div>
          <div><dt>Role</dt><dd>{{ roleName }}</dd></div>
        </dl>
      </article>

      <article class="wallet-profile-card">
        <div class="wallet-profile-card-head">
          <span>Account</span>
          <h2>Edit Profile</h2>
        </div>
        <div class="wallet-profile-form">
          <label>
            <span>Display name</span>
            <BaseInput v-model="form.name" placeholder="Enter your name" />
          </label>
          <label>
            <span>Email address</span>
            <BaseInput v-model="form.email" type="email" placeholder="Enter email" />
          </label>
          <label>
            <span>Phone number</span>
            <BaseInput v-model="form.phone" placeholder="+234 000 000 0000" />
          </label>
          <div class="wallet-profile-actions">
            <BaseButton variant="ghost" @click="resetForm">Discard</BaseButton>
            <BaseButton variant="primary" :loading="saving" @click="saveProfile">
              {{ saving ? "Saving..." : "Save profile" }}
            </BaseButton>
          </div>
          <div v-if="saveSuccess" class="wallet-profile-notice" role="status">
            Profile updated successfully
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<script>
import BaseButton from "./base/BaseButton.vue";
import BaseIconButton from "./base/BaseIconButton.vue";
import BaseInput from "./base/BaseInput.vue";
import ProfilePictureCropModal from "./ProfilePictureCropModal.vue";
import {
  loadProfileState,
  removeProfilePictureFlow,
  updateRemoteProfile,
  uploadProfilePictureFlow
} from "../services/profile-store.mjs";

export default {
  name: "ProfilePage",
  components: { BaseButton, BaseIconButton, BaseInput, ProfilePictureCropModal },
  emits: ["close", "profile-picture-updated"],
  props: {
    userName: { type: String, default: "ACB(admin)" },
    roleId: { type: String, default: null },
    profilePictureUrl: { type: String, default: "" }
  },
  data() {
    const saved = loadProfileState(this.userName);
    return {
      saving: false,
      saveSuccess: false,
      uploading: false,
      cropOpen: false,
      cropFile: null,
      avatarMenuOpen: false,
      uploadError: null,
      uploadNotice: null,
      localProfilePictureUrl: saved.profilePictureUrl || "",
      form: { name: saved.name || this.userName, email: saved.email || "", phone: saved.phone || "" }
    };
  },
  computed: {
    activeProfilePictureUrl() {
      return this.localProfilePictureUrl || this.profilePictureUrl || "";
    },
    initials() {
      return (this.form.name || this.userName || "U").split(/[\s()_-]+/).filter(Boolean).map((word) => word[0].toUpperCase()).slice(0, 2).join("");
    },
    roleName() {
      const map = { "super-admin": "Super Admin", "operations-manager": "Operations Manager", account: "Account Officer", vendor: "Vendor" };
      return map[this.roleId] || this.roleId;
    }
  },
  mounted() {
    document.addEventListener("pointerdown", this.handleOutsideClick);
  },
  beforeUnmount() {
    document.removeEventListener("pointerdown", this.handleOutsideClick);
  },
  methods: {
    handleOutsideClick(event) {
      if (this.$refs.avatarMenuRef && !this.$refs.avatarMenuRef.contains(event.target)) {
        this.avatarMenuOpen = false;
      }
    },
    triggerPhotoInput() {
      this.avatarMenuOpen = false;
      if (this.$refs.photoInput) this.$refs.photoInput.click();
    },
    handleFileSelected(event) {
      const file = event.target?.files?.[0];
      if (!file) return;
      this.cropFile = file;
      this.cropOpen = true;
      event.target.value = "";
    },
    async handleCroppedImage(file) {
      this.cropOpen = false;
      this.uploading = true;
      this.uploadError = null;
      this.uploadNotice = null;
      try {
        const state = await uploadProfilePictureFlow(file);
        this.localProfilePictureUrl = state.profilePictureUrl;
        this.uploadNotice = "Profile picture updated successfully.";
        this.$emit("profile-picture-updated", state.profilePictureUrl);
      } catch (err) {
        this.uploadError = err?.message || "Picture upload failed.";
      } finally {
        this.uploading = false;
      }
    },
    async removePicture() {
      this.avatarMenuOpen = false;
      this.uploading = true;
      this.uploadError = null;
      this.uploadNotice = null;
      try {
        const state = await removeProfilePictureFlow();
        this.localProfilePictureUrl = "";
        this.uploadNotice = "Profile picture removed.";
        this.$emit("profile-picture-updated", "");
      } catch (err) {
        this.uploadError = err?.message || "Picture removal failed.";
      } finally {
        this.uploading = false;
      }
    },
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

<style scoped>
.wallet-profile-shell {
  display: grid;
  gap: 20px;
  width: min(100%, 1100px);
  margin: 0 auto;
}

.wallet-profile-hero,
.wallet-profile-card {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}

.wallet-profile-hero {
  display: grid;
  gap: 22px;
  padding: 28px;
  overflow: hidden;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--primary) 18%, transparent), transparent 44%),
    linear-gradient(160deg, color-mix(in srgb, var(--bg-card) 88%, var(--primary) 12%), var(--bg-card));
}

.wallet-profile-top {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: end;
  gap: 20px;
}

.wallet-profile-close {
  width: 42px;
  height: 42px;
  align-self: start;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  background: var(--bg-card);
}

.wallet-profile-close svg {
  width: 20px;
  height: 20px;
}

.wallet-profile-avatar-wrap {
  position: relative;
  width: max-content;
  padding: 7px;
  border: 1px solid color-mix(in srgb, var(--primary) 35%, transparent);
  border-radius: 28px;
  background: color-mix(in srgb, var(--primary) 9%, transparent);
}

.wallet-avatar-edit-btn {
  position: absolute;
  right: -4px;
  bottom: -4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: var(--bg-card);
  color: var(--text-strong);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: background-color 0.2s, transform 0.15s;
}

.wallet-avatar-edit-btn:hover {
  background: color-mix(in srgb, var(--bg-card) 85%, var(--primary) 15%);
  transform: scale(1.05);
}

.wallet-avatar-edit-btn svg {
  width: 16px;
  height: 16px;
}

.wallet-avatar-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-color);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: wallet-spin 0.8s linear infinite;
}

@keyframes wallet-spin {
  to { transform: rotate(360deg); }
}

.wallet-avatar-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  min-width: 140px;
  padding: 6px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2);
}

.wallet-avatar-menu-item {
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-strong);
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s;
}

.wallet-avatar-menu-item:hover {
  background: color-mix(in srgb, var(--bg-card) 90%, var(--primary) 10%);
}

.wallet-avatar-menu-item.danger {
  color: #ef4444;
}

.wallet-avatar-menu-item.danger:hover {
  background: color-mix(in srgb, #ef4444 12%, transparent);
}

.wallet-profile-error {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, #ef4444 15%, transparent);
  color: #ef4444;
  font-size: 13px;
  font-weight: 600;
}


.wallet-profile-avatar {
  width: 104px;
  height: 104px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 22px;
  background: linear-gradient(135deg, var(--theme-color-bright), var(--primary-hover));
  color: var(--text-inverse);
  font-size: 34px;
  font-weight: 900;
  box-shadow: var(--shadow-lg);
}

.wallet-profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.wallet-profile-copy p,
.wallet-profile-card-head span {
  margin: 0 0 6px;
  color: var(--primary);
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
}

.wallet-profile-copy h1 {
  max-width: 12ch;
  margin: 0;
  color: var(--text-strong);
  font-size: clamp(32px, 5vw, 54px);
  line-height: .98;
}

.wallet-profile-meta {
  display: grid;
  grid-template-columns: .8fr 1.6fr .8fr;
  border-top: 1px solid var(--border-color);
}

.wallet-profile-meta > div {
  min-width: 0;
  padding: 14px 16px 0 0;
}

.wallet-profile-meta > div + div {
  padding-left: 16px;
  border-left: 1px solid var(--border-color);
}

.wallet-profile-meta span,
.wallet-profile-form label > span {
  display: block;
  margin-bottom: 6px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.wallet-profile-meta strong {
  display: block;
  overflow: hidden;
  color: var(--text-strong);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wallet-profile-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, .95fr);
  gap: 20px;
}

.wallet-profile-card {
  display: grid;
  align-content: start;
  gap: 18px;
  padding: 24px;
}

.wallet-profile-card-head h2 {
  margin: 0;
  color: var(--text-strong);
  font-size: 18px;
}

.wallet-profile-list {
  margin: 0;
}

.wallet-profile-list > div {
  display: grid;
  grid-template-columns: minmax(95px, .6fr) minmax(0, 1fr);
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border-color);
}

.wallet-profile-list > div:last-child {
  border-bottom: 0;
}

.wallet-profile-list dt {
  color: var(--text-muted);
  font-size: 13px;
}

.wallet-profile-list dd {
  margin: 0;
  color: var(--text-strong);
  font-weight: 700;
  text-align: right;
  overflow-wrap: anywhere;
}

.wallet-profile-form,
.wallet-profile-form label {
  display: grid;
  gap: 10px;
}

.wallet-profile-form {
  gap: 14px;
}

.wallet-profile-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.wallet-profile-actions :deep(button) {
  width: 100%;
}

.wallet-profile-notice {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--success-bg);
  color: var(--success);
  font-size: 12px;
  font-weight: 700;
}

@media (max-width: 900px) {
  .wallet-profile-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .wallet-profile-shell {
    gap: 14px;
  }

  .wallet-profile-hero,
  .wallet-profile-card {
    padding: 18px;
    border-radius: 16px;
  }

  .wallet-profile-top {
    align-items: center;
    gap: 16px;
  }

  .wallet-profile-avatar {
    width: 94px;
    height: 94px;
  }

  .wallet-profile-copy h1 {
    max-width: 100%;
    font-size: clamp(28px, 8vw, 36px);
  }

  .wallet-profile-meta {
    grid-template-columns: 1fr;
  }

  .wallet-profile-meta > div {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    padding: 12px 0;
  }

  .wallet-profile-meta span {
    margin-bottom: 0;
  }

  .wallet-profile-meta strong {
    text-align: right;
  }

  .wallet-profile-meta > div + div {
    padding-left: 0;
    border-top: 1px solid var(--border-color);
    border-left: 0;
  }

}

@media (max-width: 360px) {
  .wallet-profile-top,
  .wallet-profile-actions {
    grid-template-columns: 1fr;
  }
}
</style>
