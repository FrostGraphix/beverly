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

interface RequirementPolicy { identity: string[]; selfie: boolean; address: string[] }
interface AvailabilityPolicy {
  customer_enabled: boolean;
  vendor_enabled: boolean;
  customer_scope: 'all' | 'new';
  vendor_scope: 'all' | 'new';
  customer_enforced_from: string | null;
  vendor_enforced_from: string | null;
  allowed_mime_types: string[];
  customer: { tier1: RequirementPolicy; tier2: RequirementPolicy };
  vendor: { tier2: RequirementPolicy };
}

const identityOptions = [['national_id', 'NIN / national ID'], ['voters_card', 'Voter card'], ['passport', 'Passport'], ['drivers_license', "Driver's licence"]] as const;
const addressOptions = [['utility_bill', 'Utility bill'], ['bank_statement', 'Bank statement']] as const;

const policy = ref<Policy | null>(null);
const availabilityPolicy = ref<AvailabilityPolicy | null>(null);
const tier0Naira = ref<number | null>(null);
const tier1Naira = ref<number | null>(null);
const tier2Naira = ref<number | null>(null);
const tier2Uncapped = ref(true);
const reason = ref('');
const history = ref<any[]>([]);
const loading = ref(true);
const saving = ref(false);
const savingAvailability = ref(false);
const error = ref('');
const notice = ref('');

function toggleEvidence(list: string[], value: string) {
  const index = list.indexOf(value);
  if (index >= 0) list.splice(index, 1); else list.push(value);
}

function hasEvidence(requirement: RequirementPolicy) {
  return requirement.identity.length > 0 || requirement.selfie || requirement.address.length > 0;
}

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
    const [settings, audit, availability] = await Promise.all([
      api.get<{ policy: Policy }>('/api/v1/admin/kyc/settings'),
      api.get<{ history: any[] }>('/api/v1/admin/kyc/settings/history'),
      api.get<{ policy: AvailabilityPolicy }>('/api/v1/admin/kyc-policy'),
    ]);
    apply(settings.policy);
    history.value = audit.history;
    availabilityPolicy.value = availability.policy;
  } catch (cause: any) {
    error.value = cause?.message ?? 'KYC settings could not be loaded.';
  } finally { loading.value = false; }
}

async function saveAvailability() {
  if (!availabilityPolicy.value) return;
  if ([availabilityPolicy.value.customer.tier1, availabilityPolicy.value.customer.tier2, availabilityPolicy.value.vendor.tier2].some((requirement) => !hasEvidence(requirement))) {
    error.value = 'Each KYC tier must require at least one identity, selfie, or address item.';
    return;
  }
  savingAvailability.value = true;
  error.value = '';
  notice.value = '';
  try {
    const result = await api.put<{ policy: AvailabilityPolicy }>('/api/v1/admin/kyc-policy', { policy: availabilityPolicy.value });
    availabilityPolicy.value = result.policy;
    notice.value = 'KYC requirements updated for customers and vendors.';
  } catch (cause: any) {
    error.value = cause?.message ?? 'KYC requirements could not be saved.';
  } finally { savingAvailability.value = false; }
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
    <template v-else>
    <section v-if="availabilityPolicy" class="bw-card settings-card" aria-labelledby="kyc-availability-heading">
      <div class="intro">
        <strong id="kyc-availability-heading">KYC requirements</strong>
        <span>Turn mandatory verification on or off independently for each portal.</span>
      </div>
      <div class="availability-grid">
        <label class="availability-control">
          <span><strong>Customer KYC</strong><small>Require customers to complete KYC checks.</small></span>
          <span class="toggle"><input v-model="availabilityPolicy.customer_enabled" type="checkbox" /> {{ availabilityPolicy.customer_enabled ? 'On' : 'Off' }}</span>
        </label>
        <label class="availability-control">
          <span><strong>Vendor KYC</strong><small>Require vendors to complete KYC checks.</small></span>
          <span class="toggle"><input v-model="availabilityPolicy.vendor_enabled" type="checkbox" /> {{ availabilityPolicy.vendor_enabled ? 'On' : 'Off' }}</span>
        </label>
      </div>
      <div class="availability-grid">
        <label class="scope-control">Customer rollout
          <select v-model="availabilityPolicy.customer_scope" class="bw-input" :disabled="!availabilityPolicy.customer_enabled">
            <option value="all">All unverified customers</option>
            <option value="new">New customers from activation</option>
          </select>
        </label>
        <label class="scope-control">Vendor rollout
          <select v-model="availabilityPolicy.vendor_scope" class="bw-input" :disabled="!availabilityPolicy.vendor_enabled">
            <option value="all">All unverified vendors</option>
            <option value="new">New vendors from activation</option>
          </select>
        </label>
      </div>
      <div class="evidence-grid">
        <fieldset v-for="item in [
          { key: 'customer-tier1', title: 'Customer Tier 1', requirement: availabilityPolicy.customer.tier1 },
          { key: 'customer-tier2', title: 'Customer Tier 2', requirement: availabilityPolicy.customer.tier2 },
          { key: 'vendor-tier2', title: 'Vendor Tier 2', requirement: availabilityPolicy.vendor.tier2 },
        ]" :key="item.key">
          <legend>{{ item.title }}</legend>
          <small>Choose the evidence accepted for this tier.</small>
          <label v-for="[value, label] in identityOptions" :key="value"><input type="checkbox" :checked="item.requirement.identity.includes(value)" @change="toggleEvidence(item.requirement.identity, value)" /> {{ label }}</label>
          <label><input v-model="item.requirement.selfie" type="checkbox" /> Selfie</label>
          <label v-for="[value, label] in addressOptions" :key="value"><input type="checkbox" :checked="item.requirement.address.includes(value)" @change="toggleEvidence(item.requirement.address, value)" /> {{ label }}</label>
        </fieldset>
      </div>
      <button class="bw-btn primary" type="button" :disabled="savingAvailability" @click="saveAvailability">{{ savingAvailability ? 'Saving…' : 'Save KYC requirements' }}</button>
    </section>

    <form class="bw-card settings-card" @submit.prevent="save">
      <div class="intro">
        <strong>Applies to new and policy-managed accounts.</strong>
        <span>Existing policy-managed wallets update automatically. Staff-set exception caps remain unchanged.</span>
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
    </template>
  </AppShell>
</template>

<style scoped>
.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--s-4);margin-bottom:var(--s-4)}.page-head h1{margin:0;font-size:var(--t-2xl)}.page-head p{margin:4px 0 0;color:var(--text-muted)}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:10px!important;font-weight:800;color:var(--brand)!important}.settings-card,.history-card{display:grid;gap:var(--s-4);margin-bottom:var(--s-4)}.intro{display:grid;gap:4px;padding:var(--s-3);border-radius:var(--r-md);background:oklch(from var(--info) l c h/.08);border:1px solid oklch(from var(--info) l c h/.25)}.intro span,.hint,.muted{color:var(--text-muted);font-size:var(--t-sm)}.availability-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--s-3)}.availability-control{display:flex;align-items:center;justify-content:space-between;gap:var(--s-3);padding:var(--s-4);border:1px solid var(--border);border-radius:var(--r-lg);background:var(--surface-2)}.availability-control>span:first-child{display:grid;gap:4px}.availability-control small{color:var(--text-muted)}.tier-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--s-3)}.tier-field{display:flex;flex-direction:column;gap:7px;padding:var(--s-4);border:1px solid var(--border);border-radius:var(--r-lg);background:var(--surface-2)}.tier-field>span{color:var(--brand);font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.tier-field small{color:var(--text-muted);min-height:36px}.currency-input{display:flex;align-items:center;gap:8px;padding:0 10px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface)}.currency-input span{font-weight:800;color:var(--text-muted)}.currency-input input{width:100%;border:0;background:transparent;color:var(--text);padding:10px 0;font:700 var(--t-base) var(--font-mono);outline:0}.toggle{display:flex;align-items:center;gap:8px;font-weight:700;margin-top:auto}.reason-label{display:grid;gap:8px;font-weight:700}.reason-label textarea{resize:vertical}.history-card h2{margin:0}.history-card ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}.history-card li{display:grid;gap:3px;padding-bottom:10px;border-bottom:1px solid var(--border)}.history-card li:last-child{border:0;padding-bottom:0}.history-card small{color:var(--text-muted)}.empty{text-align:center;padding:var(--s-8);color:var(--text-muted)}@media(max-width:700px){.page-head{align-items:flex-start;flex-direction:column}.page-head .bw-btn{width:100%}.availability-grid,.tier-grid{grid-template-columns:1fr}.tier-field small{min-height:0}}
.scope-control{display:grid;gap:7px;font-weight:700}.evidence-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--s-3)}.evidence-grid fieldset{display:grid;gap:8px;margin:0;padding:var(--s-4);border:1px solid var(--border);border-radius:var(--r-lg)}.evidence-grid legend{font-weight:800}.evidence-grid small{color:var(--text-muted);margin-bottom:4px}.evidence-grid label{display:flex;align-items:center;gap:8px}@media(max-width:900px){.evidence-grid{grid-template-columns:1fr}}
</style>
