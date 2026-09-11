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

const tier = computed(() => Number(state.value?.kyc_tier ?? auth.user?.kyc_tier ?? 0));
const status = computed(() => state.value?.kyc_status ?? auth.user?.kyc_status ?? 'unverified');
const pending = computed(() => status.value === 'pending' || state.value?.review?.status === 'pending');
const reviewNote = computed(() => String(state.value?.review?.reviewer_note ?? '').trim());
const changesRequested = computed(() => state.value?.review?.status === 'rejected');
const selectedFileCount = computed(() => [identityFile.value, selfieFile.value, addressFile.value].filter(Boolean).length);

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
  });
  const result = await fetch(created.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!result.ok) throw new Error('Secure document upload failed.');
  await api.post(`/api/v1/vendor/kyc/documents/${created.documentId}/activate`);
  return created.documentId;
}

async function submit() {
  if (!identityFile.value || !selfieFile.value || !addressFile.value) return;
  submitting.value = true;
  error.value = '';
  notice.value = '';
  try {
    progress.value = 'Uploading identity evidence…';
    const identityId = await upload(identityFile.value, identityDocumentType.value);
    progress.value = 'Uploading representative selfie…';
    const selfieId = await upload(selfieFile.value, 'selfie');
    progress.value = 'Uploading business address evidence…';
    const addressId = await upload(addressFile.value, addressDocumentType.value);
    progress.value = 'Submitting review…';
    await api.post('/api/v1/vendor/kyc/tier2/submit', { document_ids: [identityId, selfieId, addressId] });
    notice.value = 'Tier 2 review submitted.';
    identityFile.value = null;
    selfieFile.value = null;
    addressFile.value = null;
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
    <header class="page-head">
      <div><p class="eyebrow">Business identity</p><h1>KYC verification</h1><p>Submit evidence. Track approvals.</p></div>
      <button class="bw-btn" :disabled="loading || submitting" @click="load">Refresh</button>
    </header>

    <div v-if="error && stateLoaded" class="bw-alert danger" role="alert">{{ error }}</div>
    <div v-if="notice" class="bw-alert success" role="status">{{ notice }}</div>

    <section v-if="stateLoaded" class="tier-grid" aria-label="KYC tiers">
      <article v-for="level in [0,1,2]" :key="level" :class="['tier-card', { active: tier >= level }]">
        <span>Tier {{ level }}</span>
        <strong>{{ level === 0 ? 'Registered' : level === 1 ? 'Business verified' : 'Enhanced review' }}</strong>
        <small>{{ tier >= level ? 'Complete' : level === tier + 1 ? 'Next tier' : 'Locked' }}</small>
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
      <div class="section-head"><div><span>Next verification</span><h2>Request Tier 2</h2></div><span class="bw-badge warn">Manual review</span></div>
      <p class="instructions">Provide identity, a current selfie, and recent business address evidence.</p>
      <form @submit.prevent="submit">
        <div class="upload-grid">
          <label class="upload-field">
            <strong>Government identity</strong>
            <span>NIN slip, passport, licence, or voter card.</span>
            <select v-model="identityDocumentType" class="bw-input" aria-label="Identity document type" :disabled="submitting">
              <option value="national_id">NIN slip</option>
              <option value="voters_card">Voter card</option>
              <option value="passport">Passport</option>
              <option value="drivers_license">Driver's licence</option>
            </select>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label="Government identity file" :disabled="submitting" required @change="selectFile('identity', $event)" />
            <small>{{ identityFile ? `Selected: ${identityFile.name}` : 'Choose a file' }}</small>
          </label>
          <label class="upload-field">
            <strong>Representative selfie</strong>
            <span>Use a clear photo. Avoid filters.</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Representative selfie file" :disabled="submitting" required @change="selectFile('selfie', $event)" />
            <small>{{ selfieFile ? `Selected: ${selfieFile.name}` : 'Choose a file' }}</small>
          </label>
          <label class="upload-field">
            <strong>Business address</strong>
            <select v-model="addressDocumentType" class="bw-input" aria-label="Address document type" :disabled="submitting">
              <option value="utility_bill">Utility bill</option>
              <option value="bank_statement">Bank statement</option>
            </select>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label="Business address file" :disabled="submitting" required @change="selectFile('address', $event)" />
            <small>{{ addressFile ? `Selected: ${addressFile.name}` : 'Choose a recent document' }}</small>
          </label>
        </div>
        <p class="selection-summary" role="status" aria-live="polite">{{ selectedFileCount }} of 3 required files selected.</p>
        <p class="privacy">Private storage. File validated. Maximum 10 MB.</p>
        <div v-if="fileError" class="bw-alert danger" role="alert">{{ fileError }}</div>
        <div v-if="progress" class="bw-alert info" role="status" aria-live="polite">{{ progress }}</div>
        <button class="bw-btn primary lg" type="submit" :disabled="submitting || !identityFile || !selfieFile || !addressFile">{{ submitting ? 'Submitting…' : 'Submit Tier 2 review' }}</button>
      </form>
    </section>
  </AppShell>
</template>

<style scoped>
.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--s-4);margin-bottom:var(--s-4)}.page-head h1{margin:0;font-size:var(--t-2xl)}.page-head p{margin:4px 0 0;color:var(--text-muted)}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:10px!important;font-weight:800;color:var(--brand)!important}
.tier-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--s-3);margin-bottom:var(--s-4)}.tier-card{display:flex;flex-direction:column;gap:6px;padding:var(--s-4);border:1px solid var(--border);border-radius:var(--r-lg);background:var(--surface);opacity:.62}.tier-card.active{opacity:1;border-color:oklch(from var(--brand) l c h/.35);background:oklch(from var(--brand) l c h/.06)}.tier-card span{color:var(--text-muted);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em}.tier-card small{color:var(--text-muted)}.tier-card.active small{color:var(--brand)}
.status-card,.complete-card{display:flex;align-items:center;gap:var(--s-4)}.status-card>div,.complete-card>div{flex:1}.status-card h2,.complete-card h2{margin:0 0 4px}.status-card p,.complete-card p{margin:0;color:var(--text-muted)}.status-dot{width:12px;height:12px;border-radius:50%;background:var(--warn);box-shadow:0 0 0 6px oklch(from var(--warn) l c h/.13)}.complete-mark{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;color:var(--brand);background:oklch(from var(--brand) l c h/.12);font-weight:900}
.section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--s-3)}.section-head span:first-child{color:var(--brand);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em}.section-head h2{margin:4px 0 0}.instructions{color:var(--text-muted);max-width:680px}.upload-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:var(--s-3);margin:var(--s-4) 0}.upload-field{display:flex;flex-direction:column;gap:8px;padding:var(--s-4);border:1px dashed var(--border);border-radius:var(--r-lg);background:var(--surface-2);cursor:pointer}.upload-field span,.upload-field small,.privacy{color:var(--text-muted)}.upload-field input{width:100%;color:var(--text-muted)}.upload-field small{overflow-wrap:anywhere}.selection-summary{margin:0 0 4px;color:var(--text);font-size:var(--t-sm);font-weight:700}.privacy{font-size:var(--t-xs);margin:0 0 var(--s-3)}.submission-card .bw-btn.primary{width:100%}.empty{text-align:center;padding:var(--s-8);color:var(--text-muted)}
.review-feedback{display:grid;gap:4px;margin-bottom:var(--s-4)}
@media(max-width:640px){.tier-grid{grid-template-columns:1fr}.upload-grid{grid-template-columns:1fr}.status-card{align-items:flex-start;flex-wrap:wrap}.status-card .bw-btn{width:100%}.page-head{align-items:flex-start;flex-direction:column}.page-head>.bw-btn{width:100%}}
</style>
