<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { useAuthStore } from '../stores/auth';
import { toggleTheme } from '@beverly/tokens';
import { api } from '../lib/api';

const auth   = useAuthStore();
const router = useRouter();

const editMode    = ref(false);
const exportLoading = ref(false);
const exportMsg   = ref('');
const fullName = ref(auth.customer?.full_name ?? '');
const email    = ref(auth.customer?.email ?? '');
const loading  = ref(false);
const error    = ref<string | null>(null);
const saved    = ref(false);

async function saveProfile() {
    loading.value = true; error.value = null;
    try {
        const r = await api.patch<any>('/api/v1/customer/me', {
            full_name: fullName.value.trim(),
            email: email.value.trim() || undefined,
        });
        if (auth.customer) {
            auth.customer.full_name = r.full_name;
            auth.customer.email = r.email;
        }
        editMode.value = false;
        saved.value = true;
        setTimeout(() => { saved.value = false; }, 2000);
    } catch (e: any) {
        error.value = e?.message ?? 'Update failed.';
    } finally { loading.value = false; }
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

async function confirmDelete() {
    if (!confirm('Request account deletion? Your account will be permanently deleted after a 30-day cooling-off period. You can cancel this request before then.')) return;
    try {
        const res = await api.post<any>('/api/v1/customer/privacy/delete-account', {});
        alert(res.message);
    } catch (e: any) {
        alert(e?.message ?? 'Failed to request deletion.');
    }
}
</script>

<template>
  <AppShell>
    <!-- Avatar + name -->
    <div class="bw-card" style="text-align:center; padding: var(--s-6)">
      <div style="width:64px; height:64px; border-radius:50%; background: linear-gradient(135deg, var(--brand-300), var(--brand-600)); display:grid; place-items:center; margin: 0 auto var(--s-3); font-size:28px; font-weight:700; color:white">
        {{ (auth.customer?.full_name ?? '?')[0].toUpperCase() }}
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
          <input class="bw-input" v-model="email" type="email" placeholder="Optional" />
        </div>
        <div v-if="error" class="bw-alert danger" style="font-size: var(--t-sm)">{{ error }}</div>
        <div class="bw-row" style="gap: var(--s-3)">
          <button type="button" class="bw-btn" style="flex:1; justify-content:center" @click="editMode = false">Cancel</button>
          <button type="submit" class="bw-btn primary" style="flex:1; justify-content:center" :disabled="loading">
            {{ loading ? 'Saving…' : 'Save' }}
          </button>
        </div>
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
        <button class="bw-btn" style="justify-content:flex-start; color: var(--danger)" @click="confirmDelete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          Delete my account
        </button>
        <button class="bw-btn" style="justify-content:flex-start; color: var(--danger)" @click="signOut">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          Sign out
        </button>
      </div>
    </div>
  </AppShell>
</template>
