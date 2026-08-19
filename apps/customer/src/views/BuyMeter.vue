<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppShell from '../components/AppShell.vue';
import { useAuthStore } from '../stores/auth';
import { api, ApiError, redirectToPayment } from '../lib/api';

const auth = useAuthStore();

const step = ref<1 | 2 | 3 | 4>(1);
const loading = ref(false);
const error = ref('');

// Step 1: Property category
const propertyCategory = ref<'residential' | 'commercial' | ''>('');

// Step 2: Meter type
const meterType = ref<'single_phase' | 'three_phase' | ''>('');

// Step 3: Property details
const propertyAddress = ref('');
const serviceArea = ref('');
const contactPhone = ref(auth.customer?.phone ?? '');

const prices = ref<{ residential_minor: number; commercial_minor: number }>({
    residential_minor: 3_000_000,
    commercial_minor: 15_000_000,
});

async function loadPrices() {
    try {
        const res = await api.get<{ residential_minor: number; commercial_minor: number }>('/api/v1/customer/meter-pricing');
        if (res.residential_minor) prices.value = res;
    } catch {
        // use fallback default
    }
}

onMounted(() => {
    loadPrices();
});

const activePriceMinor = computed(() => {
    if (!propertyCategory.value) return 0;
    return propertyCategory.value === 'commercial' ? prices.value.commercial_minor : prices.value.residential_minor;
});

const priceLabel = computed(() =>
    activePriceMinor.value ? `₦${(activePriceMinor.value / 100).toLocaleString()}` : ''
);

function pickCategory(category: 'residential' | 'commercial') {
    propertyCategory.value = category;
    step.value = 2;
}

function pickMeter(type: 'single_phase' | 'three_phase') {
    meterType.value = type;
    step.value = 3;
}

async function submitOrder() {
    if (!propertyAddress.value.trim() || !serviceArea.value.trim() || !contactPhone.value.trim()) {
        error.value = 'Please fill in all fields.';
        return;
    }
    loading.value = true;
    error.value = '';
    try {
        const data = await api.post<{ order: any; authorization_url: string }>('/api/v1/customer/meter-orders', {
            meter_type: meterType.value,
            property_category: propertyCategory.value,
            property_address: propertyAddress.value.trim(),
            service_area: serviceArea.value.trim(),
            contact_phone: contactPhone.value.trim(),
        });
        redirectToPayment(data.authorization_url);
    } catch (e: any) {
        error.value = e instanceof ApiError ? e.message : 'Could not create order';
    } finally {
        loading.value = false;
    }
}
</script>

<template>
  <AppShell>
    <p class="bw-page-title">Order a meter</p>
    <p class="bw-page-sub">Beverly installs certified prepaid meters at your property</p>

    <!-- Step indicator -->
    <div class="bw-steps">
      <div :class="['bw-step', { active: step >= 1, done: step > 1 }]">1</div>
      <div class="bw-step-line" />
      <div :class="['bw-step', { active: step >= 2, done: step > 2 }]">2</div>
      <div class="bw-step-line" />
      <div :class="['bw-step', { active: step >= 3, done: step > 3 }]">3</div>
      <div class="bw-step-line" />
      <div :class="['bw-step', { active: step >= 4 }]">4</div>
    </div>

    <!-- Step 1: Property Category -->
    <template v-if="step === 1">
      <p style="font-weight:600; margin-bottom: var(--s-3)">Select property type</p>

      <button class="bw-option-card" :class="{ selected: propertyCategory === 'residential' }" @click="pickCategory('residential')">
        <div class="bw-option-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </div>
        <div class="bw-option-body">
          <strong>Residential Property</strong>
          <p class="bw-muted" style="font-size:var(--t-sm); margin:2px 0 0">Private residences, apartments, residential estates</p>
        </div>
        <div class="bw-option-price">₦{{ (prices.residential_minor / 100).toLocaleString() }}</div>
      </button>

      <button class="bw-option-card" :class="{ selected: propertyCategory === 'commercial' }" @click="pickCategory('commercial')">
        <div class="bw-option-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
        </div>
        <div class="bw-option-body">
          <strong>Commercial Property</strong>
          <p class="bw-muted" style="font-size:var(--t-sm); margin:2px 0 0">Offices, shops, factories, commercial complexes</p>
        </div>
        <div class="bw-option-price">₦{{ (prices.commercial_minor / 100).toLocaleString() }}</div>
      </button>

      <div class="bw-info-row">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <span>Price includes supply, installation, and account linking. NERC-certified.</span>
      </div>
    </template>

    <!-- Step 2: Meter type -->
    <template v-else-if="step === 2">
      <div class="bw-back-row">
        <button class="bw-text-btn" @click="step = 1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back
        </button>
        <span class="bw-muted" style="font-size:var(--t-sm)">{{ propertyCategory === 'commercial' ? 'Commercial' : 'Residential' }} — {{ priceLabel }}</span>
      </div>

      <p style="font-weight:600; margin-bottom: var(--s-3)">Select meter phase</p>

      <button class="bw-option-card" :class="{ selected: meterType === 'single_phase' }" @click="pickMeter('single_phase')">
        <div class="bw-option-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        </div>
        <div class="bw-option-body">
          <strong>Single Phase</strong>
          <p class="bw-muted" style="font-size:var(--t-sm); margin:2px 0 0">Standard load connections</p>
        </div>
        <div class="bw-option-price">{{ priceLabel }}</div>
      </button>

      <button class="bw-option-card" :class="{ selected: meterType === 'three_phase' }" @click="pickMeter('three_phase')">
        <div class="bw-option-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        </div>
        <div class="bw-option-body">
          <strong>Three Phase</strong>
          <p class="bw-muted" style="font-size:var(--t-sm); margin:2px 0 0">Heavy duty & multi-phase load connections</p>
        </div>
        <div class="bw-option-price">{{ priceLabel }}</div>
      </button>
    </template>

    <!-- Step 3: Property details -->
    <template v-else-if="step === 3">
      <div class="bw-back-row">
        <button class="bw-text-btn" @click="step = 2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back
        </button>
        <span class="bw-muted" style="font-size:var(--t-sm)">{{ propertyCategory === 'commercial' ? 'Commercial' : 'Residential' }} ({{ meterType === 'three_phase' ? 'Three Phase' : 'Single Phase' }}) — {{ priceLabel }}</span>
      </div>

      <p style="font-weight:600; margin-bottom: var(--s-3)">Property details</p>

      <div class="bw-field">
        <label class="bw-label">Property address</label>
        <input v-model="propertyAddress" class="bw-input" placeholder="e.g. 12 Adeola Street, Surulere" />
      </div>

      <div class="bw-field">
        <label class="bw-label">Service area / LGA</label>
        <input v-model="serviceArea" class="bw-input" placeholder="e.g. Surulere, Lagos" />
      </div>

      <div class="bw-field">
        <label class="bw-label">Contact phone</label>
        <input v-model="contactPhone" class="bw-input" type="tel" placeholder="+234..." />
      </div>

      <p v-if="error" class="bw-error">{{ error }}</p>

      <button class="bw-btn primary" style="width:100%" @click="step = 4" :disabled="!propertyAddress || !serviceArea || !contactPhone">
        Review order
      </button>
    </template>

    <!-- Step 4: Review + Pay -->
    <template v-else>
      <div class="bw-back-row">
        <button class="bw-text-btn" @click="step = 3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back
        </button>
      </div>

      <p style="font-weight:600; margin-bottom: var(--s-3)">Review your order</p>

      <div class="bw-card">
        <div class="bw-review-row"><span class="bw-muted">Property category</span><strong>{{ propertyCategory === 'commercial' ? 'Commercial' : 'Residential' }}</strong></div>
        <div class="bw-review-row"><span class="bw-muted">Meter type</span><strong>{{ meterType === 'three_phase' ? 'Three Phase' : 'Single Phase' }}</strong></div>
        <div class="bw-review-row"><span class="bw-muted">Property address</span><span>{{ propertyAddress }}</span></div>
        <div class="bw-review-row"><span class="bw-muted">Service area</span><span>{{ serviceArea }}</span></div>
        <div class="bw-review-row"><span class="bw-muted">Contact</span><span>{{ contactPhone }}</span></div>
        <div class="bw-divider" />
        <div class="bw-review-row"><span class="bw-muted">Total</span><strong style="color:var(--brand); font-size:1.15em">{{ priceLabel }}</strong></div>
      </div>

      <div class="bw-info-row">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
        <span>You'll be redirected to Paystack to complete payment. We'll contact you within 2 business days to schedule installation.</span>
      </div>

      <p v-if="error" class="bw-error">{{ error }}</p>

      <button class="bw-btn primary" style="width:100%; margin-top:var(--s-3)" @click="submitOrder" :disabled="loading">
        <span v-if="loading">Processing…</span>
        <span v-else>Pay {{ priceLabel }} via Paystack</span>
      </button>
    </template>
  </AppShell>
</template>

<style scoped>
.bw-steps {
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: var(--s-6);
}
.bw-step {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: var(--t-sm);
  font-weight: 700;
  background: var(--surface-2);
  color: var(--fg-2);
  transition: background 0.2s, color 0.2s;
}
.bw-step.active { background: var(--brand); color: oklch(8% 0.04 145); }
.bw-step.done   { background: oklch(70% 0.19 145 / 0.25); color: var(--brand); }
.bw-step-line   { flex: 1; height: 2px; background: var(--surface-2); }

.bw-option-card {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  width: 100%;
  padding: var(--s-4);
  background: var(--surface-1);
  border: 1.5px solid var(--border);
  border-radius: var(--r-lg);
  cursor: pointer;
  margin-bottom: var(--s-3);
  text-align: left;
  transition: border-color 0.15s;
  color: var(--fg);
}
.bw-option-card.selected,
.bw-option-card:hover { border-color: var(--brand); }
.bw-option-icon {
  width: 40px; height: 40px;
  border-radius: var(--r-md);
  background: oklch(70% 0.19 145 / 0.12);
  display: grid; place-items: center;
  flex-shrink: 0;
  color: var(--brand);
}
.bw-option-body { flex: 1; }
.bw-option-price { font-weight: 700; color: var(--brand); white-space: nowrap; }

.bw-info-row {
  display: flex;
  align-items: flex-start;
  gap: var(--s-2);
  font-size: var(--t-sm);
  color: var(--fg-2);
  margin-top: var(--s-3);
  line-height: 1.5;
}
.bw-info-row svg { flex-shrink: 0; margin-top: 2px; }

.bw-back-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--s-4);
}
.bw-text-btn {
  display: flex; align-items: center; gap: var(--s-1);
  background: none; border: none; cursor: pointer;
  color: var(--fg-2); font-size: var(--t-sm); padding: 0;
}
.bw-text-btn:hover { color: var(--fg); }

.bw-review-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--s-3);
  padding: var(--s-2) 0;
  font-size: var(--t-sm);
}
.bw-review-row span:last-child { text-align: right; max-width: 60%; }
.bw-divider { border: none; border-top: 1px solid var(--border); margin: var(--s-2) 0; }
.bw-error { color: oklch(60% 0.22 25); font-size: var(--t-sm); margin-top: var(--s-2); }
</style>
