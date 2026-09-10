<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import { api, shortDate } from '../lib/api';
import { useStaffAuthStore } from '../stores/auth';

type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';
type SubjectType = 'customer' | 'vendor';
interface Review {
  id: string;
  subject_type: SubjectType;
  current_tier: number;
  requested_tier: number;
  status: ReviewStatus;
  submitted_at: string;
  reviewed_at?: string | null;
  reviewer_note?: string | null;
  submission_json: Record<string, unknown>;
  subject?: Record<string, any>;
  documents: Array<{ id: string; doc_type: string; mime_type: string; size_bytes: number; status: string }>;
}

const auth = useStaffAuthStore();
const rows = ref<Review[]>([]);
const nextCursor = ref<string | null>(null);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const status = ref<ReviewStatus>('pending');
const subjectType = ref<'all' | SubjectType>('all');
const selected = ref<Review | null>(null);
const dialogOpen = ref(false);
const decision = ref<'approved' | 'rejected'>('approved');
const note = ref('');
const saving = ref(false);

const canReview = computed(() => auth.hasPermission('wallet.kyc.review'));
const visibleRows = computed(() => rows.value);
const customerCount = computed(() => rows.value.filter((row) => row.subject_type === 'customer').length);
const vendorCount = computed(() => rows.value.filter((row) => row.subject_type === 'vendor').length);
const identityDocumentTypes = new Set(['national_id', 'voters_card', 'passport', 'drivers_license']);
const addressDocumentTypes = new Set(['utility_bill', 'bank_statement']);

function hasRequiredEvidence(row: Review): boolean {
  const documentTypes = new Set(row.documents.map((document) => document.doc_type));
  const hasIdentity = [...documentTypes].some((type) => identityDocumentTypes.has(type));
  const hasSelfie = documentTypes.has('selfie');
  const hasAddress = [...documentTypes].some((type) => addressDocumentTypes.has(type));
  return hasIdentity && hasSelfie && (row.requested_tier !== 2 || hasAddress);
}

function subjectName(row: Review): string {
  return row.subject_type === 'customer'
    ? row.subject?.full_name || row.subject?.email || row.subject?.phone || 'Customer'
    : row.subject?.legal_name || row.subject?.trading_name || row.subject?.contact_email || 'Vendor';
}

function subjectContact(row: Review): string {
  return row.subject_type === 'customer'
    ? row.subject?.email || row.subject?.phone || 'No contact'
    : row.subject?.contact_email || row.subject?.contact_phone || 'No contact';
}

async function load(append = false) {
  loading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams({ status: status.value, limit: '50' });
    if (subjectType.value !== 'all') params.set('subjectType', subjectType.value);
    if (append && nextCursor.value) params.set('cursor', nextCursor.value);
    const result = await api.get<{ reviews: Review[]; nextCursor: string | null }>(`/api/v1/admin/kyc/reviews?${params}`);
    rows.value = append ? [...rows.value, ...result.reviews] : result.reviews;
    nextCursor.value = result.nextCursor;
    if (selected.value) selected.value = rows.value.find((row) => row.id === selected.value?.id) ?? null;
  } catch (cause: any) {
    error.value = cause?.message ?? 'KYC queue failed.';
  } finally { loading.value = false; }
}

function ask(row: Review, next: 'approved' | 'rejected') {
  if (next === 'approved' && !hasRequiredEvidence(row)) return;
  selected.value = row;
  decision.value = next;
  note.value = '';
  dialogOpen.value = true;
}

async function decide() {
  if (!selected.value || note.value.trim().length < 4) return;
  saving.value = true;
  error.value = '';
  try {
    const action = decision.value === 'approved' ? 'approve' : 'reject';
    await api.post(`/api/v1/admin/kyc/reviews/${selected.value.id}/${action}`, { note: note.value.trim() });
    notice.value = decision.value === 'approved' ? 'Tier approved.' : 'Review returned.';
    dialogOpen.value = false;
    selected.value = null;
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? 'Review failed.';
    dialogOpen.value = false;
  } finally { saving.value = false; }
}

async function openDocument(documentId: string) {
  error.value = '';
  try {
    const result = await api.get<{ url: string }>(`/api/v1/admin/kyc/documents/${documentId}/url`);
    window.open(result.url, '_blank', 'noopener,noreferrer');
  } catch (cause: any) {
    error.value = cause?.message ?? 'Document preview failed.';
  }
}

onMounted(() => load());
</script>

<template>
  <AppShell title="KYC Reviews">
    <header class="page-head">
      <div>
        <p class="eyebrow">Compliance</p>
        <h1>KYC tier reviews</h1>
        <p>Review identity evidence. Approve sequential tiers.</p>
      </div>
      <button class="bw-btn" :disabled="loading" @click="load()">Refresh</button>
    </header>

    <div v-if="notice" class="bw-alert success" role="status">{{ notice }}</div>
    <div v-if="error" class="bw-alert danger" role="alert">{{ error }}</div>

    <section class="kpi-grid bw-mobile-kpi-grid" aria-label="KYC queue summary">
      <div class="kpi brand"><span>{{ status }}</span><strong>{{ rows.length }}</strong><small>loaded</small></div>
      <div class="kpi"><span>Customers</span><strong>{{ customerCount }}</strong><small>loaded</small></div>
      <div class="kpi"><span>Vendors</span><strong>{{ vendorCount }}</strong><small>loaded</small></div>
    </section>

    <section class="bw-card flush">
      <div class="toolbar">
        <div class="segmented" aria-label="Review status">
          <button v-for="item in (['pending','approved','rejected'] as const)" :key="item" :class="{ active: status === item }" @click="status = item; selected = null; load()">{{ item }}</button>
        </div>
        <select v-model="subjectType" class="bw-input" aria-label="Account type" @change="selected = null; load()">
          <option value="all">All accounts</option>
          <option value="customer">Customers</option>
          <option value="vendor">Vendors</option>
        </select>
      </div>

      <div v-if="loading" class="empty">Loading reviews…</div>
      <div v-else-if="!visibleRows.length" class="empty">
        <strong>No {{ status }} reviews.</strong>
        <span>New submissions appear here.</span>
      </div>
      <div v-else class="review-list">
        <article v-for="row in visibleRows" :key="row.id" :class="['review-card', { selected: selected?.id === row.id }]">
          <button class="review-summary" type="button" :aria-expanded="selected?.id === row.id" @click="selected = selected?.id === row.id ? null : row">
            <span :class="['account-badge', row.subject_type]">{{ row.subject_type }}</span>
            <span class="identity"><strong>{{ subjectName(row) }}</strong><small>{{ subjectContact(row) }}</small></span>
            <span class="tier">Tier {{ row.current_tier }} <b>→</b> Tier {{ row.requested_tier }}</span>
            <span class="when">{{ shortDate(row.submitted_at) }}</span>
          </button>

          <div v-if="selected?.id === row.id" class="review-detail">
            <dl>
              <div v-for="(value, key) in row.submission_json" :key="key" v-show="key !== 'document_ids'">
                <dt>{{ String(key).replace(/_/g, ' ') }}</dt><dd>{{ value || '—' }}</dd>
              </div>
            </dl>
            <div class="documents">
              <p>Evidence</p>
              <button v-for="document in row.documents" :key="document.id" type="button" class="document" @click="openDocument(document.id)">
                <span>{{ document.doc_type.replace(/_/g, ' ') }}</span>
                <small>{{ Math.ceil(document.size_bytes / 1024) }} KB · View securely</small>
              </button>
              <span v-if="!row.documents.length" class="missing">No documents attached.</span>
            </div>
            <div v-if="row.status === 'pending' && canReview" class="review-actions">
              <RouterLink v-if="row.subject?.id" :to="row.subject_type === 'customer' ? `/customers/${row.subject.id}` : `/vendors/${row.subject.id}`" class="bw-btn record-link">Open account</RouterLink>
              <button class="bw-btn danger" @click="ask(row, 'rejected')">Request changes</button>
              <button class="bw-btn primary" :disabled="!hasRequiredEvidence(row)" @click="ask(row, 'approved')">Approve tier</button>
            </div>
            <p v-else-if="row.reviewer_note" class="review-note"><strong>Review note:</strong> {{ row.reviewer_note }}</p>
          </div>
        </article>
        <button v-if="nextCursor" class="bw-btn load-more" :disabled="loading" @click="load(true)">Load more reviews</button>
      </div>
    </section>

    <ConfirmDialog
      v-model:open="dialogOpen"
      :title="decision === 'approved' ? 'Approve KYC tier' : 'Request KYC changes'"
      :description="selected ? `${subjectName(selected)} moves from Tier ${selected.current_tier} to Tier ${selected.requested_tier}. This is permanent and audit-logged.` : ''"
      :confirm-label="decision === 'approved' ? 'Approve tier' : 'Request changes'"
      :tone="decision === 'approved' ? 'brand' : 'danger'"
      :loading="saving"
      :disable-confirm="note.trim().length < 4"
      @confirm="decide"
    >
      <label class="note-label" for="review-note">Review note</label>
      <textarea id="review-note" v-model="note" class="note-input" rows="4" maxlength="1000" placeholder="Record the evidence checked." />
      <p class="note-help">Minimum four characters.</p>
    </ConfirmDialog>
  </AppShell>
</template>

<style scoped>
.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--s-4);margin-bottom:var(--s-4)}
.page-head h1{margin:0;font-size:var(--t-2xl)}.page-head p{margin:4px 0 0;color:var(--text-muted)}
.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:10px!important;font-weight:800;color:var(--brand)!important}
.kpi-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--s-3);margin-bottom:var(--s-4)}
.kpi{display:grid;grid-template-columns:auto 1fr;align-items:baseline;column-gap:var(--s-2);row-gap:2px;min-width:0;padding:var(--s-3);border:1px solid var(--border);border-radius:var(--r-lg);background:var(--surface)}
.kpi.brand{border-color:oklch(from var(--brand) l c h/.32);background:oklch(from var(--brand) l c h/.08)}
.kpi span{grid-column:1/-1;font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kpi strong{font:700 clamp(20px,2.1vw,28px)/1 var(--font-mono);color:var(--text)}.kpi.brand strong{color:var(--brand)}.kpi small{color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.toolbar{display:flex;align-items:center;justify-content:space-between;gap:var(--s-3);padding:var(--s-3) var(--s-4);border-bottom:1px solid var(--border)}
.toolbar .bw-input{width:190px}.segmented{display:flex;padding:3px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface-2)}
.segmented button{border:0;background:transparent;color:var(--text-muted);padding:8px 14px;border-radius:calc(var(--r-md) - 3px);text-transform:capitalize;font-weight:700;cursor:pointer}.segmented button.active{background:var(--surface);color:var(--brand);box-shadow:0 1px 5px oklch(0 0 0/.16)}
.empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:var(--s-8);color:var(--text-muted)}
.review-list{padding:var(--s-3);display:grid;gap:var(--s-2)}.review-card{border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;background:var(--surface)}.review-card.selected{border-color:oklch(from var(--brand) l c h/.45)}
.review-summary{width:100%;display:grid;grid-template-columns:92px minmax(180px,1fr) 140px 110px;gap:var(--s-3);align-items:center;padding:var(--s-3) var(--s-4);border:0;background:transparent;color:var(--text);text-align:left;cursor:pointer}
.account-badge{width:max-content;padding:4px 9px;border-radius:var(--r-full);text-transform:uppercase;font-size:10px;font-weight:800;letter-spacing:.07em}.account-badge.customer{color:var(--brand);background:oklch(from var(--brand) l c h/.12)}.account-badge.vendor{color:var(--info);background:oklch(from var(--info) l c h/.12)}
.identity{display:flex;flex-direction:column;gap:3px;min-width:0}.identity strong,.identity small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.identity small,.when{color:var(--text-muted);font-size:var(--t-xs)}.tier{font-family:var(--font-mono);font-weight:700}.tier b{color:var(--brand)}
.review-detail{padding:var(--s-4);border-top:1px solid var(--border);background:var(--surface-2)}.review-detail dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--s-2) var(--s-4);margin:0 0 var(--s-4)}.review-detail dl div{display:grid;grid-template-columns:130px 1fr;gap:var(--s-2)}.review-detail dt{text-transform:capitalize;color:var(--text-muted)}.review-detail dd{margin:0;word-break:break-word}
.documents{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s-2)}.documents>p{width:100%;margin:0;font-weight:800}.document{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface);color:var(--text);text-align:left;cursor:pointer;text-transform:capitalize}.document small,.missing{color:var(--text-muted)}
.review-actions{display:flex;justify-content:flex-end;gap:var(--s-2);margin-top:var(--s-4);padding-top:var(--s-3);border-top:1px solid var(--border)}.record-link{text-decoration:none;margin-right:auto}.review-note{margin:var(--s-4) 0 0;color:var(--text-muted)}
.load-more{justify-self:center;margin:var(--s-2) 0}
.note-label{display:block;font-weight:800;margin-bottom:6px}.note-input{width:100%;resize:vertical;border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface-2);color:var(--text);padding:10px 12px;font:inherit}.note-input:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-glow)}.note-help{margin:6px 0 0;color:var(--text-muted);font-size:var(--t-xs)}
@media(max-width:700px){.kpi-grid.bw-mobile-kpi-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:var(--s-2)}.kpi-grid.bw-mobile-kpi-grid>.kpi{display:grid!important;min-height:0;padding:10px!important;gap:2px var(--s-2)!important}.kpi-grid.bw-mobile-kpi-grid>:last-child:nth-child(odd){grid-column:auto!important}.kpi small{font-size:11px}.toolbar{align-items:stretch;flex-direction:column}.toolbar .bw-input{width:100%}.segmented{overflow-x:auto}.segmented button{flex:1}.review-summary{grid-template-columns:1fr auto}.account-badge,.when{grid-row:1}.identity{grid-column:1}.tier{grid-column:2;grid-row:2}.review-detail dl{grid-template-columns:1fr}.page-head{align-items:flex-start}.page-head .bw-btn{flex-shrink:0}}
@media(max-width:420px){.kpi-grid{gap:6px}.kpi{padding:9px 8px}.kpi span{font-size:8px}.kpi strong{font-size:20px}.kpi small{font-size:9px}.review-summary{grid-template-columns:1fr}.account-badge,.identity,.tier,.when{grid-column:1;grid-row:auto}.review-actions{flex-direction:column-reverse}.review-actions .bw-btn{width:100%}}
</style>
