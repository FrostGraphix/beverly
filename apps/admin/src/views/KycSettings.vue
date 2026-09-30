<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, naira, shortDate } from '../lib/api';

interface Policy {
  tier0DailyLimitMinor: number;
  tier1DailyLimitMinor: number;
  tier2DailyLimitMinor: number | null;
  version: number;
  updatedAt: string;
}

const policy = ref<Policy | null>(null);
const tier0Naira = ref<number | null>(null);
const tier1Naira = ref<number | null>(null);
const tier2Naira = ref<number | null>(null);
const tier2Uncapped = ref(true);
const reason = ref('');
const history = ref<any[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const notice = ref('');

function fromMinor(value: number | null): number | null {
  return value === null ? null : value / 100;
}

function apply(next: Policy) {
  policy.value = next;
  tier0Naira.value = fromMinor(next.tier0DailyLimitMinor);
  tier1Naira.value = fromMinor(next.tier1DailyLimitMinor);
  tier2Naira.value = fromMinor(next.tier2DailyLimitMinor);
  tier2Uncapped.value = next.tier2DailyLimitMinor === null;
}

const canSave = computed(() =>
  Number.isFinite(tier0Naira.value) && Number(tier0Naira.value) > 0
  && Number.isFinite(tier1Naira.value) && Number(tier1Naira.value) > Number(tier0Naira.value)
  && (tier2Uncapped.value || (Number.isFinite(tier2Naira.value) && Number(tier2Naira.value) > Number(tier1Naira.value)))
  && reason.value.trim().length >= 4
  && !saving.value,
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [settings, audit] = await Promise.all([
      api.get<{ policy: Policy }>('/api/v1/admin/kyc/settings'),
      api.get<{ history: any[] }>('/api/v1/admin/kyc/settings/history'),
    ]);
    apply(settings.policy);
    history.value = audit.history;
  } catch (cause: any) {
    error.value = cause?.message ?? 'KYC settings could not be loaded.';
  } finally { loading.value = false; }
}

async function save() {
  if (!policy.value || !canSave.value) return;
  saving.value = true;
  error.value = '';
  notice.value = '';
  try {
    const result = await api.put<{ policy: Policy }>('/api/v1/admin/kyc/settings', {
      tier0DailyLimitMinor: Math.round(Number(tier0Naira.value) * 100),
      tier1DailyLimitMinor: Math.round(Number(tier1Naira.value) * 100),
      tier2DailyLimitMinor: tier2Uncapped.value ? null : Math.round(Number(tier2Naira.value) * 100),
      expectedVersion: policy.value.version,
      reason: reason.value.trim(),
    });
    apply(result.policy);
    reason.value = '';
    notice.value = 'KYC limits updated. Policy-managed wallets now use the new limits.';
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? 'KYC settings could not be saved.';
  } finally { saving.value = false; }
}

onMounted(load);
</script>

<template>
  <AppShell title="KYC Settings">
    <header class="page-head">
      <div>
        <p class="eyebrow">Compliance</p>
        <h1>KYC tier limits</h1>
        <p>One daily debit policy for customers and vendors.</p>
      </div>
      <button class="bw-btn" :disabled="loading || saving" @click="load">Refresh</button>
    </header>

    <div v-if="notice" class="bw-alert success" role="status">{{ notice }}</div>
    <div v-if="error" class="bw-alert danger" role="alert">{{ error }}</div>

    <section v-if="loading" class="bw-card empty">Loading KYC policy…</section>
    <form v-else class="bw-card settings-card" @submit.prevent="save">
      <div class="intro">
        <strong>Applies to new accounts.</strong>
        <span>Approved upgrades update policy-managed wallets. Staff-set exception caps remain unchanged.</span>
      </div>

      <div class="tier-grid">
        <label class="tier-field">
          <span>Tier 0</span>
          <strong>Registered</strong>
          <small>Up to this daily amount.</small>
          <div class="currency-input"><span>₦</span><input v-model.number="tier0Naira" type="number" min="1" step="1" inputmode="numeric" aria-label="Tier 0 daily limit" /></div>
        </label>
        <label class="tier-field">
          <span>Tier 1</span>
          <strong>Identity verified</strong>
          <small>Above Tier 0, up to this daily amount.</small>
          <div class="currency-input"><span>₦</span><input v-model.number="tier1Naira" type="number" min="1" step="1" inputmode="numeric" aria-label="Tier 1 daily limit" /></div>
        </label>
        <div class="tier-field">
          <span>Tier 2</span>
          <strong>Enhanced verification</strong>
          <small>Above Tier 1.</small>
          <label class="toggle"><input v-model="tier2Uncapped" type="checkbox" /> No daily cap</label>
          <div v-if="!tier2Uncapped" class="currency-input"><span>₦</span><input v-model.number="tier2Naira" type="number" min="1" step="1" inputmode="numeric" aria-label="Tier 2 daily limit" /></div>
        </div>
      </div>

      <label class="reason-label">Why are you changing this policy?
        <textarea v-model="reason" class="bw-input" rows="3" maxlength="500" placeholder="Record the approved business or compliance reason." />
      </label>
      <p class="hint">Changes are audited. Use whole naira amounts only.</p>
      <button class="bw-btn primary" type="submit" :disabled="!canSave">{{ saving ? 'Saving…' : 'Save KYC limits' }}</button>
    </form>

    <section v-if="!loading" class="bw-card history-card">
      <h2>Change history</h2>
      <p v-if="!history.length" class="muted">No policy changes recorded.</p>
      <ul v-else>
        <li v-for="entry in history" :key="entry.id">
          <strong>{{ shortDate(entry.created_at) }}</strong>
          <span>Tier 0 {{ naira(entry.after?.tier0DailyLimitMinor) }} · Tier 1 {{ naira(entry.after?.tier1DailyLimitMinor) }} · Tier 2 {{ entry.after?.tier2DailyLimitMinor == null ? 'No cap' : naira(entry.after.tier2DailyLimitMinor) }}</span>
          <small>{{ entry.metadata_json?.reason || entry.metadata?.reason || 'No reason recorded.' }}</small>
        </li>
      </ul>
    </section>
  </AppShell>
</template>

<style scoped>
.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--s-4);margin-bottom:var(--s-4)}.page-head h1{margin:0;font-size:var(--t-2xl)}.page-head p{margin:4px 0 0;color:var(--text-muted)}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:10px!important;font-weight:800;color:var(--brand)!important}.settings-card,.history-card{display:grid;gap:var(--s-4)}.intro{display:grid;gap:4px;padding:var(--s-3);border-radius:var(--r-md);background:oklch(from var(--info) l c h/.08);border:1px solid oklch(from var(--info) l c h/.25)}.intro span,.hint,.muted{color:var(--text-muted);font-size:var(--t-sm)}.tier-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--s-3)}.tier-field{display:flex;flex-direction:column;gap:7px;padding:var(--s-4);border:1px solid var(--border);border-radius:var(--r-lg);background:var(--surface-2)}.tier-field>span{color:var(--brand);font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.tier-field small{color:var(--text-muted);min-height:36px}.currency-input{display:flex;align-items:center;gap:8px;padding:0 10px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface)}.currency-input span{font-weight:800;color:var(--text-muted)}.currency-input input{width:100%;border:0;background:transparent;color:var(--text);padding:10px 0;font:700 var(--t-base) var(--font-mono);outline:0}.toggle{display:flex;align-items:center;gap:8px;font-weight:700;margin-top:auto}.reason-label{display:grid;gap:8px;font-weight:700}.reason-label textarea{resize:vertical}.history-card h2{margin:0}.history-card ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}.history-card li{display:grid;gap:3px;padding-bottom:10px;border-bottom:1px solid var(--border)}.history-card li:last-child{border:0;padding-bottom:0}.history-card small{color:var(--text-muted)}.empty{text-align:center;padding:var(--s-8);color:var(--text-muted)}@media(max-width:700px){.page-head{align-items:flex-start;flex-direction:column}.page-head .bw-btn{width:100%}.tier-grid{grid-template-columns:1fr}.tier-field small{min-height:0}}
</style>
