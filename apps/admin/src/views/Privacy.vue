<template>
  <AppShell title="NDPR / Privacy">

    <div class="bw-filter-bar">
      <select v-model="statusFilter" class="bw-select bw-select-sm" @change="load">
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </div>

    <div v-if="loading" class="bw-loading">Loading…</div>
    <div v-else-if="error" class="bw-error-banner">{{ error }}</div>

    <div v-else>
      <div class="bw-table-wrapper">
        <table class="bw-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Requested</th>
              <th>Scheduled For</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in requests" :key="r.id">
              <td>
                <div class="bw-text-sm">{{ r.customers?.users?.full_name ?? '—' }}</div>
                <div style="font-size:var(--t-xs);color:var(--text-muted)">{{ r.customers?.users?.phone }}</div>
              </td>
              <td class="bw-text-sm">{{ r.reason ?? '—' }}</td>
              <td><span :class="statusClass(r.status)" class="bw-badge">{{ r.status }}</span></td>
              <td class="bw-text-sm">{{ fmtDate(r.requested_at) }}</td>
              <td class="bw-text-sm">{{ fmtDate(r.scheduled_for) }}</td>
              <td v-if="r.status === 'pending'" class="bw-action-cell">
                <button class="bw-btn bw-btn-danger bw-btn-sm" @click="openReview(r, true)">Approve</button>
                <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="openReview(r, false)">Reject</button>
              </td>
              <td v-else></td>
            </tr>
            <tr v-if="!requests.length">
              <td colspan="6" class="bw-empty">No deletion requests found.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards (≤640px) -->
      <div class="bw-t-cards">
        <div v-if="!requests.length" class="bw-empty">No deletion requests found.</div>
        <div v-for="r in requests" :key="r.id" class="bw-tc">
          <div class="bw-tc-head">
            <span style="font-size:var(--t-sm);font-weight:600">{{ r.customers?.users?.full_name ?? '—' }}</span>
            <span :class="statusClass(r.status)" class="bw-badge">{{ r.status }}</span>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Reason</span><span class="bw-tc-pair-val">{{ r.reason ?? '—' }}</span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Requested</span><span class="bw-tc-pair-val">{{ fmtDate(r.requested_at) }}</span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Scheduled</span><span class="bw-tc-pair-val">{{ fmtDate(r.scheduled_for) }}</span></div>
          </div>
          <div v-if="r.status === 'pending'" class="bw-tc-foot">
            <button class="bw-btn bw-btn-danger bw-btn-sm" @click="openReview(r, true)">Approve</button>
            <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="openReview(r, false)">Reject</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Review Modal -->
    <div v-if="reviewing" class="bw-modal-backdrop" @click.self="reviewing = null">
      <div class="bw-modal">
        <div class="bw-modal-header">
          <h2>{{ reviewApprove ? 'Approve' : 'Reject' }} Deletion</h2>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="reviewing = null">✕</button>
        </div>
        <div class="bw-modal-body">
          <p class="bw-text-sm">
            Customer: <strong>{{ reviewing.customers?.users?.full_name }}</strong>
          </p>
          <p v-if="reviewApprove" class="bw-alert bw-alert-warning bw-text-sm">
            Approving will schedule permanent account deletion on <strong>{{ fmtDate(reviewing.scheduled_for) }}</strong>. This cannot be undone.
          </p>
          <label class="bw-label">Note (optional)</label>
          <textarea v-model="reviewNote" class="bw-textarea" rows="3" placeholder="Internal note…"></textarea>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="reviewing = null">Cancel</button>
          <button :class="['bw-btn', reviewApprove ? 'bw-btn-danger' : 'bw-btn-primary']"
                  :disabled="saving" @click="submitReview">
            {{ saving ? 'Saving…' : (reviewApprove ? 'Approve Deletion' : 'Reject') }}
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

const requests     = ref<any[]>([]);
const loading      = ref(false);
const error        = ref('');
const statusFilter = ref('pending');
const saving       = ref(false);
const reviewing    = ref<any>(null);
const reviewApprove = ref(false);
const reviewNote   = ref('');

async function load() {
  loading.value = true;
  error.value   = '';
  try {
    const params = statusFilter.value ? `?status=${statusFilter.value}` : '';
    const res = await api.get<{ requests?: any[] }>(`/api/v1/admin/privacy/deletions${params}`);
    requests.value = res.requests ?? [];
  } catch (e: any) {
    error.value = e.message ?? 'Failed to load requests';
  } finally {
    loading.value = false;
  }
}

function openReview(r: any, approve: boolean) {
  reviewing.value    = r;
  reviewApprove.value = approve;
  reviewNote.value   = '';
}

async function submitReview() {
  if (!reviewing.value) return;
  saving.value = true;
  try {
    await api.patch(`/api/v1/admin/privacy/deletions/${reviewing.value.id}`, {
      approve: reviewApprove.value,
      note:    reviewNote.value || undefined,
    });
    await load();
    reviewing.value = null;
  } catch (e: any) {
    error.value = e.message ?? 'Failed to submit review';
  } finally {
    saving.value = false;
  }
}

function statusClass(s: string) {
  return {
    pending:   'bw-badge-warning',
    approved:  'bw-badge-error',
    rejected:  'bw-badge-neutral',
    completed: 'bw-badge-neutral',
    cancelled: 'bw-badge-neutral',
  }[s] ?? 'bw-badge-neutral';
}

function fmtDate(s: string) { return s ? new Date(s).toLocaleString() : '—'; }

onMounted(load);
</script>

<style scoped>
.bw-filter-bar { display: flex; gap: .75rem; margin-bottom: 1rem; flex-wrap: wrap; }
.bw-alert-warning { background: oklch(90% 0.12 80); border-radius: var(--r-md); padding: .5rem .75rem; border-left: 3px solid oklch(70% 0.18 80); }
.bw-tc-foot { display: flex; gap: .5rem; padding: var(--s-3) var(--s-4); border-top: 1px solid var(--border); }
</style>
