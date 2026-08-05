<template>
  <AppShell title="Meter Approvals">
    <p class="bw-muted" style="margin-bottom: var(--s-4); max-width: 60ch">
      A customer-linked meter cannot be used for token purchases until a staff member reviews it here.
      This closes the gap where any meter ID could be linked and vended against with zero ownership check.
    </p>

    <div class="bw-filter-bar">
      <button class="bw-btn bw-btn-sm" :disabled="loading" @click="load">Refresh</button>
      <select v-model="statusFilter" class="bw-select bw-select-sm" aria-label="Filter meter links by status" @change="load">
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
      </select>
    </div>

    <div v-if="loading" class="bw-card" aria-label="Loading meter links">
      <div v-for="n in 5" :key="n" class="bw-skeleton" style="margin: var(--s-2)"></div>
    </div>
    <div v-else-if="error" class="bw-error-banner" role="alert">
      <span>{{ error }}</span>
      <button class="bw-btn bw-btn-sm" @click="load">Try again</button>
    </div>

    <div v-else>
      <div v-if="successMessage" class="bw-success-banner" role="status">{{ successMessage }}</div>
      <div class="bw-table-wrapper">
        <table class="bw-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Meter</th>
              <th>Phase</th>
              <th>Station</th>
              <th>Linked</th>
              <th v-if="statusFilter !== 'pending'">Status</th>
              <th class="meter-actions-col"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in meters" :key="m.id">
              <td>
                <strong>{{ m.customers?.full_name || 'Unnamed customer' }}</strong>
                <span class="bw-mono bw-text-sm">{{ m.customers?.phone || m.customers?.email || '—' }}</span>
              </td>
              <td class="bw-mono">{{ m.meter_id }}<span v-if="m.nickname" class="bw-muted"> · {{ m.nickname }}</span></td>
              <td>{{ m.meter_type === 'three_phase' ? 'Three phase' : 'Single phase' }}</td>
              <td class="bw-mono bw-text-sm">{{ m.station_id || '—' }}</td>
              <td class="bw-text-sm">{{ fmtDate(m.created_at) }}</td>
              <td v-if="statusFilter !== 'pending'"><span :class="statusClass(m.status)" class="bw-badge">{{ statusLabel(m.status) }}</span></td>
              <td v-if="m.status === 'pending'" class="bw-action-cell meter-actions-col">
                <div class="meter-row-actions">
                  <button class="bw-btn bw-btn-primary bw-btn-sm" @click="approve(m)">Approve</button>
                  <button class="bw-btn bw-btn-danger bw-btn-sm" @click="openReject(m)">Reject</button>
                </div>
              </td>
              <td v-else></td>
            </tr>
            <tr v-if="!meters.length">
              <td colspan="7" class="bw-empty">{{ emptyMessage }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ConfirmDialog
      :open="Boolean(rejecting)"
      title="Reject meter link?"
      description="The customer will not be able to purchase tokens for this meter until they relink it."
      confirm-label="Reject meter"
      tone="danger"
      :loading="saving"
      :disable-confirm="!rejectReason.trim()"
      @update:open="(open) => { if (!open) rejecting = null; }"
      @confirm="submitReject"
    >
      <div v-if="actionError" class="bw-error-banner" role="alert">{{ actionError }}</div>
      <label class="bw-label">Reason *</label>
      <textarea v-model="rejectReason" class="bw-textarea" rows="3" placeholder="Reason for rejection..."></textarea>
    </ConfirmDialog>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { api } from '../lib/api';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';

type MeterStatus = 'pending' | 'approved' | 'rejected';
interface CustomerMeterRecord {
  id: string;
  customer_id: string;
  meter_id: string;
  meter_type: 'single_phase' | 'three_phase' | null;
  station_id: string | null;
  nickname: string | null;
  status: MeterStatus;
  created_at: string;
  customers?: { full_name: string | null; phone: string | null; email: string | null } | null;
}

const meters        = ref<CustomerMeterRecord[]>([]);
const loading        = ref(false);
const error          = ref('');
const actionError    = ref('');
const successMessage = ref('');
const statusFilter   = ref<MeterStatus>('pending');
const saving         = ref(false);
const rejecting      = ref<CustomerMeterRecord | null>(null);
const rejectReason   = ref('');

const emptyMessage = computed(() => `No ${statusLabel(statusFilter.value).toLowerCase()} meter links.`);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get<{ meters?: CustomerMeterRecord[]; error?: string }>(
      `/api/v1/admin/customer-meters?status=${statusFilter.value}`,
    );
    if (res.error) throw new Error(res.error);
    meters.value = res.meters ?? [];
  } catch (e: any) {
    error.value = e.message ?? 'Failed to load meter links';
  } finally {
    loading.value = false;
  }
}

async function approve(m: CustomerMeterRecord) {
  actionError.value = '';
  saving.value = true;
  try {
    await api.post(`/api/v1/admin/customer-meters/${m.id}/approve`, {});
    await load();
    successMessage.value = `Meter ${m.meter_id} approved.`;
  } catch (e: any) {
    error.value = e.message ?? 'Failed to approve meter link';
  } finally {
    saving.value = false;
  }
}

function openReject(m: CustomerMeterRecord) {
  actionError.value = '';
  rejecting.value = m;
  rejectReason.value = '';
}

async function submitReject() {
  if (!rejecting.value || !rejectReason.value.trim()) return;
  saving.value = true;
  try {
    await api.post(`/api/v1/admin/customer-meters/${rejecting.value.id}/reject`, { reason: rejectReason.value.trim() });
    const meterId = rejecting.value.meter_id;
    rejecting.value = null;
    await load();
    successMessage.value = `Meter ${meterId} rejected.`;
  } catch (e: any) {
    actionError.value = e.message ?? 'Failed to reject meter link';
  } finally {
    saving.value = false;
  }
}

function statusLabel(s: string) {
  return { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }[s] ?? s;
}

function statusClass(s: string) {
  return { pending: 'bw-badge-warning', approved: 'bw-badge-success', rejected: 'bw-badge-error' }[s] ?? 'bw-badge-neutral';
}

function fmtDate(s: string) { return s ? new Date(s).toLocaleString() : '—'; }

onMounted(load);
</script>

<style scoped>
.bw-filter-bar { display: flex; gap: .75rem; margin-bottom: 1rem; flex-wrap: wrap; }
.meter-row-actions { display: flex; gap: .5rem; justify-content: flex-end; }
.meter-actions-col { min-width: 150px; }
.bw-success-banner {
  background: var(--brand-glow);
  border: 1px solid oklch(70% 0.19 145 / 0.28);
  border-radius: var(--r-md);
  color: var(--brand-on-surface);
  margin-bottom: var(--s-3);
  padding: var(--s-3) var(--s-4);
}
</style>
