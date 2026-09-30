<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { safeAuthRedirect } from '../lib/auth-flow';
import { useAuthStore } from '../stores/auth';

type DocumentType = 'national_id' | 'voters_card' | 'passport' | 'drivers_license' | 'selfie' | 'utility_bill' | 'bank_statement';

interface KycDocument {
  id: string;
  doc_type: DocumentType;
  kyc_tier: number;
  uploaded_at: string | null;
  review_request_id?: string | null;
}

interface KycState {
  kyc_tier: number;
  kyc_status: 'unverified' | 'pending' | 'verified' | 'rejected';
  review: { status?: string; requested_tier?: number; reviewer_note?: string | null } | null;
  documents: KycDocument[];
  policy: { tier0DailyLimitMinor?: number | null; tier1DailyLimitMinor?: number | null; tier2DailyLimitMinor?: number | null } | null;
}

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const state = ref<KycState | null>(null);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const progress = ref('');
const submitting = ref(false);
const identityFile = ref<File | null>(null);
const selfieFile = ref<File | null>(null);
const addressFile = ref<File | null>(null);
const identityDocumentType = ref<'national_id' | 'voters_card' | 'passport' | 'drivers_license'>('national_id');
const addressDocumentType = ref<'utility_bill' | 'bank_statement'>('utility_bill');

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const DOCUMENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const identityTypes = new Set<DocumentType>(['national_id', 'voters_card', 'passport', 'drivers_license']);
const addressTypes = new Set<DocumentType>(['utility_bill', 'bank_statement']);

const tier = computed(() => Number(state.value?.kyc_tier ?? auth.kycTier ?? 0));
const requestedTier = computed<1 | 2>(() => tier.value === 0 ? 1 : 2);
const policy = computed(() => state.value?.policy ?? null);
const pending = computed(() => state.value?.kyc_status === 'pending' || state.value?.review?.status === 'pending');
const changesRequested = computed(() => state.value?.kyc_status === 'rejected' || state.value?.review?.status === 'rejected');
const reviewNote = computed(() => String(state.value?.review?.reviewer_note ?? '').trim());
const needsAddress = computed(() => requestedTier.value === 2);
const upgradeRequested = computed(() => {
  const target = String(route.query.upgrade ?? route.query.reason ?? '').toLowerCase();
  return target === `tier${requestedTier.value}` || target === `tier_${requestedTier.value}`;
});
const reusableDocuments = computed(() => (state.value?.documents ?? []).filter((document) => (
  document.kyc_tier === requestedTier.value && Boolean(document.uploaded_at) && !document.review_request_id
)));
const savedIdentity = computed(() => reusableDocuments.value.find((document) => identityTypes.has(document.doc_type)) ?? null);
const savedSelfie = computed(() => reusableDocuments.value.find((document) => document.doc_type === 'selfie') ?? null);
const savedAddress = computed(() => reusableDocuments.value.find((document) => addressTypes.has(document.doc_type)) ?? null);
const selectedFileCount = computed(() => [identityFile.value, selfieFile.value, ...(needsAddress.value ? [addressFile.value] : [])].filter(Boolean).length);
const hasIdentity = computed(() => Boolean(savedIdentity.value || identityFile.value));
const hasSelfie = computed(() => Boolean(savedSelfie.value || selfieFile.value));
const hasAddress = computed(() => Boolean(savedAddress.value || addressFile.value));
const canSubmit = computed(() => hasIdentity.value && hasSelfie.value && (!needsAddress.value || hasAddress.value));

function tierLimitLabel(level: number) {
  const cap = level === 0 ? policy.value?.tier0DailyLimitMinor
    : level === 1 ? policy.value?.tier1DailyLimitMinor
      : policy.value?.tier2DailyLimitMinor;
  if (cap === null || cap === undefined) return 'No daily cap';
  return `Up to ₦${(Number(cap) / 100).toLocaleString('en-NG')} daily`;
}

function selectFile(slot: 'identity' | 'selfie' | 'address', event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  const allowed = slot === 'selfie' ? IMAGE_TYPES : DOCUMENT_TYPES;
  error.value = '';
  if (file && !allowed.has(file.type)) {
    error.value = slot === 'selfie' ? 'Use a JPEG, PNG, or WebP image.' : 'Use JPEG, PNG, WebP, or PDF files.';
    input.value = '';
    return;
  }
  if (file && file.size > MAX_FILE_BYTES) {
    error.value = 'Each document must be 10 MB or smaller.';
    input.value = '';
    return;
  }
  if (slot === 'identity') identityFile.value = file;
  if (slot === 'selfie') selfieFile.value = file;
  if (slot === 'address') addressFile.value = file;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    state.value = await api.get<KycState>('/api/v1/customer/kyc/status');
  } catch (cause: any) {
    error.value = cause?.message ?? 'Your verification status could not be loaded.';
  } finally {
    loading.value = false;
  }
}

async function upload(file: File, documentType: DocumentType): Promise<string> {
  const created = await api.post<{ documentId: string; uploadUrl: string }>('/api/v1/customer/kyc/documents/upload-url', {
    document_type: documentType,
    requested_tier: requestedTier.value,
    mime_type: file.type,
    size_bytes: file.size,
  });
  const result = await fetch(created.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!result.ok) throw new Error('Secure document upload failed.');
  await api.post(`/api/v1/customer/kyc/documents/${created.documentId}/activate`);
  return created.documentId;
}

async function persistSelectedDocuments(): Promise<string[]> {
  const documentIds = reusableDocuments.value.map((document) => document.id);
  if (identityFile.value) {
    progress.value = 'Saving identity document…';
    documentIds.push(await upload(identityFile.value, identityDocumentType.value));
  }
  if (selfieFile.value) {
    progress.value = 'Saving selfie…';
    documentIds.push(await upload(selfieFile.value, 'selfie'));
  }
  if (addressFile.value) {
    progress.value = 'Saving address evidence…';
    documentIds.push(await upload(addressFile.value, addressDocumentType.value));
  }
  return [...new Set(documentIds)];
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

async function submitEvidence() {
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
    const result = await api.post<{ review: KycState['review'] }>(`/api/v1/customer/kyc/tier${requestedTier.value}/submit`, { document_ids: documentIds });
    clearSelectedFiles();
    state.value = state.value ? { ...state.value, kyc_status: 'pending', review: result.review } : state.value;
    await auth.refreshProfile();
  } catch (cause: any) {
    error.value = cause?.message ?? 'KYC submission failed.';
  } finally {
    progress.value = '';
    submitting.value = false;
  }
}

function requestUpgrade() {
  void router.replace({ name: 'kyc', query: { ...route.query, upgrade: `tier${requestedTier.value}` } });
}

function cancelUpgrade() {
  const { upgrade, reason, ...remaining } = route.query;
  void router.replace({ name: 'kyc', query: remaining });
}

function continueWallet() {
  void router.push(safeAuthRedirect(route.query.redirect));
}

onMounted(load);
</script>

<template>
  <AppShell>
    <header class="kyc-hero">
      <div>
        <p class="eyebrow">Account verification</p>
        <h1>Verification, when you need it</h1>
        <p>Start using your wallet now. Upgrade only for higher limits.</p>
      </div>
      <button class="bw-btn" type="button" :disabled="loading || submitting" @click="load">Refresh</button>
    </header>

    <section v-if="!loading && state" class="tier-grid" aria-label="Verification tiers">
      <article v-for="level in [0, 1, 2]" :key="level" :class="['tier-card', { active: tier >= level }]">
        <span>Tier {{ level }}</span>
        <strong>{{ level === 0 ? 'Wallet ready' : level === 1 ? 'Identity verified' : 'Enhanced review' }}</strong>
        <small>{{ level <= tier ? tierLimitLabel(level) : level === tier + 1 ? tierLimitLabel(level) : 'Available later' }}</small>
      </article>
    </section>

    <section v-if="loading" class="bw-card status-card" role="status">Loading verification status…</section>
    <section v-else-if="!state" class="bw-card status-card" role="alert">
      <div><h2>Status unavailable</h2><p>{{ error || 'Your verification status could not be loaded.' }}</p></div>
      <button class="bw-btn" type="button" @click="load">Retry</button>
    </section>

    <template v-else>
      <div v-if="error" class="bw-alert danger" role="alert">{{ error }}</div>
      <div v-if="notice" class="bw-alert success" role="status">{{ notice }}</div>

      <section v-if="pending" class="bw-card status-card" role="status">
        <span class="status-dot"></span>
        <div><h2>Review in progress</h2><p>Beverly is reviewing your Tier {{ state.review?.requested_tier ?? requestedTier }} evidence.</p></div>
        <button class="bw-btn" type="button" @click="load">Refresh status</button>
      </section>

      <section v-else-if="tier >= 2" class="bw-card status-card complete-card">
        <span class="complete-mark">✓</span>
        <div><h2>Enhanced verification complete</h2><p>Tier 2 is active. {{ tierLimitLabel(2) }}.</p></div>
        <button class="bw-btn primary" type="button" @click="continueWallet">Continue</button>
      </section>

      <section v-else-if="!upgradeRequested" class="bw-card ready-card">
        <span class="ready-mark">✓</span>
        <div>
          <p class="eyebrow">Tier {{ tier }}</p>
          <h2>{{ changesRequested ? 'Changes requested' : 'Your wallet is ready' }}</h2>
          <p>{{ changesRequested ? reviewNote || 'Review the feedback, then submit new evidence.' : `${tierLimitLabel(tier)}. No identity documents are needed until you request a higher limit.` }}</p>
        </div>
        <div class="ready-actions">
          <button class="bw-btn primary" type="button" @click="changesRequested ? requestUpgrade() : continueWallet()">{{ changesRequested ? 'Review changes' : 'Continue to wallet' }}</button>
          <button v-if="!changesRequested" class="text-button" type="button" @click="requestUpgrade">Need a higher limit?</button>
        </div>
      </section>

      <section v-else class="bw-card submission-card">
        <div class="section-head">
          <div><p class="eyebrow">Optional upgrade</p><h2>Request Tier {{ requestedTier }}</h2></div>
          <span class="bw-badge warn">Beverly review</span>
        </div>
        <p class="instructions">{{ needsAddress ? 'Provide identity, a current selfie, and recent address evidence.' : 'Provide identity and a current selfie. Address evidence starts at Tier 2.' }}</p>
        <p class="review-disclosure">Incomplete or rejected evidence can lead to account restrictions or regulatory review. Beverly will explain the next step.</p>
        <p v-if="changesRequested" class="review-note" role="alert"><strong>Changes requested:</strong> {{ reviewNote || 'Use clearer, current evidence.' }}</p>

        <form @submit.prevent="submitEvidence">
          <div class="upload-grid">
            <label class="upload-field">
              <strong>Government identity</strong><span>NIN slip, passport, licence, or voter card.</span>
              <template v-if="savedIdentity"><small class="saved-file">✓ Saved securely. Ready for review.</small></template>
              <template v-else>
                <select v-model="identityDocumentType" class="bw-input" aria-label="Identity document type" :disabled="submitting"><option value="national_id">NIN slip</option><option value="voters_card">Voter card</option><option value="passport">Passport</option><option value="drivers_license">Driver's licence</option></select>
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label="Government identity file" :disabled="submitting" @change="selectFile('identity', $event)" />
                <small>{{ identityFile ? `Selected: ${identityFile.name}` : 'Choose a file' }}</small>
              </template>
            </label>
            <label class="upload-field">
              <strong>Current selfie</strong><span>Use a clear photo. Avoid filters.</span>
              <template v-if="savedSelfie"><small class="saved-file">✓ Saved securely. Ready for review.</small></template>
              <template v-else>
                <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Current selfie file" :disabled="submitting" @change="selectFile('selfie', $event)" />
                <small>{{ selfieFile ? `Selected: ${selfieFile.name}` : 'Choose a file' }}</small>
              </template>
            </label>
            <label v-if="needsAddress" class="upload-field">
              <strong>Address evidence</strong><span>Use a recent utility bill or bank statement.</span>
              <template v-if="savedAddress"><small class="saved-file">✓ Saved securely. Ready for review.</small></template>
              <template v-else>
                <select v-model="addressDocumentType" class="bw-input" aria-label="Address document type" :disabled="submitting"><option value="utility_bill">Utility bill</option><option value="bank_statement">Bank statement</option></select>
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label="Address evidence file" :disabled="submitting" @change="selectFile('address', $event)" />
                <small>{{ addressFile ? `Selected: ${addressFile.name}` : 'Choose a file' }}</small>
              </template>
            </label>
          </div>
          <p class="selection-summary" role="status" aria-live="polite">{{ [savedIdentity || identityFile, savedSelfie || selfieFile, ...(needsAddress ? [savedAddress || addressFile] : [])].filter(Boolean).length }} of {{ needsAddress ? 3 : 2 }} required files ready.</p>
          <p class="privacy">Private storage. File validated. Maximum 10 MB.</p>
          <div v-if="progress" class="bw-alert info" role="status" aria-live="polite">{{ progress }}</div>
          <div class="form-actions">
            <button class="bw-btn primary" type="submit" :disabled="submitting || !canSubmit">{{ submitting ? 'Submitting…' : `Submit Tier ${requestedTier} review` }}</button>
            <button v-if="selectedFileCount" class="bw-btn" type="button" :disabled="submitting" @click="saveForLater">Save and finish later</button>
            <button class="text-button" type="button" :disabled="submitting" @click="cancelUpgrade">Not now</button>
          </div>
        </form>
      </section>
    </template>
  </AppShell>
</template>

<style scoped>
.kyc-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--s-4);margin-bottom:var(--s-4)}.kyc-hero h1{margin:0;font-size:var(--t-2xl)}.kyc-hero p{margin:4px 0 0;color:var(--text-muted)}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:10px!important;font-weight:800;color:var(--brand)!important}
.tier-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--s-3);margin-bottom:var(--s-4)}.tier-card{display:flex;flex-direction:column;gap:6px;padding:var(--s-4);border:1px solid var(--border);border-radius:var(--r-lg);background:var(--surface);opacity:.62}.tier-card.active{opacity:1;border-color:oklch(from var(--brand) l c h/.35);background:oklch(from var(--brand) l c h/.06)}.tier-card span{color:var(--text-muted);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em}.tier-card small{color:var(--text-muted)}.tier-card.active small{color:var(--brand)}
.status-card,.ready-card{display:flex;align-items:center;gap:var(--s-4)}.status-card>div,.ready-card>div{flex:1}.status-card h2,.ready-card h2{margin:0 0 4px}.status-card p,.ready-card p{margin:0;color:var(--text-muted)}.status-dot{width:12px;height:12px;border-radius:50%;background:var(--warn);box-shadow:0 0 0 6px oklch(from var(--warn) l c h/.13)}.complete-mark,.ready-mark{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;color:var(--brand);background:oklch(from var(--brand) l c h/.12);font-weight:900;font-size:20px}.ready-card{align-items:flex-start}.ready-actions{display:flex;flex-direction:column;align-items:flex-end;gap:var(--s-2);flex:0 0 auto!important}.text-button{padding:0;border:0;background:transparent;color:var(--brand);font:inherit;font-size:var(--t-sm);font-weight:700;cursor:pointer}.text-button:disabled{opacity:.55;cursor:not-allowed}
.section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--s-3)}.section-head h2{margin:4px 0 0}.instructions{color:var(--text-muted);max-width:680px}.review-disclosure{margin:var(--s-2) 0;color:var(--text-muted);font-size:var(--t-xs)}.review-note{padding:var(--s-3);border-left:3px solid var(--warn);background:oklch(from var(--warn) l c h/.09);border-radius:var(--r-sm);color:var(--text-muted)}.upload-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:var(--s-3);margin:var(--s-4) 0}.upload-field{display:flex;flex-direction:column;gap:8px;padding:var(--s-4);border:1px dashed var(--border);border-radius:var(--r-lg);background:var(--surface-2);cursor:pointer}.upload-field span,.upload-field small,.privacy{color:var(--text-muted)}.upload-field input{width:100%;color:var(--text-muted)}.upload-field small{overflow-wrap:anywhere}.saved-file{color:var(--brand)!important;font-weight:700}.selection-summary{margin:0 0 4px;color:var(--text);font-size:var(--t-sm);font-weight:700}.privacy{font-size:var(--t-xs);margin:0 0 var(--s-3)}.form-actions{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s-2)}.form-actions .bw-btn.primary{flex:1}.form-actions .bw-btn{min-height:44px}
@media(max-width:640px){.tier-grid{grid-template-columns:1fr}.upload-grid{grid-template-columns:1fr}.status-card,.ready-card{align-items:flex-start;flex-wrap:wrap}.status-card .bw-btn,.ready-actions{width:100%;align-items:stretch}.kyc-hero{align-items:flex-start;flex-direction:column}.kyc-hero>.bw-btn{width:100%}.form-actions>*{width:100%}.form-actions .bw-btn.primary{flex:auto}}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
