<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppShell from '../components/AppShell.vue';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const loading = ref(false);
const saving  = ref(false);
const error   = ref('');
const success = ref('');

const prefs = ref({
    token_purchased_sms:    true,
    token_purchased_email:  true,
    wallet_funded_sms:      true,
    wallet_funded_inapp:    true,
    low_balance_sms:        true,
    low_balance_inapp:      true,
    meter_tamper_sms:       true,
    meter_tamper_inapp:     true,
    payment_failed_email:   true,
    dispute_update_email:   true,
});

const API = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

async function load() {
    loading.value = true;
    try {
        const res = await fetch(`${API}/api/v1/customer/notifications/preferences`, {
            headers: { Authorization: `Bearer ${auth.accessToken}` },
        });
        if (res.ok) {
            const data = await res.json();
            Object.assign(prefs.value, data.preferences ?? {});
        }
    } catch { /* use defaults */ } finally {
        loading.value = false;
    }
}

async function save() {
    saving.value  = true;
    error.value   = '';
    success.value = '';
    try {
        const res = await fetch(`${API}/api/v1/customer/notifications/preferences`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${auth.accessToken}`,
            },
            body: JSON.stringify(prefs.value),
        });
        if (!res.ok) throw new Error((await res.json()).message ?? 'Save failed');
        success.value = 'Preferences saved.';
    } catch (e: any) {
        error.value = e.message ?? 'Failed to save preferences';
    } finally {
        saving.value = false;
    }
}

onMounted(load);
</script>

<template>
  <AppShell title="Notifications">
    <div class="bw-page-inner">
      <div class="bw-page-header-row">
        <h1>Notification Preferences</h1>
      </div>

      <div v-if="loading" class="bw-loading">Loading…</div>

      <template v-else>
        <div v-if="error" class="bw-error-pill">{{ error }}</div>
        <div v-if="success" class="bw-success-pill">{{ success }}</div>

        <div class="bw-pref-group">
          <div class="bw-pref-group-title">Token Purchases</div>
          <label class="bw-pref-row"><span>SMS on purchase</span><input type="checkbox" v-model="prefs.token_purchased_sms" /></label>
          <label class="bw-pref-row"><span>Email on purchase</span><input type="checkbox" v-model="prefs.token_purchased_email" /></label>
        </div>

        <div class="bw-pref-group">
          <div class="bw-pref-group-title">Wallet</div>
          <label class="bw-pref-row"><span>SMS when funded</span><input type="checkbox" v-model="prefs.wallet_funded_sms" /></label>
          <label class="bw-pref-row"><span>In-app when funded</span><input type="checkbox" v-model="prefs.wallet_funded_inapp" /></label>
          <label class="bw-pref-row"><span>SMS on low balance</span><input type="checkbox" v-model="prefs.low_balance_sms" /></label>
          <label class="bw-pref-row"><span>In-app on low balance</span><input type="checkbox" v-model="prefs.low_balance_inapp" /></label>
        </div>

        <div class="bw-pref-group">
          <div class="bw-pref-group-title">Meter Alerts</div>
          <label class="bw-pref-row"><span>SMS on tamper alert</span><input type="checkbox" v-model="prefs.meter_tamper_sms" /></label>
          <label class="bw-pref-row"><span>In-app on tamper alert</span><input type="checkbox" v-model="prefs.meter_tamper_inapp" /></label>
        </div>

        <div class="bw-pref-group">
          <div class="bw-pref-group-title">Payments &amp; Disputes</div>
          <label class="bw-pref-row"><span>Email on payment failure</span><input type="checkbox" v-model="prefs.payment_failed_email" /></label>
          <label class="bw-pref-row"><span>Email on dispute update</span><input type="checkbox" v-model="prefs.dispute_update_email" /></label>
        </div>

        <p class="bw-notice">OTP and security messages cannot be turned off.</p>

        <button class="bw-cta-btn" :disabled="saving" @click="save">
          {{ saving ? 'Saving…' : 'Save Preferences' }}
        </button>
      </template>
    </div>
  </AppShell>
</template>

<style scoped>
.bw-page-inner { padding: var(--s-4); max-width: 480px; margin: 0 auto; }
.bw-page-header-row { margin-bottom: var(--s-5); }
.bw-page-header-row h1 { font-size: var(--t-xl); font-weight: 700; letter-spacing: -0.02em; margin: 0; }
.bw-pref-group { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-xl); margin-bottom: var(--s-4); overflow: hidden; }
.bw-pref-group-title { font-size: var(--t-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--border); }
.bw-pref-row { display: flex; align-items: center; justify-content: space-between; padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--border); font-size: var(--t-sm); cursor: pointer; }
.bw-pref-row:last-child { border-bottom: none; }
.bw-pref-row input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--brand); }
.bw-notice { font-size: var(--t-xs); color: var(--text-muted); margin-bottom: var(--s-5); }
.bw-cta-btn { width: 100%; padding: var(--s-3) var(--s-4); background: var(--brand); color: white; border: none; border-radius: var(--r-lg); font-size: var(--t-base); font-weight: 600; cursor: pointer; }
.bw-cta-btn:disabled { opacity: 0.6; }
.bw-error-pill { background: oklch(from var(--red) l c h / 0.10); border: 1px solid oklch(from var(--red) l c h / 0.25); color: var(--red); border-radius: var(--r-md); padding: var(--s-3) var(--s-4); font-size: var(--t-sm); margin-bottom: var(--s-4); }
.bw-success-pill { background: oklch(from var(--green) l c h / 0.10); border: 1px solid oklch(from var(--green) l c h / 0.25); color: var(--green); border-radius: var(--r-md); padding: var(--s-3) var(--s-4); font-size: var(--t-sm); margin-bottom: var(--s-4); }
</style>
