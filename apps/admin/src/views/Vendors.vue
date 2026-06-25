<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, shortDate } from '../lib/api';

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
const q = ref('');
const status = ref<'' | Vendor['status']>('');
const loading = ref(false);

async function load() {
    loading.value = true;
    try {
        const params = new URLSearchParams();
        if (status.value) params.set('status', status.value);
        if (q.value) params.set('q', q.value);
        const r = await api.get<{ vendors: Vendor[] }>(`/api/v1/admin/vendors${params.toString() ? '?' + params : ''}`);
        vendors.value = r.vendors;
    } finally { loading.value = false; }
}

async function setStatus(v: Vendor, newStatus: 'approved' | 'frozen' | 'suspended') {
    if (!confirm(`${newStatus} ${v.legal_name}?`)) return;
    try {
        await api.patch(`/api/v1/admin/vendors/${v.id}/status`, { status: newStatus });
        await load();
    } catch (e: any) {
        alert(e?.message ?? 'Update failed');
    }
}

function statusBadge(s: Vendor['status']) {
    if (s === 'approved') return 'success';
    if (s === 'frozen') return 'danger';
    if (s === 'suspended') return 'warn';
    return 'neutral';
}

onMounted(load);
</script>

<template>
  <AppShell title="Vendors">
    <div class="bw-card" style="padding: 0">
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
        <router-link to="/vendors/new" class="bw-btn primary" style="text-decoration: none">+ Create vendor</router-link>
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in vendors" :key="v.id">
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
              <td>
                <div class="bw-row" style="gap: 4px; justify-content: flex-end">
                  <button v-if="v.status === 'approved'" class="bw-btn sm" @click="setStatus(v, 'frozen')">Freeze</button>
                  <button v-if="v.status === 'frozen' || v.status === 'suspended'" class="bw-btn sm primary" @click="setStatus(v, 'approved')">Reactivate</button>
                </div>
              </td>
            </tr>
            <tr v-if="!vendors.length && !loading">
              <td colspan="6" class="bw-muted" style="text-align: center; padding: var(--s-6)">No vendors yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </AppShell>
</template>
