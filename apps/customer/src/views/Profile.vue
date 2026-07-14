<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import ProfilePictureCropModal from '../components/ProfilePictureCropModal.vue';
import { useAuthStore } from '../stores/auth';
import { toggleTheme } from '@beverly/tokens';
import { api, ApiError } from '../lib/api';

const auth   = useAuthStore();
const router = useRouter();

const editMode    = ref(false);
const exportLoading = ref(false);
const exportMsg   = ref('');
const fullName = ref(auth.customer?.full_name ?? '');
const profilePictureUrl = ref(auth.customer?.profile_picture_url ?? '');
const loading  = ref(false);
const error    = ref<string | null>(null);
const saved    = ref(false);
const uploading = ref(false);
const cropOpen = ref(false);
const cropFile = ref<File | null>(null);

function fallback(value: string | null | undefined): string {
    return value?.trim() || '-';
}

function titleCase(value: string | null | undefined): string {
    if (!value) return '-';
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function saveProfile() {
    loading.value = true; error.value = null;
    try {
        const r = await api.patch<any>('/api/v1/customer/me', {
            full_name: fullName.value.trim(),
        });
        if (auth.customer) {
            auth.customer.full_name = r.full_name;
            auth.customer.email = r.email;
            auth.customer.profile_picture_url = r.profile_picture_url ?? null;
        }
        editMode.value = false;
        saved.value = true;
        setTimeout(() => { saved.value = false; }, 2000);
    } catch (e: any) {
        error.value = e?.message ?? 'Update failed.';
    } finally { loading.value = false; }
}
async function removeProfilePicture() {
    loading.value = true; error.value = null;
    try {
        await api.del('/api/v1/customer/profile-picture');
        profilePictureUrl.value = '';
        await auth.refreshProfile();
    } catch (e: any) { error.value = e?.message ?? 'Picture removal failed.'; }
    finally { loading.value = false; }
}

async function uploadProfilePicture(event: Event) {
    const file = (event.target as HTMLInputElement)?.files?.[0]; if (!file) return;
    cropFile.value = file; cropOpen.value = true;
}

async function uploadProcessedProfilePicture(file: File) {
    uploading.value = true;
    try {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
        const contentBase64 = btoa(binary);
        await api.post('/api/v1/customer/profile-picture/scan', {
            file_name: file.name,
            content_base64: contentBase64,
        });
        const payload = await api.post<any>('/api/v1/customer/profile-picture/upload-url', {
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
        const activated = await api.post<any>('/api/v1/customer/profile-picture/activate', { path: payload.path });
        profilePictureUrl.value = activated.profile_picture_url;
        await auth.refreshProfile();
    } catch (e: any) {
        error.value = e?.message ?? 'Picture upload failed.';
    } finally {
        uploading.value = false;
    }
}

async function signOut() {
    await auth.logout();
    await router.push('/login');
}

async function requestExport() {
    exportLoading.value = true;
    try {
        await api.post('/api/v1/customer/privacy/data-export', {});
        exportMsg.value = 'Your data export has been requested. We will notify you when it is ready (usually within a few minutes).';
    } catch (e: any) {
        exportMsg.value = e?.message ?? 'Failed to request export.';
    } finally {
        exportLoading.value = false;
    }
}

const signOutOpen = ref(false);
const deleteOpen = ref(false);
const deleteBusy = ref(false);
const deleteConfirmText = ref('');
const banner = ref<{ tone: 'success' | 'error'; text: string } | null>(null);

const deleteConfirmed = computed(() => deleteConfirmText.value.trim().toUpperCase() === 'DELETE');

async function doDelete() {
    if (!deleteConfirmed.value) return;
    deleteBusy.value = true;
    banner.value = null;
    try {
        const res = await api.post<{ message: string }>('/api/v1/customer/privacy/delete-account', {});
        deleteOpen.value = false;
        deleteConfirmText.value = '';
        banner.value = { tone: 'success', text: res.message ?? 'Deletion requested.' };
    } catch (e: any) {
        const msg = e instanceof ApiError ? `${e.message} (${e.code})` : e?.message ?? 'Failed to request deletion.';
        banner.value = { tone: 'error', text: msg };
        deleteOpen.value = false;
    } finally {
        deleteBusy.value = false;
    }
}

async function doSignOut() {
    signOutOpen.value = false;
    await auth.logout();
    await router.push('/login');
}
</script>

<template>
  <AppShell>
    <ProfilePictureCropModal
      :open="cropOpen"
      :file="cropFile"
      @close="cropOpen = false"
      @done="(f) => { cropOpen = false; uploadProcessedProfilePicture(f); }"
    />
    <!-- Avatar + name -->
    <div class="bw-card" style="text-align:center; padding: var(--s-6); margin-top: var(--s-3)">
      <div style="width:64px; height:64px; border-radius:50%; background: linear-gradient(135deg, var(--brand-300), var(--brand-600)); display:grid; place-items:center; margin: 0 auto var(--s-3); font-size:28px; font-weight:700; color:white; overflow:hidden">
        <img v-if="auth.customer?.profile_picture_url" :src="auth.customer.profile_picture_url" alt="Profile" style="width:100%; height:100%; object-fit:cover" />
        <template v-else>{{ (auth.customer?.full_name ?? '?')[0].toUpperCase() }}</template>
      </div>
      <p style="font-weight:700; font-size: var(--t-lg); margin:0 0 4px">{{ auth.customer?.full_name || '—' }}</p>
      <p class="bw-mono bw-muted" style="font-size: var(--t-sm); margin:0">{{ auth.customer?.phone }}</p>
      <span :class="['bw-kyc-tier', `tier-${auth.kycTier}`]" style="display:inline-flex; margin-top: var(--s-2)">
        Tier {{ auth.kycTier }}
      </span>
    </div>

    <!-- Edit profile -->
    <div class="bw-card">
      <div class="bw-row" style="margin-bottom: var(--s-4)">
        <p style="font-weight:700; margin:0; flex:1">Profile details</p>
        <button v-if="!editMode" class="bw-btn" style="font-size: var(--t-sm); height:32px; padding: 0 var(--s-3)"
                @click="editMode = true">Edit</button>
      </div>

      <template v-if="!editMode">
        <div class="bw-stack" style="gap: var(--s-3)">
          <div>
            <p class="bw-label">Full name</p>
            <p style="margin:0">{{ auth.customer?.full_name || '—' }}</p>
          </div>
          <div>
            <p class="bw-label">Email</p>
            <p style="margin:0">{{ auth.customer?.email || '—' }}</p>
          </div>
          <div>
            <p class="bw-label">Phone</p>
            <p class="bw-mono" style="margin:0">{{ auth.customer?.phone }}</p>
          </div>
          <div>
            <p class="bw-label">KYC status</p>
            <p style="margin:0; color: var(--brand); font-weight:700">{{ titleCase(auth.customer?.kyc_status) }}</p>
          </div>
        </div>
        <p v-if="saved" class="bw-muted" style="font-size: var(--t-xs); margin-top: var(--s-3); color: var(--brand)">✓ Profile updated</p>
      </template>

      <form v-else class="bw-stack" @submit.prevent="saveProfile">
        <div>
          <label class="bw-label">Full name</label>
          <input class="bw-input" v-model="fullName" required />
        </div>
        <div>
          <label class="bw-label">Email</label>
          <input class="bw-input" :value="auth.customer?.email || ''" type="email" disabled aria-describedby="email-lock-note" />
          <small id="email-lock-note" class="bw-muted locked-field-note">Registration email cannot be changed.</small>
        </div>
        <div>
          <label class="bw-label">Profile picture</label>
          <input class="bw-input bw-file-input" type="file" accept="image/png,image/jpeg,image/webp" @change="uploadProfilePicture" style="margin-top:8px" />
          <p class="bw-muted" style="font-size:var(--t-xs); margin:6px 0 0">JPEG, PNG, WEBP only. Max 2MB.</p>
          <p v-if="error" class="bw-muted" style="font-size:var(--t-xs); margin:6px 0 0; color:var(--danger)">{{ error }}</p>
          <p v-if="uploading" class="bw-muted" style="font-size:var(--t-xs); margin:6px 0 0">Uploading image...</p>
        </div>
        <div v-if="error" class="bw-alert danger" style="font-size: var(--t-sm)">{{ error }}</div>
        <div class="bw-row" style="gap: var(--s-3)">
          <button type="button" class="bw-btn" style="flex:1; justify-content:center" @click="editMode = false">Cancel</button>
          <button type="submit" class="bw-btn primary" style="flex:1; justify-content:center" :disabled="loading">
            {{ loading ? 'Saving…' : 'Save' }}
          </button>
        </div>
        <button type="button" class="bw-btn" @click="removeProfilePicture">Remove picture</button>
      </form>
    </div>

    <!-- KYC upgrade -->
    <router-link v-if="auth.kycTier < 2" to="/kyc"
                 class="bw-card" style="display:block; text-decoration:none">
      <div class="bw-row">
        <div style="flex:1">
          <p style="font-weight:700; margin:0 0 2px; font-size: var(--t-sm)">Verify identity</p>
          <p class="bw-muted" style="font-size: var(--t-xs); margin:0">
            {{ auth.kycTier === 0 ? 'Required to buy tokens' : 'Tier 2 unlocks ₦200k/day' }}
          </p>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </div>
    </router-link>

    <!-- Actions -->
    <div class="bw-card">
      <div class="bw-stack" style="gap: var(--s-2)">
        <button class="bw-btn" style="justify-content:flex-start" @click="toggleTheme">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
          Toggle theme
        </button>
        <router-link to="/transactions" class="bw-btn" style="text-decoration:none; justify-content:flex-start">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/></svg>
          Transaction history
        </router-link>
        <router-link to="/receipts" class="bw-btn" style="text-decoration:none; justify-content:flex-start">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Receipts
        </router-link>
        <router-link to="/disputes" class="bw-btn" style="text-decoration:none; justify-content:flex-start">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          My Disputes
        </router-link>
        <p v-if="exportMsg" style="font-size:var(--t-xs); color:var(--bw-text-muted); margin:0 0 4px; padding: 0 2px">{{ exportMsg }}</p>
        <button class="bw-btn" style="justify-content:flex-start; color: var(--bw-text-muted)" @click="requestExport" :disabled="exportLoading">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          {{ exportLoading ? 'Requesting…' : 'Download my data' }}
        </button>
        <button class="bw-btn" style="justify-content:flex-start; color: var(--danger)" @click="deleteOpen = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          Delete my account
        </button>
        <button class="bw-btn" style="justify-content:flex-start; color: var(--danger)" @click="signOutOpen = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          Sign out
        </button>
      </div>
    </div>

    <!-- Banner -->
    <transition name="banner">
      <div v-if="banner" :class="['p-banner', banner.tone]" role="status">
        {{ banner.text }}
        <button class="p-banner-x" @click="banner = null" aria-label="Dismiss">×</button>
      </div>
    </transition>

    <!-- Sign-out confirm -->
    <ConfirmDialog
      v-model:open="signOutOpen"
      title="Sign out?"
      description="You'll need your phone number to sign back in. Pending purchases will continue in the background."
      confirm-label="Sign out"
      tone="warn"
      @confirm="doSignOut"
    />

    <!-- Delete confirm (requires typing DELETE) -->
    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Delete account"
      description="Your account will be permanently deleted after a 30-day cooling-off period. You can cancel this request from the same screen before then. All wallet funds must be withdrawn first."
      confirm-label="Request deletion"
      cancel-label="Keep account"
      tone="danger"
      :loading="deleteBusy"
      :disable-confirm="!deleteConfirmed"
      @confirm="doDelete"
    >
      <label class="cd-input-label">Type DELETE to confirm</label>
      <input
        v-model="deleteConfirmText"
        class="cd-input"
        autocomplete="off"
        spellcheck="false"
        placeholder="DELETE"
      />
    </ConfirmDialog>
  </AppShell>
</template>

<style scoped>
.profile-hero {
  display: flex;
  align-items: center;
  gap: var(--s-4);
  margin-bottom: var(--s-3);
}

.locked-field-note {
  display: block;
  margin-top: var(--s-1);
  font-size: var(--t-xs);
}

.profile-avatar {
  width: 72px;
  height: 72px;
  border-radius: 24px;
  display: grid;
  place-items: center;
  overflow: hidden;
  color: oklch(8% 0.04 145);
  background: linear-gradient(135deg, var(--brand-400), var(--brand-700));
  font-size: 30px;
  font-weight: 900;
  box-shadow: var(--shadow-sm);
}

.profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-eyebrow {
  margin: 0 0 var(--s-1);
  font-size: var(--t-xs);
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--brand);
}

.profile-section {
  padding: 0;
  overflow: hidden;
  margin-bottom: var(--s-3);
}

.profile-section h2 {
  margin: 0;
  padding: var(--s-4);
  font-size: var(--t-md);
  font-weight: 800;
  border-bottom: 1px solid var(--border);
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

.p-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-4);
  border-radius: var(--r-md);
  margin-top: var(--s-3);
  font-size: var(--t-sm);
  border: 1px solid;
}
.p-banner.success {
  background: oklch(from var(--brand) l c h / 0.08);
  border-color: oklch(from var(--brand) l c h / 0.30);
  color: var(--brand);
}
.p-banner.error {
  background: oklch(from var(--danger) l c h / 0.08);
  border-color: oklch(from var(--danger) l c h / 0.30);
  color: var(--danger);
}
.p-banner-x {
  background: transparent; border: none; color: inherit; cursor: pointer;
  font-size: 18px; line-height: 1; padding: 2px 8px; border-radius: 50%;
  opacity: 0.7;
}
.banner-enter-active, .banner-leave-active { transition: all 0.20s var(--ease-out); }
.banner-enter-from { opacity: 0; transform: translateY(-4px); }
.banner-leave-to { opacity: 0; }

:deep(.cd-body) .cd-input-label {
  display: block;
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 6px;
}
:deep(.cd-body) .cd-input {
  width: 100%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 10px 12px;
  color: var(--text);
  font-size: var(--t-md);
  font-family: var(--font-mono);
  letter-spacing: 0.1em;
}
:deep(.cd-body) .cd-input:focus {
  outline: none;
  border-color: var(--danger);
  box-shadow: 0 0 0 3px oklch(from var(--danger) l c h / 0.18);
}
</style>
