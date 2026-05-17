<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';

const route = useRoute();
const router = useRouter();

const form = ref({
    legalName: '',
    tradingName: '',
    cacNumber: '',
    tin: '',
    businessType: '',
    contactEmail: '',
    contactPhone: '',
    operatingAddress: '',
    operatingStations: '',
    primaryUserFullName: '',
    primaryUserEmail: '',
    primaryUserPhone: '',
    dailyLimitNaira: 10000000,
    sourceApplicationId: '',
});

const loading = ref(false);
const error = ref<string | null>(null);
const result = ref<{ organizationId: string; temporaryPassword: string } | null>(null);
const copied = ref(false);

onMounted(() => {
    if (route.query.legalName) form.value.legalName = String(route.query.legalName);
    if (route.query.email) form.value.contactEmail = form.value.primaryUserEmail = String(route.query.email);
    if (route.query.phone) form.value.contactPhone = form.value.primaryUserPhone = String(route.query.phone);
    if (route.query.primaryName) form.value.primaryUserFullName = String(route.query.primaryName);
    if (route.query.source) form.value.sourceApplicationId = String(route.query.source);
});

async function submit() {
    loading.value = true; error.value = null;
    try {
        const payload = {
            legalName: form.value.legalName,
            tradingName: form.value.tradingName || undefined,
            cacNumber: form.value.cacNumber || undefined,
            tin: form.value.tin || undefined,
            businessType: form.value.businessType || undefined,
            contactEmail: form.value.contactEmail,
            contactPhone: form.value.contactPhone,
            operatingAddress: form.value.operatingAddress || undefined,
            operatingStations: form.value.operatingStations
                ? form.value.operatingStations.split(',').map((s) => s.trim()).filter(Boolean)
                : undefined,
            primaryUserFullName: form.value.primaryUserFullName,
            primaryUserEmail: form.value.primaryUserEmail,
            primaryUserPhone: form.value.primaryUserPhone || undefined,
            dailyLimitMinor: Math.round(form.value.dailyLimitNaira * 100),
            sourceApplicationId: form.value.sourceApplicationId || undefined,
        };
        result.value = await api.post('/api/v1/admin/vendors', payload);
    } catch (e: any) {
        error.value = e?.message ?? 'Failed to create vendor';
    } finally { loading.value = false; }
}

async function copyPassword() {
    if (!result.value) return;
    try {
        await navigator.clipboard.writeText(result.value.temporaryPassword);
        copied.value = true;
        setTimeout(() => (copied.value = false), 2000);
    } catch { /* noop */ }
}
</script>

<template>
  <AppShell title="Create Vendor">
    <div style="max-width: 720px; margin: 0 auto">
      <!-- Success: show temp password ONCE -->
      <div v-if="result" class="bw-stack">
        <div class="bw-card" style="background: linear-gradient(135deg, oklch(70% 0.19 145 / 0.10), transparent); border-color: oklch(70% 0.19 145 / 0.25)">
          <p class="bw-label" style="color: var(--brand)">Vendor created</p>
          <h1 class="bw-h1">{{ form.legalName }}</h1>
          <p class="bw-muted">Organization ID <span class="bw-mono">#{{ result.organizationId.slice(0, 8) }}</span></p>
        </div>

        <div class="bw-card" style="border-color: oklch(78% 0.16 75 / 0.40); background: oklch(78% 0.16 75 / 0.05)">
          <p class="bw-label" style="color: var(--warn)">Temporary password — shown ONCE</p>
          <p class="bw-mono" style="font-size: var(--t-2xl); font-weight: 700; letter-spacing: 0.1em; padding: var(--s-3) 0">
            {{ result.temporaryPassword }}
          </p>
          <p class="bw-muted" style="font-size: var(--t-sm)">
            Hand-deliver via your approved secure channel. The vendor will be forced to change it on first login.
            This page will not show this password again.
          </p>
          <button class="bw-btn primary" style="margin-top: var(--s-3)" @click="copyPassword">
            {{ copied ? 'Copied ✓' : 'Copy password' }}
          </button>
        </div>

        <div class="bw-card">
          <h2 class="bw-h2">Next steps</h2>
          <ol class="bw-muted" style="font-size: var(--t-sm); padding-left: var(--s-5); line-height: 1.8">
            <li>Send credentials via approved channel (encrypted email or in-person).</li>
            <li>Vendor logs in at <span class="bw-mono">vendor.beverly.acoblighting.com</span>.</li>
            <li>Vendor changes password and sets up 2FA.</li>
            <li>Vendor begins funding + vending.</li>
          </ol>
          <div class="bw-row" style="margin-top: var(--s-4); gap: var(--s-2)">
            <button class="bw-btn" @click="router.push('/vendors')">Done</button>
            <button class="bw-btn primary" @click="result = null">Create another</button>
          </div>
        </div>
      </div>

      <!-- Form -->
      <div v-else class="bw-card">
        <h1 class="bw-h1">New vendor</h1>
        <p class="bw-muted" style="margin: 0 0 var(--s-5)">Vendors are created by staff only. Vendors cannot self-onboard.</p>

        <form class="bw-stack" @submit.prevent="submit">
          <div class="bw-card" style="background: var(--surface-2); border: none; padding: var(--s-4)">
            <h2 class="bw-h2">Business</h2>
            <div class="bw-stack">
              <div>
                <label class="bw-label">Legal name *</label>
                <input class="bw-input" v-model="form.legalName" required />
              </div>
              <div class="bw-row" style="gap: var(--s-3); align-items: flex-start">
                <div style="flex: 1">
                  <label class="bw-label">Trading name</label>
                  <input class="bw-input" v-model="form.tradingName" />
                </div>
                <div style="flex: 1">
                  <label class="bw-label">Business type</label>
                  <input class="bw-input" v-model="form.businessType" placeholder="Retail" />
                </div>
              </div>
              <div class="bw-row" style="gap: var(--s-3); align-items: flex-start">
                <div style="flex: 1">
                  <label class="bw-label">CAC</label>
                  <input class="bw-input bw-mono" v-model="form.cacNumber" />
                </div>
                <div style="flex: 1">
                  <label class="bw-label">TIN</label>
                  <input class="bw-input bw-mono" v-model="form.tin" />
                </div>
              </div>
              <div>
                <label class="bw-label">Operating address</label>
                <input class="bw-input" v-model="form.operatingAddress" />
              </div>
              <div>
                <label class="bw-label">Operating stations (comma-separated)</label>
                <input class="bw-input bw-mono" v-model="form.operatingStations" placeholder="TUNGA, UMAISHA" />
              </div>
            </div>
          </div>

          <div class="bw-card" style="background: var(--surface-2); border: none; padding: var(--s-4)">
            <h2 class="bw-h2">Primary contact (vendor manager)</h2>
            <div class="bw-stack">
              <div>
                <label class="bw-label">Full name *</label>
                <input class="bw-input" v-model="form.primaryUserFullName" required />
              </div>
              <div class="bw-row" style="gap: var(--s-3); align-items: flex-start">
                <div style="flex: 1">
                  <label class="bw-label">Email *</label>
                  <input class="bw-input" type="email" v-model="form.primaryUserEmail" required />
                </div>
                <div style="flex: 1">
                  <label class="bw-label">Phone</label>
                  <input class="bw-input bw-mono" type="tel" v-model="form.primaryUserPhone" />
                </div>
              </div>
              <div class="bw-row" style="gap: var(--s-3); align-items: flex-start">
                <div style="flex: 1">
                  <label class="bw-label">Business email</label>
                  <input class="bw-input" type="email" v-model="form.contactEmail" required />
                </div>
                <div style="flex: 1">
                  <label class="bw-label">Business phone</label>
                  <input class="bw-input bw-mono" type="tel" v-model="form.contactPhone" required />
                </div>
              </div>
            </div>
          </div>

          <div class="bw-card" style="background: var(--surface-2); border: none; padding: var(--s-4)">
            <h2 class="bw-h2">Limits</h2>
            <label class="bw-label">Daily debit cap (₦)</label>
            <input class="bw-input bw-mono" type="number" v-model.number="form.dailyLimitNaira" min="1000" step="10000" />
            <p class="bw-muted" style="font-size: var(--t-xs); margin-top: 6px">Vendor cannot vend more than this in a 24-hour window.</p>
          </div>

          <p v-if="error" class="bw-alert danger">{{ error }}</p>

          <div class="bw-row" style="gap: var(--s-2)">
            <button type="button" class="bw-btn" @click="router.back()">Cancel</button>
            <span class="bw-spacer"></span>
            <button class="bw-btn primary" type="submit" :disabled="loading">
              {{ loading ? 'Creating…' : 'Create vendor' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </AppShell>
</template>
