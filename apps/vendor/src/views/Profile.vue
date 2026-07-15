<script setup lang="ts">
import { computed, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import ProfilePictureCropModal from '../components/ProfilePictureCropModal.vue';
import { useVendorAuthStore } from '../stores/auth';
import { api } from '../lib/api';
import { toggleTheme } from '@beverly/tokens';

type ProfileRow = {
    label: string;
    value: string | null | undefined;
    tone?: 'success' | 'warning' | 'danger';
};

type ProfileSection = {
    title: string;
    rows: ProfileRow[];
};

const auth = useVendorAuthStore();
const name = ref(auth.user?.full_name ?? '');
const phone = ref(auth.user?.phone ?? '');
const profilePictureUrl = ref(auth.user?.profile_picture_url ?? '');
const saving = ref(false);
const uploading = ref(false);
const cropOpen = ref(false);
const cropFile = ref<File | null>(null);
const error = ref<string | null>(null);

function fallback(value: string | null | undefined): string {
    return value?.trim() || '-';
}

function titleCase(value: string | null | undefined): string {
    if (!value) return '-';
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function dateOnly(value: string | null | undefined): string {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('en-NG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

function statusTone(value: string | null | undefined): ProfileRow['tone'] {
    const normalized = value?.toLowerCase();
    if (normalized === 'active' || normalized === 'approved' || normalized === 'verified') return 'success';
    if (normalized === 'pending' || normalized === 'pending_review') return 'warning';
    if (normalized === 'rejected' || normalized === 'suspended' || normalized === 'frozen' || normalized === 'closed') return 'danger';
    return undefined;
}

const profileSections = computed<ProfileSection[]>(() => {
    const user = auth.user;
    const accountStatus = user?.account_status ?? user?.organization_status ?? user?.wallet_status;
    return [
        {
            title: 'Account Information',
            rows: [
                { label: 'Vendor Name', value: user?.organization_name },
                { label: 'Vendor Code', value: user?.vendor_code },
                { label: 'Site', value: user?.site },
                { label: 'Wallet Number', value: user?.wallet_number },
                { label: 'Account Status', value: titleCase(accountStatus), tone: statusTone(accountStatus) },
            ],
        },
        {
            title: 'Contact Details',
            rows: [
                { label: 'Primary Phone', value: user?.primary_phone ?? user?.phone },
                { label: 'Email', value: user?.contact_email ?? user?.email },
                { label: 'Contact Person', value: user?.contact_person ?? user?.full_name },
            ],
        },
        {
            title: 'KYC Status',
            rows: [
                { label: 'KYC Status', value: titleCase(user?.kyc_status), tone: statusTone(user?.kyc_status) },
                { label: 'CAC Number', value: user?.cac_number },
                { label: 'Tax ID (TIN)', value: user?.tin },
                { label: 'KYC Approved Date', value: dateOnly(user?.kyc_approved_date) },
                { label: 'KYC Expiry', value: dateOnly(user?.kyc_expiry) },
            ],
        },
    ];
});

const initials = computed(() => {
    const source = auth.user?.organization_name?.trim() || auth.user?.full_name?.trim() || 'VD';
    return source.slice(0, 2).toUpperCase();
});

const roleLabel = computed(() => {
    return auth.user?.role === 'vendor_user' ? 'Vendor User' : 'Vendor';
});

const accountStatusLabel = computed(() => {
    const raw = auth.user?.account_status ?? auth.user?.organization_status ?? auth.user?.wallet_status ?? 'active';
    return titleCase(raw);
});

async function saveProfile() {
    saving.value = true;
    try {
        await api.patch('/api/v1/vendor/me', {
            full_name: name.value,
            phone: phone.value,
        });
        await auth.refreshMe();
    } catch (e: any) {
        error.value = e?.message ?? 'Profile update failed.';
    } finally {
        saving.value = false;
    }
}

async function removeProfilePicture() {
    saving.value = true; error.value = null;
    try {
        await api.del('/api/v1/vendor/profile-picture');
        profilePictureUrl.value = '';
        await auth.refreshMe();
    } catch (e: any) { error.value = e?.message ?? 'Picture removal failed.'; }
    finally { saving.value = false; }
}

async function uploadProfilePicture(event: Event) {
    const file = (event.target as HTMLInputElement)?.files?.[0];
    if (!file) return;
    cropFile.value = file;
    cropOpen.value = true;
}

async function uploadProcessedProfilePicture(file: File) {
    uploading.value = true;
    try {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
        const contentBase64 = btoa(binary);
        await api.post('/api/v1/vendor/profile-picture/scan', {
            file_name: file.name,
            content_base64: contentBase64,
        });
        const payload = await api.post<any>('/api/v1/vendor/profile-picture/upload-url', {
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
        const activated = await api.post<any>('/api/v1/vendor/profile-picture/activate', { path: payload.path });
        profilePictureUrl.value = activated.profile_picture_url;
        await auth.refreshMe();
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
      @done="(f) => { cropOpen = false; uploadProcessedProfilePicture(f); }"
    />
    <div class="bw-stack">
      <section class="profile-hero bw-card">
        <div class="profile-hero-top">
          <div class="profile-avatar-wrap">
            <div class="profile-avatar">
              <img v-if="auth.user?.profile_picture_url" :src="auth.user.profile_picture_url" alt="Vendor profile" />
              <template v-else>{{ initials }}</template>
            </div>
          </div>
          <div class="profile-hero-copy">
            <p class="profile-eyebrow">Vendor Identity</p>
            <h1 class="bw-h1">{{ auth.user?.organization_name || 'Vendor account' }}</h1>
          </div>
        </div>

        <div class="profile-hero-meta">
          <div>
            <span>Role</span>
            <strong>{{ roleLabel }}</strong>
          </div>
          <div>
            <span>Site</span>
            <strong>{{ auth.user?.site || 'No site assigned' }}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{{ accountStatusLabel }}</strong>
          </div>
        </div>
      </section>

      <section class="profile-section profile-record bw-card">
        <div class="profile-section-head">
          <span>Record</span>
          <h2>Profile Details</h2>
        </div>
        <dl>
          <div class="profile-row"><dt>Full name</dt><dd>{{ fallback(auth.user?.full_name) }}</dd></div>
          <div class="profile-row"><dt>Email</dt><dd>{{ fallback(auth.user?.contact_email ?? auth.user?.email) }}</dd></div>
          <div class="profile-row"><dt>Phone</dt><dd>{{ fallback(auth.user?.primary_phone ?? auth.user?.phone) }}</dd></div>
          <div class="profile-row"><dt>Role</dt><dd>{{ roleLabel }}</dd></div>
        </dl>
      </section>

      <section v-for="section in profileSections" :key="section.title" class="profile-section bw-card">
        <h2>{{ section.title }}</h2>
        <dl>
          <div v-for="row in section.rows" :key="row.label" class="profile-row">
            <dt>{{ row.label }}</dt>
            <dd :class="row.tone ? `tone-${row.tone}` : undefined">{{ fallback(row.value) }}</dd>
          </div>
        </dl>
      </section>

      <div class="bw-card profile-edit-card">
        <div>
          <h2>Profile Picture</h2>
          <p class="bw-muted">Optional vendor avatar controls.</p>
        </div>
        <div class="bw-stack">
          <input class="bw-input" v-model="name" placeholder="Full name" />
          <input class="bw-input" v-model="phone" placeholder="Phone" />
          <input class="bw-input bw-file-input" type="file" accept="image/png,image/jpeg,image/webp" @change="uploadProfilePicture" />
          <small class="bw-muted">JPEG, PNG, WEBP only. Max 2MB.</small>
          <div class="profile-picture-actions">
            <button class="bw-btn primary" :disabled="saving" @click="saveProfile">{{ saving ? 'Saving...' : 'Save profile' }}</button>
            <button class="bw-btn" @click="removeProfilePicture">Remove picture</button>
          </div>
          <small v-if="uploading" class="bw-muted">Uploading image...</small>
          <small v-if="error" class="bw-muted" style="color:var(--danger)">{{ error }}</small>
        </div>
      </div>

      <div class="bw-card">
        <button class="bw-btn" @click="toggleTheme">Toggle theme</button>
      </div>
      <div class="bw-card">
        <button class="bw-btn danger" @click="auth.logout()">Sign out</button>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
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
  display: grid;
  place-items: center;
  overflow: hidden;
  color: oklch(8% 0.04 145);
  background: linear-gradient(135deg, var(--brand-400), var(--brand-700));
  font-size: 34px;
  font-weight: 900;
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

.profile-section {
  padding: 0;
  overflow: hidden;
}

.profile-section h2,
.profile-edit-card h2 {
  margin: 0;
  padding: var(--s-4);
  font-size: var(--t-md);
  font-weight: 800;
  border-bottom: 1px solid var(--border);
}

.profile-section-head {
  padding: var(--s-4);
  border-bottom: 1px solid var(--border);
}

.profile-section-head span {
  display: block;
  margin-bottom: 6px;
  color: var(--brand);
  font-size: var(--t-xs);
  font-weight: 900;
  text-transform: uppercase;
}

.profile-section-head h2 {
  padding: 0;
  border: 0;
}

.profile-edit-card h2 {
  padding: 0;
  border-bottom: 0;
}

.profile-edit-card > div:first-child {
  margin-bottom: var(--s-4);
}

.profile-section dl {
  margin: 0;
  padding: 0 var(--s-4);
}

.profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  padding: var(--s-3) 0;
  border-bottom: 1px solid var(--border);
}

.profile-row:last-child {
  border-bottom: 0;
}

.profile-row dt {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--t-sm);
}

.profile-row dd {
  margin: 0;
  color: var(--text);
  font-weight: 800;
  text-align: right;
}

.tone-success {
  color: var(--success) !important;
}

.tone-warning {
  color: var(--warn) !important;
}

.tone-danger {
  color: var(--danger) !important;
}

.profile-picture-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--s-3);
}

.profile-picture-actions .bw-btn {
  justify-content: center;
}

@media (max-width: 560px) {
  .profile-hero {
    padding: 18px;
    gap: 16px;
  }

  .profile-hero-top {
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
}

@media (max-width: 360px) {
  .profile-hero-top {
    grid-template-columns: 1fr;
  }
}
</style>
