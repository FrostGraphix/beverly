<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, shortDate } from '../lib/api';

interface AuditEntry {
    id: string;
    actor_user_id: string | null;
    actor_type: string | null;
    actor_role: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    metadata: any;
    ip_address: string | null;
    created_at: string;
}

const items = ref<AuditEntry[]>([]);
const action = ref('');
const since = ref('');
const loading = ref(false);

async function load() {
    loading.value = true;
    try {
        const params = new URLSearchParams();
        if (action.value) params.set('action', action.value);
        if (since.value) params.set('since', since.value);
        params.set('limit', '500');
        const r = await api.get<{ entries: AuditEntry[] }>(`/api/v1/admin/audit?${params}`);
        items.value = r.entries;
    } finally { loading.value = false; }
}

function actorBadge(t: string | null) {
    if (t === 'staff') return 'info';
    if (t === 'vendor_user') return 'success';
    if (t === 'customer') return 'neutral';
    if (t === 'webhook') return 'warn';
    return 'neutral';
}

onMounted(load);
</script>

<template>
  <AppShell title="Audit Log">
    <div class="bw-card" style="padding: 0">
      <div class="bw-table-head-bar">
        <h2 class="bw-h2" style="margin: 0">Immutable audit trail</h2>
        <span class="bw-spacer"></span>
        <input class="bw-input bw-mono" v-model="action" placeholder="action prefix…" style="width: 200px" @keyup.enter="load" />
        <input class="bw-input" v-model="since" type="datetime-local" style="width: 200px" @change="load" />
        <button class="bw-btn sm" @click="load">Refresh</button>
      </div>
      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in items" :key="e.id">
              <td class="bw-mono bw-muted">{{ shortDate(e.created_at) }}</td>
              <td>
                <span :class="['bw-badge', actorBadge(e.actor_type)]">{{ e.actor_type || '—' }}</span>
                <div class="bw-muted bw-mono" style="font-size: 10px; margin-top: 2px">{{ e.actor_user_id?.slice(0, 8) || '—' }}</div>
              </td>
              <td class="bw-mono">{{ e.action }}</td>
              <td>
                <div class="bw-muted" style="font-size: var(--t-xs)">{{ e.target_type || '—' }}</div>
                <div class="bw-mono" style="font-size: 10px">#{{ e.target_id?.slice(0, 8) || '—' }}</div>
              </td>
              <td class="bw-mono bw-muted" style="font-size: var(--t-xs)">{{ e.ip_address || '—' }}</td>
            </tr>
            <tr v-if="!items.length && !loading">
              <td colspan="5" class="bw-muted" style="text-align: center; padding: var(--s-6)">No matching entries.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </AppShell>
</template>
