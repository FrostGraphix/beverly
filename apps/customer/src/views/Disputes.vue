<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { naira, shortDate } from '../lib/format';

type IssueType = 'token_not_received' | 'token_failed' | 'wrong_meter' | 'refund' | 'other';

const ISSUE_TYPES: Array<{ key: IssueType; label: string; subject: string; hint: string }> = [
  { key: 'token_not_received', label: 'Token missing', subject: 'Token not received', hint: 'Use this when payment succeeded but no token arrived.' },
  { key: 'token_failed', label: 'Token failed', subject: 'Token rejected by meter', hint: 'Use this when the meter rejected a token or KCT sequence.' },
  { key: 'wrong_meter', label: 'Wrong meter', subject: 'Token bought for wrong meter', hint: 'Use this when the receipt meter is not yours.' },
  { key: 'refund', label: 'Refund', subject: 'Refund request', hint: 'Use this when money was debited and service failed.' },
  { key: 'other', label: 'Other', subject: 'Wallet support request', hint: 'Use this for any other wallet issue.' },
];

const STATUS_FILTERS = ['all', 'open', 'under_review', 'resolved', 'refund_issued', 'rejected'];

const route = useRoute();
const disputes = ref<any[]>([]);
const receipts = ref<any[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const notice = ref('');
const showNew = ref(false);
const newError = ref('');
const selected = ref<any>(null);
const detail = ref<any>(null);
const replyText = ref('');
const statusFilter = ref('all');
const form = ref({
  issue_type: 'token_failed' as IssueType,
  purchase_order_id: '',
  subject: 'Token rejected by meter',
  description: '',
});
const evidenceFile = ref<File | null>(null);
const evidenceError = ref('');
const uploadingEvidence = ref(false);
const ALLOWED_EVIDENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

const visibleDisputes = computed(() => {
  if (statusFilter.value === 'all') return disputes.value;
  return disputes.value.filter((d) => d.status === statusFilter.value);
});

const stats = computed(() => ({
  open: disputes.value.filter((d) => ['open', 'under_review'].includes(d.status)).length,
  resolved: disputes.value.filter((d) => ['resolved', 'refund_issued'].includes(d.status)).length,
  total: disputes.value.length,
}));

const selectedReceipt = computed(() =>
  receipts.value.find((r) => r.purchase_order_id === form.value.purchase_order_id) ?? null,
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [disputeRes, receiptRes] = await Promise.all([
      api.get<{ disputes?: any[] }>('/api/v1/customer/disputes'),
      api.get<{ receipts?: any[] }>('/api/v1/customer/receipts').catch(() => ({ receipts: [] })),
    ]);
    disputes.value = disputeRes.disputes ?? [];
    receipts.value = receiptRes.receipts ?? [];
  } catch (e: any) {
    error.value = e.message ?? 'Failed to load disputes.';
  } finally {
    loading.value = false;
  }
}

function openNew(orderId = '') {
  newError.value = '';
  notice.value = '';
  form.value = {
    issue_type: 'token_failed',
    purchase_order_id: orderId,
    subject: 'Token rejected by meter',
    description: '',
  };
  evidenceFile.value = null;
  evidenceError.value = '';
  showNew.value = true;
}

function onEvidenceSelected(e: Event) {
  evidenceError.value = '';
  const file = (e.target as HTMLInputElement)?.files?.[0] ?? null;
  if (!file) { evidenceFile.value = null; return; }
  if (!ALLOWED_EVIDENCE_TYPES.includes(file.type)) {
    evidenceError.value = 'Only JPEG, PNG, WEBP, or PDF files are accepted.';
    evidenceFile.value = null;
    return;
  }
  if (file.size > MAX_EVIDENCE_BYTES) {
    evidenceError.value = 'File must be under 5MB.';
    evidenceFile.value = null;
    return;
  }
  evidenceFile.value = file;
}

async function uploadEvidence(disputeId: string, file: File) {
  const payload = await api.post<any>(`/api/v1/customer/disputes/${disputeId}/evidence/upload-url`, {
    file_name: file.name,
    content_type: file.type,
    size_bytes: file.size,
  });
  if (!payload?.signed_url) throw new Error('evidence_upload_unavailable');
  const uploadResponse = await fetch(payload.signed_url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!uploadResponse.ok) throw new Error('evidence_upload_failed');
  await api.post(`/api/v1/customer/disputes/${disputeId}/evidence/activate`, { path: payload.path });
}

function applyIssueType(type: IssueType) {
  const issue = ISSUE_TYPES.find((item) => item.key === type);
  if (!issue) return;
  form.value.issue_type = type;
  form.value.subject = issue.subject;
}

async function submitNew() {
  newError.value = '';
  if (form.value.subject.trim().length < 5) {
    newError.value = 'Add a clear subject.';
    return;
  }
  if (form.value.description.trim().length < 10) {
    newError.value = 'Add at least 10 characters.';
    return;
  }
  saving.value = true;
  try {
    const payload: any = {
      subject: form.value.subject.trim(),
      description: buildDescription(),
    };
    if (form.value.purchase_order_id) payload.purchase_order_id = form.value.purchase_order_id;
    const result = await api.post<any>('/api/v1/customer/disputes', payload);
    if (evidenceFile.value && result?.id) {
      uploadingEvidence.value = true;
      try {
        await uploadEvidence(result.id, evidenceFile.value);
      } catch {
        notice.value = `Dispute ${result.reference ?? ''} raised, but the attachment failed to upload. You can add it from the dispute detail later.`;
        showNew.value = false;
        await load();
        return;
      } finally {
        uploadingEvidence.value = false;
      }
    }
    showNew.value = false;
    notice.value = `Dispute ${result.reference ?? ''} raised.`;
    await load();
  } catch (e: any) {
    newError.value = e.message ?? 'Failed to submit dispute.';
  } finally {
    saving.value = false;
  }
}

function buildDescription() {
  const receipt = selectedReceipt.value;
  const lines = [
    `Issue type: ${issueLabel(form.value.issue_type)}`,
    receipt ? `Receipt: ${receipt.receipt_number}` : '',
    receipt ? `Meter: ${receipt.meter_id}` : '',
    receipt ? `Amount paid: ${naira(receipt.amount_minor)}` : '',
    receipt ? `Energy value: ${naira(receipt.energy_amount_minor ?? receipt.amount_minor)}` : '',
    receipt ? `VAT: ${naira(receipt.vat_amount_minor ?? 0)}` : '',
    '',
    form.value.description.trim(),
  ];
  return lines.filter((line, index) => line || index > 3).join('\n').trim();
}

async function openDetail(d: any) {
  selected.value = d;
  detail.value = null;
  replyText.value = '';
  try {
    detail.value = await api.get(`/api/v1/customer/disputes/${d.id}`);
  } catch {
    detail.value = d;
  }
}

async function sendMessage() {
  if (!selected.value || !replyText.value.trim()) return;
  saving.value = true;
  try {
    await api.post(`/api/v1/customer/disputes/${selected.value.id}/messages`, { body: replyText.value.trim() });
    replyText.value = '';
    detail.value = await api.get(`/api/v1/customer/disputes/${selected.value.id}`);
  } catch (e: any) {
    error.value = e.message ?? 'Failed to send message.';
  } finally {
    saving.value = false;
  }
}

function statusClass(status: string) {
  return {
    open: 'bw-badge-warning',
    under_review: 'bw-badge-brand',
    resolved: 'bw-badge-success',
    rejected: 'bw-badge-error',
    refund_issued: 'bw-badge-success',
  }[status] ?? 'bw-badge-neutral';
}

function issueLabel(type: IssueType) {
  return ISSUE_TYPES.find((issue) => issue.key === type)?.label ?? 'Other';
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ');
}

function meterTypeLabel(type?: string | null) {
  if (type === 'three_phase') return 'Three Phase';
  if (type === 'single_phase') return 'Single Phase';
  return 'Unknown';
}

function onEsc(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  if (selected.value) selected.value = null;
  else if (showNew.value) showNew.value = false;
}

watch(() => route.query, (query) => {
  const orderId = typeof query.order === 'string' ? query.order : '';
  if (query.new === '1' || orderId) openNew(orderId);
}, { immediate: true });

onMounted(() => {
  load();
  window.addEventListener('keydown', onEsc);
});
onUnmounted(() => window.removeEventListener('keydown', onEsc));
</script>

<template>
  <AppShell>
    <section class="disputes-page">
      <header class="disputes-head">
        <div>
          <p class="page-kicker">Support</p>
          <h1>My Disputes</h1>
          <p>Track refunds, token issues, and meter purchase problems.</p>
        </div>
        <button class="bw-btn bw-btn-primary bw-btn-sm" @click="openNew()">+ Raise</button>
      </header>

      <div class="dispute-stats">
        <article>
          <span>Open</span>
          <strong>{{ stats.open }}</strong>
        </article>
        <article>
          <span>Resolved</span>
          <strong>{{ stats.resolved }}</strong>
        </article>
        <article>
          <span>Total</span>
          <strong>{{ stats.total }}</strong>
        </article>
      </div>

      <div v-if="notice" class="dispute-notice">{{ notice }}</div>
      <div v-if="error" class="dispute-error">{{ error }}</div>

      <div class="dispute-actions">
        <button
          v-for="status in STATUS_FILTERS"
          :key="status"
          :class="['filter-chip', statusFilter === status && 'active']"
          @click="statusFilter = status"
        >
          {{ statusLabel(status) }}
        </button>
      </div>

      <div class="dispute-card">
        <div class="dispute-card-head">
          <strong>{{ visibleDisputes.length }} disputes</strong>
          <button class="plain-link" @click="load">Refresh</button>
        </div>

        <div v-if="loading" class="dispute-empty">Loading disputes...</div>
        <div v-else-if="!visibleDisputes.length" class="dispute-empty">
          <strong>No disputes here.</strong>
          <span>Raise one from a receipt, or start a general request.</span>
          <button class="bw-btn bw-btn-primary bw-btn-sm" @click="openNew()">Raise dispute</button>
        </div>
        <button
          v-for="d in visibleDisputes"
          v-else
          :key="d.id"
          class="dispute-row"
          @click="openDetail(d)"
        >
          <span>
            <strong>{{ d.subject }}</strong>
            <small>{{ d.reference }} - {{ shortDate(d.created_at) }}</small>
            <small v-if="d.purchase_order">{{ d.purchase_order.meter_id }} - {{ meterTypeLabel(d.purchase_order.meter_type) }}</small>
          </span>
          <span :class="statusClass(d.status)" class="bw-badge">{{ statusLabel(d.status) }}</span>
        </button>
      </div>
    </section>

    <div v-if="showNew" class="bw-modal-backdrop" @click.self="showNew = false">
      <div class="bw-modal dispute-modal">
        <div class="bw-modal-header">
          <h2>Raise dispute</h2>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="showNew = false">Close</button>
        </div>
        <div class="bw-modal-body dispute-modal-body">
          <div class="issue-grid">
            <button
              v-for="issue in ISSUE_TYPES"
              :key="issue.key"
              :class="['issue-card', form.issue_type === issue.key && 'active']"
              @click="applyIssueType(issue.key)"
            >
              <strong>{{ issue.label }}</strong>
              <span>{{ issue.hint }}</span>
            </button>
          </div>

          <label class="field">
            <span>Receipt</span>
            <select v-model="form.purchase_order_id" class="bw-input">
              <option value="">No receipt attached</option>
              <option v-for="r in receipts" :key="r.purchase_order_id" :value="r.purchase_order_id">
                {{ r.receipt_number }} - {{ r.meter_id }} - {{ naira(r.amount_minor) }}
              </option>
            </select>
          </label>

          <div v-if="selectedReceipt" class="receipt-preview">
            <span>Meter <strong>{{ selectedReceipt.meter_id }}</strong></span>
            <span>Phase <strong>{{ meterTypeLabel(selectedReceipt.meter_type) }}</strong></span>
            <span>Amount paid <strong>{{ naira(selectedReceipt.amount_minor) }}</strong></span>
            <span>Energy value <strong>{{ naira(selectedReceipt.energy_amount_minor ?? selectedReceipt.amount_minor) }}</strong></span>
            <span>VAT <strong>{{ naira(selectedReceipt.vat_amount_minor ?? 0) }}</strong></span>
          </div>

          <label class="field">
            <span>Subject</span>
            <input v-model="form.subject" class="bw-input" />
          </label>

          <label class="field">
            <span>What happened?</span>
            <textarea v-model="form.description" class="bw-textarea" rows="5" placeholder="Describe the issue, meter message, and what you already tried."></textarea>
          </label>

          <label class="field">
            <span>Photo or document (optional)</span>
            <input type="file" class="bw-input" accept="image/jpeg,image/png,image/webp,application/pdf" @change="onEvidenceSelected" />
            <small v-if="evidenceFile" style="color: var(--text-2)">{{ evidenceFile.name }} attached</small>
          </label>
          <div v-if="evidenceError" class="dispute-error">{{ evidenceError }}</div>

          <div v-if="newError" class="dispute-error">{{ newError }}</div>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="showNew = false">Cancel</button>
          <button class="bw-btn bw-btn-brand" :disabled="saving || uploadingEvidence" @click="submitNew">
            {{ uploadingEvidence ? 'Uploading attachment...' : saving ? 'Submitting...' : 'Submit dispute' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="selected" class="bw-modal-backdrop" @click.self="selected = null">
      <div class="bw-modal bw-modal-lg dispute-modal">
        <div class="bw-modal-header">
          <h2>{{ selected.reference }}</h2>
          <span :class="statusClass(selected.status)" class="bw-badge">{{ statusLabel(selected.status) }}</span>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" style="margin-left:auto" @click="selected = null">Close</button>
        </div>
        <div class="bw-modal-body dispute-modal-body">
          <div class="detail-title">
            <strong>{{ selected.subject }}</strong>
            <span>{{ selected.description }}</span>
          </div>

          <div v-if="detail?.purchase_order" class="receipt-preview">
            <span>Meter <strong>{{ detail.purchase_order.meter_id }}</strong></span>
            <span>Phase <strong>{{ meterTypeLabel(detail.purchase_order.meter_type) }}</strong></span>
            <span>Amount paid <strong>{{ naira(detail.purchase_order.amount_minor) }}</strong></span>
            <span>Energy value <strong>{{ naira(detail.purchase_order.energy_amount_minor ?? detail.purchase_order.amount_minor) }}</strong></span>
            <span>VAT <strong>{{ naira(detail.purchase_order.vat_amount_minor ?? 0) }}</strong></span>
            <span>Status <strong>{{ statusLabel(detail.purchase_order.status) }}</strong></span>
          </div>

          <div v-if="detail?.evidence?.length" class="section-label">Attachments</div>
          <div v-if="detail?.evidence?.length" class="evidence-list">
            <a
              v-for="(item, idx) in detail.evidence"
              :key="item.path"
              :href="item.url ?? undefined"
              target="_blank"
              rel="noopener noreferrer"
              class="evidence-chip"
            >
              Attachment {{ idx + 1 }}
            </a>
          </div>

          <div class="section-label">Conversation</div>
          <div class="messages">
            <div
              v-for="m in detail?.messages ?? []"
              :key="m.id"
              :class="['message', m.sender_actor_type === 'customer' ? 'mine' : 'staff']"
            >
              <span>{{ m.sender_actor_type === 'customer' ? 'You' : 'Support' }}</span>
              <p>{{ m.body }}</p>
              <small>{{ shortDate(m.created_at) }}</small>
            </div>
            <p v-if="!detail?.messages?.length" class="empty-small">No messages yet.</p>
          </div>

          <textarea v-model="replyText" class="bw-textarea" placeholder="Write a reply..." rows="3"></textarea>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="selected = null">Close</button>
          <button class="bw-btn bw-btn-brand" :disabled="!replyText.trim() || saving" @click="sendMessage">
            {{ saving ? 'Sending...' : 'Send reply' }}
          </button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.disputes-page {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}
.disputes-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-3);
}
.page-kicker {
  margin: 0 0 4px;
  color: var(--brand);
  font-size: var(--t-2xs);
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.disputes-head h1 {
  margin: 0;
  font-size: var(--t-2xl);
  color: var(--text);
}
.disputes-head p:last-child {
  margin: 5px 0 0;
  color: var(--text-2);
  font-size: var(--t-sm);
  line-height: 1.35;
}
.dispute-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--s-2);
}
.dispute-stats article,
.dispute-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--r-xl);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
}
.dispute-stats article {
  padding: var(--s-3);
}
.dispute-stats span {
  display: block;
  color: var(--text-2);
  font-size: var(--t-2xs);
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.dispute-stats strong {
  display: block;
  margin-top: 6px;
  color: var(--text);
  font-size: var(--t-xl);
}
.dispute-notice,
.dispute-error {
  padding: var(--s-3);
  border-radius: var(--r-lg);
  font-size: var(--t-sm);
  font-weight: 700;
}
.dispute-notice {
  background: color-mix(in srgb, var(--brand) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--brand) 35%, transparent);
  color: var(--brand);
}
.dispute-error {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent);
  color: var(--danger);
}
.dispute-actions {
  display: flex;
  gap: var(--s-2);
  overflow-x: auto;
  padding-bottom: 2px;
}
.filter-chip {
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  background: var(--glass-bg);
  color: var(--text-2);
  padding: 8px 12px;
  font-weight: 800;
  text-transform: capitalize;
  white-space: nowrap;
}
.filter-chip.active {
  background: var(--brand);
  border-color: var(--brand);
  color: #04140b;
}
.dispute-card {
  overflow: hidden;
}
.dispute-card-head,
.dispute-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-4);
}
.dispute-card-head {
  border-bottom: 1px solid var(--border);
}
.plain-link {
  border: 0;
  background: none;
  color: var(--brand);
  font-weight: 800;
}
.dispute-row {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  text-align: left;
}
.dispute-row:last-child {
  border-bottom: 0;
}
.dispute-row > span:first-child {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.dispute-row strong {
  font-size: var(--t-sm);
}
.dispute-row small {
  color: var(--text-2);
  font-size: var(--t-xs);
}
.dispute-empty {
  display: grid;
  place-items: center;
  gap: var(--s-2);
  min-height: 220px;
  padding: var(--s-5);
  color: var(--text-2);
  text-align: center;
}
.dispute-empty strong {
  color: var(--text);
}
.dispute-modal {
  max-height: calc(100dvh - 48px);
  display: flex;
  flex-direction: column;
}
.dispute-modal-body {
  overflow-y: auto;
}
.issue-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-2);
}
.issue-card {
  min-height: 86px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface-2);
  color: var(--text);
  text-align: left;
  padding: var(--s-3);
}
.issue-card.active {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px var(--brand-glow);
}
.issue-card strong,
.issue-card span {
  display: block;
}
.issue-card span {
  margin-top: 5px;
  color: var(--text-2);
  font-size: var(--t-xs);
  line-height: 1.35;
}
.field {
  display: grid;
  gap: 7px;
}
.field > span,
.section-label {
  color: var(--text-2);
  font-size: var(--t-2xs);
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.receipt-preview {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-2);
  padding: var(--s-3);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface-2);
}
.receipt-preview span {
  color: var(--text-2);
  font-size: var(--t-xs);
}
.receipt-preview strong {
  display: block;
  margin-top: 3px;
  color: var(--text);
}
.detail-title {
  display: grid;
  gap: 6px;
}
.detail-title span {
  color: var(--text-2);
  font-size: var(--t-sm);
  white-space: pre-wrap;
}
.messages {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  max-height: 260px;
  overflow-y: auto;
}
.message {
  max-width: 86%;
  padding: var(--s-3);
  border-radius: var(--r-lg);
  background: var(--surface-2);
}
.message.mine {
  align-self: flex-end;
  background: color-mix(in srgb, var(--brand) 18%, var(--surface-2));
}
.message span,
.message small {
  color: var(--text-2);
  font-size: var(--t-2xs);
  font-weight: 800;
  text-transform: uppercase;
}
.message p {
  margin: 5px 0;
  font-size: var(--t-sm);
  line-height: 1.4;
}
.empty-small {
  margin: 0;
  color: var(--text-2);
  font-size: var(--t-sm);
}
.evidence-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}
.evidence-chip {
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: var(--t-xs);
  font-weight: 700;
  color: var(--brand);
  text-decoration: none;
  background: var(--glass-bg);
}
@media (max-width: 420px) {
  .issue-grid,
  .receipt-preview {
    grid-template-columns: 1fr;
  }
}
</style>
