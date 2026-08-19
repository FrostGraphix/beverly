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

interface VendorOrg {
    id: string;
    legal_name: string | null;
    trading_name: string | null;
}

const router = useRouter();
const customerSearch = ref('');
const vendorSearch = ref('');
const customerResults = ref<WalletCustomer[]>([]);
const vendorResults = ref<VendorOrg[]>([]);
const selectedCustomer = ref<WalletCustomer | null>(null);
const selectedVendor = ref<VendorOrg | null>(null);
const sponsorMode = ref<'manual_paid' | 'vendor_wallet'>('manual_paid');
const propertyCategory = ref<'residential' | 'commercial'>('residential');
const meterType = ref<'single_phase' | 'three_phase'>('single_phase');
const propertyAddress = ref('');
const serviceArea = ref('');
const contactPhone = ref('');
const notes = ref('');
const loading = ref(false);
const searchBusy = ref(false);
const vendorBusy = ref(false);
const error = ref('');

const prices = ref<{ residential_minor: number; commercial_minor: number }>({
    residential_minor: 3_000_000,
    commercial_minor: 15_000_000,
});

async function loadPrices() {
    try {
        const res = await api.get<{ residential_minor: number; commercial_minor: number }>('/api/v1/admin/meter-pricing');
        if (res.residential_minor) prices.value = res;
    } catch {
        // use fallback default
    }
}

onMounted(() => {
    loadPrices();
});

const priceMinor = computed(() =>
    propertyCategory.value === 'commercial' ? prices.value.commercial_minor : prices.value.residential_minor
);
const priceLabel = computed(() => `NGN ${(priceMinor.value / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

async function lookupCustomers() {
    searchBusy.value = true;
    error.value = '';
    try {
        const response = await api.get<{ customers: WalletCustomer[]; error?: string }>(
            `/api/v1/admin/meter-orders/customer-search?limit=12&q=${encodeURIComponent(customerSearch.value.trim())}`,
        );
        if (response.error) {
            error.value = response.error;
            customerResults.value = [];
            return;
        }
        customerResults.value = response.customers ?? [];
    } catch (err: any) {
        error.value = err instanceof ApiError ? err.message : 'Could not load customers.';
    } finally {
        searchBusy.value = false;
    }
}

async function lookupVendors() {
    vendorBusy.value = true;
    try {
        const response = await api.get<{ vendors: VendorOrg[] }>(
            `/api/v1/admin/vendors?q=${encodeURIComponent(vendorSearch.value.trim())}`,
        );
        vendorResults.value = response.vendors ?? [];
    } catch (err: any) {
        error.value = err instanceof ApiError ? err.message : 'Could not load vendors.';
    } finally {
        vendorBusy.value = false;
    }
}

async function submit() {
    if (!selectedCustomer.value) {
        error.value = 'Select a customer.';
        return;
    }
    if (sponsorMode.value === 'vendor_wallet' && !selectedVendor.value) {
        error.value = 'Select a sponsor vendor.';
        return;
    }
    if (!propertyAddress.value.trim() || !serviceArea.value.trim() || !contactPhone.value.trim()) {
        error.value = 'Complete every field.';
        return;
    }
    loading.value = true;
    error.value = '';
    try {
        await api.post('/api/v1/admin/meter-orders', {
            customer_id: selectedCustomer.value.id,
            meter_type: meterType.value,
            property_category: propertyCategory.value,
            property_address: propertyAddress.value.trim(),
            service_area: serviceArea.value.trim(),
            contact_phone: contactPhone.value.trim(),
            sponsor_mode: sponsorMode.value,
            vendor_organization_id: selectedVendor.value?.id,
            notes: notes.value.trim() || undefined,
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
      <div class="bw-card bw-row" style="justify-content: space-between; align-items: center">
        <div>
          <div class="bw-page-title">Create meter order</div>
          <p class="bw-page-sub">Staff can log assisted orders or charge a vendor wallet for a customer.</p>
        </div>
        <router-link to="/meter-pricing" class="bw-btn sm">Edit meter prices →</router-link>
      </div>

      <div class="bw-card bw-stack" style="gap: var(--s-3)">
        <label class="bw-label">Find customer</label>
        <div class="bw-row" style="gap: var(--s-2)">
          <input v-model="customerSearch" class="bw-input" placeholder="Customer name, phone, or email" @keyup.enter="lookupCustomers" />
          <button class="bw-btn sm primary" :disabled="searchBusy" @click="lookupCustomers">{{ searchBusy ? 'Searching…' : 'Search' }}</button>
        </div>
        <div class="bw-grid" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--s-2)">
          <button v-for="customer in customerResults" :key="customer.id" class="bw-option-card" @click="selectedCustomer = customer">
            <div class="bw-option-body">
              <strong>{{ customer.full_name || 'Unnamed customer' }}</strong>
              <p class="bw-muted" style="margin: 4px 0 0">{{ customer.phone || customer.email || customer.id }}</p>
            </div>
          </button>
        </div>
        <p v-if="selectedCustomer" class="bw-muted">Selected: {{ selectedCustomer.full_name || selectedCustomer.id }}</p>
      </div>

      <div class="bw-card bw-stack" style="gap: var(--s-3)">
        <label class="bw-label">Sponsor mode</label>
        <div class="bw-row" style="gap: var(--s-2); flex-wrap: wrap">
          <button :class="['bw-btn', sponsorMode === 'manual_paid' ? 'primary' : '']" @click="sponsorMode = 'manual_paid'">Staff assisted</button>
          <button :class="['bw-btn', sponsorMode === 'vendor_wallet' ? 'primary' : '']" @click="sponsorMode = 'vendor_wallet'">Charge vendor wallet</button>
        </div>

        <div v-if="sponsorMode === 'vendor_wallet'" class="bw-stack" style="gap: var(--s-3)">
          <label class="bw-label">Find sponsor vendor</label>
          <div class="bw-row" style="gap: var(--s-2)">
            <input v-model="vendorSearch" class="bw-input" placeholder="Vendor legal name" @keyup.enter="lookupVendors" />
            <button class="bw-btn sm primary" :disabled="vendorBusy" @click="lookupVendors">{{ vendorBusy ? 'Searching…' : 'Search' }}</button>
          </div>
          <div class="bw-grid" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--s-2)">
            <button v-for="vendor in vendorResults" :key="vendor.id" class="bw-option-card" @click="selectedVendor = vendor">
              <div class="bw-option-body">
                <strong>{{ vendor.trading_name || vendor.legal_name || 'Vendor' }}</strong>
                <p class="bw-muted" style="margin: 4px 0 0">{{ vendor.legal_name || vendor.id }}</p>
              </div>
            </button>
          </div>
          <p v-if="selectedVendor" class="bw-muted">Selected vendor: {{ selectedVendor.trading_name || selectedVendor.legal_name || selectedVendor.id }}</p>
        </div>
      </div>

      <div class="bw-card bw-stack" style="gap: var(--s-3)">
        <label class="bw-label">Property category (pricing axis)</label>
        <div class="bw-row" style="gap: var(--s-2); flex-wrap: wrap">
          <button :class="['bw-btn', propertyCategory === 'residential' ? 'primary' : '']" @click="propertyCategory = 'residential'">Residential (NGN {{ (prices.residential_minor / 100).toLocaleString() }})</button>
          <button :class="['bw-btn', propertyCategory === 'commercial' ? 'primary' : '']" @click="propertyCategory = 'commercial'">Commercial (NGN {{ (prices.commercial_minor / 100).toLocaleString() }})</button>
        </div>

        <label class="bw-label" style="margin-top: var(--s-2)">Meter type</label>
        <div class="bw-row" style="gap: var(--s-2); flex-wrap: wrap">
          <button :class="['bw-btn', meterType === 'single_phase' ? 'primary' : '']" @click="meterType = 'single_phase'">Single phase</button>
          <button :class="['bw-btn', meterType === 'three_phase' ? 'primary' : '']" @click="meterType = 'three_phase'">Three phase</button>
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
        <div class="bw-field">
          <label class="bw-label">Ops note</label>
          <textarea v-model="notes" class="bw-input" rows="3" placeholder="Optional context"></textarea>
        </div>
      </div>

      <div class="bw-card">
        <div class="bw-review-row"><span class="bw-muted">Customer</span><strong>{{ selectedCustomer?.full_name || '—' }}</strong></div>
        <div class="bw-review-row"><span class="bw-muted">Sponsor</span><strong>{{ sponsorMode === 'vendor_wallet' ? (selectedVendor?.trading_name || selectedVendor?.legal_name || '—') : 'Staff assisted' }}</strong></div>
        <div class="bw-review-row"><span class="bw-muted">Property category</span><strong>{{ propertyCategory === 'commercial' ? 'Commercial' : 'Residential' }}</strong></div>
        <div class="bw-review-row"><span class="bw-muted">Meter type</span><strong>{{ meterType === 'three_phase' ? 'Three Phase' : 'Single Phase' }}</strong></div>
        <div class="bw-review-row"><span class="bw-muted">Amount</span><strong>{{ priceLabel }}</strong></div>
      </div>

      <p v-if="error" class="bw-error">{{ error }}</p>

      <div class="bw-row" style="gap: var(--s-2); justify-content: flex-end">
        <button class="bw-btn" @click="router.push('/meter-orders')">Cancel</button>
        <button class="bw-btn primary" :disabled="loading" @click="submit">{{ loading ? 'Creating…' : 'Create Order' }}</button>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.bw-option-card { display:flex; width:100%; text-align:left; padding:var(--s-4); border:1px solid var(--border); border-radius:var(--r-lg); background:var(--surface-1); color:var(--fg); }
.bw-option-body { flex:1; }
.bw-review-row { display:flex; justify-content:space-between; gap:var(--s-3); padding:6px 0; }
</style>
