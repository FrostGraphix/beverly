<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import WalletDataViewSwitch from '@beverly/tokens/WalletDataViewSwitch.vue';
import WalletTableSkeleton from '@beverly/tokens/WalletTableSkeleton.vue';
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
}

const orders = ref<MeterOrder[]>([]);
const loading = ref(true);
const error = ref('');
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
    };
});

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
              </tr>
            </thead>
            <tbody>
              <WalletTableSkeleton v-if="loading" :columns="6" />
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
                  <div class="bw-muted" style="font-size: var(--t-xs)">{{ order.sponsor_mode === 'vendor_wallet' ? 'Vendor wallet' : 'Manual paid' }}</div>
                  <div class="bw-muted" style="font-size: var(--t-xs)">{{ dateLabel(order.created_at) }}</div>
                </td>
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
          </div>
          <div v-if="!orders.length && !loading" class="bw-muted" style="text-align:center; padding: var(--s-6)">No vendor meter orders yet.</div>
        </div>
      </div>
    </div>
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

@media (max-width: 900px) {
  .mo-kpi-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 560px) {
  .mo-kpi-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mo-kpi { min-height: 88px; padding: var(--s-3); }
}
</style>
