<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../lib/api';
import { useVendorAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useVendorAuthStore();
const current = ref('');
const next = ref('');
const confirm = ref('');
const loading = ref(false);
const error = ref<string | null>(null);

async function submit() {
    if (next.value !== confirm.value) {
        error.value = 'New passwords do not match';
        return;
    }
    if (next.value.length < 12) {
        error.value = 'Password must be at least 12 characters';
        return;
    }
    loading.value = true; error.value = null;
    try {
        await api.post('/api/v1/vendor/password-change', { current: current.value, next: next.value });
        if (auth.user) auth.user.password_reset_required = false;
        await router.push('/');
    } catch (e: any) {
        error.value = e?.message ?? 'Update failed';
    } finally {
        loading.value = false;
    }
}
</script>

<template>
  <main style="min-height: 100dvh; display: grid; place-items: center; padding: var(--s-5)">
    <div class="bw-card" style="width: 100%; max-width: 480px">
      <h1 class="bw-h1" style="font-size: var(--t-2xl)">Set a new password</h1>
      <p class="bw-muted" style="margin: 0 0 var(--s-5); font-size: var(--t-sm)">
        Required before your first session. Minimum 12 characters.
      </p>

      <form class="bw-stack" @submit.prevent="submit">
        <div>
          <label class="bw-label">Current (temporary) password</label>
          <input class="bw-input" v-model="current" type="password" required />
        </div>
        <div>
          <label class="bw-label">New password</label>
          <input class="bw-input" v-model="next" type="password" minlength="12" required />
        </div>
        <div>
          <label class="bw-label">Confirm new password</label>
          <input class="bw-input" v-model="confirm" type="password" minlength="12" required />
        </div>
        <p v-if="error" class="bw-alert danger" style="margin: 0">{{ error }}</p>
        <button class="bw-btn primary" type="submit" :disabled="loading" style="justify-content: center; height: 44px">
          {{ loading ? 'Updating…' : 'Set password' }}
        </button>
      </form>
    </div>
  </main>
</template>
