<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';

interface Meter {
    id: string;
    meter_id: string;
    nickname?: string | null;
    meter_type?: string | null;
    station_id?: string | null;
}

const meters = ref<Meter[]>([]);
const loading = ref(false);
const confirm = ref<string | null>(null);
const deleting = ref(false);

function meterTypeLabel(type?: string | null) {
    if (type === 'three_phase') return 'Three Phase';
    if (type === 'single_phase') return 'Single Phase';
    return 'Phase Unknown';
}

onMounted(async () => {
    loading.value = true;
    try {
        const response = await api.get<{ meters: Meter[] }>('/api/v1/customer/meters');
        meters.value = response.meters ?? [];
    } catch { /* noop */ } finally { loading.value = false; }
});

async function unlink(id: string) {
    deleting.value = true;
    try {
        await api.del(`/api/v1/customer/meters/${id}`);
        meters.value = meters.value.filter((meter) => meter.id !== id);
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
      <div class="bw-row" style="gap:8px">
        <router-link to="/consumption" class="bw-btn" style="text-decoration:none; white-space:nowrap">
          Consumption
        </router-link>
        <router-link to="/onboard-meter" class="bw-btn primary" style="text-decoration:none; white-space:nowrap">
          + Add meter
        </router-link>
      </div>
    </div>

    <section class="meter-install-card">
      <div class="meter-install-icon" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M13 2 4 14h7l-1 8 10-13h-7l0-7Z" />
        </svg>
      </div>
      <div class="meter-install-copy">
        <p class="meter-install-kicker">Certified install</p>
        <h2>Need a meter installed?</h2>
        <p>Choose a prepaid meter, track installation, and start buying tokens after activation.</p>
      </div>
      <div class="meter-install-prices" aria-label="Meter prices">
        <span><strong>NGN 50k</strong> 1-phase</span>
        <span><strong>NGN 75k</strong> 3-phase</span>
      </div>
      <div class="meter-install-actions">
        <router-link to="/meter-orders" class="bw-btn meter-install-secondary">
          My orders
        </router-link>
        <router-link to="/buy-meter" class="bw-btn primary">
          Order meter
        </router-link>
      </div>
    </section>

    <div v-if="loading" class="bw-muted" style="text-align:center; padding: var(--s-8); font-size: var(--t-sm)">Loading...</div>

    <div v-else-if="!meters.length" class="bw-card" style="text-align:center; padding: var(--s-8)">
      <div class="meter-empty-icon" aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M13 2 4 14h7l-1 8 10-13h-7l0-7Z" />
        </svg>
      </div>
      <p style="font-weight:700; margin:0 0 var(--s-2)">No meters yet</p>
      <p class="bw-muted" style="font-size: var(--t-sm); margin:0 0 var(--s-5)">Link your prepaid meter to buy tokens instantly.</p>
      <router-link to="/onboard-meter" class="bw-btn primary" style="text-decoration:none; display:inline-flex">
        Link a meter
      </router-link>
    </div>

    <div v-for="meter in meters" :key="meter.id" class="bw-card">
      <div class="bw-row">
        <div class="bw-meter-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
          </svg>
        </div>
        <div style="flex:1; min-width:0">
          <div style="font-weight:700">{{ meter.nickname || meter.meter_id }}</div>
          <div class="bw-mono bw-dim" style="font-size: var(--t-xs)">{{ meter.meter_id }}</div>
          <div class="bw-row" style="gap: var(--s-2); margin-top:4px; flex-wrap:wrap">
            <span :class="['bw-badge', meter.meter_type === 'three_phase' ? 'info' : 'neutral']">
              {{ meterTypeLabel(meter.meter_type) }}
            </span>
            <span v-if="meter.station_id" class="bw-muted" style="font-size: var(--t-xs)">{{ meter.station_id }}</span>
          </div>
        </div>
        <div class="bw-row" style="gap: var(--s-2); flex-shrink:0">
          <router-link :to="{ name: 'buy-token', query: { meter: meter.meter_id } }"
                       class="bw-btn" style="text-decoration:none; font-size: var(--t-sm); padding:0 var(--s-3); height:36px">
            Buy
          </router-link>
          <button class="bw-btn" style="font-size: var(--t-sm); padding:0 var(--s-3); height:36px; color: var(--danger)"
                  @click="confirm = meter.id">
            Remove
          </button>
        </div>
      </div>

      <div v-if="confirm === meter.id"
           style="margin-top: var(--s-3); padding: var(--s-3); background: var(--surface-2); border-radius: var(--r-md)">
        <p style="font-size: var(--t-sm); margin:0 0 var(--s-3)">Remove <strong>{{ meter.meter_id }}</strong>?</p>
        <div class="bw-row" style="gap: var(--s-2)">
          <button class="bw-btn" style="flex:1; justify-content:center; font-size: var(--t-sm)"
                  @click="confirm = null">Cancel</button>
          <button class="bw-btn danger" style="flex:1; justify-content:center; font-size: var(--t-sm)"
                  :disabled="deleting" @click="unlink(meter.id)">
            {{ deleting ? 'Removing...' : 'Remove' }}
          </button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.meter-install-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--s-4);
    position: relative;
    overflow: hidden;
    margin-bottom: var(--s-5);
    padding: var(--s-5);
    border: 1px solid color-mix(in srgb, var(--brand) 34%, var(--border));
    border-radius: var(--r-xl);
    background:
        linear-gradient(135deg, color-mix(in srgb, var(--brand) 16%, transparent), transparent 52%),
        var(--glass-bg-strong);
    box-shadow: var(--glass-shine), var(--glass-shadow-card);
    backdrop-filter: blur(18px) saturate(160%);
    -webkit-backdrop-filter: blur(18px) saturate(160%);
}
.meter-install-card::after {
    content: "";
    position: absolute;
    right: -56px;
    top: -72px;
    width: 160px;
    height: 160px;
    border: 1px solid color-mix(in srgb, var(--brand) 24%, transparent);
    border-radius: 999px;
}
.meter-install-icon {
    width: 56px;
    height: 56px;
    display: grid;
    place-items: center;
    border-radius: var(--r-lg);
    background: color-mix(in srgb, var(--brand) 18%, transparent);
    color: var(--brand);
}
.meter-install-copy {
    min-width: 0;
}
.meter-install-kicker {
    margin: 0 0 4px;
    color: var(--brand);
    font-size: var(--t-2xs);
    font-weight: 800;
    letter-spacing: .12em;
    text-transform: uppercase;
}
.meter-install-copy h2 {
    margin: 0;
    color: var(--text);
    font-size: var(--t-xl);
    line-height: 1.05;
}
.meter-install-copy p:last-child {
    margin: var(--s-2) 0 0;
    color: var(--text-2);
    font-size: var(--t-sm);
    line-height: 1.45;
}
.meter-install-prices {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-2);
}
.meter-install-prices span {
    display: grid;
    gap: 2px;
    padding: var(--s-3);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: color-mix(in srgb, var(--surface) 72%, transparent);
    color: var(--text-2);
    font-size: var(--t-xs);
}
.meter-install-prices strong {
    color: var(--text);
    font-size: var(--t-lg);
}
.meter-install-actions {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s-2);
}
.meter-install-actions a {
    justify-content: center;
    min-height: 44px;
    text-decoration: none;
}
.meter-install-secondary {
    background: color-mix(in srgb, var(--surface) 84%, transparent);
}
.meter-empty-icon {
    width: 58px;
    height: 58px;
    display: grid;
    place-items: center;
    margin: 0 auto var(--s-3);
    border-radius: var(--r-lg);
    background: color-mix(in srgb, var(--brand) 14%, transparent);
    color: var(--brand);
}
@media (max-width: 420px) {
    .meter-install-card,
    .meter-install-actions {
        grid-template-columns: 1fr;
    }
}
</style>
