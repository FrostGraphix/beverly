<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import Stepper from '../components/Stepper.vue';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

const auth   = useAuthStore();
const router = useRouter();
const tier   = ref(auth.kycTier);
const kycStatus = ref(auth.customer?.kyc_status ?? 'unverified');
const latestReview = ref<any>(null);
const basicInfoComplete = ref(Boolean((auth.customer as any)?.kyc_data?.basic_info?.completed_at));

// ── Draft persistence ─────────────────────────────────────────────
const DRAFT_KEY   = 'beverly.kyc.t1.draft';
const draftSaved  = ref(false);    // shows "saved" flash
const draftExists = ref(false);    // true when a draft was restored on mount

interface T1Draft {
    fullName: string; dob: string;
    address: string; state: string; lga: string;
    step: number;
}

function saveDraft() {
    const draft: T1Draft = {
        fullName: fullName.value, dob: dob.value,
        address: address.value, state: state.value, lga: lga.value,
        step: t1Index.value,
    };
    try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        draftSaved.value = true;
        setTimeout(() => { draftSaved.value = false; }, 2000);
    } catch { /* storage unavailable */ }
}

function clearDraft() {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
    draftExists.value = false;
}

function saveAndLeave() {
    saveDraft();
    void router.push('/');
}

// ── Tier 0 basic information ─────────────────────────────────────
const T1_STEPS = [
    { key: 'identity', label: 'Identity' },
    { key: 'address',  label: 'Address' },
    { key: 'confirm',  label: 'Confirm' },
];
const t1Index = ref(0);

const fullName = ref(auth.customer?.full_name ?? '');
const dob      = ref('');
const address  = ref('');
const state    = ref('');
const lga      = ref('');

const t1Errors = ref<Record<string, string>>({});
const loading1 = ref(false);
const error1   = ref<string | null>(null);

// Auto-save draft whenever any field changes
watch([fullName, dob, address, state, lga, t1Index], () => {
    // Only auto-save once something meaningful is entered
    if (fullName.value || dob.value || address.value) {
        try {
            sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
                fullName: fullName.value, dob: dob.value,
                address: address.value, state: state.value, lga: lga.value,
                step: t1Index.value,
            }));
        } catch { /* noop */ }
    }
});

// ── Tier 2 ────────────────────────────────────────────────────────
const loading2     = ref(false);
const error2       = ref<string | null>(null);
const tier2Skipped = ref(false);
const identityFile = ref<File | null>(null);
const identityDocumentType = ref<'national_id' | 'voters_card' | 'passport' | 'drivers_license'>('national_id');
const selfieFile = ref<File | null>(null);
const addressFile = ref<File | null>(null);
const addressDocumentType = ref<'utility_bill' | 'bank_statement'>('utility_bill');
const uploadProgress = ref('');

const nigerianStates = [
    'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
    'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo',
    'Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa',
    'Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba',
    'Yobe','Zamfara',
];

const dobMax = computed(() =>
    new Date(Date.now() - 18 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10)
);

function tierComplete(level: number): boolean {
    return level === 0 ? basicInfoComplete.value : tier.value >= level;
}

// ── On mount: restore draft ───────────────────────────────────────
async function loadKycState() {
    try {
        const state = await api.get<any>('/api/v1/customer/kyc/status');
        tier.value = Number(state.kyc_tier ?? 0);
        kycStatus.value = state.kyc_status ?? 'unverified';
        latestReview.value = state.review ?? null;
        basicInfoComplete.value = Boolean(state.kyc_data?.basic_info?.completed_at);
    } catch { /* profile remains authoritative */ }
}

onMounted(() => {
    void loadKycState();
    if (basicInfoComplete.value) return;
    try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const draft: T1Draft = JSON.parse(raw);
        if (draft.fullName || draft.dob || draft.address) {
            fullName.value  = draft.fullName ?? '';
            dob.value       = draft.dob ?? '';
            address.value   = draft.address ?? '';
            state.value     = draft.state ?? '';
            lga.value       = draft.lga ?? '';
            t1Index.value   = draft.step ?? 0;
            draftExists.value = true;
        }
    } catch { /* malformed draft — ignore */ }
});

// ── Validation ────────────────────────────────────────────────────
function validateT1Step(i: number): boolean {
    t1Errors.value = {};
    const errs: Record<string, string> = {};
    if (i === 0) {
        if (!fullName.value.trim() || fullName.value.trim().split(' ').filter(Boolean).length < 2)
            errs.fullName = 'Enter your full legal name (first and last).';
        if (!dob.value) errs.dob = 'Date of birth is required.';
        else if (new Date(dob.value) > new Date(dobMax.value)) errs.dob = 'You must be 18 or older.';
    }
    if (i === 1) {
        if (!address.value.trim() || address.value.trim().length < 5)
            errs.address = 'Enter your residential address.';
        if (!state.value) errs.state = 'Select your state.';
        if (!lga.value.trim()) errs.lga = 'Enter your LGA.';
    }
    t1Errors.value = errs;
    return Object.keys(errs).length === 0;
}

function next() {
    if (validateT1Step(t1Index.value))
        t1Index.value = Math.min(T1_STEPS.length - 1, t1Index.value + 1);
}
function prev() {
    error1.value = null;
    t1Errors.value = {};
    t1Index.value = Math.max(0, t1Index.value - 1);
}

async function submitBasicInfo() {
    if (!validateT1Step(0) || !validateT1Step(1)) return;
    loading1.value = true;
    error1.value = null;
    try {
        const r = await api.post<{ kyc_tier: number; kyc_status: string; basic_info: { completedAt: string } }>('/api/v1/customer/kyc/basic-info', {
            full_name:    fullName.value.trim(),
            date_of_birth: dob.value,
            address:      address.value.trim(),
            state:        state.value.trim(),
            lga:          lga.value.trim(),
        });
        tier.value = r.kyc_tier;
        kycStatus.value = r.kyc_status as 'unverified' | 'pending' | 'verified' | 'rejected';
        basicInfoComplete.value = true;
        if (auth.customer) {
            auth.customer.kyc_tier = r.kyc_tier;
            auth.customer.kyc_status = r.kyc_status as any;
        }
        clearDraft();
        t1Index.value = 0;
    } catch (e: any) {
        error1.value = e?.message ?? 'Verification failed. Please check your details and try again.';
    } finally { loading1.value = false; }
}

async function uploadKycFile(file: File, documentType: 'national_id' | 'voters_card' | 'passport' | 'drivers_license' | 'selfie' | 'utility_bill' | 'bank_statement', requestedTier: 1 | 2): Promise<string> {
    const created = await api.post<{ documentId: string; uploadUrl: string }>('/api/v1/customer/kyc/documents/upload-url', {
        document_type: documentType,
        requested_tier: requestedTier,
        mime_type: file.type,
        size_bytes: file.size,
    });
    const uploaded = await fetch(created.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!uploaded.ok) throw new Error('Secure document upload failed.');
    await api.post(`/api/v1/customer/kyc/documents/${created.documentId}/activate`);
    return created.documentId;
}

async function submitEvidence() {
    const requestedTier = (tier.value + 1) as 1 | 2;
    if (!identityFile.value || !selfieFile.value || (requestedTier === 2 && !addressFile.value)) {
        error2.value = requestedTier === 2
            ? 'Identity, selfie, and address evidence are required.'
            : 'Identity document and selfie are required.';
        return;
    }
    loading2.value = true;
    error2.value = null;
    try {
        uploadProgress.value = 'Uploading identity document…';
        const identityId = await uploadKycFile(identityFile.value, identityDocumentType.value, requestedTier);
        uploadProgress.value = 'Uploading selfie…';
        const selfieId = await uploadKycFile(selfieFile.value, 'selfie', requestedTier);
        const documentIds = [identityId, selfieId];
        if (requestedTier === 2 && addressFile.value) {
            uploadProgress.value = 'Uploading address evidence…';
            documentIds.push(await uploadKycFile(addressFile.value, addressDocumentType.value, requestedTier));
        }
        uploadProgress.value = 'Submitting review…';
        const result = await api.post<{ review: any }>(`/api/v1/customer/kyc/tier${requestedTier}/submit`, { document_ids: documentIds });
        latestReview.value = result.review;
        kycStatus.value = 'pending';
        await auth.refreshProfile();
    } catch (e: any) {
        error2.value = e?.message ?? 'KYC submission failed.';
    } finally {
        loading2.value = false;
        uploadProgress.value = '';
    }
}

function skipTier2() {
    tier2Skipped.value = true;
    void router.push('/profile');
}
</script>

<template>
  <AppShell>
    <!-- Header -->
    <div style="margin-bottom: var(--s-4)">
      <p class="bw-page-title">Verify identity</p>
      <p class="bw-page-sub">Unlock token purchases and higher daily limits</p>
    </div>

    <!-- Tier progress indicators -->
    <div class="tier-row">
      <div v-for="n in [0, 1, 2]" :key="n" :class="['bw-kyc-tier', tierComplete(n) ? `tier-active` : 'tier-pending']">
        <span class="tier-check" v-if="tierComplete(n)">✓</span>
        Tier {{ n }}
        <span class="tier-desc">
          {{ n === 0 ? 'Basic' : n === 1 ? 'Identity' : 'Enhanced' }}
        </span>
      </div>
    </div>

    <!-- ─ Draft restored banner ───────────────────────────────────── -->
    <transition name="fade">
      <div v-if="draftExists && !basicInfoComplete" class="draft-banner">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>Your previous progress has been restored — continue from where you left off.</span>
        <button class="draft-clear" @click="clearDraft(); fullName=''; dob=''; address=''; state=''; lga=''; t1Index=0">
          Start over
        </button>
      </div>
    </transition>

    <!-- Draft saved flash -->
    <transition name="fade">
      <div v-if="draftSaved" class="draft-saved-toast">
        ✓ Progress saved — you can continue later from this device
      </div>
    </transition>

    <!-- ─ TIER 0: basic information ──────────────────────────────── -->
    <div v-if="!basicInfoComplete" class="bw-card">
      <div class="card-head">
        <div>
          <p class="card-title">Tier 0 — Basic details</p>
          <p class="card-sub">Save your profile. Approval is not required.</p>
        </div>
      </div>

      <Stepper :steps="T1_STEPS" :current-index="t1Index" />

      <!-- Step 0: Identity -->
      <form v-if="t1Index === 0" class="step-pane" @submit.prevent="next">
        <div>
          <label class="bw-label">Full legal name</label>
          <input
            class="bw-input"
            :class="{ 'has-error': t1Errors.fullName }"
            v-model="fullName"
            placeholder="First Last name"
            autocomplete="name"
          />
          <p v-if="t1Errors.fullName" class="field-error">{{ t1Errors.fullName }}</p>
        </div>

        <div>
          <label class="bw-label">Date of birth</label>
          <input
            class="bw-input"
            :class="{ 'has-error': t1Errors.dob }"
            v-model="dob"
            type="date"
            :max="dobMax"
          />
          <p v-if="t1Errors.dob" class="field-error">{{ t1Errors.dob }}</p>
          <p v-else class="field-hint">You must be at least 18 years old.</p>
        </div>

        <button class="bw-btn primary lg full" type="submit">Continue →</button>
        <button type="button" class="later-link" @click="saveAndLeave">
          Save progress &amp; finish later
        </button>
      </form>

      <!-- Step 1: Address -->
      <form v-if="t1Index === 1" class="step-pane" @submit.prevent="next">
        <div>
          <label class="bw-label">Residential address</label>
          <input
            class="bw-input"
            :class="{ 'has-error': t1Errors.address }"
            v-model="address"
            placeholder="12 Example Street, Area"
            autocomplete="street-address"
          />
          <p v-if="t1Errors.address" class="field-error">{{ t1Errors.address }}</p>
        </div>

        <div class="row">
          <div class="col">
            <label class="bw-label">State</label>
            <select class="bw-input" :class="{ 'has-error': t1Errors.state }" v-model="state">
              <option value="">Select…</option>
              <option v-for="s in nigerianStates" :key="s" :value="s">{{ s }}</option>
            </select>
            <p v-if="t1Errors.state" class="field-error">{{ t1Errors.state }}</p>
          </div>
          <div class="col">
            <label class="bw-label">LGA</label>
            <input
              class="bw-input"
              :class="{ 'has-error': t1Errors.lga }"
              v-model="lga"
              placeholder="Ikeja"
            />
            <p v-if="t1Errors.lga" class="field-error">{{ t1Errors.lga }}</p>
          </div>
        </div>

        <div class="nav-row">
          <button type="button" class="bw-btn" @click="prev">← Back</button>
          <button type="submit" class="bw-btn primary" style="flex:2">Continue →</button>
        </div>
        <button type="button" class="later-link" @click="saveAndLeave">
          Save progress &amp; finish later
        </button>
      </form>

      <!-- Step 2: Confirm & submit -->
      <div v-if="t1Index === 2" class="step-pane">
        <div class="review-card">
          <div class="review-row">
            <span class="review-key">Full name</span>
            <span class="review-val">{{ fullName }}</span>
          </div>
          <div class="review-row">
            <span class="review-key">Date of birth</span>
            <span class="review-val">{{ dob }}</span>
          </div>
          <div class="review-row">
            <span class="review-key">Address</span>
            <span class="review-val">{{ address }}</span>
          </div>
          <div class="review-row">
            <span class="review-key">State / LGA</span>
            <span class="review-val">{{ state }} · {{ lga }}</span>
          </div>
        </div>

        <p class="legal-note">
          By submitting, you confirm this information is accurate. False information may cause
          account restrictions or regulatory review.
        </p>

        <div v-if="error1" class="bw-alert danger">{{ error1 }}</div>

        <div class="nav-row">
          <button type="button" class="bw-btn" :disabled="loading1" @click="prev">← Back</button>
          <button class="bw-btn primary" style="flex:2" :disabled="loading1" @click="submitBasicInfo">
            {{ loading1 ? 'Saving…' : 'Save basic information' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="kycStatus === 'pending'" class="bw-card pending-card" role="status">
      <span class="pending-dot"></span>
      <div>
        <p class="card-title">Review in progress</p>
        <p class="card-sub">Your Tier {{ latestReview?.requested_tier ?? tier + 1 }} request is awaiting Beverly approval.</p>
      </div>
      <button class="bw-btn" type="button" @click="loadKycState">Refresh status</button>
    </div>

    <div v-if="kycStatus === 'rejected' && latestReview?.reviewer_note" class="bw-alert danger" role="alert">
      Changes requested: {{ latestReview.reviewer_note }}
    </div>

    <!-- ─ TIER 1 DONE → Tier 2 prompt ────────────────────────────── -->
    <div v-if="tier === 1" class="tier1-done-banner">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      <div>
        <strong>Tier 1 complete!</strong> You can now buy tokens up to ₦50,000/day.
      </div>
    </div>

    <!-- ─ TIER 1+: manual evidence review ─────────────────────────── -->
    <div v-if="basicInfoComplete && tier < 2 && !tier2Skipped && kycStatus !== 'pending'" class="bw-card">
      <div class="card-head">
        <div>
          <p class="card-title">Tier {{ tier + 1 }} — {{ tier === 0 ? 'NIN identity review' : 'Enhanced identity review' }}</p>
          <p class="card-sub">Every tier upgrade requires Beverly approval.</p>
        </div>
        <span v-if="tier >= 1" class="optional-badge">Optional</span>
      </div>

      <form class="step-pane" @submit.prevent="submitEvidence">
        <div class="upload-grid">
          <label class="upload-field">
            <span class="bw-label">Government identity</span>
            <select v-model="identityDocumentType" class="bw-input" aria-label="Identity document type">
              <option value="national_id">NIN slip</option>
              <option value="voters_card">Voter card</option>
              <option value="passport">Passport</option>
              <option value="drivers_license">Driver's licence</option>
            </select>
          <input
              type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
              @change="identityFile = ($event.target as HTMLInputElement).files?.[0] ?? null"
          />
            <small>{{ identityFile?.name || 'NIN slip, passport, licence, or voter card.' }}</small>
          </label>
          <label class="upload-field">
            <span class="bw-label">Current selfie</span>
            <input
              type="file" accept="image/jpeg,image/png,image/webp"
              @change="selfieFile = ($event.target as HTMLInputElement).files?.[0] ?? null"
            />
            <small>{{ selfieFile?.name || 'Clear face photo. No filters.' }}</small>
          </label>
          <label v-if="tier === 1" class="upload-field">
            <span class="bw-label">Address evidence</span>
            <select v-model="addressDocumentType" class="bw-input">
              <option value="utility_bill">Utility bill</option>
              <option value="bank_statement">Bank statement</option>
            </select>
            <input
              type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
              @change="addressFile = ($event.target as HTMLInputElement).files?.[0] ?? null"
            />
            <small>{{ addressFile?.name || 'Recent proof matching your address.' }}</small>
          </label>
        </div>

        <p class="field-hint">Files are private. Maximum 10 MB each.</p>
        <div v-if="error2" class="bw-alert danger" role="alert">{{ error2 }}</div>
        <div v-if="uploadProgress" class="bw-alert info" role="status" aria-live="polite">{{ uploadProgress }}</div>

        <button
          class="bw-btn primary lg full"
          type="submit"
          :disabled="loading2 || !identityFile || !selfieFile || (tier === 1 && !addressFile)"
        >
          {{ loading2 ? 'Submitting…' : `Submit Tier ${tier + 1} review` }}
        </button>
      </form>

      <!-- Skip / finish later -->
      <div v-if="tier >= 1" class="tier2-skip">
        <button type="button" class="later-link" @click="skipTier2">
          Not now — I'll verify later
        </button>
        <p class="skip-note">
          You can complete Tier 2 any time from your <router-link to="/profile" class="skip-link">Profile</router-link>.
        </p>
      </div>
    </div>

    <!-- ─ TIER 2 skipped → gentle reminder card ───────────────────── -->
    <div v-if="tier2Skipped && tier < 2" class="reminder-card">
      <div class="reminder-icon">⏰</div>
      <div>
        <p class="reminder-title">Reminder set!</p>
        <p class="reminder-sub">
          Finish Tier 2 any time from your <router-link to="/profile" class="skip-link">Profile</router-link> to unlock ₦200k/day purchases.
        </p>
      </div>
      <router-link to="/" class="bw-btn primary" style="text-decoration:none; white-space:nowrap">
        Go home
      </router-link>
    </div>

    <!-- ─ DONE ───────────────────────────────────────────────────── -->
    <div v-if="tier >= 2" class="bw-card done-card">
      <div class="done-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <p class="bw-page-title done-title">Fully verified!</p>
      <p class="bw-muted done-sub">You've reached Tier 2. Enjoy up to ₦200,000/day on token purchases.</p>
      <router-link to="/buy-token" class="bw-btn primary done-cta">Buy tokens now</router-link>
    </div>
  </AppShell>
</template>

<style scoped>
/* Tier indicators */
.tier-row {
  display: flex;
  gap: var(--s-2);
  margin-bottom: var(--s-4);
}
.bw-kyc-tier {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  padding: var(--s-2) var(--s-1);
  border-radius: var(--r-md);
  font-size: var(--t-xs);
  font-weight: 700;
  gap: 2px;
  border: 1px solid;
  transition: all 0.2s;
}
.tier-active  { background: oklch(70% 0.19 145 / 0.12); border-color: oklch(70% 0.19 145 / 0.35); color: var(--brand); }
.tier-pending { background: var(--surface-2); border-color: var(--border); color: var(--text-muted); }
.tier-check   { font-size: 10px; }
.tier-desc    { font-size: 9px; font-weight: 500; opacity: 0.8; }

/* Draft restored banner */
.draft-banner {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-3) var(--s-4);
  background: oklch(72% 0.13 220 / 0.10);
  border: 1px solid oklch(72% 0.13 220 / 0.25);
  border-radius: var(--r-md);
  font-size: var(--t-sm);
  color: var(--info, #0ea5e9);
  margin-bottom: var(--s-3);
  flex-wrap: wrap;
  gap: var(--s-2);
}
.draft-banner span { flex: 1; min-width: 0; }
.draft-clear {
  background: none; border: none; cursor: pointer;
  font-size: var(--t-xs); color: inherit; opacity: 0.7;
  text-decoration: underline; white-space: nowrap; padding: 0;
}
.draft-clear:hover { opacity: 1; }

/* Draft saved toast */
.draft-saved-toast {
  position: fixed;
  bottom: 90px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--glass-bg-strong);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid var(--brand);
  color: var(--brand);
  border-radius: var(--r-full);
  padding: var(--s-2) var(--s-4);
  font-size: var(--t-xs);
  font-weight: 600;
  z-index: 100;
  box-shadow: 0 4px 20px oklch(0% 0 0 / 0.20);
  white-space: nowrap;
}

/* Cards */
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--s-3);
  margin-bottom: var(--s-4);
}
.card-title { font-weight: 700; margin: 0 0 var(--s-1); }
.card-sub   { color: var(--text-muted); font-size: var(--t-sm); margin: 0; }

.optional-badge {
  font-size: var(--t-xs);
  font-weight: 700;
  background: oklch(78% 0.16 75 / 0.15);
  color: var(--warn, #d97706);
  border: 1px solid oklch(78% 0.16 75 / 0.30);
  border-radius: var(--r-full);
  padding: 2px 10px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Steps */
.step-pane {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
  animation: fadeIn 0.25s var(--ease-out);
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
.col { display: flex; flex-direction: column; }

.field-hint  { font-size: var(--t-xs); color: var(--text-muted); margin: 6px 0 0; }
.field-error { font-size: var(--t-xs); color: var(--danger); margin: 4px 0 0; font-weight: 500; }
.has-error { border-color: var(--danger) !important; }

.review-card {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: var(--s-4);
  display: flex; flex-direction: column; gap: var(--s-3);
}
.review-row {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: var(--t-sm); gap: var(--s-3);
}
.review-key { color: var(--text-muted); }
.review-val { color: var(--text); font-weight: 600; text-align: right; word-break: break-word; }

.legal-note {
  font-size: var(--t-xs); color: var(--text-muted);
  line-height: 1.6; margin: 0; padding: var(--s-2) 0;
}

.nav-row { display: flex; gap: var(--s-2); }
.nav-row .bw-btn { flex: 1; justify-content: center; }
.full { width: 100%; justify-content: center; }
.status-retry { margin-top: var(--s-2); color: inherit; }

/* Save for later link */
.later-link {
  background: none; border: none; cursor: pointer;
  color: var(--text-muted); font-size: var(--t-xs);
  text-align: center; text-decoration: underline;
  padding: 0; width: 100%;
  transition: color 0.15s;
}
.later-link:hover { color: var(--text); }

/* Tier 1 done banner */
.tier1-done-banner {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-4);
  background: oklch(70% 0.19 145 / 0.10);
  border: 1px solid oklch(70% 0.19 145 / 0.25);
  border-radius: var(--r-md);
  font-size: var(--t-sm);
  color: var(--brand);
  margin-bottom: var(--s-3);
}
.pending-card { display:flex; align-items:center; gap:var(--s-3); margin-bottom:var(--s-3); border-color:oklch(from var(--warn) l c h / .35); }
.pending-card > div { flex:1; }
.pending-dot { width:10px; height:10px; flex:0 0 auto; border-radius:50%; background:var(--warn); box-shadow:0 0 0 5px oklch(from var(--warn) l c h / .12); }
.upload-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:var(--s-3); }
.upload-field { display:flex; flex-direction:column; gap:8px; padding:var(--s-3); border:1px dashed var(--border); border-radius:var(--r-md); background:var(--surface-2); cursor:pointer; }
.upload-field input { width:100%; color:var(--text-muted); }
.upload-field small { color:var(--text-muted); overflow-wrap:anywhere; }

/* Tier 2 skip section */
.tier2-skip {
  border-top: 1px dashed var(--border);
  margin-top: var(--s-4);
  padding-top: var(--s-4);
  text-align: center;
}
.skip-note { font-size: var(--t-xs); color: var(--text-muted); margin: var(--s-2) 0 0; }
.skip-link { color: var(--brand); text-decoration: underline; }

/* Reminder card */
.reminder-card {
  display: flex;
  align-items: center;
  gap: var(--s-4);
  padding: var(--s-4) var(--s-5);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
  border-radius: var(--r-xl);
  margin-top: var(--s-3);
  flex-wrap: wrap;
}
.reminder-icon { font-size: 28px; flex-shrink: 0; }
.reminder-title { font-weight: 700; margin: 0 0 4px; }
.reminder-sub   { font-size: var(--t-sm); color: var(--text-muted); margin: 0; }

/* Done state */
.done-card { text-align: center; padding: var(--s-8); }
.done-icon {
  width: 56px; height: 56px; border-radius: 50%;
  background: oklch(70% 0.19 145 / 0.15);
  display: grid; place-items: center;
  margin: 0 auto var(--s-4);
}
.done-title { margin-bottom: var(--s-2); }
.done-sub   { font-size: var(--t-sm); margin-bottom: var(--s-5); }
.done-cta   { text-decoration: none; display: inline-flex; }

/* Fade transition */
.fade-enter-active, .fade-leave-active { transition: all 0.25s var(--ease-out); }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }

@media (max-width: 380px) {
  .row { grid-template-columns: 1fr; }
  .upload-grid { grid-template-columns: 1fr; }
  .pending-card { align-items:flex-start; flex-wrap:wrap; }
  .tier-row { flex-wrap: wrap; }
}
</style>
