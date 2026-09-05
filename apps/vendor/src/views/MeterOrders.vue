<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import WalletDataViewSwitch from '@beverly/tokens/WalletDataViewSwitch.vue';
import WalletTableSkeleton from '@beverly/tokens/WalletTableSkeleton.vue';
import WalletRowActions from '@beverly/tokens/WalletRowActions.vue';
import type { ActionItem } from '@beverly/tokens/WalletRowActions.vue';
import WalletExportMenu from '@beverly/tokens/WalletExportMenu.vue';
import type { WalletExportColumn } from '@beverly/tokens/wallet-export';
import { api, ApiError } from '../lib/api';

interface MeterOrder {
    id: string;
    customer_name_snapshot: string | null;
    meter_type: 'single_phase' | 'three_phase';
    property_address: string;
    service_area: string;
    contact_phone: string;
    amount_minor: number;
    status: string;
    created_at: string;
    technician_name: string | null;
    sponsor_mode?: 'manual_paid' | 'vendor_wallet';
    cancellation_eligible?: boolean;
    cancellation_deadline?: string;
    rejection_reason?: string | null;
    rejection_refund_destination?: 'none' | 'vendor_wallet' | 'customer_wallet' | null;
    rejected_at?: string | null;
}

const orders = ref<MeterOrder[]>([]);
const loading = ref(true);
const error = ref('');
const cancelling = ref(false);
const cancelOrder = ref<MeterOrder | null>(null);
const cancellationReason = ref('');
const viewMode = ref<'list' | 'table'>(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'list' : 'table',
);

const stats = computed(() => {
    const count = (status: string) => orders.value.filter((order) => order.status === status).length;
    return {
        total: orders.value.length,
        pending: count('pending_payment'),
        inProgress: ['paid', 'assigned', 'dispatched'].reduce((total, status) => total + count(status), 0),
        installed: count('installed'),
        cancelled: count('cancelled'),
        rejected: count('rejected'),
    };
});

function amount(minor: number) {
    return `NGN ${(minor / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateLabel(iso: string) {
    return new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const orderExportColumns: WalletExportColumn<MeterOrder>[] = [
    { key: 'created_at', header: 'Created', value: (order) => dateLabel(order.created_at) },
    { key: 'customer_name_snapshot', header: 'Customer', value: (order) => order.customer_name_snapshot || '' },
    { key: 'meter_type', header: 'Meter Type', value: (order) => order.meter_type.replace(/_/g, ' ') },
    { key: 'property_address', header: 'Address', value: (order) => order.property_address },
    { key: 'service_area', header: 'Service Area', value: (order) => order.service_area },
    { key: 'amount_minor', header: 'Amount', value: (order) => amount(order.amount_minor) },
    { key: 'status', header: 'Status', value: (order) => order.status.replace(/_/g, ' ') },
];

async function load() {
    loading.value = true;
    error.value = '';
    try {
        const response = await api.get<{ orders: MeterOrder[] }>('/api/v1/vendor/meter-orders');
        orders.value = response.orders ?? [];
    } catch (err: any) {
        error.value = err instanceof ApiError ? err.message : 'Could not load meter orders.';
    } finally {
        loading.value = false;
    }
}

function actions(order: MeterOrder): ActionItem[] {
    if (!order.cancellation_eligible) return [];
    return [{ label: 'Cancel order', icon: 'delete', tone: 'danger', action: () => {
        cancellationReason.value = '';
        cancelOrder.value = order;
    } }];
}

async function confirmCancellation() {
    if (!cancelOrder.value || cancellationReason.value.trim().length < 5) return;
    cancelling.value = true;
    error.value = '';
    try {
        await api.post(`/api/v1/vendor/meter-orders/${cancelOrder.value.id}/cancel`, { reason: cancellationReason.value.trim() });
        cancelOrder.value = null;
        await load();
    } catch (err: any) {
        error.value = err instanceof ApiError ? err.message : 'Could not cancel meter order.';
    } finally { cancelling.value = false; }
}

onMounted(load);
</script>

<template>
  <AppShell title="Meter Orders">
    <div class="bw-stack" style="gap: var(--s-4)">
      <div class="bw-page-actions">
        <RouterLink to="/meter-orders/new" class="bw-btn primary" style="text-decoration:none">New Order</RouterLink>
      </div>

      <div class="mo-kpi-row bw-mobile-kpi-grid" aria-label="Meter order summary">
        <div class="mo-kpi">
          <span class="mo-kpi-label">Total orders</span>
          <span class="mo-kpi-value">{{ loading ? '—' : stats.total }}</span>
        </div>
        <div class="mo-kpi warn">
          <span class="mo-kpi-label">Pending payment</span>
          <span class="mo-kpi-value">{{ loading ? '—' : stats.pending }}</span>
        </div>
        <div class="mo-kpi info">
          <span class="mo-kpi-label">In progress</span>
          <span class="mo-kpi-value">{{ loading ? '—' : stats.inProgress }}</span>
        </div>
        <div class="mo-kpi success">
          <span class="mo-kpi-label">Installed</span>
          <span class="mo-kpi-value">{{ loading ? '—' : stats.installed }}</span>
        </div>
        <div class="mo-kpi danger">
          <span class="mo-kpi-label">Cancelled</span>
          <span class="mo-kpi-value">{{ loading ? '—' : stats.cancelled }}</span>
        </div>
        <div class="mo-kpi danger">
          <span class="mo-kpi-label">Rejected</span>
          <span class="mo-kpi-value">{{ loading ? '—' : stats.rejected }}</span>
        </div>
      </div>

      <div v-if="error" class="bw-card">
        <p class="bw-error">{{ error }}</p>
      </div>

      <div class="bw-card flush bw-data-region" :data-view="viewMode">
        <div class="bw-table-head-bar">
          <div class="bw-table-heading">
            <div class="bw-table-title-row">
              <div class="bw-card-title">Recent orders</div>
              <span v-if="loading" class="bw-skeleton bw-table-count" aria-hidden="true"></span>
              <span v-else class="bw-table-count">{{ orders.length }}</span>
            </div>
            <div class="bw-card-sub">Meter inventory purchasing and tracking orders</div>
          </div>
          <div class="bw-table-actions">
            <WalletExportMenu
              :rows="orders"
              :columns="orderExportColumns"
              filename="beverly-vendor-meter-orders"
              title="Vendor Meter Orders"
              subtitle="Customer meter installation requests"
              :loading="loading"
              :formats="['pdf']"
            />
            <button class="bw-btn sm" :disabled="loading" @click="load">{{ loading ? 'Loading…' : 'Refresh' }}</button>
            <WalletDataViewSwitch v-model="viewMode" label="Meter order display view" />
          </div>
        </div>

        <div class="bw-t-wrap">
          <table class="bw-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Type</th>
                <th>Address</th>
                <th>Area</th>
                <th>Status</th>
                <th style="text-align:right">Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <WalletTableSkeleton v-if="loading" :columns="7" />
              <tr v-else-if="!orders.length">
                <td colspan="7" class="bw-muted" style="text-align:center; padding: var(--s-6)">No vendor meter orders yet.</td>
              </tr>
              <tr v-for="order in orders" :key="order.id">
                <td>
                  <div>{{ order.customer_name_snapshot || 'Customer' }}</div>
                  <div class="bw-muted" style="font-size: var(--t-xs)">{{ order.contact_phone }}</div>
                </td>
                <td>{{ order.meter_type === 'three_phase' ? 'Three Phase' : 'Single Phase' }}</td>
                <td>{{ order.property_address }}</td>
                <td>{{ order.service_area }}</td>
                <td>
                  <span class="bw-badge neutral">{{ order.status.replace(/_/g, ' ') }}</span>
                  <div v-if="order.technician_name" class="bw-muted" style="font-size: var(--t-xs); margin-top: 4px">{{ order.technician_name }}</div>
                  <div v-if="order.status === 'rejected'" class="order-rejection-note"><strong>Rejection reason</strong><span>{{ order.rejection_reason || 'No reason recorded.' }}</span></div>
                </td>
                <td style="text-align:right">
                  <div>{{ amount(order.amount_minor) }}</div>
                  <div class="bw-muted" style="font-size: var(--t-xs)">{{ order.sponsor_mode === 'vendor_wallet' ? 'Vendor wallet' : 'Manual paid' }}</div>
                  <div class="bw-muted" style="font-size: var(--t-xs)">{{ dateLabel(order.created_at) }}</div>
                </td>
                <td><WalletRowActions v-if="actions(order).length" :items="actions(order)" :label="`Actions for ${order.customer_name_snapshot || 'meter order'}`" /></td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile cards -->
        <div class="bw-t-cards">
          <WalletTableSkeleton v-if="loading" variant="cards" />
          <div v-for="order in orders" :key="`order-card-${order.id}`" class="bw-tc">
            <div class="bw-tc-top">
              <div>
                <div class="bw-tc-vendor">{{ order.customer_name_snapshot || 'Customer' }}</div>
                <div class="bw-tc-id">{{ order.contact_phone }}</div>
              </div>
              <div class="bw-tc-amt bw-money">{{ amount(order.amount_minor) }}</div>
            </div>
            <div class="bw-tc-mid">
              <div class="bw-tc-pair">
                <span class="bw-tc-pair-label">Type</span>
                <span class="bw-tc-pair-val">{{ order.meter_type === 'three_phase' ? 'Three Phase' : 'Single Phase' }}</span>
              </div>
              <div class="bw-tc-pair">
                <span class="bw-tc-pair-label">Status</span>
                <span class="bw-badge neutral">{{ order.status.replace(/_/g, ' ') }}</span>
              </div>
              <div class="bw-tc-pair">
                <span class="bw-tc-pair-label">Address</span>
                <span class="bw-tc-pair-val">{{ order.property_address }} ({{ order.service_area }})</span>
              </div>
              <div class="bw-tc-pair">
                <span class="bw-tc-pair-label">Sponsor & Date</span>
                <span class="bw-tc-pair-val bw-muted">{{ order.sponsor_mode === 'vendor_wallet' ? 'Vendor wallet' : 'Manual paid' }} · {{ dateLabel(order.created_at) }}</span>
              </div>
            </div>
            <div v-if="order.cancellation_eligible" class="order-card-action">
              <span class="bw-muted">Cancel before {{ dateLabel(order.cancellation_deadline || order.created_at) }}</span>
              <WalletRowActions :items="actions(order)" :label="`Actions for ${order.customer_name_snapshot || 'meter order'}`" align="right" />
            </div>
            <div v-if="order.status === 'rejected'" class="order-rejection-card" role="status">
              <strong>Rejection reason</strong>
              <span>{{ order.rejection_reason || 'No reason recorded.' }}</span>
              <span>{{ order.rejection_refund_destination === 'vendor_wallet' ? 'Your vendor wallet was refunded.' : order.rejection_refund_destination === 'customer_wallet' ? 'The customer wallet was credited.' : 'No payment was captured.' }}</span>
            </div>
          </div>
          <div v-if="!orders.length && !loading" class="bw-muted" style="text-align:center; padding: var(--s-6)">No vendor meter orders yet.</div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="cancelOrder" class="bw-modal-backdrop order-cancel-backdrop" @click.self="cancelOrder = null">
        <section class="bw-modal order-cancel" role="dialog" aria-modal="true" aria-labelledby="cancel-order-title">
          <div class="bw-modal-header">
            <div><p class="bw-label cancel-kicker">Refund confirmation</p><h2 id="cancel-order-title">Cancel meter order?</h2></div>
            <button type="button" class="bw-btn ghost sm" @click="cancelOrder = null">Close</button>
          </div>
          <div class="bw-modal-body cancel-body">
            <div class="cancel-summary"><strong>{{ cancelOrder.customer_name_snapshot || 'Customer' }}</strong><span>{{ amount(cancelOrder.amount_minor) }}</span></div>
            <p class="bw-muted">The wallet debit returns automatically. This action cannot be undone.</p>
            <div class="bw-field">
              <label class="bw-label" for="meter-order-cancel-reason">Cancellation reason</label>
              <textarea id="meter-order-cancel-reason" v-model="cancellationReason" class="bw-textarea" rows="3" maxlength="500" placeholder="Explain why this order changed"></textarea>
              <span class="bw-muted">Minimum five characters.</span>
            </div>
          </div>
          <div class="bw-modal-footer">
            <button type="button" class="bw-btn ghost" :disabled="cancelling" @click="cancelOrder = null">Keep order</button>
            <button type="button" class="bw-btn danger" :disabled="cancelling || cancellationReason.trim().length < 5" @click="confirmCancellation">{{ cancelling ? 'Cancelling…' : 'Cancel and refund' }}</button>
          </div>
        </section>
      </div>
    </Teleport>
  </AppShell>
</template>

<style scoped>
.mo-kpi-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--s-3);
}

.mo-kpi {
  min-height: 96px;
  padding: var(--s-3) var(--s-4);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--s-2);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--r-md);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
}

.mo-kpi-label {
  color: var(--text-muted);
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.mo-kpi-value {
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--t-xl);
  font-weight: 700;
}

.mo-kpi.warn .mo-kpi-value { color: var(--warn, #d97706); }
.mo-kpi.info .mo-kpi-value { color: var(--info, #0ea5e9); }
.mo-kpi.success .mo-kpi-value { color: var(--brand); }
.mo-kpi.danger .mo-kpi-value { color: var(--danger); }
.order-card-action { display:flex; align-items:center; justify-content:space-between; gap:var(--s-2); padding-top:var(--s-2); border-top:1px dashed var(--border); }
.order-cancel-backdrop { z-index:100000; }
.order-cancel { width:min(520px, calc(100vw - 24px)); }
.cancel-kicker { color:var(--danger); margin:0 0 4px; }
.cancel-body { display:grid; gap:var(--s-3); }
.cancel-summary { display:flex; justify-content:space-between; gap:var(--s-3); padding:var(--s-4); border:1px solid var(--border); border-radius:var(--r-lg); background:var(--surface-1); }
.cancel-summary span { color:var(--brand); font-family:var(--font-mono); font-weight:800; }
.order-rejection-note { display:grid; gap:3px; max-width:220px; margin-top:6px; color:var(--danger); font-size:var(--t-xs); }
.order-rejection-card { display:grid; gap:4px; margin-top:var(--s-2); padding:var(--s-3); border:1px solid color-mix(in srgb, var(--danger) 30%, var(--border)); border-radius:var(--r-md); background:color-mix(in srgb, var(--danger) 8%, var(--surface)); font-size:var(--t-xs); }
.order-rejection-card strong { color:var(--danger); }

@media (max-width: 900px) {
  .mo-kpi-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 560px) {
  .mo-kpi-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mo-kpi { min-height: 88px; padding: var(--s-3); }
}
</style>
