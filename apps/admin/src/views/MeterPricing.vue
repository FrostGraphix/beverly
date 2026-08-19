<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, naira, ApiError } from '../lib/api';

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

const residentialNaira = ref<number | ''>('');
const commercialNaira = ref<number | ''>('');

async function fetchPrices() {
    loading.value = true;
    error.value = '';
    try {
        const res = await api.get<{ residential_minor: number; commercial_minor: number }>('/api/v1/admin/meter-pricing');
        residentialNaira.value = res.residential_minor / 100;
        commercialNaira.value = res.commercial_minor / 100;
    } catch (err: any) {
        error.value = err instanceof ApiError ? err.message : 'Could not load current meter prices.';
    } finally {
        loading.value = false;
    }
}

async function savePrices() {
    if (!residentialNaira.value || !commercialNaira.value) {
        error.value = 'Please enter valid non-zero prices for both residential and commercial categories.';
        return;
    }
    saving.value = true;
    error.value = '';
    success.value = '';
    try {
        const res = await api.put<{ residential_minor: number; commercial_minor: number }>('/api/v1/admin/meter-pricing', {
            residential_minor: Math.round(Number(residentialNaira.value) * 100),
            commercial_minor: Math.round(Number(commercialNaira.value) * 100),
        });
        residentialNaira.value = res.residential_minor / 100;
        commercialNaira.value = res.commercial_minor / 100;
        success.value = 'Meter prices updated successfully! New prices will apply immediately to all portals.';
    } catch (err: any) {
        error.value = err instanceof ApiError ? err.message : 'Could not update meter prices.';
    } finally {
        saving.value = false;
    }
}

onMounted(() => {
    fetchPrices();
});
</script>

<template>
  <AppShell title="Meter Pricing Configuration">
    <div class="bw-stack" style="gap: var(--s-4); max-width: 720px">
      <div class="bw-card">
        <div class="bw-page-title">Meter Pricing Settings</div>
        <p class="bw-page-sub">
          Manage installation prices for prepaid meters. Prices apply instantly to Customer, Vendor, and Admin order portals.
        </p>
      </div>

      <div v-if="loading" class="bw-card" style="padding: var(--s-6); text-align: center">
        <p class="bw-muted">Loading active pricing configuration…</p>
      </div>

      <div v-else class="bw-card bw-stack" style="gap: var(--s-4)">
        <div v-if="success" class="bw-alert success">{{ success }}</div>
        <div v-if="error" class="bw-alert error">{{ error }}</div>

        <div class="bw-pricing-grid">
          <div class="bw-pricing-card">
            <div class="bw-badge-row">
              <span class="bw-badge">Residential</span>
            </div>
            <label class="bw-label" style="margin-top: var(--s-2)">Price per meter (NGN)</label>
            <div class="bw-input-prefix">
              <span>NGN</span>
              <input
                v-model.number="residentialNaira"
                type="number"
                min="1000"
                step="1000"
                class="bw-input"
                placeholder="30000"
              />
            </div>
            <p class="bw-muted" style="font-size: var(--t-sm); margin-top: var(--s-2)">
              Applies to single-phase and three-phase meters for residential properties. Currently: <strong>{{ naira(Number(residentialNaira) * 100) }}</strong>
            </p>
          </div>

          <div class="bw-pricing-card">
            <div class="bw-badge-row">
              <span class="bw-badge brand">Commercial</span>
            </div>
            <label class="bw-label" style="margin-top: var(--s-2)">Price per meter (NGN)</label>
            <div class="bw-input-prefix">
              <span>NGN</span>
              <input
                v-model.number="commercialNaira"
                type="number"
                min="1000"
                step="1000"
                class="bw-input"
                placeholder="150000"
              />
            </div>
            <p class="bw-muted" style="font-size: var(--t-sm); margin-top: var(--s-2)">
              Applies to commercial properties and heavy load installations. Currently: <strong>{{ naira(Number(commercialNaira) * 100) }}</strong>
            </p>
          </div>
        </div>

        <div class="bw-row" style="justify-content: flex-end; gap: var(--s-2); margin-top: var(--s-2)">
          <button class="bw-btn" :disabled="saving" @click="fetchPrices">Reset</button>
          <button class="bw-btn primary" :disabled="saving" @click="savePrices">
            {{ saving ? 'Saving…' : 'Save Meter Prices' }}
          </button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.bw-pricing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--s-4);
}
.bw-pricing-card {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: var(--s-4);
  display: flex;
  flex-direction: column;
}
.bw-badge-row {
  display: flex;
  align-items: center;
  margin-bottom: var(--s-2);
}
.bw-badge {
  font-size: var(--t-xs);
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--fg);
}
.bw-badge.brand {
  background: color-mix(in srgb, var(--brand) 15%, transparent);
  color: var(--brand);
}
.bw-input-prefix {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}
.bw-input-prefix span {
  font-weight: 700;
  color: var(--fg-2);
  font-size: 1.1em;
}
.bw-alert {
  padding: var(--s-3) var(--s-4);
  border-radius: var(--r-md);
  font-size: var(--t-sm);
  font-weight: 500;
}
.bw-alert.success {
  background: color-mix(in srgb, var(--brand) 15%, transparent);
  color: var(--brand);
  border: 1px solid color-mix(in srgb, var(--brand) 30%, transparent);
}
.bw-alert.error {
  background: color-mix(in srgb, oklch(60% 0.22 25) 15%, transparent);
  color: oklch(60% 0.22 25);
  border: 1px solid color-mix(in srgb, oklch(60% 0.22 25) 30%, transparent);
}
</style>
