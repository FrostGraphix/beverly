<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import WalletTablePagination from '@beverly/tokens/WalletTablePagination.vue';
import WalletExportMenu from '@beverly/tokens/WalletExportMenu.vue';
import type { WalletExportColumn } from '@beverly/tokens/wallet-export';
import { api, ApiError } from '../lib/api';

interface MeterOrder {
    id: string;
    meter_type: 'single_phase' | 'three_phase';
    property_category?: 'residential' | 'commercial';
    property_address: string;
    service_area: string;
    contact_phone: string;
    amount_minor: number;
    status: string;
    payment_reference: string;
    technician_name: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
    rejection_reason?: string | null;
    rejection_refund_destination?: 'none' | 'vendor_wallet' | 'customer_wallet' | null;
    rejected_at?: string | null;
}

const route = useRoute();
const orders = ref<MeterOrder[]>([]);
const loading = ref(true);
const verifying = ref(false);
const verifyNotice = ref<{ orderId: string; message: string; type: 'success' | 'warning' | 'error' } | null>(null);
const currentPage = ref(1);
const pageSize = ref(10);

const paginatedOrders = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    return orders.value.slice(start, start + pageSize.value);
});

const orderExportColumns: WalletExportColumn<MeterOrder>[] = [
    { key: 'created_at', header: 'Created', value: (order) => fmtDate(order.created_at) },
    { key: 'meter_type', header: 'Meter Type', value: (order) => order.meter_type.replace(/_/g, ' ') },
    { key: 'property_address', header: 'Address', value: (order) => order.property_address },
    { key: 'service_area', header: 'Service Area', value: (order) => order.service_area },
    { key: 'amount_minor', header: 'Amount', value: (order) => (order.amount_minor / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' }) },
    { key: 'status', header: 'Status', value: (order) => STATUS_LABEL[order.status] || order.status },
    { key: 'payment_reference', header: 'Payment Reference', value: (order) => order.payment_reference },
];

const STATUS_LABEL: Record<string, string> = {
    pending_payment: 'Awaiting Payment',
    paid:            'Paid — Pending Assignment',
    assigned:        'Technician Assigned',
    dispatched:      'Technician En Route',
    installed:       'Installed',
    cancelled:       'Cancelled',
    rejected:        'Rejected',
};

const STATUS_BADGE: Record<string, string> = {
    pending_payment: 'neutral',
    paid:            'warn',
    assigned:        'warn',
    dispatched:      'info',
    installed:       'success',
    cancelled:       'danger',
    rejected:        'danger',
};

function fmt(minor: number) { return `₦${(minor / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`; }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }); }

async function load() {
    loading.value = true;
    try {
        const data = await api.get<{ orders: MeterOrder[] }>('/api/v1/customer/meter-orders');
        orders.value = data.orders;
    } catch { /* noop */ } finally {
        loading.value = false;
    }
}

async function verifyPayment(orderId: string) {
    verifying.value = true;
    verifyNotice.value = null;
    try {
        const updated = await api.post<MeterOrder>(`/api/v1/customer/meter-orders/${orderId}/verify-payment`);
        const idx = orders.value.findIndex(o => o.id === orderId);
        if (idx >= 0) orders.value[idx] = updated;

        if (['paid', 'assigned', 'dispatched', 'installed'].includes(updated.status)) {
            verifyNotice.value = {
                orderId,
                type: 'success',
                message: 'Payment confirmed! Beverly will contact you within 2 business days to schedule installation.',
            };
        } else {
            verifyNotice.value = {
                orderId,
                type: 'warning',
                message: 'Payment has not been completed on Paystack yet. Order remains awaiting payment.',
            };
        }
    } catch (e: any) {
        verifyNotice.value = {
            orderId,
            type: 'error',
            message: e instanceof ApiError ? e.message : 'Could not verify payment status.',
        };
    } finally {
        verifying.value = false;
    }
}

onMounted(async () => {
    await load();
    // If returning from Paystack with ?ref=..., verify the matching order
    const ref = route.query.ref as string | undefined;
    if (ref) {
        const match = orders.value.find(o => o.payment_reference === ref && o.status === 'pending_payment');
        if (match) await verifyPayment(match.id);
    }
});
</script>

<template>
  <AppShell>
    <div class="bw-page-header">
      <div>
        <p class="bw-page-title">Meter Orders</p>
        <p class="bw-page-sub">Track your meter installation requests</p>
      </div>
      <div class="bw-row" style="gap: var(--s-2)">
        <WalletExportMenu
          :rows="orders"
          :columns="orderExportColumns"
          filename="beverly-customer-meter-orders"
          title="Customer Meter Orders"
          subtitle="Meter installation requests"
          :loading="loading"
          :formats="['pdf']"
        />
        <RouterLink to="/buy-meter" class="bw-btn small primary" style="text-decoration:none">+ New order</RouterLink>
      </div>
    </div>

    <!-- Notice banner after payment verification -->
    <div v-if="verifyNotice" :class="['bw-notice-banner', verifyNotice.type]">
      <svg v-if="verifyNotice.type === 'success'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>{{ verifyNotice.message }}</span>
    </div>

    <div v-if="loading" class="bw-spinner-wrap">
      <div class="bw-spinner"></div>
    </div>

    <div v-else-if="orders.length === 0" class="bw-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
      <p>No meter orders yet</p>
      <RouterLink to="/buy-meter" class="bw-btn small primary" style="text-decoration:none">Order a meter</RouterLink>
    </div>

    <div v-else class="bw-stack" style="gap: var(--s-3)">
      <div v-for="order in paginatedOrders" :key="order.id" class="bw-card">
        <div class="bw-order-head">
          <div>
            <strong>{{ order.meter_type === 'three_phase' ? 'Three Phase' : 'Single Phase' }} Meter</strong>
            <p class="bw-muted" style="font-size:var(--t-sm); margin:2px 0 0">{{ fmtDate(order.created_at) }}</p>
          </div>
          <span :class="['bw-badge', STATUS_BADGE[order.status] ?? 'neutral']">
            {{ STATUS_LABEL[order.status] ?? order.status }}
          </span>
        </div>

        <div class="bw-order-details">
          <div class="bw-detail-row">
            <span class="bw-muted">Property category</span>
            <span style="font-weight:600">{{ order.property_category === 'commercial' ? 'Commercial' : 'Residential' }}</span>
          </div>
          <div class="bw-detail-row">
            <span class="bw-muted">Address</span>
            <span>{{ order.property_address }}</span>
          </div>
          <div class="bw-detail-row">
            <span class="bw-muted">Area</span>
            <span>{{ order.service_area }}</span>
          </div>
          <div class="bw-detail-row">
            <span class="bw-muted">Amount</span>
            <span style="font-weight:600; color:var(--brand)">{{ fmt(order.amount_minor) }}</span>
          </div>
          <div v-if="order.technician_name" class="bw-detail-row">
            <span class="bw-muted">Technician</span>
            <span>{{ order.technician_name }}</span>
          </div>
          <div v-if="order.notes" class="bw-detail-row">
            <span class="bw-muted">Notes</span>
            <span>{{ order.notes }}</span>
          </div>
        </div>

        <div v-if="order.status === 'rejected'" class="rejection-recovery" role="status">
          <strong>Rejection reason</strong>
          <p>{{ order.rejection_reason || 'No reason was recorded. Contact support for details.' }}</p>
          <p class="rejection-refund">{{ order.rejection_refund_destination === 'customer_wallet' ? 'The amount was credited to your Beverly wallet.' : order.rejection_refund_destination === 'vendor_wallet' ? 'The sponsoring vendor wallet was refunded.' : 'No payment was captured for this order.' }}</p>
          <div class="rejection-actions">
            <RouterLink to="/buy-meter" class="bw-btn small primary" style="text-decoration:none">Correct and order again</RouterLink>
            <RouterLink to="/help" class="bw-btn small" style="text-decoration:none">Contact support</RouterLink>
          </div>
        </div>

        <button
          v-if="order.status === 'pending_payment'"
          class="bw-btn small primary"
          style="width:100%; margin-top:var(--s-3)"
          :disabled="verifying"
          @click="verifyPayment(order.id)"
        >
          {{ verifying ? 'Verifying…' : 'Check payment status' }}
        </button>
      </div>

      <WalletTablePagination
        v-model:page="currentPage"
        v-model:pageSize="pageSize"
        :total-items="orders.length"
        item-label="orders"
      />
    </div>
  </AppShell>
</template>

<style scoped>
.bw-page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: var(--s-4); }
.bw-notice-banner {
  display: flex; align-items: center; gap: var(--s-2);
  padding: var(--s-3) var(--s-4);
  border-radius: var(--r-md);
  margin-bottom: var(--s-4);
  font-size: var(--t-sm);
  font-weight: 500;
}
.bw-notice-banner.success {
  background: color-mix(in srgb, var(--brand) 15%, transparent);
  color: var(--brand);
  border: 1px solid color-mix(in srgb, var(--brand) 30%, transparent);
}
.bw-notice-banner.warning {
  background: color-mix(in srgb, oklch(75% 0.18 70) 15%, transparent);
  color: oklch(75% 0.18 70);
  border: 1px solid color-mix(in srgb, oklch(75% 0.18 70) 30%, transparent);
}
.bw-notice-banner.error {
  background: color-mix(in srgb, oklch(60% 0.22 25) 15%, transparent);
  color: oklch(60% 0.22 25);
  border: 1px solid color-mix(in srgb, oklch(60% 0.22 25) 30%, transparent);
}
.bw-spinner-wrap { display: grid; place-items: center; padding: var(--s-10); }
.bw-spinner { width: 28px; height: 28px; border: 2.5px solid var(--border); border-top-color: var(--brand); border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.bw-empty { display: flex; flex-direction: column; align-items: center; gap: var(--s-4); text-align: center; padding: var(--s-10) 0; color: var(--fg-2); }
.bw-order-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--s-3); margin-bottom: var(--s-3); }
.bw-order-details { display: flex; flex-direction: column; gap: var(--s-1); }
.bw-detail-row { display: flex; justify-content: space-between; gap: var(--s-3); font-size: var(--t-sm); }
.bw-detail-row span:last-child { text-align: right; }
.rejection-recovery { display:grid; gap:6px; margin-top:var(--s-3); padding:var(--s-3); border:1px solid color-mix(in srgb, var(--danger) 30%, var(--border)); border-radius:var(--r-md); background:color-mix(in srgb, var(--danger) 8%, var(--surface)); }
.rejection-recovery strong { color:var(--danger); }
.rejection-recovery p { margin:0; font-size:var(--t-sm); line-height:1.45; }
.rejection-refund { color:var(--text-2); }
.rejection-actions { display:flex; flex-wrap:wrap; gap:var(--s-2); margin-top:var(--s-2); }
</style>
