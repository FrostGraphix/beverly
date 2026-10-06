<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';

type Requirement = { identity: string[]; selfie: boolean; address: string[] };
type Policy = {
  customer_enabled: boolean;
  vendor_enabled: boolean;
  allowed_mime_types: string[];
  customer: { tier1: Requirement; tier2: Requirement };
  vendor: { tier2: Requirement };
};

export interface KycTierSettings {
  tier0_daily_limit_minor: number;
  tier1_daily_limit_minor: number;
  tier2_daily_limit_minor: number | null;
  version: number;
  updated_at: string;
  updated_by: string | null;
  change_reason: string;
}

export interface KycTierPolicyHistoryItem {
  id: string;
  settings_version: number;
  actor_user_id: string | null;
  reason: string;
  before_json: Record<string, any>;
  after_json: Record<string, any>;
  created_at: string;
}

const identity = [
  ['national_id', 'NIN slip'],
  ['voters_card', 'Voter card'],
  ['passport', 'Passport'],
  ['drivers_license', 'Driver licence'],
] as const;
const address = [
  ['utility_bill', 'Utility bill'],
  ['bank_statement', 'Bank statement'],
] as const;
const formats = [
  ['image/jpeg', 'JPEG'],
  ['image/png', 'PNG'],
  ['image/webp', 'WebP'],
  ['application/pdf', 'PDF'],
] as const;

const policy = ref<Policy | null>(null);
const tierSettings = ref<KycTierSettings | null>(null);
const history = ref<KycTierPolicyHistoryItem[]>([]);

// Form models for tier limits in Naira
const tier0Naira = ref<number>(200000);
const tier1Naira = ref<number>(700000);
const tier2Uncapped = ref<boolean>(true);
const tier2Naira = ref<number | null>(null);
const tierReason = ref<string>('');

const loading = ref(true);
const savingPolicy = ref(false);
const savingLimits = ref(false);
const message = ref('');
const error = ref('');

const enabled = computed(() => Boolean(policy.value?.customer_enabled || policy.value?.vendor_enabled));

function toggle(list: string[], value: string) {
  const i = list.indexOf(value);
  if (i >= 0) list.splice(i, 1);
  else list.push(value);
}
function selected(list: string[], value: string) {
  return list.includes(value);
}

function naira(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return 'Uncapped';
  return (minor / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [pRes, tRes, hRes] = await Promise.all([
      api.get<{ policy: Policy }>('/api/v1/admin/kyc-policy'),
      api.get<{ settings: KycTierSettings }>('/api/v1/admin/kyc-tier-settings'),
      api.get<{ history: KycTierPolicyHistoryItem[] }>('/api/v1/admin/kyc-tier-settings/history?limit=15'),
    ]);
    policy.value = pRes.policy;
    tierSettings.value = tRes.settings;
    history.value = hRes.history ?? [];

    if (tRes.settings) {
      tier0Naira.value = Math.round(tRes.settings.tier0_daily_limit_minor / 100);
      tier1Naira.value = Math.round(tRes.settings.tier1_daily_limit_minor / 100);
      if (tRes.settings.tier2_daily_limit_minor === null || tRes.settings.tier2_daily_limit_minor === undefined) {
        tier2Uncapped.value = true;
        tier2Naira.value = null;
      } else {
        tier2Uncapped.value = false;
        tier2Naira.value = Math.round(tRes.settings.tier2_daily_limit_minor / 100);
      }
    }
  } catch (e: any) {
    error.value = e.message ?? 'KYC configuration failed to load.';
  } finally {
    loading.value = false;
  }
}

async function savePolicy() {
  if (!policy.value) return;
  savingPolicy.value = true;
  message.value = '';
  error.value = '';
  try {
    policy.value = (await api.put<{ policy: Policy }>('/api/v1/admin/kyc-policy', { policy: policy.value })).policy;
    message.value = 'KYC document policy saved successfully.';
  } catch (e: any) {
    error.value = e.message ?? 'KYC document policy could not save.';
  } finally {
    savingPolicy.value = false;
  }
}

async function saveTierLimits() {
  if (!tierReason.value.trim() || tierReason.value.trim().length < 5) {
    error.value = 'Please provide a meaningful reason of at least 5 characters for the limit adjustment.';
    return;
  }
  savingLimits.value = true;
  message.value = '';
  error.value = '';
  try {
    const payload = {
      tier0_daily_limit_minor: Math.round(tier0Naira.value * 100),
      tier1_daily_limit_minor: Math.round(tier1Naira.value * 100),
      tier2_daily_limit_minor: tier2Uncapped.value ? null : Math.round((tier2Naira.value ?? 0) * 100),
      change_reason: tierReason.value.trim(),
    };
    const res = await api.put<{ ok: boolean; settings: KycTierSettings }>('/api/v1/admin/kyc-tier-settings', payload);
    tierSettings.value = res.settings;
    tierReason.value = '';
    message.value = `Tier limits updated to Version ${res.settings.version} successfully.`;
    // Refresh history
    const hRes = await api.get<{ history: KycTierPolicyHistoryItem[] }>('/api/v1/admin/kyc-tier-settings/history?limit=15');
    history.value = hRes.history ?? [];
  } catch (e: any) {
    error.value = e.message ?? 'Could not update tier limits.';
  } finally {
    savingLimits.value = false;
  }
}

onMounted(load);
</script>

<template>
  <AppShell title="KYC Settings">
    <header class="page-head">
      <div>
        <p class="eyebrow">Compliance controls</p>
        <h1>KYC Policy &amp; Tier Limits</h1>
        <p>Control verification, document rules, and daily debit limits dynamically.</p>
      </div>
      <button class="bw-btn" :disabled="loading" @click="load">Refresh</button>
    </header>

    <p v-if="error" class="bw-alert danger" role="alert">{{ error }}</p>
    <p v-if="message" class="bw-alert success" role="status">{{ message }}</p>

    <div v-if="loading" class="bw-card">Loading policy and tier configuration…</div>
    <template v-else>
      <!-- Section 1: Configurable KYC Tier Limits -->
      <section class="bw-card tier-limits-card">
        <div class="tier-limits-head">
          <div>
            <div style="display:flex; align-items:center; gap:var(--s-2)">
              <h2>Configurable Tier Limits</h2>
              <span v-if="tierSettings" class="bw-badge info">v{{ tierSettings.version }}</span>
            </div>
            <p>Set daily wallet debit caps enforced in real-time across customer purchases.</p>
          </div>
          <div v-if="tierSettings?.updated_at" class="last-updated">
            <small>Last updated: {{ formatDate(tierSettings.updated_at) }}</small>
          </div>
        </div>

        <div class="tier-limits-grid">
          <!-- Tier 0 -->
          <article class="tier-box">
            <div class="tier-box-head">
              <h3>Tier 0 (Unverified / Basic)</h3>
              <span class="bw-badge neutral">Default</span>
            </div>
            <p class="tier-box-desc">Basic phone &amp; name profile. Allows initial entry without documentation.</p>
            <div class="form-group">
              <label>Daily Debit Cap (₦)</label>
              <input v-model.number="tier0Naira" type="number" min="1000" step="10000" class="bw-input bw-mono" required />
            </div>
          </article>

          <!-- Tier 1 -->
          <article class="tier-box">
            <div class="tier-box-head">
              <h3>Tier 1 (Standard Verification)</h3>
              <span class="bw-badge warn">Intermediate</span>
            </div>
            <p class="tier-box-desc">Government identity &amp; selfie. Unlocks standard household &amp; commercial limit.</p>
            <div class="form-group">
              <label>Daily Debit Cap (₦)</label>
              <input v-model.number="tier1Naira" type="number" min="5000" step="10000" class="bw-input bw-mono" required />
            </div>
          </article>

          <!-- Tier 2 -->
          <article class="tier-box">
            <div class="tier-box-head">
              <h3>Tier 2 (Enhanced Verification)</h3>
              <span class="bw-badge success">High Volume</span>
            </div>
            <p class="tier-box-desc">Address evidence &amp; manual staff approval. Unlocks high volume or uncapped throughput.</p>
            <div class="form-group">
              <label style="display:flex; justify-content:space-between; align-items:center">
                <span>Daily Debit Cap (₦)</span>
                <label class="uncapped-checkbox">
                  <input v-model="tier2Uncapped" type="checkbox" />
                  <span>Uncapped (Unlimited)</span>
                </label>
              </label>
              <input
                v-if="!tier2Uncapped"
                v-model.number="tier2Naira"
                type="number"
                min="10000"
                step="50000"
                class="bw-input bw-mono"
                placeholder="Enter custom limit in Naira"
                required
              />
              <div v-else class="bw-input bw-mono uncapped-display">
                ∞ No daily limit applied
              </div>
            </div>
          </article>
        </div>

        <div class="reason-group">
          <label for="change-reason">Reason for Limit Adjustment (Required for Audit Trail)</label>
          <input
            id="change-reason"
            v-model="tierReason"
            type="text"
            class="bw-input"
            placeholder="e.g. Raised Tier 0 daily cap to ₦200k in accordance with approved policy change"
            minlength="5"
            maxlength="500"
          />
        </div>

        <button
          class="bw-btn primary save"
          :disabled="savingLimits || !tierReason.trim() || tierReason.trim().length < 5"
          @click="saveTierLimits"
        >
          {{ savingLimits ? 'Applying changes…' : 'Update Tier Limits &amp; Apply Immediately' }}
        </button>
      </section>

      <!-- Section 2: Compliance Controls -->
      <section v-if="policy" class="bw-card control-card">
        <div>
          <h2>Customer KYC Requirement</h2>
          <p>When off, customer transactions bypass mandatory KYC gates entirely.</p>
        </div>
        <label class="switch">
          <input v-model="policy.customer_enabled" type="checkbox" />
          <span>{{ policy.customer_enabled ? 'On' : 'Off' }}</span>
        </label>
      </section>

      <section v-if="policy" class="bw-card control-card">
        <div>
          <h2>Vendor KYC Requirement</h2>
          <p>When off, vendor evidence submission is unavailable.</p>
        </div>
        <label class="switch">
          <input v-model="policy.vendor_enabled" type="checkbox" />
          <span>{{ policy.vendor_enabled ? 'On' : 'Off' }}</span>
        </label>
      </section>

      <section v-if="policy && enabled" class="bw-card policy-card">
        <h2>Accepted File Formats</h2>
        <p>At least one format must remain enabled.</p>
        <div class="choice-grid">
          <label v-for="[value, label] in formats" :key="value">
            <input
              type="checkbox"
              :checked="selected(policy.allowed_mime_types, value)"
              @change="toggle(policy.allowed_mime_types, value)"
            />
            {{ label }}
          </label>
        </div>
      </section>

      <section v-if="policy && enabled" class="bw-card policy-card">
        <h2>Customer Evidence Requirements</h2>
        <div class="requirement-grid">
          <article>
            <h3>Tier 1 Evidence</h3>
            <p>Identity document and selfie verification.</p>
            <div class="choice-grid">
              <label v-for="[value, label] in identity" :key="value">
                <input
                  type="checkbox"
                  :checked="selected(policy.customer.tier1.identity, value)"
                  @change="toggle(policy.customer.tier1.identity, value)"
                />
                {{ label }}
              </label>
              <label>
                <input v-model="policy.customer.tier1.selfie" type="checkbox" />
                Selfie
              </label>
            </div>
          </article>
          <article>
            <h3>Tier 2 Evidence</h3>
            <p>Enhanced evidence for full verification.</p>
            <div class="choice-grid">
              <label v-for="[value, label] in identity" :key="value">
                <input
                  type="checkbox"
                  :checked="selected(policy.customer.tier2.identity, value)"
                  @change="toggle(policy.customer.tier2.identity, value)"
                />
                {{ label }}
              </label>
              <label>
                <input v-model="policy.customer.tier2.selfie" type="checkbox" />
                Selfie
              </label>
              <label v-for="[value, label] in address" :key="value">
                <input
                  type="checkbox"
                  :checked="selected(policy.customer.tier2.address, value)"
                  @change="toggle(policy.customer.tier2.address, value)"
                />
                {{ label }}
              </label>
            </div>
          </article>
        </div>
      </section>

      <section v-if="policy && enabled" class="bw-card policy-card">
        <h2>Vendor Evidence Requirements</h2>
        <p>Tier 2 business review requirements.</p>
        <div class="choice-grid">
          <label v-for="[value, label] in identity" :key="value">
            <input
              type="checkbox"
              :checked="selected(policy.vendor.tier2.identity, value)"
              @change="toggle(policy.vendor.tier2.identity, value)"
            />
            {{ label }}
          </label>
          <label>
            <input v-model="policy.vendor.tier2.selfie" type="checkbox" />
            Representative selfie
          </label>
          <label v-for="[value, label] in address" :key="value">
            <input
              type="checkbox"
              :checked="selected(policy.vendor.tier2.address, value)"
              @change="toggle(policy.vendor.tier2.address, value)"
            />
            {{ label }}
          </label>
        </div>
      </section>

      <button
        v-if="policy"
        class="bw-btn primary save"
        style="margin-bottom: var(--s-5)"
        :disabled="savingPolicy"
        @click="savePolicy"
      >
        {{ savingPolicy ? 'Saving…' : 'Save Document Requirements' }}
      </button>

      <!-- Section 3: Policy Change Audit Trail -->
      <section v-if="history.length" class="bw-card history-card">
        <h2>Limit Policy Change History</h2>
        <p style="margin-top: 4px; color: var(--text-muted); font-size: var(--t-sm)">
          Immutable audit record of all tier cap adjustments.
        </p>
        <div class="table-wrap">
          <table class="bw-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Date</th>
                <th>Tier 0 Cap</th>
                <th>Tier 1 Cap</th>
                <th>Tier 2 Cap</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in history" :key="entry.id">
                <td><span class="bw-badge info">v{{ entry.settings_version }}</span></td>
                <td style="white-space:nowrap">{{ formatDate(entry.created_at) }}</td>
                <td class="bw-mono">{{ naira(entry.after_json?.tier0DailyLimitMinor) }}</td>
                <td class="bw-mono">{{ naira(entry.after_json?.tier1DailyLimitMinor) }}</td>
                <td class="bw-mono">{{ naira(entry.after_json?.tier2DailyLimitMinor) }}</td>
                <td>{{ entry.reason }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </AppShell>
</template>

<style scoped>
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--s-4);
  margin-bottom: var(--s-4);
}
h1, h2, h3, p { margin: 0; }
.page-head p, .control-card p, .policy-card > p, .tier-limits-card p {
  margin-top: 5px;
  color: var(--text-muted);
}
.eyebrow {
  color: var(--brand) !important;
  font-size: var(--t-xs);
  font-weight: 800;
  text-transform: uppercase;
}
.control-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  margin-bottom: var(--s-3);
}
.control-card h2, .policy-card h2, .tier-limits-card h2 {
  font-size: var(--t-lg);
}
.switch {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
}
.switch input {
  width: 22px;
  height: 22px;
  accent-color: var(--brand);
}
.policy-card, .tier-limits-card, .history-card {
  display: grid;
  gap: var(--s-3);
  margin-bottom: var(--s-4);
}
.tier-limits-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: var(--s-3);
}
.last-updated {
  color: var(--text-muted);
  font-size: var(--t-xs);
}
.tier-limits-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-3);
  margin-top: var(--s-2);
}
.tier-box {
  padding: var(--s-4);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface-2);
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}
.tier-box-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--s-2);
}
.tier-box h3 {
  font-size: var(--t-md);
  font-weight: 700;
}
.tier-box-desc {
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.4;
  margin: 0;
  min-height: 34px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-group label {
  font-size: var(--t-xs);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.uncapped-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--t-xs);
  font-weight: 500;
  text-transform: none;
  cursor: pointer;
  color: var(--brand);
}
.uncapped-checkbox input {
  accent-color: var(--brand);
}
.uncapped-display {
  display: flex;
  align-items: center;
  color: var(--brand);
  background: oklch(70% 0.19 145 / 0.08);
  border: 1px dashed var(--brand);
}
.reason-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: var(--s-2);
}
.reason-group label {
  font-size: var(--t-sm);
  font-weight: 700;
}
.requirement-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-3);
}
.requirement-grid article {
  padding: var(--s-3);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface-2);
}
.requirement-grid h3 {
  font-size: var(--t-md);
}
.requirement-grid p {
  margin: 4px 0 12px;
  color: var(--text-muted);
  font-size: var(--t-sm);
}
.choice-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.choice-grid label {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: var(--t-sm);
  cursor: pointer;
}
.choice-grid input {
  accent-color: var(--brand);
}
.save {
  width: 100%;
  justify-content: center;
}
.table-wrap {
  overflow-x: auto;
}
.history-card table {
  width: 100%;
  font-size: var(--t-sm);
}
@media (max-width: 900px) {
  .tier-limits-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 650px) {
  .page-head, .control-card {
    align-items: flex-start;
    flex-direction: column;
  }
  .requirement-grid, .choice-grid {
    grid-template-columns: 1fr;
  }
}
</style>
