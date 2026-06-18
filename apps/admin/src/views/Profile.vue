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
            profile_picture_url: profilePictureUrl.value.trim() || null,
        });
        await syncAuthFromApi(response);
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
        await fetch(payload.signed_url, {
            method: 'PUT',
            headers: { 'Content-Type': file.type },
            body: file,
        });
        profilePictureUrl.value = payload.public_url;
        await saveProfile();
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
        <div class="profile-avatar">
          <img v-if="auth.user?.profile_picture_url" :src="auth.user.profile_picture_url" alt="Staff profile" />
          <template v-else>{{ initials }}</template>
        </div>
        <div class="profile-hero-copy">
          <p class="profile-eyebrow">Staff Identity</p>
          <h1 class="bw-h1">{{ auth.user?.full_name || 'Staff user' }}</h1>
          <p class="bw-muted">Your wallet admin identity, avatar, and session profile.</p>
          <div class="profile-badges">
            <span class="bw-badge bw-badge-success">{{ roleLabel }}</span>
            <span class="bw-badge bw-badge-neutral">{{ auth.user?.email || 'No email' }}</span>
          </div>
        </div>
      </section>

      <section class="profile-grid">
        <article class="bw-card profile-panel">
          <h2>Profile Details</h2>
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
          <h2>Profile Picture</h2>
          <p class="bw-muted profile-panel-copy">Use the same clean avatar standard across admin, vendor, and customer surfaces.</p>
          <div class="profile-form">
            <input v-model="fullName" class="bw-input" placeholder="Full name" />
            <input class="bw-input" type="file" accept="image/png,image/jpeg,image/webp" @change="uploadProfilePicture" />
            <small class="bw-muted">JPEG, PNG, WEBP only. Max 2MB. Image is cropped to square and re-exported clean.</small>
            <div class="profile-actions">
              <button class="bw-btn primary" :disabled="saving || uploading" @click="saveProfile">{{ saving ? 'Saving...' : 'Save profile' }}</button>
              <button class="bw-btn" :disabled="saving || uploading || !auth.user?.profile_picture_url" @click="removeProfilePicture">Remove picture</button>
            </div>
            <small v-if="uploading" class="bw-muted">Uploading image...</small>
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
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 24px;
}

.profile-avatar {
  width: 84px;
  height: 84px;
  flex: 0 0 auto;
  border-radius: 26px;
  overflow: hidden;
  display: grid;
  place-items: center;
  font-size: 30px;
  font-weight: 900;
  color: oklch(8% 0.04 145);
  background: linear-gradient(135deg, var(--brand-400), var(--brand-700));
  box-shadow: var(--shadow-sm);
}

.profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-hero-copy {
  min-width: 0;
}

.profile-eyebrow {
  margin: 0 0 6px;
  font-size: var(--t-xs);
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--brand);
}

.profile-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.profile-panel h2 {
  margin: 0 0 14px;
  font-size: var(--t-md);
}

.profile-panel-copy {
  margin: 0 0 16px;
}

.profile-list {
  margin: 0;
  display: grid;
  gap: 14px;
}

.profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}

.profile-row:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.profile-row dt {
  color: var(--muted);
}

.profile-row dd {
  margin: 0;
  text-align: right;
  font-weight: 700;
  color: var(--text);
}

.profile-mono {
  font-family: var(--font-mono);
  font-size: var(--t-sm);
}

.profile-form {
  display: grid;
  gap: 12px;
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
    align-items: flex-start;
    flex-direction: column;
  }

  .profile-actions {
    grid-template-columns: 1fr;
  }
}
</style>
