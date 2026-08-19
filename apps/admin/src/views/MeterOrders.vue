<script setup lang="ts">
/**
 * Admin — Meter Orders
 *
 * Full lifecycle management for meter purchase orders.
 *   GET  /api/v1/admin/meter-orders/stats
 *   GET  /api/v1/admin/meter-orders[?status=&q=&cursor=]
 *   GET  /api/v1/admin/meter-orders/:id
 *   PATCH /api/v1/admin/meter-orders/:id  { status, technician_name?, notes? }
 *
 * Status flow:  pending_payment → paid → assigned → dispatched → installed
 *                                                               ↘ cancelled (any paid+ state)
 */
import { ref, computed, onMounted } from 'vue';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import MobileActionMenu from '../components/MobileActionMenu.vue';
import WalletRowActions from '@beverly/tokens/WalletRowActions.vue';
import WalletTablePagination from '@beverly/tokens/WalletTablePagination.vue';
import type { ActionItem } from '@beverly/tokens/WalletRowActions.vue';
import { api, naira, shortDate, ApiError } from '../lib/api';
import { exportCsv, type Column } from '../lib/export';
import { useStaffAuthStore } from '../stores/auth';

const auth = useStaffAuthStore();
const canManageMeterOrders = computed(() => auth.hasPermission('wallet.vendors.manage'));
const currentPage = ref(1);
const pageSize = ref(10);

interface CustomerUser {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
}

interface VendorOrg {
    legal_name?: string | null;
    trading_name?: string | null;
}

interface MeterOrder {
    id: string;
    customer_id: string;
    customer_name_snapshot?: string | null;
    meter_type: 'single_phase' | 'three_phase';
    property_address: string;
    service_area: string;
    contact_phone: string;
    amount_minor: number;
    status: 'pending_payment' | 'paid' | 'assigned' | 'dispatched' | 'installed' | 'cancelled';
    payment_reference: string;
    technician_name: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
    source_channel?: 'customer_portal' | 'vendor_portal' | 'admin_portal';
    sponsor_mode?: 'manual_paid' | 'vendor_wallet';
    customers?: CustomerUser | null;
    vendor_organizations?: VendorOrg | null;
}

interface Stats {
    total: number;
    pending_payment: number;
    in_progress: number;
    installed: number;
    installed_today: number;
    cancelled: number;
    by_source?: Record<string, number>;
}

// ── data ──────────────────────────────────────────────────────────
const orders      = ref<MeterOrder[]>([]);
const stats       = ref<Stats | null>(null);
const loading     = ref(false);
const loadingMore = ref(false);
const nextCursor  = ref<string | null>(null);
const banner      = ref<{ tone: 'success' | 'error'; text: string } | null>(null);

// ── filters ───────────────────────────────────────────────────────
const filterStatus = ref('');
const search       = ref('');

const STATUS_OPTS = [
    { value: '',                label: 'All statuses' },
    { value: 'pending_payment', label: 'Pending payment' },
    { value: 'paid',            label: 'Paid' },
    { value: 'assigned',        label: 'Assigned' },
    { value: 'dispatched',      label: 'Dispatched' },
    { value: 'installed',       label: 'Installed' },
    { value: 'cancelled',       label: 'Cancelled' },
];

// ── status helpers ────────────────────────────────────────────────
const STATUS_BADGE: Record<string, string> = {
    pending_payment: 'neutral',
    paid:            'warn',
    assigned:        'warn',
    dispatched:      'info',
    installed:       'success',
    cancelled:       'danger',
};

const STATUS_LABEL: Record<string, string> = {
    pending_payment: 'Awaiting Payment',
    paid:            'Paid',
    assigned:        'Assigned',
    dispatched:      'En Route',
    installed:       'Installed',
    cancelled:       'Cancelled',
};

/** The natural next status in the workflow */
const STATUS_NEXT: Record<string, string> = {
    paid:       'assigned',
    assigned:   'dispatched',
    dispatched: 'installed',
};
const STATUS_ALLOWED: Record<string, string[]> = {
    pending_payment: ['paid', 'cancelled'],
    paid: ['assigned', 'cancelled'],
    assigned: ['dispatched', 'cancelled'],
    dispatched: ['installed'],
    installed: [],
    cancelled: [],
};

function customerName(o: MeterOrder) {
    return o.customers?.full_name ?? o.customer_name_snapshot ?? `Customer #${o.customer_id.slice(0, 8)}`;
}
function customerContact(o: MeterOrder) {
    return o.customers?.phone ?? o.contact_phone;
}
function meterTypeLabel(t: string) {
    return t === 'three_phase' ? '3-Phase' : '1-Phase';
}
function sourceLabel(o: MeterOrder) {
    if (o.source_channel === 'vendor_portal') {
        return o.vendor_organizations?.trading_name ?? o.vendor_organizations?.legal_name ?? 'Vendor portal';
    }
    if (o.source_channel === 'admin_portal') return 'Admin assisted';
    return 'Customer self-service';
}
function sponsorLabel(o: MeterOrder) {
    return o.sponsor_mode === 'vendor_wallet' ? 'Vendor wallet' : 'Manual paid';
}

// ── fetch ─────────────────────────────────────────────────────────
async function loadStats() {
    try {
        stats.value = await api.get<Stats>('/api/v1/admin/meter-orders/stats');
    } catch { /* non-critical */ }
}

function buildUrl(cursor?: string | null) {
    const p = new URLSearchParams({ limit: '100' });
    if (filterStatus.value) p.set('status', filterStatus.value);
    if (search.value.trim()) p.set('q', search.value.trim());
    if (cursor) p.set('cursor', cursor);
    return `/api/v1/admin/meter-orders?${p}`;
}

async function load() {
    loading.value = true;
    banner.value = null;
    orders.value = [];
    nextCursor.value = null;
    try {
        const r = await api.get<{ orders: MeterOrder[]; nextCursor: string | null }>(buildUrl());
        orders.value    = r.orders ?? [];
        nextCursor.value = r.nextCursor ?? null;
    } catch (e: any) {
        const msg = e instanceof ApiError ? e.message : e?.message ?? 'Could not load orders.';
        banner.value = { tone: 'error', text: msg };
    } finally { loading.value = false; }
}

async function loadMore() {
    if (!nextCursor.value || loadingMore.value) return;
    loadingMore.value = true;
    try {
        const r = await api.get<{ orders: MeterOrder[]; nextCursor: string | null }>(buildUrl(nextCursor.value));
        orders.value.push(...(r.orders ?? []));
        nextCursor.value = r.nextCursor ?? null;
    } catch { /* noop */ } finally { loadingMore.value = false; }
}

async function refresh() {
    await Promise.all([loadStats(), load()]);
}

onMounted(refresh);

// ── advance / cancel modal ─────────────────────────────────────────
const actionOpen    = ref(false);
const actionOrder   = ref<MeterOrder | null>(null);
const actionVerb    = ref<'advance' | 'cancel'>('advance');
const actionStatus  = ref('');
const techName      = ref('');
const actionNotes   = ref('');
const actionBusy    = ref(false);
const actionError   = ref('');

const actionTitle = computed(() => {
    if (!actionOrder.value) return '';
    if (actionVerb.value === 'cancel') return 'Cancel order';
    return `Mark as ${STATUS_LABEL[actionStatus.value] ?? actionStatus.value}`;
});

const actionDesc = computed(() => {
    if (!actionOrder.value) return '';
    const o = actionOrder.value;
    if (actionVerb.value === 'cancel') {
        return `Cancel the ${meterTypeLabel(o.meter_type)} meter order for ${customerName(o)} at ${o.property_address}? This cannot be undone.`;
    }
    return `Advance order for ${customerName(o)} at ${o.property_address} → ${STATUS_LABEL[actionStatus.value]}.`;
});

const needsTech = computed(() =>
    actionVerb.value === 'advance' && ['assigned', 'dispatched'].includes(actionStatus.value)
);
const actionStatuses = computed(() => actionOrder.value
    ? [actionOrder.value.status, ...(STATUS_ALLOWED[actionOrder.value.status] ?? [])]
    : []);

function askAdvance(o: MeterOrder) {
    if (!canManageMeterOrders.value) return;
    actionOrder.value  = o;
    actionVerb.value   = 'advance';
    actionStatus.value = STATUS_NEXT[o.status] ?? '';
    techName.value     = o.technician_name ?? '';
    actionNotes.value  = '';
    actionError.value  = '';
    actionOpen.value   = true;
}

function askCancel(o: MeterOrder) {
    if (!canManageMeterOrders.value) return;
    actionOrder.value  = o;
    actionVerb.value   = 'cancel';
    actionStatus.value = 'cancelled';
    techName.value     = '';
    actionNotes.value  = '';
    actionError.value  = '';
    actionOpen.value   = true;
}

function askCustomStatus(o: MeterOrder) {
    if (!canManageMeterOrders.value) return;
    actionOrder.value  = o;
    actionVerb.value   = 'advance';
    actionStatus.value = o.status;
    techName.value     = o.technician_name ?? '';
    actionNotes.value  = o.notes ?? '';
    actionError.value  = '';
    actionOpen.value   = true;
}

async function doAction() {
    if (!actionOrder.value) return;
    actionBusy.value  = true;
    actionError.value = '';
    const body: Record<string, string> = { status: actionStatus.value };
    if (techName.value.trim())    body.technician_name = techName.value.trim();
    if (actionNotes.value.trim()) body.notes = actionNotes.value.trim();
    try {
        const updated = await api.patch<MeterOrder>(
            `/api/v1/admin/meter-orders/${actionOrder.value.id}`, body
        );
        const idx = orders.value.findIndex((o) => o.id === actionOrder.value!.id);
        if (idx >= 0) orders.value[idx] = updated;
        banner.value = {
            tone: 'success',
            text: actionVerb.value === 'cancel'
                ? `Order for ${customerName(actionOrder.value)} cancelled.`
                : `Order marked ${STATUS_LABEL[actionStatus.value]} successfully.`,
        };
        actionOpen.value = false;
        await loadStats();
    } catch (e: any) {
        actionError.value = e instanceof ApiError ? e.message : e?.message ?? 'Update failed.';
    } finally { actionBusy.value = false; }
}

// Disable confirm when cancel but no notes
const actionDisabled = computed(() =>
    actionVerb.value === 'cancel' && actionNotes.value.trim().length < 3
);

function buildMeterOrderRowActions(o: MeterOrder): ActionItem[] {
    const actions: ActionItem[] = [];
    if (STATUS_NEXT[o.status]) {
        actions.push({
            label: `Advance to ${STATUS_LABEL[STATUS_NEXT[o.status]]}`,
            icon: 'approve',
            action: () => askAdvance(o),
        });
    }
    actions.push({
        label: 'Edit Order',
        icon: 'edit',
        action: () => askCustomStatus(o),
    });
    if (['paid', 'assigned', 'dispatched'].includes(o.status)) {
        actions.push({
            label: 'Cancel Order',
            icon: 'reject',
            action: () => askCancel(o),
        });
    }
    return actions;
}

const paginatedOrders = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    return orders.value.slice(start, start + pageSize.value);
});

// ── export ────────────────────────────────────────────────────────
const CSV_COLS: Column<MeterOrder>[] = [
    { key: 'created_at',  header: 'Date',         value: (r) => r.created_at },
    { key: 'customer',    header: 'Customer',      value: customerName },
    { key: 'phone',       header: 'Phone',         value: customerContact },
    { key: 'type',        header: 'Meter Type',    value: (r) => r.meter_type },
    { key: 'address',     header: 'Address',       value: (r) => r.property_address },
    { key: 'area',        header: 'Service Area',  value: (r) => r.service_area },
    { key: 'amount',      header: 'Amount (₦)',    value: (r) => (r.amount_minor / 100).toFixed(2) },
    { key: 'status',      header: 'Status',        value: (r) => r.status },
    { key: 'technician',  header: 'Technician',    value: (r) => r.technician_name ?? '' },
    { key: 'reference',   header: 'Payment Ref',   value: (r) => r.payment_reference },
    { key: 'notes',       header: 'Notes',         value: (r) => r.notes ?? '' },
];

function doExport() {
    exportCsv('beverly-meter-orders', orders.value, CSV_COLS);
}
</script>

<template>
  <AppShell title="Meter Orders">
    <div class="bw-page-actions">
      <RouterLink v-if="canManageMeterOrders" to="/meter-orders/new" class="bw-btn primary" style="text-decoration:none">
        New Order
      </RouterLink>
    </div>

    <!-- Banner -->
    <transition name="banner">
      <div v-if="banner" :class="['mo-banner', banner.tone]" role="status">
        {{ banner.text }}
        <button class="mo-banner-x" @click="banner = null" aria-label="Dismiss">×</button>
      </div>
    </transition>

    <!-- KPI row -->
    <div class="mo-kpi-row bw-mobile-kpi-grid" aria-label="Meter order summary">
      <div class="mo-kpi">
        <span class="mo-kpi-label">Total orders</span>
        <span class="mo-kpi-value">{{ stats?.total ?? '—' }}</span>
      </div>
      <div class="mo-kpi warn">
        <span class="mo-kpi-label">Pending payment</span>
        <span class="mo-kpi-value">{{ stats?.pending_payment ?? '—' }}</span>
      </div>
      <div class="mo-kpi info">
        <span class="mo-kpi-label">In progress</span>
        <span class="mo-kpi-value">{{ stats?.in_progress ?? '—' }}</span>
      </div>
      <div class="mo-kpi success">
        <span class="mo-kpi-label">Installed</span>
        <span class="mo-kpi-value">
          {{ stats?.installed ?? '—' }}
          <span v-if="stats?.installed_today" class="mo-kpi-today">+{{ stats.installed_today }} today</span>
        </span>
      </div>
      <div class="mo-kpi danger">
        <span class="mo-kpi-label">Cancelled</span>
        <span class="mo-kpi-value">{{ stats?.cancelled ?? '—' }}</span>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="mo-toolbar">
      <div class="mo-search-wrap">
        <svg class="mo-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          v-model="search"
          class="bw-input mo-search-input"
          placeholder="Search address, area, phone…"
          @keyup.enter="load"
        />
      </div>
      <select v-model="filterStatus" class="bw-select mo-status-select" @change="load">
        <option v-for="o in STATUS_OPTS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <div class="mo-toolbar-actions">
      <button type="button" class="bw-btn sm" :disabled="loading" @click.prevent="refresh">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
      <button type="button" class="bw-btn sm" :disabled="!orders.length" @click.prevent="doExport">
        Export CSV
      </button>
      </div>
    </div>

    <!-- Table card -->
    <div class="bw-card" style="padding: 0">
      <div class="mo-count-bar">
        <span class="bw-muted" style="font-size: var(--t-xs)">
          {{ loading ? 'Loading…' : `${orders.length} orders${nextCursor ? '+' : ''}` }}
        </span>
      </div>

      <!-- Desktop table -->
      <div class="bw-t-wrap">
        <table class="bw-table mo-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Type</th>
              <th>Address</th>
              <th>Area</th>
              <th>Source</th>
              <th style="text-align:right">Amount</th>
              <th>Status</th>
              <th>Date</th>
              <th>Technician</th>
              <th v-if="canManageMeterOrders" class="mo-actions-col action-column bw-align-center" style="text-align: center">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td :colspan="canManageMeterOrders ? 10 : 9" class="mo-center-cell">Loading…</td>
            </tr>
            <tr v-else-if="!orders.length">
              <td :colspan="canManageMeterOrders ? 10 : 9" class="mo-center-cell">No orders match the current filters.</td>
            </tr>
            <tr v-for="o in paginatedOrders" :key="o.id">
              <td>
                <div class="mo-customer-name">{{ customerName(o) }}</div>
                <div class="mo-customer-sub">{{ customerContact(o) }}</div>
              </td>
              <td>
                <span :class="['bw-badge', o.meter_type === 'three_phase' ? 'info' : 'neutral']">
                  {{ meterTypeLabel(o.meter_type) }}
                </span>
              </td>
              <td class="mo-address">{{ o.property_address }}</td>
              <td class="bw-muted" style="font-size: var(--t-sm)">{{ o.service_area }}</td>
              <td class="bw-muted" style="font-size: var(--t-sm)">{{ sourceLabel(o) }} · {{ sponsorLabel(o) }}</td>
              <td class="bw-money" style="text-align:right">{{ naira(o.amount_minor) }}</td>
              <td>
                <span :class="['bw-badge', STATUS_BADGE[o.status] ?? 'neutral']">
                  {{ STATUS_LABEL[o.status] ?? o.status }}
                </span>
              </td>
              <td class="bw-muted bw-mono" style="font-size: var(--t-xs); white-space: nowrap">
                {{ shortDate(o.created_at) }}
              </td>
              <td class="bw-muted" style="font-size: var(--t-sm)">{{ o.technician_name ?? '—' }}</td>
              <td v-if="canManageMeterOrders" class="mo-actions-col action-column bw-align-center" style="text-align: center">
                <WalletRowActions
                  :items="buildMeterOrderRowActions(o)"
                  label="Meter order actions"
                  align="center"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="bw-t-cards mo-cards">
        <div v-for="o in paginatedOrders" :key="o.id" class="mo-card">
          <div class="mo-card-top">
            <div>
              <div class="mo-card-customer">{{ customerName(o) }}</div>
              <div class="mo-card-sub">{{ customerContact(o) }}</div>
            </div>
            <span :class="['bw-badge', STATUS_BADGE[o.status] ?? 'neutral']">
              {{ STATUS_LABEL[o.status] ?? o.status }}
            </span>
          </div>

          <div class="mo-card-row">
            <span class="mo-card-lbl">Type</span>
            <span :class="['bw-badge', o.meter_type === 'three_phase' ? 'info' : 'neutral']">
              {{ meterTypeLabel(o.meter_type) }}
            </span>
          </div>
          <div class="mo-card-row">
            <span class="mo-card-lbl">Address</span>
            <span class="mo-card-val">{{ o.property_address }}</span>
          </div>
          <div class="mo-card-row">
            <span class="mo-card-lbl">Area</span>
            <span>{{ o.service_area }}</span>
          </div>
          <div class="mo-card-row">
            <span class="mo-card-lbl">Amount</span>
            <strong class="bw-money">{{ naira(o.amount_minor) }}</strong>
          </div>
          <div class="mo-card-row">
            <span class="mo-card-lbl">Date</span>
            <span class="bw-mono" style="font-size: var(--t-xs)">{{ shortDate(o.created_at) }}</span>
          </div>
          <div v-if="o.technician_name" class="mo-card-row">
            <span class="mo-card-lbl">Technician</span>
            <span>{{ o.technician_name }}</span>
          </div>

          <div v-if="canManageMeterOrders" class="mo-card-acts">
            <WalletRowActions
              :items="buildMeterOrderRowActions(o)"
              label="Meter order actions"
              align="right"
            />
          </div>
        </div>

        <div v-if="!loading && !orders.length" class="bw-muted mo-empty">
          No orders match the current filters.
        </div>
      </div>

      <WalletTablePagination
        v-model:page="currentPage"
        v-model:pageSize="pageSize"
        :total-items="orders.length"
        item-label="orders"
      />

      <!-- Load more -->
      <div v-if="nextCursor" class="mo-load-more">
        <button class="bw-btn sm" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </div>

    <!-- Action dialog (advance / cancel / edit) -->
    <ConfirmDialog
      v-model:open="actionOpen"
      :title="actionTitle"
      :description="actionDesc"
      :confirm-label="actionVerb === 'cancel' ? 'Cancel order' : 'Confirm'"
      :cancel-label="'Back'"
      :tone="actionVerb === 'cancel' ? 'danger' : 'brand'"
      :loading="actionBusy"
      :disable-confirm="actionDisabled"
      @confirm="doAction"
    >
      <!-- Status selector (edit mode) -->
      <div v-if="actionVerb === 'advance'" class="mo-cd-field">
        <label class="mo-cd-label">New status</label>
        <select v-model="actionStatus" class="bw-select">
          <option v-for="status in actionStatuses" :key="status" :value="status">{{ STATUS_LABEL[status] }}</option>
        </select>
      </div>

      <!-- Technician name (for assigned / dispatched) -->
      <div v-if="needsTech" class="mo-cd-field">
        <label class="mo-cd-label">Technician name</label>
        <input
          v-model="techName"
          class="bw-input"
          placeholder="e.g. Emeka Obi"
        />
      </div>

      <!-- Notes -->
      <div class="mo-cd-field">
        <label class="mo-cd-label">
          Notes <span v-if="actionVerb === 'cancel'" style="color: var(--danger)">* (required)</span>
          <span v-else class="bw-muted">(optional)</span>
        </label>
        <textarea
          v-model="actionNotes"
          class="bw-input"
          rows="2"
          :placeholder="actionVerb === 'cancel' ? 'Reason for cancellation…' : 'Any notes for this update…'"
        />
        <p v-if="actionVerb === 'cancel'" class="mo-cd-hint">
          Visible in the audit log. Minimum 3 characters.
        </p>
      </div>

      <p v-if="actionError" class="mo-cd-error">{{ actionError }}</p>
    </ConfirmDialog>

  </AppShell>
</template>

<style scoped>
/* Banner */
.mo-banner {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--s-3); padding: var(--s-3) var(--s-4); border-radius: var(--r-md);
  margin-bottom: var(--s-3); font-size: var(--t-sm); border: 1px solid;
}
.mo-banner.success { background: oklch(from var(--brand) l c h / 0.08); border-color: oklch(from var(--brand) l c h / 0.30); color: var(--brand); }
.mo-banner.error   { background: oklch(from var(--danger) l c h / 0.08); border-color: oklch(from var(--danger) l c h / 0.30); color: var(--danger); }
.mo-banner-x { background: transparent; border: none; color: inherit; cursor: pointer; font-size: 18px; line-height: 1; padding: 2px 8px; border-radius: 50%; opacity: 0.7; }
.mo-banner-x:hover { opacity: 1; background: oklch(0% 0 0 / 0.10); }
.banner-enter-active, .banner-leave-active { transition: all 0.20s var(--ease-out); }
.banner-enter-from { opacity: 0; transform: translateY(-4px); }
.banner-leave-to { opacity: 0; }

/* KPI row */
.mo-kpi-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--s-3);
  margin-bottom: var(--s-3);
}
.mo-kpi {
  min-height: 96px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--r-md);
  padding: var(--s-3) var(--s-4);
  display: flex; flex-direction: column; gap: 4px;
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
}
.mo-kpi-label { font-size: var(--t-xs); color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0; }
.mo-kpi-value { font-family: var(--font-mono); font-size: var(--t-xl); font-weight: 700; color: var(--text); display: flex; align-items: baseline; gap: 6px; }
.mo-kpi-today { font-size: var(--t-xs); font-weight: 500; color: var(--brand); }
.mo-kpi.success .mo-kpi-value { color: var(--brand); }
.mo-kpi.warn    .mo-kpi-value { color: var(--warn, #d97706); }
.mo-kpi.info    .mo-kpi-value { color: var(--info, #0ea5e9); }
.mo-kpi.danger  .mo-kpi-value { color: var(--danger); }

/* Toolbar */
.mo-toolbar {
  display: flex; flex-wrap: wrap; align-items: center;
  gap: var(--s-2); margin-bottom: var(--s-3);
}
.mo-search-wrap {
  position: relative;
  flex: 1;
  min-width: 220px;
}
.mo-search-input {
  width: 100%;
  padding-left: 34px;
}
.mo-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  width: 14px;
  height: 14px;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}
.mo-status-select {
  width: 210px;
}
.mo-toolbar-actions {
  display: flex;
  gap: var(--s-2);
}

/* Count bar */
.mo-count-bar {
  padding: var(--s-2) var(--s-4);
  border-bottom: 1px solid var(--border);
}

/* Table */
.mo-table .mo-actions-col { min-width: 220px; }
.mo-center-cell { text-align: center; padding: var(--s-6); color: var(--text-muted); }
.mo-customer-name { font-weight: 600; font-size: var(--t-sm); }
.mo-customer-sub  { font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 2px; }
.mo-address { max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: var(--t-sm); }
.mo-row-acts { display: flex; gap: 4px; justify-content: flex-end; flex-wrap: nowrap; }

/* Mobile cards */
.mo-cards { padding: var(--s-3); }
.mo-card {
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--r-md); padding: var(--s-4); margin-bottom: var(--s-2);
}
.mo-card:last-child { margin-bottom: 0; }
.mo-card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--s-3); gap: var(--s-2); }
.mo-card-customer { font-weight: 600; font-size: var(--t-sm); }
.mo-card-sub { font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 2px; }
.mo-card-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: var(--t-sm); border-top: 1px dashed var(--border); }
.mo-card-lbl { color: var(--text-muted); }
.mo-card-val { text-align: right; max-width: 55%; word-break: break-word; }
.mo-card-acts { display: flex; justify-content: flex-end; gap: var(--s-2); margin-top: var(--s-3); flex-wrap: wrap; }
.mo-card-acts .bw-btn { min-height: 36px; }
.mo-empty { text-align: center; padding: var(--s-8); font-size: var(--t-sm); }

/* Load more */
.mo-load-more { display: flex; justify-content: center; padding: var(--s-4); border-top: 1px solid var(--border); }

/* ConfirmDialog slot styles */
.mo-cd-field { margin-bottom: var(--s-3); }
.mo-cd-label {
  display: block; font-size: var(--t-xs); font-weight: 700;
  text-transform: uppercase; letter-spacing: .04em;
  color: var(--text-muted); margin-bottom: 6px;
}
.mo-cd-hint { font-size: var(--t-xs); color: var(--text-muted); margin: 4px 0 0; }
.mo-cd-error { font-size: var(--t-sm); color: var(--danger); margin-top: var(--s-2); }

/* Responsive */
@media (max-width: 900px) {
  .mo-kpi-row { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 720px) {
  .mo-table .mo-actions-col {
    min-width: 72px;
    position: sticky;
    right: 0;
    background: var(--glass-bg-strong);
    backdrop-filter: blur(16px) saturate(150%);
    -webkit-backdrop-filter: blur(16px) saturate(150%);
    z-index: 3;
  }

  .mo-row-acts {
    display: none;
  }
}
@media (max-width: 560px) {
  .mo-kpi-row { grid-template-columns: repeat(2, 1fr); }
  .mo-kpi { min-height: 88px; padding: var(--s-3); }
  .mo-toolbar { flex-direction: column; align-items: stretch; }
  .mo-search-wrap,
  .mo-status-select {
    width: 100%;
  }
  .mo-toolbar-actions {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
}
</style>
