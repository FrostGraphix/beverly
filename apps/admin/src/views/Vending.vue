<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, naira, shortDate } from '../lib/api';

interface Purchase {
    id: string;
    actor_id: string;
    customer_name: string | null;
    meter_id: string;
    station_id: string | null;
    amount_minor: number;
    units_kwh: number | null;
    purchase_mode: string;
    status: string;
    delivery_state: string | null;
    created_at: string;
    failure_reason: string | null;
}

const items = ref<Purchase[]>([]);
const status = ref('');
const station = ref('');
const q = ref('');
const loading = ref(false);

async function load() {
    loading.value = true;
    try {
        const params = new URLSearchParams();
        if (status.value) params.set('status', status.value);
        if (station.value) params.set('station', station.value);
        if (q.value) params.set('q', q.value);
        const r = await api.get<{ purchases: Purchase[] }>(`/api/v1/admin/vending${params.toString() ? '?' + params : ''}`);
        items.value = r.purchases;
    } finally { loading.value = false; }
}

function statusBadge(s: string) {
    if (s === 'delivered') return 'success';
    if (s === 'failed') return 'danger';
    if (s === 'dispatching' || s === 'hold_active') return 'info';
    if (s === 'delivery_pending_review' || s === 'reversed') return 'warn';
    return 'neutral';
}

onMounted(load);
</script>

<template>
  <AppShell title="Vending Monitor">
    <div class="bw-card" style="padding: 0">
      <div class="bw-table-head-bar">
        <h2 class="bw-h2" style="margin: 0">
          Live vending
          <span class="bw-live-tag" style="margin-left: var(--s-2)">
            <span class="bw-live-dot" />LIVE
          </span>
        </h2>
        <span class="bw-spacer"></span>
        <input class="bw-input bw-mono" v-model="q" placeholder="Meter…" style="width: 180px" @keyup.enter="load" />
        <select class="bw-select" v-model="status" @change="load" style="width: 160px">
          <option value="">All status</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Failed</option>
          <option value="dispatching">Dispatching</option>
          <option value="hold_active">Hold active</option>
          <option value="reversed">Reversed</option>
        </select>
        <select class="bw-select" v-model="station" @change="load" style="width: 140px">
          <option value="">All stations</option>
          <option>TUNGA</option><option>UMAISHA</option><option>OGUFA</option><option>KYAKALE</option><option>MUSHA</option>
        </select>
        <button class="bw-btn sm" @click="load">Refresh</button>
      </div>

      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Vendor</th>
              <th>Customer</th>
              <th>Meter</th>
              <th>Station</th>
              <th>Mode</th>
              <th style="text-align:right">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in items" :key="p.id">
              <td class="bw-mono bw-muted">{{ shortDate(p.created_at) }}</td>
              <td class="bw-mono">#{{ p.actor_id.slice(0, 8) }}</td>
              <td>{{ p.customer_name || '—' }}</td>
              <td class="bw-mono">{{ p.meter_id }}</td>
              <td>{{ p.station_id || '—' }}</td>
              <td><span class="bw-badge neutral">{{ p.purchase_mode }}</span></td>
              <td class="bw-money" style="text-align: right">{{ naira(p.amount_minor) }}</td>
              <td>
                <span :class="['bw-badge', statusBadge(p.status)]">{{ p.status }}</span>
                <div v-if="p.failure_reason" class="bw-muted" style="font-size: 10px; margin-top: 2px; max-width: 200px; overflow: hidden; text-overflow: ellipsis">{{ p.failure_reason }}</div>
              </td>
            </tr>
            <tr v-if="!items.length && !loading">
              <td colspan="8" class="bw-muted" style="text-align: center; padding: var(--s-6)">No purchases match.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </AppShell>
</template>
