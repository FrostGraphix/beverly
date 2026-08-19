<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api, ApiError } from '../lib/api';

interface WalletCustomer {
    id: string;
    full_name: string | null;
    phone: string | null;
    email: string | null;
}

const router = useRouter();
const step = ref<1 | 2 | 3 | 4>(1);
const loading = ref(false);
const searching = ref(false);
const error = ref('');
const search = ref('');
const results = ref<WalletCustomer[]>([]);
const selectedCustomer = ref<WalletCustomer | null>(null);
const propertyCategory = ref<'residential' | 'commercial' | ''>('');
const meterType = ref<'single_phase' | 'three_phase' | ''>('');
const propertyAddress = ref('');
const serviceArea = ref('');
const contactPhone = ref('');

const prices = ref<{ residential_minor: number; commercial_minor: number }>({
    residential_minor: 3_000_000,
    commercial_minor: 15_000_000,
});

async function loadPrices() {
    try {
        const res = await api.get<{ residential_minor: number; commercial_minor: number }>('/api/v1/vendor/meter-pricing');
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

const priceLabel = computed(() => {
    if (!activePriceMinor.value) return '';
    return `NGN ${(activePriceMinor.value / 100).toLocaleString()}`;
});

async function lookupCustomers() {
    searching.value = true;
    error.value = '';
    try {
        const response = await api.get<{ customers: WalletCustomer[] }>(
            `/api/v1/vendor/customers?q=${encodeURIComponent(search.value.trim())}&limit=12`,
        );
        results.value = response.customers ?? [];
    } catch (err: any) {
        error.value = err instanceof ApiError ? err.message : 'Could not load customers.';
    } finally {
        searching.value = false;
    }
}

function chooseCustomer(customer: WalletCustomer) {
    selectedCustomer.value = customer;
    contactPhone.value = customer.phone ?? '';
    step.value = 2;
}

function pickCategory(category: 'residential' | 'commercial') {
    propertyCategory.value = category;
    step.value = 3;
}

function pickMeter(type: 'single_phase' | 'three_phase') {
    meterType.value = type;
    step.value = 4;
}

async function submit() {
    if (!selectedCustomer.value || !meterType.value || !propertyCategory.value) return;
    if (!propertyAddress.value.trim() || !serviceArea.value.trim() || !contactPhone.value.trim()) {
        error.value = 'Complete every field.';
        return;
    }
    loading.value = true;
    error.value = '';
    try {
        await api.post('/api/v1/vendor/meter-orders', {
            customer_id: selectedCustomer.value.id,
            meter_type: meterType.value,
            property_category: propertyCategory.value,
            property_address: propertyAddress.value.trim(),
            service_area: serviceArea.value.trim(),
            contact_phone: contactPhone.value.trim(),
        });
        await router.push('/meter-orders');
    } catch (err: any) {
        error.value = err instanceof ApiError ? err.message : 'Could not create meter order.';
    } finally {
        loading.value = false;
    }
}
</script>

<template>
  <AppShell title="New Meter Order">
    <div class="bw-stack" style="gap: var(--s-4)">
      <div class="bw-card">
        <div class="bw-page-title">Order meter for customer</div>
        <p class="bw-page-sub">Vendor wallet is charged instantly after confirmation.</p>
      </div>

      <div class="bw-steps">
        <div :class="['bw-step', { active: step >= 1, done: step > 1 }]">1</div>
        <div class="bw-step-line"></div>
        <div :class="['bw-step', { active: step >= 2, done: step > 2 }]">2</div>
        <div class="bw-step-line"></div>
        <div :class="['bw-step', { active: step >= 3, done: step > 3 }]">3</div>
        <div class="bw-step-line"></div>
        <div :class="['bw-step', { active: step >= 4 }]">4</div>
      </div>

      <div v-if="step === 1" class="bw-card bw-stack" style="gap: var(--s-3)">
        <label class="bw-label">Search wallet customer</label>
        <div class="bw-row" style="gap: var(--s-2)">
          <input v-model="search" class="bw-input" placeholder="Name, phone, or email" @keyup.enter="lookupCustomers" />
          <button class="bw-btn primary" :disabled="searching" @click="lookupCustomers">
            {{ searching ? 'Searching…' : 'Search' }}
          </button>
        </div>
        <div class="bw-stack" style="gap: var(--s-2)">
          <button
            v-for="customer in results"
            :key="customer.id"
            class="bw-option-card"
            @click="chooseCustomer(customer)"
          >
            <div class="bw-option-body">
              <strong>{{ customer.full_name || 'Unnamed customer' }}</strong>
              <p class="bw-muted" style="margin: 4px 0 0">{{ customer.phone || customer.email || customer.id }}</p>
            </div>
          </button>
          <p v-if="!searching && search && !results.length" class="bw-muted">No wallet customer found.</p>
        </div>
      </div>

      <div v-else-if="step === 2" class="bw-card bw-stack" style="gap: var(--s-3)">
        <div class="bw-back-row">
          <button class="bw-text-btn" @click="step = 1">Back</button>
          <span class="bw-muted">{{ selectedCustomer?.full_name || 'Customer selected' }}</span>
        </div>
        <label class="bw-label">Select property type</label>
        <button class="bw-option-card" @click="pickCategory('residential')">
          <div class="bw-option-body">
            <strong>Residential Property</strong>
            <p class="bw-muted" style="margin: 4px 0 0">Private residences, apartments, estates.</p>
          </div>
          <div class="bw-option-price">NGN {{ (prices.residential_minor / 100).toLocaleString() }}</div>
        </button>
        <button class="bw-option-card" @click="pickCategory('commercial')">
          <div class="bw-option-body">
            <strong>Commercial Property</strong>
            <p class="bw-muted" style="margin: 4px 0 0">Offices, shops, commercial complexes.</p>
          </div>
          <div class="bw-option-price">NGN {{ (prices.commercial_minor / 100).toLocaleString() }}</div>
        </button>
      </div>

      <div v-else-if="step === 3" class="bw-card bw-stack" style="gap: var(--s-3)">
        <div class="bw-back-row">
          <button class="bw-text-btn" @click="step = 2">Back</button>
          <span class="bw-muted">{{ propertyCategory === 'commercial' ? 'Commercial' : 'Residential' }} — {{ priceLabel }}</span>
        </div>
        <label class="bw-label">Select meter phase</label>
        <button class="bw-option-card" @click="pickMeter('single_phase')">
          <div class="bw-option-body">
            <strong>Single Phase</strong>
            <p class="bw-muted" style="margin: 4px 0 0">Standard load connections.</p>
          </div>
          <div class="bw-option-price">{{ priceLabel }}</div>
        </button>
        <button class="bw-option-card" @click="pickMeter('three_phase')">
          <div class="bw-option-body">
            <strong>Three Phase</strong>
            <p class="bw-muted" style="margin: 4px 0 0">Heavy duty load connections.</p>
          </div>
          <div class="bw-option-price">{{ priceLabel }}</div>
        </button>
      </div>

      <div v-else class="bw-card bw-stack" style="gap: var(--s-3)">
        <div class="bw-back-row">
          <button class="bw-text-btn" @click="step = 3">Back</button>
          <span class="bw-muted">{{ priceLabel }}</span>
        </div>
        <div class="bw-field">
          <label class="bw-label">Property address</label>
          <input v-model="propertyAddress" class="bw-input" placeholder="Installation address" />
        </div>
        <div class="bw-field">
          <label class="bw-label">Service area</label>
          <input v-model="serviceArea" class="bw-input" placeholder="Station or area" />
        </div>
        <div class="bw-field">
          <label class="bw-label">Contact phone</label>
          <input v-model="contactPhone" class="bw-input" placeholder="+234…" />
        </div>
        <div class="bw-card" style="padding: var(--s-4)">
          <div class="bw-review-row"><span class="bw-muted">Customer</span><strong>{{ selectedCustomer?.full_name || '—' }}</strong></div>
          <div class="bw-review-row"><span class="bw-muted">Property category</span><strong>{{ propertyCategory === 'commercial' ? 'Commercial' : 'Residential' }}</strong></div>
          <div class="bw-review-row"><span class="bw-muted">Meter type</span><strong>{{ meterType === 'three_phase' ? 'Three Phase' : 'Single Phase' }}</strong></div>
          <div class="bw-review-row"><span class="bw-muted">Charge source</span><strong>Vendor wallet</strong></div>
          <div class="bw-review-row"><span class="bw-muted">Amount</span><strong>{{ priceLabel }}</strong></div>
        </div>
        <p v-if="error" class="bw-error">{{ error }}</p>
        <button class="bw-btn primary" :disabled="loading" @click="submit">
          {{ loading ? 'Creating…' : `Create order · ${priceLabel}` }}
        </button>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.bw-steps { display:flex; align-items:center; gap:0; }
.bw-step { width:28px; height:28px; border-radius:999px; display:grid; place-items:center; background:var(--surface-2); color:var(--fg-2); font-weight:700; }
.bw-step.active { background: var(--brand); color: var(--surface-0); }
.bw-step.done { background: color-mix(in srgb, var(--brand) 18%, transparent); color: var(--brand); }
.bw-step-line { flex:1; height:2px; background:var(--border); }
.bw-option-card { display:flex; align-items:center; justify-content:space-between; gap:var(--s-3); width:100%; padding:var(--s-4); border:1px solid var(--border); border-radius:var(--r-lg); background:var(--surface-1); color:var(--fg); text-align:left; }
.bw-option-body { flex:1; }
.bw-option-price { font-weight:700; color:var(--brand); }
.bw-back-row { display:flex; align-items:center; justify-content:space-between; gap:var(--s-2); }
.bw-text-btn { background:none; border:none; color:var(--fg-2); padding:0; cursor:pointer; }
.bw-review-row { display:flex; justify-content:space-between; gap:var(--s-3); padding:6px 0; }
</style>
