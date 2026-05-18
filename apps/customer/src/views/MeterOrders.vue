<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';

const route = useRoute();

interface MeterOrder {
    id: string;
    meter_type: 'single_phase' | 'three_phase';
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
}

const orders = ref<MeterOrder[]>([]);
const loading = ref(true);
const verifying = ref(false);
const verifiedRef = ref('');

const STATUS_LABEL: Record<string, string> = {
    pending_payment: 'Awaiting Payment',
    paid:            'Paid — Pending Assignment',
    assigned:        'Technician Assigned',
    dispatched:      'Technician En Route',
    installed:       'Installed',
    cancelled:       'Cancelled',
};

const STATUS_COLOR: Record<string, string> = {
    pending_payment: 'var(--fg-2)',
    paid:            'oklch(75% 0.18 85)',
    assigned:        'oklch(75% 0.18 85)',
    dispatched:      'oklch(70% 0.19 145)',
    installed:       'var(--brand)',
    cancelled:       'oklch(60% 0.22 25)',
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
    try {
        const updated = await api.post<MeterOrder>(`/api/v1/customer/meter-orders/${orderId}/verify-payment`);
        const idx = orders.value.findIndex(o => o.id === orderId);
        if (idx >= 0) orders.value[idx] = updated;
        verifiedRef.value = orderId;
    } catch { /* noop */ } finally {
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
      <RouterLink to="/buy-meter" class="bw-btn small primary" style="text-decoration:none">+ New order</RouterLink>
    </div>

    <!-- Success banner after payment -->
    <div v-if="verifiedRef" class="bw-success-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      Payment confirmed! Beverly will contact you within 2 business days to schedule installation.
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
      <div v-for="order in orders" :key="order.id" class="bw-card">
        <div class="bw-order-head">
          <div>
            <strong>{{ order.meter_type === 'three_phase' ? 'Three Phase' : 'Single Phase' }} Meter</strong>
            <p class="bw-muted" style="font-size:var(--t-sm); margin:2px 0 0">{{ fmtDate(order.created_at) }}</p>
          </div>
          <span class="bw-status-badge" :style="`color:${STATUS_COLOR[order.status]}`">
            {{ STATUS_LABEL[order.status] ?? order.status }}
          </span>
        </div>

        <div class="bw-order-details">
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
            <span style="font-weight:600">{{ fmt(order.amount_minor) }}</span>
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
    </div>
  </AppShell>
</template>

<style scoped>
.bw-page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: var(--s-4); }
.bw-success-banner {
  display: flex; align-items: center; gap: var(--s-2);
  padding: var(--s-3) var(--s-4);
  background: oklch(70% 0.19 145 / 0.12);
  border: 1px solid oklch(70% 0.19 145 / 0.25);
  border-radius: var(--r-md);
  margin-bottom: var(--s-4);
  font-size: var(--t-sm);
  color: var(--brand);
}
.bw-spinner-wrap { display: grid; place-items: center; padding: var(--s-10); }
.bw-spinner { width: 28px; height: 28px; border: 2.5px solid var(--border); border-top-color: var(--brand); border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.bw-empty { display: flex; flex-direction: column; align-items: center; gap: var(--s-4); text-align: center; padding: var(--s-10) 0; color: var(--fg-2); }
.bw-order-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--s-3); margin-bottom: var(--s-3); }
.bw-status-badge { font-size: var(--t-xs, 0.7rem); font-weight: 600; white-space: nowrap; }
.bw-order-details { display: flex; flex-direction: column; gap: var(--s-1); }
.bw-detail-row { display: flex; justify-content: space-between; gap: var(--s-3); font-size: var(--t-sm); }
.bw-detail-row span:last-child { text-align: right; }
</style>
