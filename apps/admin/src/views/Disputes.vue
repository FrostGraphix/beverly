<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { api, naira, shortDate } from '../lib/api';
import AppShell from '../components/AppShell.vue';
import MobileActionMenu from '../components/MobileActionMenu.vue';
import WalletTablePagination from '@beverly/tokens/WalletTablePagination.vue';

type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'rejected' | 'refund_issued';

interface DisputeRow {
  id: string;
  reference?: string | null;
  subject?: string | null;
  description?: string | null;
  status: DisputeStatus;
  vendor_organization_id?: string | null;
  raised_by_actor_id?: string | null;
  raised_by_actor_type?: string | null;
  created_at: string;
  updated_at?: string | null;
  customers?: { users?: { full_name?: string | null; phone?: string | null } | null } | null;
  vendor_organizations?: { trading_name?: string | null; legal_name?: string | null } | null;
  purchase_order?: {
    meter_id?: string | null;
    customer_name?: string | null;
    amount_minor?: number | null;
    energy_amount_minor?: number | null;
    vat_amount_minor?: number | null;
    vat_rate_basis_points?: number | null;
    units_kwh?: number | null;
    status?: string | null;
  } | null;
}

interface DisputeMessage {
  id: string;
  sender_actor_type: 'customer' | 'vendor' | 'staff' | string;
  body: string;
  created_at: string;
}

interface DisputeDetail extends DisputeRow {
  resolution_note?: string | null;
  dispute_messages?: DisputeMessage[];
}

const statuses: Array<{ value: '' | DisputeStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'under_review', label: 'Under review' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'refund_issued', label: 'Refund issued' },
];

const disputes = ref<DisputeRow[]>([]);
const loading = ref(false);
const error = ref('');
const banner = ref<{ tone: 'success' | 'error'; text: string } | null>(null);
const statusFilter = ref<'' | DisputeStatus>('');
const search = ref('');
const currentPage = ref(1);
const pageSize = ref(10);

const selected = ref<DisputeRow | null>(null);
const detail = ref<DisputeDetail | null>(null);
const detailLoading = ref(false);
const replyText = ref('');
const newStatus = ref<'' | DisputeStatus>('');
const resolutionNote = ref('');
const saving = ref(false);

const filteredDisputes = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return disputes.value;
  return disputes.value.filter((d) =>
    [
      d.reference,
      d.subject,
      actorName(d),
      orgName(d),
      d.purchase_order?.meter_id,
      d.purchase_order?.customer_name,
    ].some((value) => String(value ?? '').toLowerCase().includes(q)),
  );
});

const summary = computed(() => ({
  open: disputes.value.filter((d) => d.status === 'open' || d.status === 'under_review').length,
  resolved: disputes.value.filter((d) => d.status === 'resolved' || d.status === 'refund_issued').length,
  rejected: disputes.value.filter((d) => d.status === 'rejected').length,
}));
const pagedDisputes = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredDisputes.value.slice(start, start + pageSize.value);
});

const canSave = computed(() =>
  !saving.value && Boolean(newStatus.value || replyText.value.trim() || resolutionNote.value.trim()),
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const params = statusFilter.value ? `?status=${statusFilter.value}` : '';
    const res = await api.get<{ disputes?: DisputeRow[] }>(`/api/v1/admin/disputes${params}`);
    disputes.value = res.disputes ?? [];
    currentPage.value = 1;
  } catch (e: any) {
    error.value = e.message ?? 'Failed to load disputes.';
  } finally {
    loading.value = false;
  }
}

async function openDetail(d: DisputeRow) {
  selected.value = d;
  detail.value = null;
  detailLoading.value = true;
  replyText.value = '';
  newStatus.value = '';
  resolutionNote.value = '';
  try {
    detail.value = await api.get<DisputeDetail>(`/api/v1/admin/disputes/${d.id}`);
  } catch (e: any) {
    banner.value = { tone: 'error', text: e.message ?? 'Could not load dispute.' };
  } finally {
    detailLoading.value = false;
  }
}

function closeDetail() {
  selected.value = null;
  detail.value = null;
}

async function submitUpdate() {
  if (!selected.value || !canSave.value) return;
  saving.value = true;
  banner.value = null;
  try {
    const payload: { status?: DisputeStatus; resolution_note?: string; message?: string } = {};
    if (newStatus.value) payload.status = newStatus.value;
    if (resolutionNote.value.trim()) payload.resolution_note = resolutionNote.value.trim();
    if (replyText.value.trim()) payload.message = replyText.value.trim();
    await api.patch(`/api/v1/admin/disputes/${selected.value.id}`, payload);
    banner.value = { tone: 'success', text: 'Dispute updated.' };
    await load();
    closeDetail();
  } catch (e: any) {
    banner.value = { tone: 'error', text: e.message ?? 'Failed to update dispute.' };
  } finally {
    saving.value = false;
  }
}

function statusLabel(s: string) {
  return {
    open: 'Open',
    under_review: 'Under review',
    resolved: 'Resolved',
    rejected: 'Rejected',
    refund_issued: 'Refund issued',
  }[s] ?? s;
}

function statusClass(s: string) {
  return {
    open: 'warn',
    under_review: 'info',
    resolved: 'success',
    rejected: 'neutral',
    refund_issued: 'success',
  }[s] ?? 'neutral';
}

function orgName(d: DisputeRow) {
  return d.vendor_organizations?.trading_name || d.vendor_organizations?.legal_name || 'Unassigned';
}

function actorName(d: DisputeRow) {
  return d.customers?.users?.full_name || d.purchase_order?.customer_name || d.raised_by_actor_type || 'Unknown';
}

function refLabel(d: DisputeRow) {
  return d.reference || d.id?.slice(0, 8).toUpperCase();
}

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape' && selected.value) closeDetail();
}

onMounted(() => {
  void load();
  window.addEventListener('keydown', onEsc);
});
onUnmounted(() => window.removeEventListener('keydown', onEsc));
</script>

<template>
  <AppShell title="Disputes">
    <transition name="banner">
      <div v-if="banner" :class="['bw-banner', banner.tone]" role="status">
        {{ banner.text }}
        <button class="bw-banner-x" aria-label="Dismiss" @click="banner = null">×</button>
      </div>
    </transition>

    <section class="bw-kpi-grid bw-mobile-kpi-grid dispute-stat-grid" aria-label="Dispute summary">
      <article class="bw-kpi featured">
        <span class="bw-kpi-label">Active</span>
        <strong class="bw-kpi-value">{{ summary.open }}</strong>
        <span class="bw-kpi-note">open or review</span>
      </article>
      <article class="bw-kpi info-tone">
        <span class="bw-kpi-label">Resolved</span>
        <strong class="bw-kpi-value">{{ summary.resolved }}</strong>
        <span class="bw-kpi-note">closed cleanly</span>
      </article>
      <article class="bw-kpi danger-tone">
        <span class="bw-kpi-label">Rejected</span>
        <strong class="bw-kpi-value">{{ summary.rejected }}</strong>
        <span class="bw-kpi-note">not approved</span>
      </article>
    </section>

    <section class="bw-card dispute-controls">
      <select v-model="statusFilter" class="bw-select" @change="load">
        <option v-for="s in statuses" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>
      <input v-model="search" class="bw-input" placeholder="reference / customer / meter" />
      <button type="button" class="bw-btn" :disabled="loading" @click.prevent="load">{{ loading ? 'Loading...' : 'Refresh' }}</button>
    </section>

    <div v-if="error" class="bw-banner error" role="alert">{{ error }}</div>

    <section class="bw-card flush dispute-table-card">
      <div class="bw-table-head-bar">
        <div class="bw-table-heading">
          <div class="bw-table-title-row">
            <div class="bw-card-title">Disputes</div>
            <span v-if="loading" class="bw-skeleton bw-table-count" aria-hidden="true"></span>
            <span v-else class="bw-table-count">{{ filteredDisputes.length }}</span>
          </div>
          <div class="bw-card-sub">Customer and vendor transaction dispute cases</div>
        </div>
      </div>

      <div v-if="loading" class="dispute-empty">Loading disputes...</div>

      <template v-else>
        <div class="bw-t-wrap dispute-table-wrap">
          <table class="bw-table dispute-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Subject</th>
                <th>Customer</th>
                <th>Vendor</th>
                <th>Purchase</th>
                <th>Status</th>
                <th>Created</th>
                <th class="dispute-actions-col"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in pagedDisputes" :key="d.id">
                <td class="bw-mono bw-text-sm">{{ refLabel(d) }}</td>
                <td>
                  <strong class="row-main">{{ d.subject || 'No subject' }}</strong>
                  <span class="row-sub">{{ d.description || 'No description provided.' }}</span>
                </td>
                <td>
                  <strong class="row-main">{{ actorName(d) }}</strong>
                  <span class="row-sub">{{ d.raised_by_actor_type || 'actor' }}</span>
                </td>
                <td><span class="row-main">{{ orgName(d) }}</span></td>
                <td>
                  <span class="bw-mono row-main">{{ d.purchase_order?.meter_id || '—' }}</span>
                  <span v-if="d.purchase_order?.amount_minor != null" class="row-sub">Paid {{ naira(d.purchase_order.amount_minor) }} · VAT {{ naira(d.purchase_order.vat_amount_minor ?? 0) }}</span>
                </td>
                <td><span :class="['bw-badge', statusClass(d.status)]">{{ statusLabel(d.status) }}</span></td>
                <td class="bw-text-sm">{{ shortDate(d.created_at) }}</td>
                <td class="dispute-actions-col">
                  <button class="bw-btn sm dispute-row-action" @click="openDetail(d)">Review</button>
                  <MobileActionMenu label="Dispute actions">
                    <button class="mobile-action-item" @click="openDetail(d)">Review</button>
                  </MobileActionMenu>
                </td>
              </tr>
              <tr v-if="!filteredDisputes.length">
                <td colspan="8">
                  <div class="dispute-empty">
                    <strong>No disputes found.</strong>
                    <span>New cases will appear here.</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="bw-t-cards dispute-cards">
          <div v-if="!filteredDisputes.length" class="dispute-empty">
            <strong>No disputes found.</strong>
            <span>New cases will appear here.</span>
          </div>
          <article v-for="d in pagedDisputes" :key="d.id" class="bw-tc dispute-card">
            <div class="bw-tc-head">
              <div>
                <span class="bw-mono bw-tc-ref">{{ refLabel(d) }}</span>
                <strong>{{ d.subject || 'No subject' }}</strong>
              </div>
              <span :class="['bw-badge', statusClass(d.status)]">{{ statusLabel(d.status) }}</span>
            </div>
            <div class="bw-tc-mid">
              <div class="bw-tc-pair"><span>Customer</span><strong>{{ actorName(d) }}</strong></div>
              <div class="bw-tc-pair"><span>Vendor</span><strong>{{ orgName(d) }}</strong></div>
              <div class="bw-tc-pair"><span>Meter</span><strong class="bw-mono">{{ d.purchase_order?.meter_id || '—' }}</strong></div>
              <div class="bw-tc-pair"><span>Created</span><strong>{{ shortDate(d.created_at) }}</strong></div>
            </div>
            <div class="bw-tc-foot">
              <MobileActionMenu label="Dispute actions">
                <button class="mobile-action-item" @click="openDetail(d)">Review</button>
              </MobileActionMenu>
            </div>
          </article>
        </div>
        <WalletTablePagination
          v-model:page="currentPage"
          v-model:pageSize="pageSize"
          :total-items="filteredDisputes.length"
          item-label="disputes"
        />
      </template>
    </section>

    <Teleport to="body">
      <div v-if="selected" class="bw-modal-backdrop" @click.self="closeDetail">
        <section class="bw-modal bw-modal-lg dispute-modal" role="dialog" aria-modal="true">
          <header class="bw-modal-header">
            <div>
              <p class="modal-eyebrow">Dispute</p>
              <h2>{{ refLabel(selected) }}</h2>
              <p>{{ selected.subject || 'No subject' }}</p>
            </div>
            <button class="bw-btn sm" @click="closeDetail">Close</button>
          </header>

          <div class="bw-modal-body">
            <div v-if="detailLoading" class="dispute-empty">Loading case...</div>
            <template v-else>
              <div class="case-grid">
                <div><span>Customer</span><strong>{{ actorName(detail || selected) }}</strong></div>
                <div><span>Vendor</span><strong>{{ orgName(detail || selected) }}</strong></div>
                <div><span>Meter</span><strong class="bw-mono">{{ (detail || selected).purchase_order?.meter_id || '—' }}</strong></div>
                <div><span>Amount paid</span><strong>{{ (detail || selected).purchase_order?.amount_minor != null ? naira((detail || selected).purchase_order?.amount_minor || 0) : '—' }}</strong></div>
                <div><span>Energy value</span><strong>{{ (detail || selected).purchase_order?.amount_minor != null ? naira(((detail || selected).purchase_order?.energy_amount_minor ?? (detail || selected).purchase_order?.amount_minor) ?? 0) : '—' }}</strong></div>
                <div><span>VAT</span><strong>{{ (detail || selected).purchase_order?.amount_minor != null ? naira((detail || selected).purchase_order?.vat_amount_minor ?? 0) : '—' }}</strong></div>
              </div>

              <section class="case-panel">
                <h3>Description</h3>
                <p>{{ detail?.description || selected.description || 'No description provided.' }}</p>
              </section>

              <section class="case-panel">
                <h3>Thread</h3>
                <div class="bw-messages">
                  <div v-for="m in detail?.dispute_messages" :key="m.id" :class="['bw-message', m.sender_actor_type === 'staff' ? 'bw-message-staff' : '']">
                    <span class="bw-message-actor">{{ m.sender_actor_type === 'staff' ? 'Beverly Support' : m.sender_actor_type }}</span>
                    <p class="bw-message-body">{{ m.body }}</p>
                    <span class="bw-message-time">{{ shortDate(m.created_at) }}</span>
                  </div>
                  <p v-if="!detail?.dispute_messages?.length" class="bw-text-sm bw-text-muted">No messages yet.</p>
                </div>
              </section>

              <section class="case-panel update-panel">
                <label class="bw-label">Reply</label>
                <textarea v-model="replyText" class="bw-textarea" placeholder="Add a staff reply..." rows="3"></textarea>

                <div class="update-grid">
                  <div>
                    <label class="bw-label">Status</label>
                    <select v-model="newStatus" class="bw-select">
                      <option value="">No change</option>
                      <option v-for="s in statuses.filter((item) => item.value)" :key="s.value" :value="s.value">{{ s.label }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="bw-label">Resolution note</label>
                    <input v-model="resolutionNote" class="bw-input" placeholder="Required when closing" />
                  </div>
                </div>
              </section>
            </template>
          </div>

          <footer class="bw-modal-footer">
            <button class="bw-btn" @click="closeDetail">Cancel</button>
            <button class="bw-btn primary" :disabled="!canSave" @click="submitUpdate">
              {{ saving ? 'Saving...' : 'Save update' }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>
  </AppShell>
</template>

<style scoped>
.bw-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-4);
  border: 1px solid;
  border-radius: var(--r-md);
  margin-bottom: var(--s-3);
  font-size: var(--t-sm);
}
.bw-banner.success { background: oklch(from var(--brand) l c h / 0.08); border-color: oklch(from var(--brand) l c h / 0.3); color: var(--brand); }
.bw-banner.error { background: oklch(from var(--danger) l c h / 0.08); border-color: oklch(from var(--danger) l c h / 0.3); color: var(--danger); }
.bw-banner-x { border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 18px; }

.dispute-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-3);
  margin-bottom: var(--s-4);
}
.dispute-stat {
  min-height: 104px;
  padding: var(--s-4);
  border: 1px solid var(--glass-border);
  border-radius: var(--r-lg);
  background: var(--glass-bg);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
}
.dispute-stat strong {
  display: block;
  margin: 8px 0 3px;
  font-size: var(--t-2xl);
  color: var(--brand);
  line-height: 1;
}
.dispute-stat span:not(.stat-label) {
  color: var(--text-muted);
  font-size: var(--t-xs);
}
.stat-label {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.dispute-controls {
  display: grid;
  grid-template-columns: 180px minmax(220px, 1fr) auto;
  gap: var(--s-3);
  align-items: center;
  margin-bottom: var(--s-4);
}
.dispute-table-card { overflow: hidden; }
.bw-table-head-bar h2 { margin: 0; }
.dispute-table-wrap { max-height: none; }
.row-main {
  display: block;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--t-sm);
}
.row-sub {
  display: block;
  max-width: 240px;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
  font-size: 11px;
}
.dispute-actions-col { min-width: 96px; text-align: right; }
.dispute-empty {
  display: grid;
  place-items: center;
  gap: 5px;
  min-height: 112px;
  padding: var(--s-5);
  color: var(--text-muted);
  text-align: center;
  font-size: var(--t-sm);
}

.bw-tc-foot {
  display: flex;
  justify-content: flex-end;
  padding: var(--s-3) var(--s-4);
  border-top: 1px solid var(--border);
}
.dispute-card strong {
  font-size: var(--t-sm);
}

.bw-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  padding: var(--s-4);
  background: oklch(0 0 0 / 0.58);
}
.dispute-modal {
  width: min(760px, 100%);
  max-height: min(86vh, 760px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.bw-modal-header {
  display: flex;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-5);
  border-bottom: 1px solid var(--border);
}
.bw-modal-header h2,
.bw-modal-header p {
  margin: 0;
}
.bw-modal-header p:last-child {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: var(--t-sm);
}
.modal-eyebrow {
  margin-bottom: 6px;
  color: var(--brand);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.bw-modal-body {
  flex: 1;
  overflow: auto;
  padding: var(--s-5);
}
.bw-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--s-2);
  padding: var(--s-4) var(--s-5);
  border-top: 1px solid var(--border);
}
.case-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--s-2);
  margin-bottom: var(--s-4);
}
.case-grid div,
.case-panel {
  padding: var(--s-3);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface-2);
}
.case-grid span {
  display: block;
  margin-bottom: 4px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.case-grid strong {
  font-size: var(--t-sm);
}
.case-panel {
  margin-bottom: var(--s-3);
}
.case-panel h3 {
  margin: 0 0 var(--s-2);
  font-size: var(--t-sm);
}
.case-panel p {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--t-sm);
  line-height: 1.5;
}
.bw-messages {
  display: grid;
  gap: var(--s-2);
  max-height: 240px;
  overflow: auto;
}
.bw-message {
  padding: var(--s-3);
  border: 1px solid var(--glass-border);
  border-radius: var(--r-md);
  background: var(--glass-bg);
}
.bw-message-staff {
  background: oklch(from var(--brand) l c h / 0.1);
}
.bw-message-actor,
.bw-message-time {
  display: block;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.bw-message-body {
  margin: 6px 0;
  color: var(--text);
  font-size: var(--t-sm);
}
.update-panel {
  display: grid;
  gap: var(--s-3);
}
.update-grid {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: var(--s-3);
}

@media (max-width: 720px) {
  .dispute-stat-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s-2);
  }
  .dispute-stat {
    min-height: 90px;
    padding: var(--s-3);
  }
  .dispute-stat strong {
    font-size: var(--t-xl);
  }
  .dispute-controls {
    grid-template-columns: 1fr;
    padding: var(--s-3);
  }
  .dispute-actions-col {
    min-width: 72px;
    position: sticky;
    right: 0;
    z-index: 3;
    background: var(--glass-bg-strong);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }
  .dispute-row-action {
    display: none;
  }
  .case-grid,
  .update-grid {
    grid-template-columns: 1fr;
  }
  .bw-modal-backdrop {
    align-items: end;
    padding: 0;
  }
  .dispute-modal {
    width: 100%;
    max-height: 92vh;
    border-radius: var(--r-xl) var(--r-xl) 0 0;
  }
  .bw-modal-header,
  .bw-modal-body,
  .bw-modal-footer {
    padding: var(--s-4);
  }
}
</style>
