<script setup lang="ts">
import { computed, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
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
    saving.value = true;
    try {
        const response = await api.patch<{ user: any; permissions: string[] }>('/api/v1/admin/me', {
            full_name: fullName.value.trim(),
        });
        await syncAuthFromApi(response);
    } catch (e: any) {
        error.value = e?.message ?? 'Profile update failed.';
    } finally {
        saving.value = false;
    }
}

async function removeProfilePicture() {
    saving.value = true;
    try {
        await api.del('/api/v1/admin/profile-picture');
        profilePictureUrl.value = '';
        await syncAuthFromApi();
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
    } catch (e: any) {
        error.value = e?.message ?? 'Picture upload failed.';
    } finally {
        uploading.value = false;
    }
}
</script>

<template>
  <AppShell title="Profile">
    <ProfilePictureCropModal
      :open="cropOpen"
      :file="cropFile"
      @close="cropOpen = false"
      @done="(file) => { cropOpen = false; uploadProcessedProfilePicture(file); }"
    />

    <div class="profile-shell">
      <section class="profile-hero bw-card">
        <div class="profile-hero-top">
          <div class="profile-avatar-wrap">
            <div class="profile-avatar">
              <img v-if="auth.user?.profile_picture_url" :src="auth.user.profile_picture_url" alt="Staff profile" />
              <template v-else>{{ initials }}</template>
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
              <dd>{{ auth.user?.full_name || '-' }}</dd>
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
        </article>

        <article class="bw-card profile-panel">
          <div class="profile-panel-head">
            <span class="profile-panel-kicker">Avatar</span>
            <h2>Profile Picture</h2>
          </div>
          <div class="profile-form">
            <label class="profile-field">
              <span>Display name</span>
              <input v-model="fullName" class="bw-input" placeholder="Full name" />
            </label>
            <label class="profile-field">
              <span>Photo upload</span>
              <input class="bw-input bw-file-input" type="file" accept="image/png,image/jpeg,image/webp" @change="uploadProfilePicture" />
            </label>
            <small class="bw-muted">JPEG, PNG, WEBP only. Max 2MB. Image is cropped to square and re-exported clean.</small>
            <div class="profile-actions">
              <button class="bw-btn primary" :disabled="saving || uploading" @click="saveProfile">{{ saving ? 'Saving...' : 'Save profile' }}</button>
              <button class="bw-btn" :disabled="saving || uploading || !auth.user?.profile_picture_url" @click="removeProfilePicture">Remove picture</button>
            </div>
            <small v-if="uploading" class="bw-muted">Uploading image...</small>
            <small v-if="error" class="bw-muted" style="color:var(--danger)">{{ error }}</small>
          </div>
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
  overflow: hidden;
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
  width: max-content;
  padding: 7px;
  border: 1px solid oklch(from var(--brand) l c h / 0.35);
  border-radius: 28px;
  background: oklch(from var(--brand) l c h / 0.09);
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
  max-width: 11ch;
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
  grid-template-columns: 0.8fr 1.6fr 0.8fr;
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
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  gap: 20px;
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
  align-items: start;
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
    padding: 12px 0;
  }

  .profile-hero-meta > div + div {
    padding-left: 0;
    border-top: 1px solid var(--border);
    border-left: 0;
  }

  .profile-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .profile-row dd {
    text-align: left;
  }

  .profile-actions {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
  }
}

@media (max-width: 360px) {
  .profile-hero-top {
    grid-template-columns: 1fr;
  }
}
</style>
