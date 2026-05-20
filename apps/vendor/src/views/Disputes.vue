<template>
  <AppShell title="Disputes">
    <template #topbar-end>
      <button class="bw-btn bw-btn-primary" @click="showNew = true">+ Raise Dispute</button>
    </template>

    <div v-if="loading" class="bw-loading">Loading…</div>
    <div v-else-if="error" class="bw-error-banner">{{ error }}</div>

    <div v-else>
      <div class="bw-table-wrapper">
        <table class="bw-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in disputes" :key="d.id">
              <td class="bw-mono bw-text-sm">{{ d.reference }}</td>
              <td class="bw-text-sm" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ d.subject }}</td>
              <td><span :class="statusClass(d.status)" class="bw-badge">{{ statusLabel(d.status) }}</span></td>
              <td class="bw-text-sm">{{ fmtDate(d.created_at) }}</td>
              <td><button class="bw-btn bw-btn-ghost bw-btn-sm" @click="openDetail(d)">View</button></td>
            </tr>
            <tr v-if="!disputes.length">
              <td colspan="5" class="bw-empty">No disputes yet. Raise one if you have a vending issue.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards (≤640px) -->
      <div class="bw-t-cards">
        <div v-if="!disputes.length" class="bw-empty">No disputes yet.</div>
        <div v-for="d in disputes" :key="d.id" class="bw-tc">
          <div class="bw-tc-head">
            <span class="bw-mono" style="font-size:var(--t-sm)">{{ d.reference }}</span>
            <span :class="statusClass(d.status)" class="bw-badge">{{ statusLabel(d.status) }}</span>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Subject</span><span class="bw-tc-pair-val">{{ d.subject }}</span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Created</span><span class="bw-tc-pair-val">{{ fmtDate(d.created_at) }}</span></div>
          </div>
          <div class="bw-tc-foot">
            <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="openDetail(d)">View</button>
          </div>
        </div>
      </div>
    </div>

    <!-- New Dispute Modal -->
    <div v-if="showNew" class="bw-modal-backdrop" @click.self="showNew = false">
      <div class="bw-modal">
        <div class="bw-modal-header">
          <h2>Raise a Dispute</h2>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="showNew = false">✕</button>
        </div>
        <div class="bw-modal-body">
          <div class="bw-form-group">
            <label class="bw-label">Type</label>
            <select v-model="form.disputeType" class="bw-select">
              <option value="vend_failure">Vend Failure</option>
              <option value="token_not_received">Token Not Received</option>
              <option value="overcharge">Overcharge</option>
              <option value="underdelivery">Underdelivery</option>
              <option value="double_charge">Double Charge</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="bw-form-group">
            <label class="bw-label">Description *</label>
            <textarea v-model="form.description" class="bw-textarea" rows="4" placeholder="Describe the issue in detail…"></textarea>
          </div>
          <div class="bw-form-group">
            <label class="bw-label">Purchase Order ID (optional)</label>
            <input v-model="form.purchase_order_id" class="bw-input bw-mono" placeholder="Order UUID…" />
          </div>
          <div v-if="newError" class="bw-error-banner">{{ newError }}</div>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="showNew = false">Cancel</button>
          <button class="bw-btn bw-btn-primary" :disabled="saving" @click="submitNew">
            {{ saving ? 'Submitting…' : 'Submit' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Detail Modal -->
    <div v-if="selected" class="bw-modal-backdrop" @click.self="selected = null">
      <div class="bw-modal bw-modal-lg">
        <div class="bw-modal-header">
          <h2>{{ selected.reference }}</h2>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="selected = null">✕</button>
        </div>
        <div class="bw-modal-body">
          <p class="bw-text-sm"><strong>{{ selected.subject }}</strong></p>
          <p class="bw-text-sm bw-text-muted">{{ detail?.description || selected.description }}</p>

          <div class="bw-section-label">Thread</div>
          <div class="bw-messages">
            <div v-for="m in detail?.dispute_messages" :key="m.id" :class="['bw-message', m.sender_actor_type === 'staff' ? 'bw-message-staff' : '']">
              <span class="bw-message-actor">{{ m.sender_actor_type === 'staff' ? 'Beverly Support' : 'You' }}</span>
              <p class="bw-message-body">{{ m.body }}</p>
              <span class="bw-message-time">{{ fmtDate(m.created_at) }}</span>
            </div>
            <p v-if="!detail?.dispute_messages?.length" class="bw-text-sm bw-text-muted">No messages yet.</p>
          </div>

          <textarea v-model="replyText" class="bw-textarea" placeholder="Add a message to support…" rows="3"></textarea>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="selected = null">Close</button>
          <button class="bw-btn bw-btn-primary" :disabled="!replyText || saving" @click="sendMessage">
            {{ saving ? 'Sending…' : 'Send' }}
          </button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';

const disputes = ref<any[]>([]);
const loading  = ref(false);
const error    = ref('');
const showNew  = ref(false);
const saving   = ref(false);
const newError = ref('');
const selected = ref<any>(null);
const detail   = ref<any>(null);
const replyText = ref('');

const form = ref({ disputeType: 'other', description: '', purchase_order_id: '' });

async function load() {
  loading.value = true;
  error.value   = '';
  try {
    const res = await api.get<{ disputes?: any[] }>('/api/v1/vendor/disputes');
    disputes.value = res.disputes ?? [];
  } catch (e: any) {
    error.value = e.message ?? 'Failed to load disputes';
  } finally {
    loading.value = false;
  }
}

const SUBJECT_MAP: Record<string, string> = {
  vend_failure: 'Vend Failure',
  token_not_received: 'Token Not Received',
  overcharge: 'Overcharge',
  underdelivery: 'Underdelivery',
  double_charge: 'Double Charge',
  other: 'Other Issue',
};

async function submitNew() {
  newError.value = '';
  if (!form.value.description.trim() || form.value.description.trim().length < 10) {
    newError.value = 'Description must be at least 10 characters.';
    return;
  }
  saving.value = true;
  try {
    const subject = SUBJECT_MAP[form.value.disputeType] ?? 'Dispute';
    const payload: any = { subject, description: form.value.description.trim() };
    if (form.value.purchase_order_id) payload.purchase_order_id = form.value.purchase_order_id;
    await api.post('/api/v1/vendor/disputes', payload);
    showNew.value = false;
    form.value = { disputeType: 'other', description: '', purchase_order_id: '' };
    await load();
  } catch (e: any) {
    newError.value = e.message ?? 'Failed to submit dispute';
  } finally {
    saving.value = false;
  }
}

async function openDetail(d: any) {
  selected.value  = d;
  detail.value    = null;
  replyText.value = '';
  try {
    detail.value = await api.get<any>(`/api/v1/vendor/disputes/${d.id}`);
  } catch {}
}

async function sendMessage() {
  if (!selected.value || !replyText.value.trim()) return;
  saving.value = true;
  try {
    await api.post(`/api/v1/vendor/disputes/${selected.value.id}/messages`, { body: replyText.value });
    replyText.value = '';
    detail.value = await api.get<any>(`/api/v1/vendor/disputes/${selected.value.id}`);
  } catch (e: any) {
    error.value = e.message ?? 'Failed to send message';
  } finally {
    saving.value = false;
  }
}

function statusLabel(s: string) {
  return {
    open:          'Open',
    under_review:  'Under Review',
    resolved:      'Resolved',
    rejected:      'Rejected',
    refund_issued: 'Refund Issued',
  }[s] ?? s;
}

function statusClass(s: string) {
  return {
    open:          'bw-badge-warning',
    under_review:  'bw-badge-brand',
    resolved:      'bw-badge-success',
    rejected:      'bw-badge-neutral',
    refund_issued: 'bw-badge-success',
  }[s] ?? 'bw-badge-neutral';
}

function fmtDate(s: string) { return s ? new Date(s).toLocaleString() : '—'; }

onMounted(load);
</script>

<style scoped>
.bw-messages { display: flex; flex-direction: column; gap: .5rem; margin: .5rem 0 1rem; max-height: 240px; overflow-y: auto; }
.bw-message { background: var(--surface); border-radius: var(--r-md); padding: .5rem .75rem; }
.bw-message-staff { background: oklch(from var(--brand) l c h / 0.10); }
.bw-message-actor { font-size: .7rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted); display: block; }
.bw-message-body { margin: .25rem 0; font-size: .875rem; }
.bw-message-time { font-size: .7rem; color: var(--text-muted); }
.bw-section-label { font-size: .75rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted); margin: 1rem 0 .25rem; }
.bw-tc-foot { padding: var(--s-3) var(--s-4); border-top: 1px solid var(--border); }
</style>
