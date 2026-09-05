<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import WalletDataViewSwitch from '@beverly/tokens/WalletDataViewSwitch.vue';
import WalletTablePagination from '@beverly/tokens/WalletTablePagination.vue';
import WalletTableSkeleton from '@beverly/tokens/WalletTableSkeleton.vue';
import WalletRowActions from '@beverly/tokens/WalletRowActions.vue';
import type { ActionItem } from '@beverly/tokens/WalletRowActions.vue';
import RemoteSendTrackerModal from '@beverly/tokens/RemoteSendTrackerModal.vue';
import WalletExportMenu from '@beverly/tokens/WalletExportMenu.vue';
import type { WalletExportColumn } from '@beverly/tokens/wallet-export';
import { api } from '../lib/api';
import { naira, kwh, shortDate } from '../lib/format';
import { printReceipt, purchaseReceipt, viewReceipt } from '../lib/receipts';

const purchases = ref<any[]>([]);
const loading   = ref(false);
const showFilters = ref(false);
const searchQuery = ref('');
const pageSize = ref(10);
const viewMode = ref<'list' | 'table'>(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'list' : 'table',
);
const filter    = ref<'all' | 'delivered' | 'failed' | 'pending'>('all');

const selectedRemoteOrder = ref<any | null>(null);
const remoteTrackerOpen = ref(false);
const copiedId = ref<string | null>(null);
const toastNotice = ref<{ message: string; tone: string } | null>(null);

function triggerRemoteSend(p: any) {
    selectedRemoteOrder.value = p;
    remoteTrackerOpen.value = true;
}

async function copyRowToken(p: any) {
    if (!p.token) return;
    try {
        await navigator.clipboard.writeText(p.token);
        copiedId.value = p.id;
        toastNotice.value = { message: `Token copied for meter ${p.meter_id}`, tone: 'success' };
        setTimeout(() => { copiedId.value = null; toastNotice.value = null; }, 2000);
    } catch {
        toastNotice.value = { message: 'Copy failed.', tone: 'danger' };
    }
}

async function fetchRemoteSendStatus(endpoint: string) {
    try {
        return await api.get<any>(endpoint);
    } catch (err: any) {
        const data = err?.details || err?.data || err?.response?.data;
        if (data && typeof data === 'object') {
            return {
                status: 'failed',
                deliveryState: data.delivery_state || data.deliveryState || 'remote_send_failed_needs_manual_entry',
                remark: data.message || data.remark || data.error || err.message || 'Remote send failed',
                purchaseOrder: data.purchaseOrder,
                remoteTaskId: data.remoteTaskId || data.remote_task_id,
            };
        }
        try {
            return await api.post<any>(endpoint, {});
        } catch (postErr: any) {
            const postData = postErr?.details || postErr?.data || postErr?.response?.data;
            if (postData && typeof postData === 'object') {
                return {
                    status: 'failed',
                    deliveryState: postData.delivery_state || postData.deliveryState || 'remote_send_failed_needs_manual_entry',
                    remark: postData.message || postData.remark || postData.error || postErr.message || 'Remote send failed',
                    purchaseOrder: postData.purchaseOrder,
                    remoteTaskId: postData.remoteTaskId || postData.remote_task_id,
                };
            }
            return {
                status: 'failed',
                deliveryState: 'remote_send_failed_needs_manual_entry',
                remark: postErr?.message || err?.message || 'Remote send failed',
            };
        }
    }
}

function isUndeliveredWithToken(p: any) {
    const isDelivered = (p.status === 'delivered' || (p.delivery_state && String(p.delivery_state).toUpperCase() === 'DELIVERED'));
    return Boolean(p.token && !isDelivered);
}

function buildCustomerRowActions(p: any): ActionItem[] {
    const items: ActionItem[] = [];
    if (canReceipt(p)) {
        items.push({
            label: 'View receipt',
            icon: 'view',
            action: () => viewPurchaseReceipt(p),
        });
        items.push({
            label: 'Print receipt',
            icon: 'print',
            action: () => printPurchaseReceipt(p),
        });
    }
    if (p.token) {
        items.push({
            label: copiedId.value === p.id ? '✓ Copied' : 'Copy token',
            icon: 'copy',
            action: () => copyRowToken(p),
        });
    }
    if (isUndeliveredWithToken(p)) {
        items.push({
            label: 'Remote Send',
            icon: 'send',
            tone: 'primary',
            action: () => triggerRemoteSend(p),
        });
    }
    return items;
}

onMounted(async () => {
    loading.value = true;
    try {
        const r = await api.get<{ purchases: any[] }>('/api/v1/customer/transactions?limit=200');
        purchases.value = r.purchases;
    } catch { /* noop */ } finally { loading.value = false; }
});

const filterPurchases = (rows: any[]) => {
    const q = searchQuery.value.trim().toLowerCase();
    let result = rows;
    if (filter.value === 'delivered') result = rows.filter(p => p.status === 'delivered');
    else if (filter.value === 'failed') result = rows.filter(p => p.status === 'failed');
    else if (filter.value === 'pending') result = rows.filter(p => ['created','hold_active','dispatching','delivery_pending_review'].includes(p.status));

    if (q) {
        result = result.filter(p => (
            (p.meter_id || '').toLowerCase().includes(q) ||
            (p.token || '').toLowerCase().includes(q) ||
            (p.id || '').toLowerCase().includes(q)
        ));
    }
    return result;
};

const activeFilterCount = computed(() => [
    filter.value !== 'all',
    Boolean(searchQuery.value.trim()),
].filter(Boolean).length);

const currentPage = ref(1);

const filtered = () => filterPurchases(purchases.value);

const transactionExportColumns: WalletExportColumn<any>[] = [
    { key: 'created_at', header: 'When', value: (purchase) => shortDate(purchase.created_at) },
    { key: 'meter_id', header: 'Meter', value: (purchase) => purchase.meter_id },
    { key: 'amount_minor', header: 'Amount', value: (purchase) => naira(purchase.amount_minor) },
    { key: 'units_kwh', header: 'Units', value: (purchase) => kwh(purchase.units_kwh) },
    { key: 'status', header: 'Status', value: (purchase) => statusLabel(purchase) },
    { key: 'token', header: 'Token', value: (purchase) => purchase.token || '' },
];

const paginatedPurchases = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    return filtered().slice(start, start + pageSize.value);
});

async function loadTransactions() {
    loading.value = true;
    try {
        const r = await api.get<{ purchases: any[] }>('/api/v1/customer/transactions?limit=200');
        purchases.value = r.purchases;
    } catch { /* noop */ } finally { loading.value = false; }
}

function getItemStatus(p: any): string {
    const ds = String(p.delivery_state || '').toLowerCase();
    const st = String(p.status || '').toLowerCase();
    if (ds === 'remote_send_delivered' || ds === 'delivered' || st === 'delivered') return 'delivered';
    if (ds.includes('failed') || st === 'failed') return 'failed';
    if (ds.includes('pending') || st === 'delivery_pending_review') return 'delivery_pending_review';
    return st || ds || 'unknown';
}

function statusBadge(p: any) {
    const s = typeof p === 'string' ? p : getItemStatus(p);
    if (s === 'delivered' || s === 'remote_send_delivered') return 'success';
    if (s === 'failed' || s.includes('failed')) return 'danger';
    if (s === 'dispatching' || s === 'hold_active') return 'info';
    if (s.includes('pending') || s === 'delivery_pending_review' || s === 'reversed') return 'warn';
    return 'neutral';
}

function statusLabel(p: any) {
    const ds = String(p.delivery_state || '').toLowerCase();
    if (ds === 'remote_send_delivered' || p.status === 'delivered') return 'DELIVERED';
    if (ds === 'remote_send_pending_review' || p.delivery_state === 'remote_send_pending_review') return 'DELIVERY_PENDING_REVIEW';
    if (ds.includes('failed')) return 'FAILED';
    if (p.failure_reason?.includes('payment_amount_mismatch')) return 'Payment needs review';
    if (p.delivery_state === 'token_generated_needs_reconciliation') return 'Token generated; reconciling';
    if (p.delivery_state === 'awaiting_payment') return 'Payment awaiting confirmation';
    return String(p.status ?? '').replace(/_/g, ' ').toUpperCase();
}

function onRemoteSendUpdated(res: any) {
    if (!selectedRemoteOrder.value) return;
    const nextState = res.deliveryState || res.delivery_state || res.purchaseOrder?.delivery_state;
    const isDelivered = res.status === 'success' || nextState === 'remote_send_delivered';

    if (res.purchaseOrder) {
        selectedRemoteOrder.value = { ...selectedRemoteOrder.value, ...res.purchaseOrder };
    } else if (nextState) {
        selectedRemoteOrder.value.delivery_state = nextState;
        if (isDelivered) selectedRemoteOrder.value.status = 'delivered';
    }

    const idx = purchases.value.findIndex(p => p.id === selectedRemoteOrder.value?.id);
    if (idx !== -1) {
        purchases.value[idx] = {
            ...purchases.value[idx],
            ...(res.purchaseOrder || {}),
            delivery_state: nextState || purchases.value[idx].delivery_state,
            status: isDelivered ? 'delivered' : (res.purchaseOrder?.status || purchases.value[idx].status),
        };
    }
}

async function onRemoteSendClose() {
    remoteTrackerOpen.value = false;
    await loadTransactions();
}

function canReceipt(p: any) {
    return Boolean(p.token || p.status === 'delivered' || p.receipt_id || (p.amount_minor && p.amount_minor > 0));
}

function viewPurchaseReceipt(p: any) {
    viewReceipt(purchaseReceipt(p));
}

function printPurchaseReceipt(p: any) {
    printReceipt(purchaseReceipt(p));
}
</script>

<template>
  <AppShell>
    <div class="bw-card flush bw-data-region" :data-view="viewMode">
      <div class="bw-table-head-bar recent-head-bar">
        <div class="recent-heading">
          <div class="recent-title-row">
            <div class="bw-card-title">Transactions</div>
            <span v-if="loading" class="bw-skeleton recent-count-skeleton" aria-hidden="true"></span>
            <span v-else class="recent-count">{{ filtered().length }}</span>
          </div>
          <div class="bw-card-sub">Electricity vending purchases and token receipts</div>
        </div>
        <div class="recent-actions">
          <WalletExportMenu
            :rows="filtered()"
            :columns="transactionExportColumns"
            filename="beverly-customer-transactions"
            title="Customer Transactions"
            subtitle="Filtered electricity purchases"
            :loading="loading"
            :formats="['pdf']"
          />
          <WalletDataViewSwitch v-model="viewMode" label="Transaction display view" />
          <button
            class="bw-btn sm recent-filter-button"
            :class="{ active: showFilters }"
            :aria-expanded="showFilters"
            aria-controls="customer-tx-filter-panel"
            title="Filter transactions"
            @click="showFilters = !showFilters"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            <span class="recent-action-label">Filter</span>
            <span v-if="activeFilterCount" class="recent-filter-count">{{ activeFilterCount }}</span>
          </button>
        </div>
      </div>

      <!-- Filter Controls Panel -->
      <div v-if="showFilters" id="customer-tx-filter-panel" class="recent-filter-panel">
        <div class="recent-filter-grid">
          <div class="filter-group search-group">
            <label class="filter-label">Search</label>
            <input
              v-model="searchQuery"
              type="text"
              class="bw-input bw-input-sm"
              placeholder="Search meter, token..."
            />
          </div>
          <div class="filter-group full-width">
            <label class="filter-label">Status Filter</label>
            <div class="recent-tabs-row">
              <button
                v-for="f in (['all','delivered','pending','failed'] as const)"
                :key="f"
                type="button"
                :class="['bw-btn sm', filter === f ? 'primary' : '']"
                @click="filter = f"
              >
                {{ f.charAt(0).toUpperCase() + f.slice(1) }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Meter</th>
              <th style="text-align:right">Amount</th>
              <th style="text-align:right">Units</th>
              <th>Status</th>
              <th>Token</th>
              <th class="action-column bw-align-center" style="text-align:center">Actions</th>
            </tr>
          </thead>
          <tbody>
            <WalletTableSkeleton v-if="loading && !purchases.length" :columns="7" />
            <tr v-for="p in paginatedPurchases" :key="p.id">
              <td class="bw-mono bw-dim" style="font-size: var(--t-xs)">{{ shortDate(p.created_at) }}</td>
              <td class="bw-mono">{{ p.meter_id }}</td>
              <td class="bw-money" style="text-align:right">{{ naira(p.amount_minor) }}</td>
              <td class="bw-mono" style="text-align:right">{{ kwh(p.units_kwh) }}</td>
              <td><span :class="['bw-badge', statusBadge(p)]">{{ statusLabel(p) }}</span></td>
              <td class="bw-mono" style="font-size: var(--t-xs)">{{ p.token ? p.token.slice(0,12) + '...' : '-' }}</td>
              <td class="action-column bw-align-center" style="text-align:center">
                <WalletRowActions
                  v-if="buildCustomerRowActions(p).length"
                  :items="buildCustomerRowActions(p)"
                  label="Transaction actions"
                  align="center"
                />
                <span v-else class="bw-muted">-</span>
              </td>
            </tr>
            <tr v-if="!filtered().length && !loading">
              <td colspan="7" class="bw-muted" style="text-align:center; padding: var(--s-6)">No transactions.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="bw-t-cards">
        <WalletTableSkeleton v-if="loading && !purchases.length" variant="cards" :rows="4" />
        <div v-for="p in paginatedPurchases" :key="p.id" class="bw-tc">
          <div class="bw-tc-top">
            <div>
              <div class="bw-tc-vendor bw-mono">{{ p.meter_id }}</div>
              <div class="bw-tc-id">{{ shortDate(p.created_at) }}</div>
            </div>
            <div class="bw-tc-amt bw-money">{{ naira(p.amount_minor) }}</div>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Status</span>
              <span :class="['bw-badge', statusBadge(p)]">{{ statusLabel(p) }}</span>
            </div>
            <div class="bw-tc-pair" v-if="p.units_kwh">
              <span class="bw-tc-pair-label">Units</span>
              <span class="bw-tc-pair-val bw-mono">{{ kwh(p.units_kwh) }}</span>
            </div>
            <div class="bw-tc-pair" v-if="p.token">
              <span class="bw-tc-pair-label">Token</span>
              <span class="bw-tc-pair-val bw-mono" style="font-size: var(--t-xs)">{{ p.token.slice(0,16) }}…</span>
            </div>
            <div class="bw-tc-pair" v-if="buildCustomerRowActions(p).length">
              <span class="bw-tc-pair-label">Actions</span>
              <WalletRowActions
                :items="buildCustomerRowActions(p)"
                label="Transaction actions"
                align="right"
              />
            </div>
          </div>
        </div>
        <div v-if="!filtered().length && !loading" class="bw-muted"
             style="text-align:center; padding: var(--s-6); font-size: var(--t-sm)">No transactions.</div>
      </div>

      <!-- Pagination Bar -->
      <WalletTablePagination
        v-model:page="currentPage"
        v-model:pageSize="pageSize"
        :total-items="filtered().length"
        item-label="transactions"
      />
    </div>

    <!-- Toast Notification for Action Feedback -->
    <div v-if="toastNotice" class="bw-toast-bar" :class="toastNotice.tone" style="position: fixed; bottom: 24px; right: 24px; z-index: 1000; padding: 12px 20px; border-radius: 10px; background: var(--surface-1); border: 1px solid var(--brand); color: var(--text); box-shadow: 0 8px 24px rgba(0,0,0,0.4)">
      <span>{{ toastNotice.message }}</span>
    </div>

    <!-- Remote Send Tracker Modal for Customer -->
    <RemoteSendTrackerModal
      v-model:open="remoteTrackerOpen"
      :order-id="selectedRemoteOrder?.id"
      :meter-id="selectedRemoteOrder?.meter_id"
      :token="selectedRemoteOrder?.token"
      :amount-minor="selectedRemoteOrder?.amount_minor"
      :units-kwh="selectedRemoteOrder?.units_kwh"
      :delivery-state="selectedRemoteOrder?.delivery_state"
      :remote-task-id="selectedRemoteOrder?.remote_task_id"
      :api-endpoint="selectedRemoteOrder?.id ? `/api/v1/customer/purchase/${selectedRemoteOrder.id}/remote-send` : null"
      :fetcher="fetchRemoteSendStatus"
      @updated="onRemoteSendUpdated"
      @close="onRemoteSendClose"
    />
  </AppShell>
</template>
