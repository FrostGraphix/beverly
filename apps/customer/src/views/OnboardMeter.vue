<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';

const router   = useRouter();
const meterId  = ref('');
const nickname = ref('');
const loading  = ref(false);
const error    = ref<string | null>(null);
const done     = ref(false);

async function submit() {
    if (!meterId.value.trim()) return;
    loading.value = true; error.value = null;
    try {
        await api.post('/api/v1/customer/meters', {
            meter_id: meterId.value.trim().toUpperCase(),
            nickname: nickname.value.trim() || undefined,
        });
        done.value = true;
    } catch (e: any) {
        error.value = e?.message ?? 'Could not link meter. Check the number and try again.';
    } finally { loading.value = false; }
}
</script>

<template>
  <AppShell>
    <template v-if="!done">
      <div class="bw-card">
        <p class="bw-page-title" style="margin-bottom: var(--s-1)">Link a meter</p>
        <p class="bw-muted" style="font-size: var(--t-sm); margin-bottom: var(--s-5)">
          Enter your prepaid meter number. We'll verify it with the energy network.
        </p>

        <form class="bw-stack" @submit.prevent="submit">
          <div>
            <label class="bw-label">Meter number</label>
            <input class="bw-input bw-mono" v-model="meterId" inputmode="numeric"
                   autocomplete="off" required placeholder="e.g. 44120000000"
                   style="font-size: var(--t-lg); letter-spacing: 0.08em" />
          </div>
          <div>
            <label class="bw-label">
              Nickname
              <span class="bw-muted" style="text-transform:none; letter-spacing:0; font-weight:400; margin-left:4px">(optional)</span>
            </label>
            <input class="bw-input" v-model="nickname" type="text" placeholder="Home, Office…" />
          </div>

          <div v-if="error" class="bw-alert danger" style="font-size: var(--t-sm)">{{ error }}</div>

          <button class="bw-btn primary lg" type="submit" :disabled="loading || !meterId.trim()"
                  style="width:100%; justify-content:center">
            {{ loading ? 'Verifying…' : 'Link meter' }}
          </button>
        </form>
      </div>

      <div class="bw-card" style="background: var(--surface-2)">
        <p style="font-size: var(--t-sm); font-weight:600; margin:0 0 var(--s-2)">Where to find your meter number</p>
        <p class="bw-muted" style="font-size: var(--t-xs); margin:0">
          The meter number is printed on the face of your prepaid meter, usually 11–13 digits starting with 44 or 57.
        </p>
      </div>
    </template>

    <template v-else>
      <div class="bw-card" style="text-align:center; padding: var(--s-8)">
        <div style="width:56px; height:56px; border-radius:50%; background: oklch(70% 0.19 145 / 0.15); display:grid; place-items:center; margin: 0 auto var(--s-4)">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <p class="bw-page-title" style="margin-bottom: var(--s-2)">Meter linked!</p>
        <p class="bw-muted" style="font-size: var(--t-sm); margin-bottom: var(--s-6)">
          <span class="bw-mono">{{ meterId.toUpperCase() }}</span> is now linked to your account.
        </p>
        <div class="bw-row" style="gap: var(--s-3)">
          <router-link to="/buy-token" class="bw-btn primary" style="text-decoration:none; flex:1; justify-content:center">
            Buy token
          </router-link>
          <router-link to="/meters" class="bw-btn" style="text-decoration:none; flex:1; justify-content:center">
            My meters
          </router-link>
        </div>
      </div>
    </template>
  </AppShell>
</template>
