<template>
  <div class="bw-page">
    <div class="bw-page-header">
      <h1 class="bw-page-title">Disputes</h1>
      <button class="bw-btn bw-btn-primary" @click="showNew = true">+ Raise Dispute</button>
    </div>

    <div v-if="loading" class="bw-loading">Loading…</div>
    <div v-else-if="error" class="bw-error-banner">{{ error }}</div>

    <div v-else class="bw-table-wrapper">
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
            <td class="bw-mono">{{ d.reference }}</td>
            <td>{{ d.subject }}</td>
            <td><span :class="statusClass(d.status)" class="bw-badge">{{ d.status }}</span></td>
            <td class="bw-text-sm">{{ fmtDate(d.created_at) }}</td>
            <td><button class="bw-btn bw-btn-ghost bw-btn-sm" @click="openDetail(d)">View</button></td>
          </tr>
          <tr v-if="!disputes.length">
            <td colspan="5" class="bw-empty">No disputes yet.</td>
          </tr>
        </tbody>
      </table>
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
            <label class="bw-label">Subject *</label>
            <input v-model="form.subject" class="bw-input" placeholder="Brief subject…" />
          </div>
          <div class="bw-form-group">
            <label class="bw-label">Description *</label>
            <textarea v-model="form.description" class="bw-textarea" rows="4" placeholder="Describe the issue in detail…"></textarea>
          </div>
          <div class="bw-form-group">
            <label class="bw-label">Purchase Order ID (optional)</label>
            <input v-model="form.purchase_order_id" class="bw-input bw-mono" placeholder="UUID…" />
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
          <p class="bw-text-sm bw-text-muted">{{ selected.description }}</p>

          <div class="bw-section-label">Messages</div>
          <div class="bw-messages">
            <div v-for="m in detail?.messages" :key="m.id" :class="['bw-message', m.sender_actor_type === 'staff' ? 'bw-message-staff' : '']">
              <span class="bw-message-actor">{{ m.sender_actor_type }}</span>
              <p class="bw-message-body">{{ m.body }}</p>
              <span class="bw-message-time">{{ fmtDate(m.created_at) }}</span>
            </div>
            <p v-if="!detail?.messages?.length" class="bw-text-sm bw-text-muted">No messages yet.</p>
          </div>

          <textarea v-model="replyText" class="bw-textarea" placeholder="Add a message…" rows="3"></textarea>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="selected = null">Close</button>
          <button class="bw-btn bw-btn-primary" :disabled="!replyText || saving" @click="sendMessage">
            {{ saving ? 'Sending…' : 'Send' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
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

const form = ref({ subject: '', description: '', purchase_order_id: '' });

async function load() {
  loading.value = true;
  error.value   = '';
  try {
    const res = await api.get('/api/v1/vendor/disputes');
    disputes.value = res.disputes ?? [];
  } catch (e: any) {
    error.value = e.message ?? 'Failed to load disputes';
  } finally {
    loading.value = false;
  }
}

async function submitNew() {
  newError.value = '';
  if (!form.value.subject || !form.value.description) {
    newError.value = 'Subject and description are required.';
    return;
  }
  saving.value = true;
  try {
    const payload: any = { subject: form.value.subject, description: form.value.description };
    if (form.value.purchase_order_id) payload.purchase_order_id = form.value.purchase_order_id;
    await api.post('/api/v1/vendor/disputes', payload);
    showNew.value = false;
    form.value = { subject: '', description: '', purchase_order_id: '' };
    await load();
  } catch (e: any) {
    newError.value = e.message ?? 'Failed to submit dispute';
  } finally {
    saving.value = false;
  }
}

async function openDetail(d: any) {
  selected.value = d;
  detail.value   = null;
  replyText.value = '';
  try {
    detail.value = await api.get(`/api/v1/vendor/disputes/${d.id}`);
  } catch {}
}

async function sendMessage() {
  if (!selected.value || !replyText.value) return;
  saving.value = true;
  try {
    await api.post(`/api/v1/vendor/disputes/${selected.value.id}/messages`, { body: replyText.value });
    replyText.value = '';
    detail.value = await api.get(`/api/v1/vendor/disputes/${selected.value.id}`);
  } catch (e: any) {
    error.value = e.message ?? 'Failed to send message';
  } finally {
    saving.value = false;
  }
}

function statusClass(s: string) {
  return {
    open: 'bw-badge-warning', under_review: 'bw-badge-brand',
    resolved: 'bw-badge-success', rejected: 'bw-badge-error', refund_issued: 'bw-badge-success',
  }[s] ?? 'bw-badge-neutral';
}

function fmtDate(s: string) { return s ? new Date(s).toLocaleString() : '—'; }

onMounted(load);
</script>

<style scoped>
.bw-messages { display: flex; flex-direction: column; gap: .5rem; margin: .5rem 0 1rem; max-height: 240px; overflow-y: auto; }
.bw-message { background: var(--bw-surface-2); border-radius: var(--bw-radius-sm); padding: .5rem .75rem; }
.bw-message-staff { background: var(--bw-brand-50); }
.bw-message-actor { font-size: .7rem; font-weight: 600; text-transform: uppercase; color: var(--bw-text-muted); display: block; }
.bw-message-body { margin: .25rem 0; font-size: .875rem; }
.bw-message-time { font-size: .7rem; color: var(--bw-text-muted); }
.bw-section-label { font-size: .75rem; font-weight: 600; text-transform: uppercase; color: var(--bw-text-muted); margin: 1rem 0 .25rem; }
.bw-textarea { width: 100%; }
</style>
