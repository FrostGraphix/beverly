<template>
  <AppShell title="Disputes">

    <div class="bw-filter-bar">
      <select v-model="statusFilter" class="bw-select bw-select-sm" @change="load">
        <option value="">All statuses</option>
        <option value="open">Open</option>
        <option value="under_review">Under Review</option>
        <option value="resolved">Resolved</option>
        <option value="rejected">Rejected</option>
        <option value="refund_issued">Refund Issued</option>
      </select>
    </div>

    <div v-if="loading" class="bw-loading">Loading…</div>
    <div v-else-if="error" class="bw-error-banner">{{ error }}</div>

    <div v-else>
      <div class="bw-table-wrapper">
        <table class="bw-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Subject</th>
              <th>Org</th>
              <th>Status</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in disputes" :key="d.id">
              <td class="bw-mono bw-text-sm">{{ d.reference || d.id?.slice(0, 8).toUpperCase() }}</td>
              <td class="bw-text-sm" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ d.subject || '—' }}</td>
              <td class="bw-mono bw-text-sm">{{ d.vendor_organizations?.trading_name || d.vendor_organizations?.legal_name || '—' }}</td>
              <td><span :class="statusClass(d.status)" class="bw-badge">{{ statusLabel(d.status) }}</span></td>
              <td class="bw-text-sm">{{ fmtDate(d.created_at) }}</td>
              <td>
                <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="openDetail(d)">Review</button>
              </td>
            </tr>
            <tr v-if="!disputes.length">
              <td colspan="6" class="bw-empty">No disputes found.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards (≤640px) -->
      <div class="bw-t-cards">
        <div v-if="!disputes.length" class="bw-empty">No disputes found.</div>
        <div v-for="d in disputes" :key="d.id" class="bw-tc">
          <div class="bw-tc-head">
            <span class="bw-mono bw-tc-ref">{{ d.reference || d.id?.slice(0, 8).toUpperCase() }}</span>
            <span :class="statusClass(d.status)" class="bw-badge">{{ statusLabel(d.status) }}</span>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Subject</span><span class="bw-tc-pair-val">{{ d.subject || '—' }}</span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Org</span><span class="bw-tc-pair-val">{{ d.vendor_organizations?.legal_name || '—' }}</span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Date</span><span class="bw-tc-pair-val">{{ fmtDate(d.created_at) }}</span></div>
          </div>
          <div class="bw-tc-foot">
            <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="openDetail(d)">Review</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Detail Modal -->
    <div v-if="selected" class="bw-modal-backdrop" @click.self="selected = null">
      <div class="bw-modal bw-modal-lg">
        <div class="bw-modal-header">
          <h2>{{ selected.reference || selected.id?.slice(0, 8).toUpperCase() }}</h2>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="selected = null">✕</button>
        </div>
        <div class="bw-modal-body">
          <p class="bw-text-sm"><strong>{{ selected.subject }}</strong></p>
          <p class="bw-text-sm bw-text-muted">{{ detail?.description || selected.description }}</p>
          <div class="bw-dispute-meta">
            <span>Org: <code class="bw-mono">{{ selected.vendor_organizations?.legal_name || selected.vendor_organization_id?.slice(0, 8) }}</code></span>
            <span>Actor: <code class="bw-mono">{{ selected.raised_by_actor_id?.slice(0, 8) }}</code></span>
          </div>

          <div class="bw-section-label">Thread</div>
          <div class="bw-messages">
            <div v-for="m in detail?.dispute_messages" :key="m.id" :class="['bw-message', m.sender_actor_type === 'staff' ? 'bw-message-staff' : '']">
              <span class="bw-message-actor">{{ m.sender_actor_type === 'staff' ? 'Beverly Support' : m.sender_actor_type }}</span>
              <p class="bw-message-body">{{ m.body }}</p>
              <span class="bw-message-time">{{ fmtDate(m.created_at) }}</span>
            </div>
            <p v-if="!detail?.dispute_messages?.length" class="bw-text-sm bw-text-muted">No messages yet.</p>
          </div>

          <textarea v-model="replyText" class="bw-textarea" placeholder="Add a note / message to vendor…" rows="3"></textarea>

          <div class="bw-form-group">
            <label class="bw-label">Update Status</label>
            <select v-model="newStatus" class="bw-select">
              <option value="">— no change —</option>
              <option value="open">Open</option>
              <option value="under_review">Under Review</option>
              <option value="resolved">Resolved</option>
              <option value="rejected">Rejected</option>
              <option value="refund_issued">Refund Issued</option>
            </select>
          </div>
          <div v-if="newStatus === 'resolved' || newStatus === 'rejected'">
            <label class="bw-label">Resolution Note</label>
            <textarea v-model="resolutionNote" class="bw-textarea" rows="2" placeholder="Internal resolution note…"></textarea>
          </div>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="selected = null">Cancel</button>
          <button class="bw-btn bw-btn-primary" :disabled="saving" @click="submitUpdate">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../lib/api';
import AppShell from '../components/AppShell.vue';

const disputes     = ref<any[]>([]);
const loading      = ref(false);
const error        = ref('');
const statusFilter = ref('');

const selected       = ref<any>(null);
const detail         = ref<any>(null);
const replyText      = ref('');
const newStatus      = ref('');
const resolutionNote = ref('');
const saving         = ref(false);

async function load() {
  loading.value = true;
  error.value   = '';
  try {
    const params = statusFilter.value ? `?status=${statusFilter.value}` : '';
    const res = await api.get<{ disputes?: any[] }>(`/api/v1/admin/disputes${params}`);
    disputes.value = res.disputes ?? [];
  } catch (e: any) {
    error.value = e.message ?? 'Failed to load disputes';
  } finally {
    loading.value = false;
  }
}

async function openDetail(d: any) {
  selected.value       = d;
  detail.value         = null;
  replyText.value      = '';
  newStatus.value      = '';
  resolutionNote.value = '';
  try {
    detail.value = await api.get(`/api/v1/admin/disputes/${d.id}`);
  } catch {}
}

async function submitUpdate() {
  if (!selected.value) return;
  saving.value = true;
  try {
    const payload: any = {};
    if (newStatus.value)      payload.status = newStatus.value;
    if (resolutionNote.value) payload.resolution_note = resolutionNote.value;
    if (replyText.value)      payload.message = replyText.value;
    if (!payload.status && !payload.message) {
      saving.value = false;
      return;
    }
    await api.patch(`/api/v1/admin/disputes/${selected.value.id}`, payload);
    await load();
    selected.value = null;
  } catch (e: any) {
    error.value = e.message ?? 'Failed to update dispute';
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
.bw-filter-bar { display: flex; gap: .75rem; margin-bottom: 1rem; flex-wrap: wrap; }
.bw-dispute-meta { display: flex; gap: 1rem; font-size: .8rem; color: var(--text-muted); margin: .5rem 0 1rem; flex-wrap: wrap; }
.bw-messages { display: flex; flex-direction: column; gap: .5rem; margin: .5rem 0 1rem; max-height: 240px; overflow-y: auto; }
.bw-message { background: var(--surface); border-radius: var(--r-md); padding: .5rem .75rem; }
.bw-message-staff { background: oklch(from var(--brand) l c h / 0.10); }
.bw-message-actor { font-size: .7rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted); display: block; }
.bw-message-body { margin: .25rem 0; font-size: .875rem; }
.bw-message-time { font-size: .7rem; color: var(--text-muted); }
.bw-section-label { font-size: .75rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted); margin: 1rem 0 .25rem; }
.bw-tc-foot { padding: var(--s-3) var(--s-4); border-top: 1px solid var(--border); }
.bw-tc-ref { font-size: var(--t-sm); }
</style>
