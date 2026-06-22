<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
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
}

const orders = ref<MeterOrder[]>([]);
const loading = ref(true);
const error = ref('');

function amount(minor: number) {
    return `NGN ${(minor / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateLabel(iso: string) {
    return new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

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

onMounted(load);
</script>

<template>
  <AppShell title="Meter Orders">
    <template #topbar-end>
      <RouterLink to="/meter-orders/new" class="bw-btn primary" style="text-decoration:none">New Order</RouterLink>
    </template>

    <div class="bw-stack" style="gap: var(--s-4)">
      <div class="bw-card">
        <div class="bw-page-title">Vendor meter orders</div>
        <p class="bw-page-sub">Orders you placed for wallet customers.</p>
      </div>

      <div v-if="error" class="bw-card">
        <p class="bw-error">{{ error }}</p>
      </div>

      <div class="bw-card flush">
        <div class="bw-table-head-bar">
          <div>
            <div class="bw-card-title">Recent orders</div>
            <div class="bw-card-sub">{{ loading ? 'Loading…' : `${orders.length} orders` }}</div>
          </div>
          <button class="bw-btn sm" :disabled="loading" @click="load">{{ loading ? 'Loading…' : 'Refresh' }}</button>
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
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="6" class="bw-muted" style="text-align:center; padding: var(--s-6)">Loading…</td>
              </tr>
              <tr v-else-if="!orders.length">
                <td colspan="6" class="bw-muted" style="text-align:center; padding: var(--s-6)">No vendor meter orders yet.</td>
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
                </td>
                <td style="text-align:right">
                  <div>{{ amount(order.amount_minor) }}</div>
                  <div class="bw-muted" style="font-size: var(--t-xs)">{{ dateLabel(order.created_at) }}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </AppShell>
</template>
