<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, ApiError } from '../lib/api';

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
    customers?: { users?: { full_name?: string; email?: string; phone?: string } };
}

const orders = ref<MeterOrder[]>([]);
const loading = ref(true);
const filterStatus = ref('');
const search = ref('');

const STATUS_OPTS = [
    { value: '',               label: 'All statuses' },
    { value: 'pending_payment',label: 'Pending Payment' },
    { value: 'paid',           label: 'Paid' },
    { value: 'assigned',       label: 'Assigned' },
    { value: 'dispatched',     label: 'Dispatched' },
    { value: 'installed',      label: 'Installed' },
    { value: 'cancelled',      label: 'Cancelled' },
];

const STATUS_NEXT: Record<string, string> = {
    paid:       'assigned',
    assigned:   'dispatched',
    dispatched: 'installed',
};

const STATUS_BADGE: Record<string, string> = {
    pending_payment: 'bw-badge gray',
    paid:            'bw-badge yellow',
    assigned:        'bw-badge yellow',
    dispatched:      'bw-badge blue',
    installed:       'bw-badge green',
    cancelled:       'bw-badge red',
};

const STATUS_LABEL: Record<string, string> = {
    pending_payment: 'Awaiting Payment',
    paid:            'Paid',
    assigned:        'Assigned',
    dispatched:      'Dispatched',
    installed:       'Installed',
    cancelled:       'Cancelled',
};

function fmt(minor: number) { return `₦${(minor / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`; }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }

async function load() {
    loading.value = true;
    const params = new URLSearchParams();
    if (filterStatus.value) params.set('status', filterStatus.value);
    if (search.value)       params.set('q', search.value);
    try {
        const data = await api.get<{ orders: MeterOrder[] }>(`/api/v1/admin/meter-orders?${params}`);
        orders.value = data.orders;
    } catch { /* noop */ } finally {
        loading.value = false;
    }
}

// Update modal state
const updating = ref(false);
const updateError = ref('');
const activeOrder = ref<MeterOrder | null>(null);
const updateForm = ref({ status: '', technician_name: '', notes: '' });

function openUpdate(order: MeterOrder, nextStatus?: string) {
    activeOrder.value = order;
    updateForm.value = {
        status: nextStatus ?? STATUS_NEXT[order.status] ?? order.status,
        technician_name: order.technician_name ?? '',
        notes: '',
    };
    updateError.value = '';
}

async function submitUpdate() {
    if (!activeOrder.value) return;
    updating.value = true;
    updateError.value = '';
    try {
        const body: Record<string, string> = { status: updateForm.value.status };
        if (updateForm.value.technician_name) body.technician_name = updateForm.value.technician_name;
        if (updateForm.value.notes) body.notes = updateForm.value.notes;

        const updated = await api.patch<MeterOrder>(`/api/v1/admin/meter-orders/${activeOrder.value.id}`, body);
        const idx = orders.value.findIndex(o => o.id === activeOrder.value!.id);
        if (idx >= 0) orders.value[idx] = updated;
        activeOrder.value = null;
    } catch (e: any) {
        updateError.value = e instanceof ApiError ? e.message : 'Update failed';
    } finally {
        updating.value = false;
    }
}

onMounted(load);
</script>

<template>
  <AppShell title="Meter Orders">
    <template #topbar-end>
      <button class="bw-icon-btn" @click="load" title="Refresh">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
      </button>
    </template>

    <!-- Filters -->
    <div class="bw-toolbar">
      <input v-model="search" class="bw-input sm" placeholder="Search address or area…" style="max-width:260px" @keyup.enter="load" />
      <select v-model="filterStatus" class="bw-select sm" @change="load">
        <option v-for="o in STATUS_OPTS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <button class="bw-btn sm" @click="load">Search</button>
    </div>

    <!-- Table -->
    <div class="bw-table-wrap">
      <table class="bw-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Type</th>
            <th>Address</th>
            <th>Area</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Created</th>
            <th>Technician</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="9" style="text-align:center; padding:var(--s-8); color:var(--fg-2)">Loading…</td>
          </tr>
          <tr v-else-if="orders.length === 0">
            <td colspan="9" style="text-align:center; padding:var(--s-8); color:var(--fg-2)">No orders found</td>
          </tr>
          <tr v-for="order in orders" :key="order.id">
            <td>
              <div style="font-weight:600; font-size:var(--t-sm)">{{ order.customers?.users?.full_name ?? '—' }}</div>
              <div style="font-size:var(--t-xs, 0.7rem); color:var(--fg-2)">{{ order.customers?.users?.phone ?? order.contact_phone }}</div>
            </td>
            <td>{{ order.meter_type === 'three_phase' ? '3-Phase' : '1-Phase' }}</td>
            <td style="max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">{{ order.property_address }}</td>
            <td>{{ order.service_area }}</td>
            <td style="font-weight:600">{{ fmt(order.amount_minor) }}</td>
            <td><span :class="STATUS_BADGE[order.status] ?? 'bw-badge gray'">{{ STATUS_LABEL[order.status] ?? order.status }}</span></td>
            <td style="white-space:nowrap; font-size:var(--t-xs, 0.7rem); color:var(--fg-2)">{{ fmtDate(order.created_at) }}</td>
            <td style="font-size:var(--t-sm)">{{ order.technician_name ?? '—' }}</td>
            <td>
              <button
                v-if="STATUS_NEXT[order.status]"
                class="bw-btn sm primary"
                @click="openUpdate(order, STATUS_NEXT[order.status])"
              >
                Mark {{ STATUS_NEXT[order.status] }}
              </button>
              <button
                v-else-if="order.status === 'paid'"
                class="bw-btn sm"
                @click="openUpdate(order, 'assigned')"
              >
                Assign
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Update modal -->
    <div v-if="activeOrder" class="bw-modal-backdrop" @click.self="activeOrder = null">
      <div class="bw-modal">
        <div class="bw-modal-head">
          <strong>Update Order</strong>
          <button class="bw-icon-btn" @click="activeOrder = null">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="bw-field">
          <label class="bw-label">Status</label>
          <select v-model="updateForm.status" class="bw-select">
            <option value="paid">Paid</option>
            <option value="assigned">Assigned</option>
            <option value="dispatched">Dispatched</option>
            <option value="installed">Installed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div class="bw-field">
          <label class="bw-label">Technician name</label>
          <input v-model="updateForm.technician_name" class="bw-input" placeholder="e.g. Emeka Obi" />
        </div>

        <div class="bw-field">
          <label class="bw-label">Notes</label>
          <textarea v-model="updateForm.notes" class="bw-input" rows="2" placeholder="Optional notes…" style="resize:vertical" />
        </div>

        <p v-if="updateError" style="color:oklch(60% 0.22 25); font-size:var(--t-sm)">{{ updateError }}</p>

        <div class="bw-modal-foot">
          <button class="bw-btn" @click="activeOrder = null">Cancel</button>
          <button class="bw-btn primary" @click="submitUpdate" :disabled="updating">
            {{ updating ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.bw-toolbar { display: flex; gap: var(--s-3); flex-wrap: wrap; align-items: center; margin-bottom: var(--s-4); }
.bw-modal-backdrop {
  position: fixed; inset: 0; background: oklch(0% 0 0 / 0.5); display: grid; place-items: center; z-index: 200;
}
.bw-modal {
  background: var(--surface-0); border: 1px solid var(--border); border-radius: var(--r-xl);
  padding: var(--s-6); width: min(480px, 90vw); display: flex; flex-direction: column; gap: var(--s-4);
}
.bw-modal-head { display: flex; align-items: center; justify-content: space-between; }
.bw-modal-foot { display: flex; gap: var(--s-3); justify-content: flex-end; }
</style>
