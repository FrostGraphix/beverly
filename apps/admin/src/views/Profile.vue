<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import ProfilePictureCropModal from '../components/ProfilePictureCropModal.vue';
import { useStaffAuthStore } from '../stores/auth';
import { api } from '../lib/api';

const auth = useStaffAuthStore();

const fullName = ref(auth.user?.full_name ?? '');
const profilePictureUrl = ref(auth.user?.profile_picture_url ?? '');
const saving = ref(false);
const uploading = ref(false);
const cropOpen = ref(false);
const cropFile = ref<File | null>(null);
const error = ref<string | null>(null);
const feedback = ref<string | null>(null);
const editingName = ref(false);
const avatarMenuOpen = ref(false);
const removePictureOpen = ref(false);
const avatarMenu = ref<HTMLElement | null>(null);
const photoInput = ref<HTMLInputElement | null>(null);

const initials = computed(() => {
    const source = auth.user?.full_name?.trim() || auth.user?.email?.trim() || 'ST';
    return source.slice(0, 2).toUpperCase();
});

const roleLabel = computed(() => {
    const raw = auth.user?.role || 'staff';
    return raw.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
});

async function syncAuthFromApi(response?: { user?: any }) {
    if (response?.user && auth.user) auth.user = response.user;
    await auth.refreshSession();
    fullName.value = auth.user?.full_name ?? '';
    profilePictureUrl.value = auth.user?.profile_picture_url ?? '';
}

async function saveProfile() {
    if (!fullName.value.trim()) return;
    error.value = null;
    feedback.value = null;
    saving.value = true;
    try {
        const response = await api.patch<{ user: any; permissions: string[] }>('/api/v1/admin/me', {
            full_name: fullName.value.trim(),
        });
        await syncAuthFromApi(response);
        editingName.value = false;
        feedback.value = 'Name updated.';
    } catch (e: any) {
        error.value = e?.message ?? 'Profile update failed.';
    } finally {
        saving.value = false;
    }
}

async function removeProfilePicture() {
    error.value = null;
    feedback.value = null;
    saving.value = true;
    try {
        await api.del('/api/v1/admin/profile-picture');
        profilePictureUrl.value = '';
        await syncAuthFromApi();
        removePictureOpen.value = false;
        feedback.value = 'Picture removed.';
    } catch (e: any) {
        error.value = e?.message ?? 'Picture removal failed.';
    } finally {
        saving.value = false;
    }
}

async function uploadProfilePicture(event: Event) {
    const file = (event.target as HTMLInputElement)?.files?.[0];
    if (!file) return;
    cropFile.value = file;
    cropOpen.value = true;
    (event.target as HTMLInputElement).value = '';
}

async function uploadProcessedProfilePicture(file: File) {
    error.value = null;
    feedback.value = null;
    uploading.value = true;
    try {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
        const contentBase64 = btoa(binary);
        await api.post('/api/v1/admin/profile-picture/scan', {
            file_name: file.name,
            content_base64: contentBase64,
        });
        const payload = await api.post<any>('/api/v1/admin/profile-picture/upload-url', {
            file_name: file.name,
            content_type: file.type,
            size_bytes: file.size,
        });
        if (!payload?.signed_url || !payload?.public_url) throw new Error('profile_picture_upload_unavailable');
        const uploadResponse = await fetch(payload.signed_url, {
            method: 'PUT',
            headers: { 'Content-Type': file.type },
            body: file,
        });
        if (!uploadResponse.ok) throw new Error('profile_picture_upload_failed');
        const activated = await api.post<any>('/api/v1/admin/profile-picture/activate', { path: payload.path });
        profilePictureUrl.value = activated.profile_picture_url;
        await syncAuthFromApi();
        feedback.value = 'Picture updated.';
    } catch (e: any) {
        error.value = e?.message ?? 'Picture upload failed.';
    } finally {
        uploading.value = false;
    }
}

function beginNameEdit() {
    fullName.value = auth.user?.full_name ?? '';
    error.value = null;
    feedback.value = null;
    editingName.value = true;
}

function cancelNameEdit() {
    fullName.value = auth.user?.full_name ?? '';
    editingName.value = false;
}

function chooseProfilePicture() {
    avatarMenuOpen.value = false;
    photoInput.value?.click();
}

function requestPictureRemoval() {
    avatarMenuOpen.value = false;
    removePictureOpen.value = true;
}

function closeAvatarMenu(event: PointerEvent) {
    if (!avatarMenu.value?.contains(event.target as Node)) avatarMenuOpen.value = false;
}

function closeAvatarMenuOnEscape(event: KeyboardEvent) {
    if (event.key === 'Escape') avatarMenuOpen.value = false;
}

onMounted(() => {
    document.addEventListener('pointerdown', closeAvatarMenu);
    document.addEventListener('keydown', closeAvatarMenuOnEscape);
});

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', closeAvatarMenu);
    document.removeEventListener('keydown', closeAvatarMenuOnEscape);
});
</script>

<template>
  <AppShell title="Profile">
    <ProfilePictureCropModal
      :open="cropOpen"
      :file="cropFile"
      @close="cropOpen = false"
      @done="(file) => { cropOpen = false; uploadProcessedProfilePicture(file); }"
    />
    <ConfirmDialog
      v-model:open="removePictureOpen"
      title="Remove profile picture?"
      description="Your initials will replace the current picture."
      confirm-label="Remove picture"
      tone="danger"
      :loading="saving"
      @confirm="removeProfilePicture"
    />

    <div class="profile-shell">
      <section class="profile-hero bw-card">
        <div class="profile-hero-top">
          <div ref="avatarMenu" class="profile-avatar-wrap">
            <div class="profile-avatar">
              <img v-if="profilePictureUrl" :src="profilePictureUrl" alt="Staff profile" />
              <template v-else>{{ initials }}</template>
            </div>
            <button
              type="button"
              class="profile-avatar-edit"
              aria-label="Edit profile picture"
              title="Edit profile picture"
              :aria-expanded="avatarMenuOpen"
              :disabled="uploading"
              @click="avatarMenuOpen = !avatarMenuOpen"
            >
              <svg v-if="!uploading" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
              </svg>
              <span v-else class="profile-spinner" aria-hidden="true" />
            </button>
            <input
              ref="photoInput"
              class="bw-input bw-file-input profile-photo-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              tabindex="-1"
              @change="uploadProfilePicture"
            />
            <div v-if="avatarMenuOpen" class="profile-avatar-menu" role="menu">
              <button type="button" role="menuitem" @click="chooseProfilePicture">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="8.5" cy="10.5" r="1.5" />
                  <path d="m21 15-5-5L5 19" />
                </svg>
                {{ profilePictureUrl ? 'Change picture' : 'Add picture' }}
              </button>
              <button
                v-if="profilePictureUrl"
                type="button"
                class="danger"
                role="menuitem"
                @click="requestPictureRemoval"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="m19 6-1 14H6L5 6" />
                </svg>
                Remove picture
              </button>
            </div>
          </div>
          <div class="profile-hero-copy">
            <p class="profile-eyebrow">Staff Identity</p>
            <h1 class="bw-h1">{{ auth.user?.full_name || 'Staff user' }}</h1>
          </div>
        </div>

        <div class="profile-hero-meta">
          <div>
            <span>Role</span>
            <strong>{{ roleLabel }}</strong>
          </div>
          <div>
            <span>Email</span>
            <strong>{{ auth.user?.email || 'No email' }}</strong>
          </div>
          <div>
            <span>Session</span>
            <strong>Active</strong>
          </div>
        </div>
      </section>

      <section class="profile-grid">
        <article class="bw-card profile-panel">
          <div class="profile-panel-head">
            <span class="profile-panel-kicker">Record</span>
            <h2>Profile Details</h2>
          </div>
          <dl class="profile-list">
            <div class="profile-row">
              <dt>Full name</dt>
              <dd v-if="!editingName" class="profile-value-editable">
                <span>{{ auth.user?.full_name || '-' }}</span>
                <button type="button" class="profile-icon-btn" aria-label="Edit full name" title="Edit full name" @click="beginNameEdit">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
                  </svg>
                </button>
              </dd>
              <dd v-else class="profile-name-editor">
                <input
                  v-model="fullName"
                  class="bw-input"
                  aria-label="Full name"
                  maxlength="120"
                  autofocus
                  @keydown.enter.prevent="saveProfile"
                  @keydown.esc.prevent="cancelNameEdit"
                />
                <button type="button" class="profile-icon-btn save" aria-label="Save full name" title="Save full name" :disabled="saving || !fullName.trim()" @click="saveProfile">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6" /></svg>
                </button>
                <button type="button" class="profile-icon-btn" aria-label="Cancel editing" title="Cancel editing" :disabled="saving" @click="cancelNameEdit">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </dd>
            </div>
            <div class="profile-row">
              <dt>Email</dt>
              <dd>{{ auth.user?.email || '-' }}</dd>
            </div>
            <div class="profile-row">
              <dt>Role</dt>
              <dd>{{ roleLabel }}</dd>
            </div>
            <div class="profile-row">
              <dt>User ID</dt>
              <dd class="profile-mono">{{ auth.user?.id || '-' }}</dd>
            </div>
          </dl>
          <p v-if="error" class="profile-feedback" role="alert">{{ error }}</p>
          <p v-else-if="uploading" class="profile-feedback" role="status">Uploading picture...</p>
          <p v-else-if="feedback" class="profile-feedback success" role="status">{{ feedback }}</p>
        </article>
      </section>
    </div>
  </AppShell>
</template>

<style scoped>
.profile-shell {
  display: grid;
  gap: 20px;
}

.profile-hero {
  position: relative;
  overflow: visible;
  display: grid;
  gap: 22px;
  padding: 28px;
  background:
    linear-gradient(135deg, oklch(from var(--brand) l c h / 0.18), transparent 44%),
    linear-gradient(160deg, var(--surface-2), var(--surface));
}

.profile-hero::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, transparent, oklch(from var(--brand) l c h / 0.10), transparent),
    repeating-linear-gradient(90deg, oklch(from var(--text) l c h / 0.08) 0 1px, transparent 1px 96px);
  opacity: 0.35;
}

.profile-hero-top,
.profile-hero-meta {
  position: relative;
}

.profile-hero-top {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: end;
  gap: 20px;
}

.profile-avatar-wrap {
  position: relative;
  width: max-content;
  padding: 7px;
  border: 1px solid oklch(from var(--brand) l c h / 0.35);
  border-radius: 28px;
  background: oklch(from var(--brand) l c h / 0.09);
}

.profile-avatar-edit,
.profile-icon-btn {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  background: var(--surface-2);
  cursor: pointer;
}

.profile-avatar-edit {
  position: absolute;
  right: -6px;
  bottom: -6px;
  z-index: 2;
  color: oklch(8% 0.04 145);
  background: var(--brand);
  border-color: var(--brand);
  box-shadow: var(--shadow-2);
}

.profile-avatar-edit svg,
.profile-icon-btn svg,
.profile-avatar-menu svg {
  width: 18px;
  height: 18px;
}

.profile-avatar-edit:focus-visible,
.profile-icon-btn:focus-visible,
.profile-avatar-menu button:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.profile-avatar-edit:disabled,
.profile-icon-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.profile-photo-input {
  position: fixed;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.profile-avatar-menu {
  position: absolute;
  top: calc(100% + 12px);
  left: 0;
  z-index: 30;
  width: max-content;
  min-width: 190px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow-3);
}

.profile-avatar-menu button {
  display: grid;
  grid-template-columns: 20px 1fr;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px;
  border: 0;
  border-radius: 6px;
  color: var(--text);
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.profile-avatar-menu button:hover {
  background: var(--surface-2);
}

.profile-avatar-menu button.danger {
  color: var(--danger);
}

.profile-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: profile-spin 0.7s linear infinite;
}

@keyframes profile-spin {
  to { transform: rotate(360deg); }
}

.profile-avatar {
  width: 104px;
  height: 104px;
  flex: 0 0 auto;
  border-radius: 22px;
  overflow: hidden;
  display: grid;
  place-items: center;
  font-size: 34px;
  font-weight: 900;
  color: oklch(8% 0.04 145);
  background: linear-gradient(135deg, var(--brand-400), var(--brand-700));
  box-shadow: var(--shadow-3);
}

.profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-hero-copy {
  min-width: 0;
}

.profile-hero-copy h1 {
  max-width: 12ch;
  margin-bottom: 10px;
  line-height: 0.98;
}

.profile-eyebrow {
  margin: 0 0 6px;
  font-size: var(--t-xs);
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
  color: var(--brand);
}

.profile-hero-meta {
  display: grid;
  grid-template-columns: 0.85fr 1.45fr 0.85fr;
  border-top: 1px solid var(--border);
}

.profile-hero-meta > div {
  min-width: 0;
  padding: 14px 16px 0 0;
}

.profile-hero-meta > div + div {
  padding-left: 16px;
  border-left: 1px solid var(--border);
}

.profile-hero-meta span {
  display: block;
  margin-bottom: 5px;
  color: var(--muted);
  font-size: var(--t-xs);
  font-weight: 800;
  text-transform: uppercase;
}

.profile-hero-meta strong {
  display: block;
  overflow: hidden;
  color: var(--text);
  font-size: var(--t-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
}

.profile-value-editable {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.profile-value-editable span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.profile-icon-btn {
  flex: 0 0 auto;
}

.profile-icon-btn.save {
  color: oklch(8% 0.04 145);
  background: var(--brand);
  border-color: var(--brand);
}

.profile-name-editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px 36px;
  align-items: center;
  gap: 8px;
}

.profile-name-editor .bw-input {
  min-width: 0;
  height: 40px;
}

.profile-feedback {
  margin: 0;
  color: var(--danger);
  font-size: var(--t-sm);
}

.profile-feedback[role="status"] {
  color: var(--muted);
}

.profile-feedback.success {
  color: var(--brand);
}

.profile-panel {
  display: grid;
  align-content: start;
  gap: 18px;
}

.profile-panel-head {
  display: grid;
  gap: 4px;
}

.profile-panel-kicker {
  color: var(--brand);
  font-size: var(--t-xs);
  font-weight: 900;
  text-transform: uppercase;
}

.profile-panel h2 {
  margin: 0;
  font-size: var(--t-md);
}

.profile-list {
  margin: 0;
  display: grid;
}

.profile-row {
  display: grid;
  grid-template-columns: minmax(95px, 0.6fr) minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
}

.profile-row:first-child {
  padding-top: 0;
}

.profile-row:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.profile-row dt {
  color: var(--muted);
  font-size: var(--t-sm);
}

.profile-row dd {
  margin: 0;
  text-align: right;
  font-weight: 700;
  color: var(--text);
  overflow-wrap: anywhere;
}

.profile-mono {
  font-family: var(--font-mono);
  font-size: var(--t-sm);
}

.profile-form {
  display: grid;
  gap: 14px;
}

.profile-field {
  display: grid;
  gap: 8px;
}

.profile-field > span {
  color: var(--muted);
  font-size: var(--t-xs);
  font-weight: 800;
  text-transform: uppercase;
}

.profile-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.profile-actions .bw-btn {
  justify-content: center;
}

@media (max-width: 900px) {
  .profile-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .profile-hero {
    padding: 18px;
    gap: 16px;
  }

  .profile-hero-top {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 16px;
  }

  .profile-avatar {
    width: 94px;
    height: 94px;
  }

  .profile-hero-copy h1 {
    max-width: 100%;
    font-size: clamp(1.8rem, 7vw, 2.25rem);
  }

  .profile-hero-meta {
    grid-template-columns: 1fr;
  }

  .profile-hero-meta > div {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    padding: 12px 0;
  }

  .profile-hero-meta span {
    margin-bottom: 0;
  }

  .profile-hero-meta strong {
    text-align: right;
  }

  .profile-hero-meta > div + div {
    padding-left: 0;
    border-top: 1px solid var(--border);
    border-left: 0;
  }

  .profile-row {
    grid-template-columns: 95px minmax(0, 1fr);
    gap: 16px;
  }

  .profile-row dd {
    text-align: right;
  }

  .profile-name-editor {
    grid-column: 1 / -1;
    margin-top: 2px;
  }
}

@media (max-width: 360px) {
  .profile-hero-top {
    grid-template-columns: 1fr;
  }
}
</style>
