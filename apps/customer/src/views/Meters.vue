<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';

const meters  = ref<any[]>([]);
const loading = ref(false);
const confirm = ref<string | null>(null);
const deleting = ref(false);

onMounted(async () => {
    loading.value = true;
    try {
        const r = await api.get<{ meters: any[] }>('/api/v1/customer/meters');
        meters.value = r.meters;
    } catch { /* noop */ } finally { loading.value = false; }
});

async function unlink(id: string) {
    deleting.value = true;
    try {
        await api.del(`/api/v1/customer/meters/${id}`);
        meters.value = meters.value.filter(m => m.id !== id);
        confirm.value = null;
    } catch { /* noop */ } finally { deleting.value = false; }
}
</script>

<template>
  <AppShell>
    <div class="bw-row" style="justify-content:space-between; align-items:center">
      <div>
        <p class="bw-page-title">My Meters</p>
        <p class="bw-page-sub">{{ meters.length }} linked</p>
      </div>
      <router-link to="/onboard-meter" class="bw-btn primary" style="text-decoration:none; white-space:nowrap">
        + Add meter
      </router-link>
    </div>

    <div v-if="loading" class="bw-muted" style="text-align:center; padding: var(--s-8); font-size: var(--t-sm)">Loading…</div>

    <div v-else-if="!meters.length" class="bw-card" style="text-align:center; padding: var(--s-8)">
      <div style="font-size:40px; margin-bottom: var(--s-3)">⚡</div>
      <p style="font-weight:700; margin:0 0 var(--s-2)">No meters yet</p>
      <p class="bw-muted" style="font-size: var(--t-sm); margin:0 0 var(--s-5)">Link your prepaid meter to buy tokens instantly.</p>
      <router-link to="/onboard-meter" class="bw-btn primary" style="text-decoration:none; display:inline-flex">
        Link a meter
      </router-link>
    </div>

    <div v-for="m in meters" :key="m.id" class="bw-card">
      <div class="bw-row">
        <div class="bw-meter-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
          </svg>
        </div>
        <div style="flex:1; min-width:0">
          <div style="font-weight:700">{{ m.nickname || m.meter_id }}</div>
          <div class="bw-mono bw-dim" style="font-size: var(--t-xs)">{{ m.meter_id }}</div>
          <div v-if="m.station_id" class="bw-muted" style="font-size: var(--t-xs)">{{ m.station_id }}</div>
        </div>
        <div class="bw-row" style="gap: var(--s-2); flex-shrink:0">
          <router-link :to="{ name: 'buy-token', query: { meter: m.meter_id } }"
                       class="bw-btn" style="text-decoration:none; font-size: var(--t-sm); padding:0 var(--s-3); height:36px">
            Buy
          </router-link>
          <button class="bw-btn" style="font-size: var(--t-sm); padding:0 var(--s-3); height:36px; color: var(--danger)"
                  @click="confirm = m.id">
            Remove
          </button>
        </div>
      </div>

      <!-- Inline confirm -->
      <div v-if="confirm === m.id"
           style="margin-top: var(--s-3); padding: var(--s-3); background: var(--surface-2); border-radius: var(--r-md)">
        <p style="font-size: var(--t-sm); margin:0 0 var(--s-3)">Remove <strong>{{ m.meter_id }}</strong>?</p>
        <div class="bw-row" style="gap: var(--s-2)">
          <button class="bw-btn" style="flex:1; justify-content:center; font-size: var(--t-sm)"
                  @click="confirm = null">Cancel</button>
          <button class="bw-btn danger" style="flex:1; justify-content:center; font-size: var(--t-sm)"
                  :disabled="deleting" @click="unlink(m.id)">
            {{ deleting ? 'Removing…' : 'Remove' }}
          </button>
        </div>
      </div>
    </div>
  </AppShell>
</template>
