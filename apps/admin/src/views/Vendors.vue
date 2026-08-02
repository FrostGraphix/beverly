<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import MobileActionMenu from '../components/MobileActionMenu.vue';
import WalletDataViewSwitch from '@beverly/tokens/WalletDataViewSwitch.vue';
import { api, shortDate, ApiError } from '../lib/api';
import { useStaffAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useStaffAuthStore();
const canManageVendors = computed(() => auth.hasPermission('wallet.vendors.manage'));

interface Vendor {
    id: string;
    legal_name: string;
    trading_name: string | null;
    contact_email: string;
    contact_phone: string;
    risk_level: string;
    status: 'pending' | 'approved' | 'suspended' | 'frozen' | 'closed';
    approved_at: string | null;
    created_at: string;
}

const vendors = ref<Vendor[]>([]);
const summary = ref<{ total: number; byStatus: Record<Vendor['status'], number> } | null>(null);
const q = ref('');
const status = ref<'' | Vendor['status']>('');
const loading = ref(false);
const viewMode = ref<'list' | 'table'>(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'list' : 'table',
);
const banner = ref<{ tone: 'success' | 'error'; text: string } | null>(null);

// ─ Action modal ──────────────────────────────────────────────
const modalOpen = ref(false);
const target = ref<Vendor | null>(null);
const targetAction = ref<'approved' | 'frozen' | 'suspended'>('approved');
const reason = ref('');
const busy = ref(false);
const deleteOpen = ref(false);
const deleteTarget = ref<Vendor | null>(null);
const deleteReason = ref('');
const deleteBusy = ref(false);

const actionTone = computed<'brand' | 'danger' | 'warn'>(() =>
    targetAction.value === 'frozen' ? 'danger'
        : targetAction.value === 'suspended' ? 'warn'
            : 'brand',
);

const actionLabel = computed(() => ({
    approved:  'Reactivate vendor',
    frozen:    'Freeze vendor',
    suspended: 'Suspend vendor',
}[targetAction.value]));

const actionRequiresReason = computed(() =>
    targetAction.value === 'frozen' || targetAction.value === 'suspended',
);

const reasonValid = computed(() =>
    !actionRequiresReason.value || reason.value.trim().length >= 4,
);

function ask(v: Vendor, next: 'approved' | 'frozen' | 'suspended') {
    if (!canManageVendors.value) return;
    target.value = v;
    targetAction.value = next;
    reason.value = '';
    modalOpen.value = true;
}

function askDelete(v: Vendor) {
    if (!canManageVendors.value) return;
    deleteTarget.value = v;
    deleteReason.value = '';
    deleteOpen.value = true;
}

async function doAction() {
    if (!target.value || !reasonValid.value) return;
    busy.value = true;
    banner.value = null;
    try {
        await api.patch(`/api/v1/admin/vendors/${target.value.id}/status`, {
            status: targetAction.value,
            reason: reason.value.trim() || undefined,
        });
        modalOpen.value = false;
        banner.value = {
            tone: 'success',
            text: `${target.value.legal_name} → ${targetAction.value}.`,
        };
        target.value = null;
        await Promise.all([load(), loadSummary()]);
    } catch (e: any) {
        const msg = e instanceof ApiError ? `${e.message} (${e.code})` : e?.message ?? 'Update failed.';
        banner.value = { tone: 'error', text: msg };
        modalOpen.value = false;
    } finally {
        busy.value = false;
    }
}

async function deleteVendor() {
    if (!deleteTarget.value) return;
    deleteBusy.value = true;
    banner.value = null;
    try {
        await api.del(`/api/v1/admin/vendors/${deleteTarget.value.id}`, {
            reason: deleteReason.value.trim() || undefined,
        });
        banner.value = { tone: 'success', text: `${deleteTarget.value.legal_name} deleted.` };
        vendors.value = vendors.value.filter((v) => v.id !== deleteTarget.value?.id);
        await loadSummary();
        deleteOpen.value = false;
        deleteTarget.value = null;
    } catch (e: any) {
        const msg = e instanceof ApiError ? `${e.message} (${e.code})` : e?.message ?? 'Delete failed.';
        banner.value = { tone: 'error', text: msg };
        deleteOpen.value = false;
    } finally {
        deleteBusy.value = false;
    }
}

async function load() {
    loading.value = true;
    try {
        const params = new URLSearchParams();
        if (status.value) params.set('status', status.value);
        if (q.value) params.set('q', q.value);
        const r = await api.get<{ vendors: Vendor[] }>(`/api/v1/admin/vendors${params.toString() ? '?' + params : ''}`);
        vendors.value = r.vendors;
    } catch (e: any) {
        banner.value = { tone: 'error', text: e?.message ?? 'Could not load vendors.' };
    } finally { loading.value = false; }
}

async function loadSummary() {
    try {
        summary.value = await api.get('/api/v1/admin/vendors/summary');
    } catch (e: any) {
        banner.value = { tone: 'error', text: e?.message ?? 'Could not load vendor summary.' };
    }
}

function statusBadge(s: Vendor['status']) {
    if (s === 'approved') return 'success';
    if (s === 'frozen') return 'danger';
    if (s === 'suspended') return 'warn';
    return 'neutral';
}

onMounted(() => {
    void load();
    void loadSummary();
});
</script>

<template>
  <AppShell title="Vendors">

    <transition name="banner">
      <div v-if="banner" :class="['bw-banner', banner.tone]" role="status">
        {{ banner.text }}
        <button class="bw-banner-x" @click="banner = null" aria-label="Dismiss">×</button>
      </div>
    </transition>

    <section class="bw-kpi-grid bw-mobile-kpi-grid vendor-kpis" aria-label="Vendor summary">
      <article class="bw-kpi featured">
        <span class="bw-kpi-label">Total vendors</span>
        <strong class="bw-kpi-value">{{ summary?.total ?? 0 }}</strong>
        <span class="bw-kpi-note">registered organizations</span>
      </article>
      <article class="bw-kpi">
        <span class="bw-kpi-label">Approved</span>
        <strong class="bw-kpi-value">{{ summary?.byStatus?.approved ?? 0 }}</strong>
        <span class="bw-kpi-note">ready to operate</span>
      </article>
      <article class="bw-kpi warn-tone">
        <span class="bw-kpi-label">Pending</span>
        <strong class="bw-kpi-value">{{ summary?.byStatus?.pending ?? 0 }}</strong>
        <span class="bw-kpi-note">awaiting approval</span>
      </article>
      <article class="bw-kpi danger-tone">
        <span class="bw-kpi-label">Restricted</span>
        <strong class="bw-kpi-value">{{ (summary?.byStatus?.suspended ?? 0) + (summary?.byStatus?.frozen ?? 0) }}</strong>
        <span class="bw-kpi-note">suspended or frozen</span>
      </article>
    </section>

    <div class="bw-card bw-data-region" :data-view="viewMode" style="padding: 0">
      <div class="bw-table-head-bar">
        <h2 class="bw-h2" style="margin: 0">Vendor organizations</h2>
        <input class="bw-input" v-model="q" placeholder="Search…" style="width: 220px" @keyup.enter="load" />
        <select class="bw-select" v-model="status" @change="load" style="width: 140px">
          <option value="">All status</option>
          <option value="approved">Approved</option>
          <option value="suspended">Suspended</option>
          <option value="frozen">Frozen</option>
          <option value="closed">Closed</option>
        </select>
        <span class="bw-spacer"></span>
        <WalletDataViewSwitch v-model="viewMode" label="Vendor display view" />
        <router-link to="/vendors/analytics" class="bw-btn" style="text-decoration: none">View analytics</router-link>
        <router-link v-if="canManageVendors" to="/vendors/new" class="bw-btn primary" style="text-decoration: none">+ Create vendor</router-link>
      </div>

      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>Created</th>
              <th>Legal name</th>
              <th>Contact</th>
              <th>Risk</th>
              <th>Status</th>
              <th class="actions-col"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in vendors" :key="v.id" class="v-row" @click="router.push(`/vendors/${v.id}`)">
              <td class="bw-mono bw-muted">{{ shortDate(v.created_at) }}</td>
              <td>
                <strong>{{ v.legal_name }}</strong>
                <div v-if="v.trading_name" class="bw-muted" style="font-size: var(--t-xs)">{{ v.trading_name }}</div>
              </td>
              <td>
                <div class="bw-mono" style="font-size: var(--t-xs)">{{ v.contact_email }}</div>
                <div class="bw-muted bw-mono" style="font-size: var(--t-xs)">{{ v.contact_phone }}</div>
              </td>
              <td><span class="bw-badge neutral">{{ v.risk_level }}</span></td>
              <td><span :class="['bw-badge', statusBadge(v.status)]">{{ v.status }}</span></td>
              <td class="actions-col" @click.stop>
                <div class="action-cluster">
                  <router-link :to="`/vendors/${v.id}`" class="bw-btn sm" style="text-decoration:none">View</router-link>
                  <button v-if="canManageVendors && v.status === 'approved'" class="bw-btn sm" @click="ask(v, 'frozen')">Freeze</button>
                  <button v-if="canManageVendors && v.status === 'approved'" class="bw-btn sm" @click="ask(v, 'suspended')">Suspend</button>
                  <button v-if="canManageVendors && (v.status === 'frozen' || v.status === 'suspended')" class="bw-btn sm primary" @click="ask(v, 'approved')">Reactivate</button>
                  <button v-if="canManageVendors" class="bw-btn sm danger" @click="askDelete(v)">Delete</button>
                </div>
                <MobileActionMenu label="Vendor actions">
                  <router-link :to="`/vendors/${v.id}`" class="mobile-action-item">View</router-link>
                  <button v-if="canManageVendors && v.status === 'approved'" class="mobile-action-item" @click="ask(v, 'frozen')">Freeze</button>
                  <button v-if="canManageVendors && v.status === 'approved'" class="mobile-action-item" @click="ask(v, 'suspended')">Suspend</button>
                  <button v-if="canManageVendors && (v.status === 'frozen' || v.status === 'suspended')" class="mobile-action-item primary" @click="ask(v, 'approved')">Reactivate</button>
                  <button v-if="canManageVendors" class="mobile-action-item danger" @click="askDelete(v)">Delete</button>
                </MobileActionMenu>
              </td>
            </tr>
            <tr v-if="!vendors.length && !loading">
              <td colspan="6" class="bw-muted" style="text-align: center; padding: var(--s-6)">No vendors yet.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="bw-t-cards">
        <div v-for="v in vendors" :key="`vendor-card-${v.id}`" class="bw-tc" @click="router.push(`/vendors/${v.id}`)">
          <div class="bw-tc-top">
            <div>
              <div class="bw-tc-vendor">{{ v.legal_name }}</div>
              <div v-if="v.trading_name" class="bw-muted" style="font-size: var(--t-xs)">{{ v.trading_name }}</div>
            </div>
            <span :class="['bw-badge', statusBadge(v.status)]">{{ v.status }}</span>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Contact</span>
              <span class="bw-tc-pair-val bw-mono">{{ v.contact_email }}</span>
              <span v-if="v.contact_phone" class="bw-muted bw-mono" style="font-size: var(--t-xs)">{{ v.contact_phone }}</span>
            </div>
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Risk Level</span>
              <span class="bw-badge neutral">{{ v.risk_level }}</span>
            </div>
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Created</span>
              <span class="bw-tc-pair-val bw-muted">{{ shortDate(v.created_at) }}</span>
            </div>
          </div>
          <MobileActionMenu label="Vendor actions" @click.stop>
            <router-link :to="`/vendors/${v.id}`" class="mobile-action-item">View</router-link>
            <button v-if="canManageVendors && v.status === 'approved'" class="mobile-action-item" @click="ask(v, 'frozen')">Freeze</button>
            <button v-if="canManageVendors && v.status === 'approved'" class="mobile-action-item" @click="ask(v, 'suspended')">Suspend</button>
            <button v-if="canManageVendors && (v.status === 'frozen' || v.status === 'suspended')" class="mobile-action-item primary" @click="ask(v, 'approved')">Reactivate</button>
            <button v-if="canManageVendors" class="mobile-action-item danger" @click="askDelete(v)">Delete</button>
          </MobileActionMenu>
        </div>
        <div v-if="!vendors.length && !loading" class="bw-muted" style="text-align: center; padding: var(--s-6)">No vendors yet.</div>
      </div>
    </div>

    <!-- Status change confirm -->
    <ConfirmDialog
      v-model:open="modalOpen"
      :title="actionLabel"
      :description="target
        ? `Change ${target.legal_name} → ${targetAction}. This is logged in the audit trail.`
        : ''"
      :confirm-label="actionLabel"
      :tone="actionTone"
      :loading="busy"
      :disable-confirm="!reasonValid"
      @confirm="doAction"
    >
      <template v-if="actionRequiresReason">
        <label class="cd-input-label">Reason (visible to vendor) *</label>
        <textarea
          v-model="reason"
          rows="3"
          class="cd-input"
          placeholder="e.g. Suspected fraud — under investigation."
        />
        <p class="cd-input-hint">Minimum 4 characters.</p>
      </template>
    </ConfirmDialog>

    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Delete vendor"
      :description="deleteTarget
        ? `Delete ${deleteTarget.legal_name} from the active vendor list? Financial records stay preserved for audit.`
        : ''"
      confirm-label="Delete vendor"
      tone="danger"
      :loading="deleteBusy"
      @confirm="deleteVendor"
    >
      <label class="cd-input-label">Reason (optional)</label>
      <textarea
        v-model="deleteReason"
        rows="3"
        class="cd-input"
        placeholder="e.g. duplicate vendor record"
      />
    </ConfirmDialog>

  </AppShell>
</template>

<style scoped>
.bw-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-4);
  border-radius: var(--r-md);
  margin-bottom: var(--s-3);
  font-size: var(--t-sm);
  border: 1px solid;
}
.bw-banner.success {
  background: oklch(from var(--brand) l c h / 0.08);
  border-color: oklch(from var(--brand) l c h / 0.30);
  color: var(--brand);
}
.bw-banner.error {
  background: oklch(from var(--danger) l c h / 0.08);
  border-color: oklch(from var(--danger) l c h / 0.30);
  color: var(--danger);
}
.bw-banner-x {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 2px 8px;
  border-radius: 50%;
  opacity: 0.7;
}
.bw-banner-x:hover { opacity: 1; }
.banner-enter-active, .banner-leave-active { transition: all 0.20s var(--ease-out); }
.banner-enter-from { opacity: 0; transform: translateY(-4px); }
.banner-leave-to { opacity: 0; }

.vendor-kpis { margin-bottom: var(--s-3); }

.v-row { cursor: pointer; }
.v-row:hover { background: var(--surface-2); }
.actions-col { min-width: 260px; }
.action-cluster {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
  flex-wrap: nowrap;
}

@media (max-width: 720px) {
  .actions-col {
    min-width: 72px;
    position: sticky;
    right: 0;
    background: var(--glass-bg-strong);
    backdrop-filter: blur(16px) saturate(150%);
    -webkit-backdrop-filter: blur(16px) saturate(150%);
    z-index: 3;
  }

  .action-cluster {
    display: none;
  }

}

:deep(.cd-body) .cd-input-label {
  display: block;
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0 0 6px;
}
:deep(.cd-body) .cd-input {
  display: block;
  width: 100%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 10px 12px;
  color: var(--text);
  font-size: var(--t-sm);
  line-height: 1.45;
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
  box-sizing: border-box;
}
:deep(.cd-body) .cd-input:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-glow);
}
:deep(.cd-body) .cd-input-hint {
  font-size: var(--t-xs);
  color: var(--text-muted);
  margin: 6px 0 0;
}
</style>
