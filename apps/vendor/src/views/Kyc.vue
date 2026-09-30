<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { useVendorAuthStore } from '../stores/auth';

const auth = useVendorAuthStore();
const state = ref<any>(null);
const identityFile = ref<File | null>(null);
const identityDocumentType = ref<'national_id' | 'voters_card' | 'passport' | 'drivers_license'>('national_id');
const selfieFile = ref<File | null>(null);
const addressFile = ref<File | null>(null);
const addressDocumentType = ref<'utility_bill' | 'bank_statement'>('utility_bill');
const loading = ref(true);
const stateLoaded = ref(false);
const submitting = ref(false);
const progress = ref('');
const error = ref('');
const notice = ref('');
const fileError = ref('');

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const DOCUMENT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const identityTypes = new Set(['national_id', 'voters_card', 'passport', 'drivers_license']);
const addressTypes = new Set(['utility_bill', 'bank_statement']);

const tier = computed(() => Number(state.value?.kyc_tier ?? auth.user?.kyc_tier ?? 0));
const requestedTier = computed<1 | 2>(() => tier.value === 0 ? 1 : 2);
const needsAddress = computed(() => requestedTier.value === 2);
const status = computed(() => state.value?.kyc_status ?? auth.user?.kyc_status ?? 'unverified');
const pending = computed(() => status.value === 'pending' || state.value?.review?.status === 'pending');
const reviewNote = computed(() => String(state.value?.review?.reviewer_note ?? '').trim());
const changesRequested = computed(() => state.value?.review?.status === 'rejected');
const selectedFileCount = computed(() => [identityFile.value, selfieFile.value, ...(needsAddress.value ? [addressFile.value] : [])].filter(Boolean).length);
const requiredFileCount = computed(() => needsAddress.value ? 3 : 2);
const reusableDocuments = computed(() => (state.value?.documents ?? []).filter((document: any) => (
  document.kyc_tier === requestedTier.value && Boolean(document.uploaded_at) && !document.review_request_id
)));
const savedIdentity = computed(() => reusableDocuments.value.find((document: any) => identityTypes.has(document.doc_type)) ?? null);
const savedSelfie = computed(() => reusableDocuments.value.find((document: any) => document.doc_type === 'selfie') ?? null);
const savedAddress = computed(() => reusableDocuments.value.find((document: any) => addressTypes.has(document.doc_type)) ?? null);
const hasIdentity = computed(() => Boolean(savedIdentity.value || identityFile.value));
const hasSelfie = computed(() => Boolean(savedSelfie.value || selfieFile.value));
const hasAddress = computed(() => Boolean(savedAddress.value || addressFile.value));
const canSubmit = computed(() => hasIdentity.value && hasSelfie.value && (!needsAddress.value || hasAddress.value));
const policy = computed(() => state.value?.policy ?? null);
const businessName = computed(() => auth.user?.organization_name?.trim() || 'Your business');

function tierLimitLabel(level: number) {
  const value = level === 0 ? policy.value?.tier0DailyLimitMinor
    : level === 1 ? policy.value?.tier1DailyLimitMinor
      : policy.value?.tier2DailyLimitMinor;
  if (value === null || value === undefined) return 'No daily cap';
  return `Up to ₦${(Number(value) / 100).toLocaleString('en-NG')} daily`;
}

function selectFile(slot: 'identity' | 'selfie' | 'address', event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  const allowed = slot === 'selfie' ? IMAGE_MIME_TYPES : DOCUMENT_MIME_TYPES;
  fileError.value = '';

  if (file && !allowed.has(file.type)) {
    fileError.value = slot === 'selfie'
      ? 'Use a JPEG, PNG, or WebP image.'
      : 'Use JPEG, PNG, WebP, or PDF files.';
    input.value = '';
  } else if (file && file.size > MAX_FILE_BYTES) {
    fileError.value = 'Each file must be 10 MB or smaller.';
    input.value = '';
  }

  const selected = fileError.value ? null : file;
  if (slot === 'identity') identityFile.value = selected;
  if (slot === 'selfie') selfieFile.value = selected;
  if (slot === 'address') addressFile.value = selected;
}

async function load() {
  loading.value = true;
  stateLoaded.value = false;
  error.value = '';
  try {
    state.value = await api.get('/api/v1/vendor/kyc/status');
    stateLoaded.value = true;
  }
  catch (cause: any) { error.value = cause?.message ?? 'KYC status failed.'; }
  finally { loading.value = false; }
}

async function upload(file: File, documentType: 'national_id' | 'voters_card' | 'passport' | 'drivers_license' | 'selfie' | 'utility_bill' | 'bank_statement'): Promise<string> {
  const created = await api.post<{ documentId: string; uploadUrl: string }>('/api/v1/vendor/kyc/documents/upload-url', {
    document_type: documentType,
    mime_type: file.type,
    size_bytes: file.size,
    requested_tier: requestedTier.value,
  });
  const result = await fetch(created.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!result.ok) throw new Error('Secure document upload failed.');
  await api.post(`/api/v1/vendor/kyc/documents/${created.documentId}/activate`);
  return created.documentId;
}

async function persistSelectedDocuments(): Promise<string[]> {
  const documentIds: string[] = reusableDocuments.value.map((document: any) => String(document.id));
  if (identityFile.value) {
    progress.value = 'Saving identity evidence…';
    documentIds.push(await upload(identityFile.value, identityDocumentType.value));
  }
  if (selfieFile.value) {
    progress.value = 'Saving representative selfie…';
    documentIds.push(await upload(selfieFile.value, 'selfie'));
  }
  if (addressFile.value) {
    progress.value = 'Saving business address evidence…';
    documentIds.push(await upload(addressFile.value, addressDocumentType.value));
  }
  return [...new Set<string>(documentIds)];
}

function clearSelectedFiles() {
  identityFile.value = null;
  selfieFile.value = null;
  addressFile.value = null;
}

async function saveForLater() {
  if (!selectedFileCount.value) {
    error.value = 'Choose one or more files before saving.';
    return;
  }
  submitting.value = true;
  error.value = '';
  notice.value = '';
  try {
    await persistSelectedDocuments();
    clearSelectedFiles();
    await load();
    notice.value = 'Documents saved securely. You can continue later from this account.';
  } catch (cause: any) {
    error.value = cause?.message ?? 'Documents could not be saved.';
  } finally {
    progress.value = '';
    submitting.value = false;
  }
}

async function submit() {
  if (!canSubmit.value) {
    error.value = needsAddress.value ? 'Identity, selfie, and address evidence are required.' : 'Identity document and selfie are required.';
    return;
  }
  submitting.value = true;
  error.value = '';
  notice.value = '';
  try {
    const documentIds = await persistSelectedDocuments();
    progress.value = 'Submitting review…';
    await api.post(`/api/v1/vendor/kyc/tier${requestedTier.value}/submit`, {
      document_ids: documentIds,
    });
    notice.value = `Tier ${requestedTier.value} review submitted.`;
    clearSelectedFiles();
    await Promise.all([load(), auth.refreshMe()]);
  } catch (cause: any) {
    error.value = cause?.message ?? 'KYC submission failed.';
  } finally {
    progress.value = '';
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <AppShell title="KYC verification">
    <header class="onboarding-hero">
      <div>
        <p class="eyebrow">Business identity</p>
        <h1>Set up your business</h1>
        <p>Tier 1 approval unlocks vending. Higher limits stay optional.</p>
      </div>
      <button class="bw-btn" :disabled="loading || submitting" @click="load">Refresh</button>
    </header>

    <div v-if="error && stateLoaded" class="bw-alert danger" role="alert">{{ error }}</div>
    <div v-if="notice" class="bw-alert success" role="status">{{ notice }}</div>

    <section v-if="stateLoaded" class="business-summary" aria-label="Business setup">
      <div class="business-summary-icon" aria-hidden="true">✓</div>
      <div>
        <p class="business-summary-kicker">Business details saved</p>
        <h2>{{ businessName }}</h2>
        <p>Submit Tier 1 now. Beverly approval unlocks vending.</p>
      </div>
    </section>

    <section v-if="stateLoaded" class="tier-grid" aria-label="KYC tiers">
      <article v-for="level in [0,1,2]" :key="level" :class="['tier-card', { active: tier >= level }]">
        <span>Tier {{ level }}</span>
        <strong>{{ level === 0 ? 'Business registered' : level === 1 ? 'Business verified' : 'Enhanced review' }}</strong>
        <small>{{ tier >= level ? 'Complete' : level === tier + 1 ? tierLimitLabel(level) : 'Later' }}</small>
      </article>
    </section>

    <section v-if="stateLoaded && changesRequested" class="bw-alert danger review-feedback" role="alert">
      <strong>Changes requested</strong>
      <span>{{ reviewNote || 'Review your evidence, then submit clearer documents.' }}</span>
    </section>

    <section v-if="loading" class="bw-card empty">Loading status…</section>
    <section v-else-if="!stateLoaded" class="bw-card status-card" role="alert">
      <div><h2>Status unavailable</h2><p>{{ error || 'Your verification status could not be confirmed.' }}</p></div>
      <button class="bw-btn" @click="load">Retry</button>
    </section>
    <section v-else-if="pending" class="bw-card status-card" role="status">
      <span class="status-dot"></span>
      <div><h2>Review in progress</h2><p>Beverly is reviewing your Tier {{ state?.review?.requested_tier ?? tier + 1 }} evidence.</p></div>
      <button class="bw-btn" @click="load">Refresh status</button>
    </section>
    <section v-else-if="tier >= 2" class="bw-card complete-card">
      <span class="complete-mark">✓</span><div><h2>Enhanced KYC complete</h2><p>Your vendor account reached Tier 2.</p></div>
    </section>
    <section v-else class="bw-card submission-card">
      <div class="section-head"><div><span>Next verification</span><h2>Request Tier {{ requestedTier }}</h2></div><span class="bw-badge warn">Beverly review</span></div>
      <p class="instructions">{{ needsAddress ? 'Provide identity, a current selfie, and recent business address evidence.' : 'Provide identity and a current selfie. Beverly approval unlocks vending after Tier 1.' }}</p>
      <form @submit.prevent="submit">
        <div class="upload-grid">
          <label class="upload-field">
            <strong>Government identity</strong>
            <span>NIN slip, passport, licence, or voter card.</span>
            <template v-if="savedIdentity"><small class="saved-file">✓ Saved securely. Ready for review.</small></template>
            <template v-else>
              <select v-model="identityDocumentType" class="bw-input" aria-label="Identity document type" :disabled="submitting">
                <option value="national_id">NIN slip</option>
                <option value="voters_card">Voter card</option>
                <option value="passport">Passport</option>
                <option value="drivers_license">Driver's licence</option>
              </select>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label="Government identity file" :disabled="submitting" @change="selectFile('identity', $event)" />
              <small>{{ identityFile ? `Selected: ${identityFile.name}` : 'Choose a file' }}</small>
            </template>
          </label>
          <label class="upload-field">
            <strong>Representative selfie</strong>
            <span>Use a clear photo. Avoid filters.</span>
            <template v-if="savedSelfie"><small class="saved-file">✓ Saved securely. Ready for review.</small></template>
            <template v-else>
              <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Representative selfie file" :disabled="submitting" @change="selectFile('selfie', $event)" />
              <small>{{ selfieFile ? `Selected: ${selfieFile.name}` : 'Choose a file' }}</small>
            </template>
          </label>
          <label v-if="needsAddress" class="upload-field">
            <strong>Business address</strong>
            <template v-if="savedAddress"><small class="saved-file">✓ Saved securely. Ready for review.</small></template>
            <template v-else>
              <select v-model="addressDocumentType" class="bw-input" aria-label="Address document type" :disabled="submitting">
                <option value="utility_bill">Utility bill</option>
                <option value="bank_statement">Bank statement</option>
              </select>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label="Business address file" :disabled="submitting" @change="selectFile('address', $event)" />
              <small>{{ addressFile ? `Selected: ${addressFile.name}` : 'Choose a recent document' }}</small>
            </template>
          </label>
        </div>
        <p class="selection-summary" role="status" aria-live="polite">{{ [savedIdentity || identityFile, savedSelfie || selfieFile, ...(needsAddress ? [savedAddress || addressFile] : [])].filter(Boolean).length }} of {{ requiredFileCount }} required files ready.</p>
        <p class="privacy">Private storage. File validated. Maximum 10 MB.</p>
        <div v-if="fileError" class="bw-alert danger" role="alert">{{ fileError }}</div>
        <div v-if="progress" class="bw-alert info" role="status" aria-live="polite">{{ progress }}</div>
        <div class="form-actions">
          <button class="bw-btn primary lg" type="submit" :disabled="submitting || !canSubmit">{{ submitting ? 'Submitting…' : `Submit Tier ${requestedTier} review` }}</button>
          <button v-if="selectedFileCount" class="bw-btn" type="button" :disabled="submitting" @click="saveForLater">Save and finish later</button>
        </div>
      </form>
      <router-link class="support-link" to="/help">Need help with your documents?</router-link>
    </section>
  </AppShell>
</template>

<style scoped>
.onboarding-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--s-4);margin-bottom:var(--s-4)}.onboarding-hero h1{margin:0;font-size:var(--t-2xl)}.onboarding-hero p{margin:4px 0 0;color:var(--text-muted)}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:10px!important;font-weight:800;color:var(--brand)!important}
.business-summary{display:flex;align-items:center;gap:var(--s-3);margin-bottom:var(--s-4);padding:var(--s-4);border:1px solid oklch(from var(--brand) l c h/.28);border-radius:var(--r-lg);background:oklch(from var(--brand) l c h/.06)}.business-summary-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:oklch(from var(--brand) l c h/.15);color:var(--brand);font-weight:900;flex:0 0 auto}.business-summary-kicker{margin:0!important;color:var(--brand)!important;font-size:10px!important;letter-spacing:.1em;text-transform:uppercase;font-weight:800}.business-summary h2{margin:2px 0;font-size:var(--t-md)}.business-summary p:last-child{font-size:var(--t-sm)}
.tier-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--s-3);margin-bottom:var(--s-4)}.tier-card{display:flex;flex-direction:column;gap:6px;padding:var(--s-4);border:1px solid var(--border);border-radius:var(--r-lg);background:var(--surface);opacity:.62}.tier-card.active{opacity:1;border-color:oklch(from var(--brand) l c h/.35);background:oklch(from var(--brand) l c h/.06)}.tier-card span{color:var(--text-muted);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em}.tier-card small{color:var(--text-muted)}.tier-card.active small{color:var(--brand)}
.status-card,.complete-card{display:flex;align-items:center;gap:var(--s-4)}.status-card>div,.complete-card>div{flex:1}.status-card h2,.complete-card h2{margin:0 0 4px}.status-card p,.complete-card p{margin:0;color:var(--text-muted)}.status-dot{width:12px;height:12px;border-radius:50%;background:var(--warn);box-shadow:0 0 0 6px oklch(from var(--warn) l c h/.13)}.complete-mark{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;color:var(--brand);background:oklch(from var(--brand) l c h/.12);font-weight:900}
.section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--s-3)}.section-head span:first-child{color:var(--brand);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em}.section-head h2{margin:4px 0 0}.instructions{color:var(--text-muted);max-width:680px}.upload-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:var(--s-3);margin:var(--s-4) 0}.upload-field{display:flex;flex-direction:column;gap:8px;padding:var(--s-4);border:1px dashed var(--border);border-radius:var(--r-lg);background:var(--surface-2);cursor:pointer}.upload-field span,.upload-field small,.privacy{color:var(--text-muted)}.upload-field input{width:100%;color:var(--text-muted)}.upload-field small{overflow-wrap:anywhere}.saved-file{color:var(--brand)!important;font-weight:700}.selection-summary{margin:0 0 4px;color:var(--text);font-size:var(--t-sm);font-weight:700}.privacy{font-size:var(--t-xs);margin:0 0 var(--s-3)}.form-actions{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s-2)}.form-actions .bw-btn.primary{flex:1}.form-actions .bw-btn{min-height:44px}.empty{text-align:center;padding:var(--s-8);color:var(--text-muted)}
.review-feedback{display:grid;gap:4px;margin-bottom:var(--s-4)}
.support-link{display:inline-block;margin-top:var(--s-4);font-size:var(--t-sm);font-weight:700;color:var(--brand)}
@media(max-width:640px){.tier-grid{grid-template-columns:1fr}.upload-grid{grid-template-columns:1fr}.status-card{align-items:flex-start;flex-wrap:wrap}.status-card .bw-btn,.form-actions>*{width:100%}.form-actions .bw-btn.primary{flex:auto}.onboarding-hero{align-items:flex-start;flex-direction:column}.onboarding-hero>.bw-btn{width:100%}}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
