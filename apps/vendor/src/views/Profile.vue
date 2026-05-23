<script setup lang="ts">
import { ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { useVendorAuthStore } from '../stores/auth';
import { toggleTheme } from '@beverly/tokens';
import { api } from '../lib/api';
import ProfilePictureCropModal from '../components/ProfilePictureCropModal.vue';
const auth = useVendorAuthStore();
const name = ref(auth.user?.full_name ?? '');
const phone = ref(auth.user?.phone ?? '');
const profilePictureUrl = ref(auth.user?.profile_picture_url ?? '');
const saving = ref(false);
const uploading = ref(false);
const cropOpen = ref(false);
const cropFile = ref<File | null>(null);

async function saveProfile() {
    saving.value = true;
    try {
        await api.patch('/api/v1/vendor/me', {
            full_name: name.value,
            phone: phone.value,
            profile_picture_url: profilePictureUrl.value,
        });
        await auth.refreshMe();
    } finally {
        saving.value = false;
    }
}
async function removeProfilePicture() {
    await api.del('/api/v1/vendor/profile-picture');
    profilePictureUrl.value = '';
    await auth.refreshMe();
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
        await api.post('/api/v1/vendor/profile-picture/scan', {
            file_name: file.name,
            content_base64: contentBase64,
        });
        const payload = await api.post<any>('/api/v1/vendor/profile-picture/upload-url', {
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
      @done="(f) => { cropOpen = false; uploadProcessedProfilePicture(f); }"
    />
    <div class="bw-stack">
      <div class="bw-card">
        <h1 class="bw-h1">{{ auth.user?.full_name || 'Vendor user' }}</h1>
        <p class="bw-muted bw-mono">{{ auth.user?.email }}</p>
        <p class="bw-muted" style="font-size: var(--t-sm); margin-top: var(--s-2)">{{ auth.user?.organization_name }} · {{ auth.user?.role }}</p>
      </div>
      <div class="bw-card">
        <div class="bw-stack">
          <input class="bw-input" v-model="name" placeholder="Full name" />
          <input class="bw-input" v-model="phone" placeholder="Phone" />
          <input class="bw-input" v-model="profilePictureUrl" placeholder="Profile picture URL" />
          <input class="bw-input" type="file" accept="image/png,image/jpeg,image/webp" @change="uploadProfilePicture" />
          <small class="bw-muted">JPEG, PNG, WEBP only. Max 2MB.</small>
          <button class="bw-btn primary" :disabled="saving" @click="saveProfile">{{ saving ? 'Saving...' : 'Save profile' }}</button>
          <button class="bw-btn" @click="removeProfilePicture">Remove picture</button>
          <small v-if="uploading" class="bw-muted">Uploading image...</small>
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
