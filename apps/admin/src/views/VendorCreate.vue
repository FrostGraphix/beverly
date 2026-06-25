<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import Stepper from '../components/Stepper.vue';
import { api } from '../lib/api';

const route = useRoute();
const router = useRouter();

const STEPS = [
    { key: 'business', label: 'Business', description: 'Legal & trading info' },
    { key: 'contact',  label: 'Contact',  description: 'Primary user' },
    { key: 'limits',   label: 'Limits',   description: 'Spend caps' },
    { key: 'review',   label: 'Review',   description: 'Confirm details' },
];

const currentIndex = ref(0);

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

const fieldErrors = ref<Record<string, string>>({});
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

// ─ Per-step validation ─────────────────────────────────────────────
function validateStep(index: number): boolean {
    fieldErrors.value = {};
    const errs: Record<string, string> = {};

    if (index === 0) {
        if (!form.value.legalName.trim()) errs.legalName = 'Legal name is required.';
        if (form.value.legalName.trim().length > 0 && form.value.legalName.trim().length < 2) {
            errs.legalName = 'Legal name must be at least 2 characters.';
        }
        if (form.value.cacNumber && !/^[A-Za-z0-9-]{3,20}$/.test(form.value.cacNumber)) {
            errs.cacNumber = 'CAC looks invalid (3–20 letters/digits).';
        }
        if (form.value.tin && !/^[A-Za-z0-9-]{3,20}$/.test(form.value.tin)) {
            errs.tin = 'TIN looks invalid (3–20 letters/digits).';
        }
    }

    if (index === 1) {
        if (!form.value.primaryUserFullName.trim()) errs.primaryUserFullName = 'Full name is required.';
        if (!form.value.primaryUserEmail.trim()) errs.primaryUserEmail = 'Email is required.';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.primaryUserEmail.trim())) {
            errs.primaryUserEmail = 'Invalid email address.';
        }
        if (!form.value.contactEmail.trim()) errs.contactEmail = 'Business email is required.';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.contactEmail.trim())) {
            errs.contactEmail = 'Invalid business email.';
        }
        if (!form.value.contactPhone.trim()) errs.contactPhone = 'Business phone is required.';
        else if (form.value.contactPhone.replace(/\D/g, '').length < 10) {
            errs.contactPhone = 'Phone must be at least 10 digits.';
        }
        if (form.value.primaryUserPhone && form.value.primaryUserPhone.replace(/\D/g, '').length < 10) {
            errs.primaryUserPhone = 'Phone must be at least 10 digits.';
        }
    }

    if (index === 2) {
        if (!form.value.dailyLimitNaira || form.value.dailyLimitNaira < 1000) {
            errs.dailyLimitNaira = 'Daily cap must be at least ₦1,000.';
        }
        if (form.value.dailyLimitNaira > 100_000_000) {
            errs.dailyLimitNaira = 'Daily cap above ₦100M needs CTO approval — set lower.';
        }
    }

    fieldErrors.value = errs;
    return Object.keys(errs).length === 0;
}

function next() {
    if (validateStep(currentIndex.value)) {
        currentIndex.value = Math.min(STEPS.length - 1, currentIndex.value + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function prev() {
    error.value = null;
    fieldErrors.value = {};
    currentIndex.value = Math.max(0, currentIndex.value - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goToStep(i: number) {
    if (i < currentIndex.value) {
        currentIndex.value = i;
        error.value = null;
        fieldErrors.value = {};
    }
}

// ─ Submit ──────────────────────────────────────────────────────────
async function submit() {
    // Re-run all step validations
    for (let i = 0; i < STEPS.length - 1; i++) {
        if (!validateStep(i)) {
            currentIndex.value = i;
            return;
        }
    }

    loading.value = true;
    error.value = null;
    try {
        const payload = {
            legalName: form.value.legalName.trim(),
            tradingName: form.value.tradingName.trim() || undefined,
            cacNumber: form.value.cacNumber.trim() || undefined,
            tin: form.value.tin.trim() || undefined,
            businessType: form.value.businessType.trim() || undefined,
            contactEmail: form.value.contactEmail.trim(),
            contactPhone: form.value.contactPhone.trim(),
            operatingAddress: form.value.operatingAddress.trim() || undefined,
            operatingStations: form.value.operatingStations
                ? form.value.operatingStations.split(',').map((s) => s.trim()).filter(Boolean)
                : undefined,
            primaryUserFullName: form.value.primaryUserFullName.trim(),
            primaryUserEmail: form.value.primaryUserEmail.trim(),
            primaryUserPhone: form.value.primaryUserPhone.trim() || undefined,
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

const dailyLimitFmt = computed(() =>
    '₦' + form.value.dailyLimitNaira.toLocaleString('en-NG'),
);
</script>

<template>
  <AppShell title="Create Vendor">
    <div class="page-container">

      <!-- ── SUCCESS ───────────────────────────────────────────────── -->
      <div v-if="result" class="bw-stack">
        <div class="bw-card success-card">
          <p class="bw-label" style="color: var(--brand)">✓ Vendor created</p>
          <h1 class="bw-h1">{{ form.legalName }}</h1>
          <p class="bw-muted">Organization ID <span class="bw-mono">#{{ result.organizationId.slice(0, 8) }}</span></p>
        </div>

        <div class="bw-card password-card">
          <p class="bw-label" style="color: var(--warn)">⚠ Temporary password — shown ONCE</p>
          <p class="bw-mono temp-password">{{ result.temporaryPassword }}</p>
          <p class="bw-muted" style="font-size: var(--t-sm)">
            Hand-deliver via your approved secure channel. The vendor will be forced to change it on first login.
            This page will <strong>not</strong> show this password again.
          </p>
          <button class="bw-btn primary" style="margin-top: var(--s-3)" @click="copyPassword">
            {{ copied ? 'Copied ✓' : 'Copy password' }}
          </button>
        </div>

        <div class="bw-card">
          <h2 class="bw-h2">Next steps</h2>
          <ol class="next-steps">
            <li>Send credentials via approved channel (encrypted email or in-person).</li>
            <li>Vendor logs in at <span class="bw-mono">vendor.beverly.acoblighting.com</span>.</li>
            <li>Vendor changes password and sets up 2FA.</li>
            <li>Vendor begins funding + vending.</li>
          </ol>
          <div class="action-row">
            <button class="bw-btn" @click="router.push('/vendors')">Done</button>
            <button class="bw-btn primary" @click="result = null; currentIndex = 0">Create another</button>
          </div>
        </div>
      </div>

      <!-- ── FORM ──────────────────────────────────────────────────── -->
      <div v-else class="bw-card form-card">
        <h1 class="bw-h1">New vendor</h1>
        <p class="bw-muted form-subtitle">
          Vendors are created by staff only. Vendors cannot self-onboard.
        </p>

        <!-- Stepper -->
        <Stepper :steps="STEPS" :current-index="currentIndex" />

        <!-- ── STEP 0: Business ─────────────────────────────────── -->
        <section v-if="currentIndex === 0" class="step-pane">
          <div>
            <label class="bw-label">Legal name *</label>
            <input
              class="bw-input"
              :class="{ 'has-error': fieldErrors.legalName }"
              v-model="form.legalName"
              placeholder="Acob Lighting Ltd"
            />
            <p v-if="fieldErrors.legalName" class="field-error">{{ fieldErrors.legalName }}</p>
          </div>

          <div class="row">
            <div class="col">
              <label class="bw-label">Trading name</label>
              <input class="bw-input" v-model="form.tradingName" placeholder="Acob Lighting" />
            </div>
            <div class="col">
              <label class="bw-label">Business type</label>
              <input class="bw-input" v-model="form.businessType" placeholder="Retail · Wholesale · …" />
            </div>
          </div>

          <div class="row">
            <div class="col">
              <label class="bw-label">CAC number</label>
              <input class="bw-input bw-mono" :class="{ 'has-error': fieldErrors.cacNumber }" v-model="form.cacNumber" placeholder="RC123456" />
              <p v-if="fieldErrors.cacNumber" class="field-error">{{ fieldErrors.cacNumber }}</p>
            </div>
            <div class="col">
              <label class="bw-label">TIN</label>
              <input class="bw-input bw-mono" :class="{ 'has-error': fieldErrors.tin }" v-model="form.tin" placeholder="00000000-0001" />
              <p v-if="fieldErrors.tin" class="field-error">{{ fieldErrors.tin }}</p>
            </div>
          </div>

          <div>
            <label class="bw-label">Operating address</label>
            <input class="bw-input" v-model="form.operatingAddress" placeholder="123 Marina St, Lagos" />
          </div>

          <div>
            <label class="bw-label">Operating stations (comma-separated)</label>
            <input class="bw-input bw-mono" v-model="form.operatingStations" placeholder="TUNGA, UMAISHA, KARSHI" />
            <p class="field-hint">Station codes this vendor will sell tokens for.</p>
          </div>
        </section>

        <!-- ── STEP 1: Contact ─────────────────────────────────── -->
        <section v-if="currentIndex === 1" class="step-pane">
          <div class="info-callout">
            The primary user receives the temporary password and becomes the vendor's manager account.
          </div>

          <div>
            <label class="bw-label">Primary user · Full name *</label>
            <input class="bw-input" :class="{ 'has-error': fieldErrors.primaryUserFullName }" v-model="form.primaryUserFullName" placeholder="Amaka Obi" />
            <p v-if="fieldErrors.primaryUserFullName" class="field-error">{{ fieldErrors.primaryUserFullName }}</p>
          </div>

          <div class="row">
            <div class="col">
              <label class="bw-label">Primary user · Email *</label>
              <input class="bw-input" type="email" :class="{ 'has-error': fieldErrors.primaryUserEmail }" v-model="form.primaryUserEmail" placeholder="user@vendor.com" />
              <p v-if="fieldErrors.primaryUserEmail" class="field-error">{{ fieldErrors.primaryUserEmail }}</p>
            </div>
            <div class="col">
              <label class="bw-label">Primary user · Phone</label>
              <input class="bw-input bw-mono" type="tel" :class="{ 'has-error': fieldErrors.primaryUserPhone }" v-model="form.primaryUserPhone" placeholder="+2348012345678" />
              <p v-if="fieldErrors.primaryUserPhone" class="field-error">{{ fieldErrors.primaryUserPhone }}</p>
            </div>
          </div>

          <div class="row">
            <div class="col">
              <label class="bw-label">Business email *</label>
              <input class="bw-input" type="email" :class="{ 'has-error': fieldErrors.contactEmail }" v-model="form.contactEmail" placeholder="ops@vendor.com" />
              <p v-if="fieldErrors.contactEmail" class="field-error">{{ fieldErrors.contactEmail }}</p>
            </div>
            <div class="col">
              <label class="bw-label">Business phone *</label>
              <input class="bw-input bw-mono" type="tel" :class="{ 'has-error': fieldErrors.contactPhone }" v-model="form.contactPhone" placeholder="+2348000000000" />
              <p v-if="fieldErrors.contactPhone" class="field-error">{{ fieldErrors.contactPhone }}</p>
            </div>
          </div>
        </section>

        <!-- ── STEP 2: Limits ──────────────────────────────────── -->
        <section v-if="currentIndex === 2" class="step-pane">
          <div>
            <label class="bw-label">Daily debit cap (₦) *</label>
            <input class="bw-input bw-mono" :class="{ 'has-error': fieldErrors.dailyLimitNaira }" type="number" v-model.number="form.dailyLimitNaira" min="1000" step="10000" />
            <p v-if="fieldErrors.dailyLimitNaira" class="field-error">{{ fieldErrors.dailyLimitNaira }}</p>
            <p class="field-hint">
              Vendor cannot vend more than this in a 24-hour rolling window.
              Currently set to <strong>{{ dailyLimitFmt }}</strong>.
            </p>
          </div>

          <div class="limit-presets">
            <button type="button" class="preset-chip" :class="{ active: form.dailyLimitNaira === 1_000_000 }" @click="form.dailyLimitNaira = 1_000_000">₦1M</button>
            <button type="button" class="preset-chip" :class="{ active: form.dailyLimitNaira === 5_000_000 }" @click="form.dailyLimitNaira = 5_000_000">₦5M</button>
            <button type="button" class="preset-chip" :class="{ active: form.dailyLimitNaira === 10_000_000 }" @click="form.dailyLimitNaira = 10_000_000">₦10M</button>
            <button type="button" class="preset-chip" :class="{ active: form.dailyLimitNaira === 50_000_000 }" @click="form.dailyLimitNaira = 50_000_000">₦50M</button>
            <button type="button" class="preset-chip" :class="{ active: form.dailyLimitNaira === 100_000_000 }" @click="form.dailyLimitNaira = 100_000_000">₦100M</button>
          </div>
        </section>

        <!-- ── STEP 3: Review ──────────────────────────────────── -->
        <section v-if="currentIndex === 3" class="step-pane">
          <div class="review-grid">
            <div class="review-section">
              <div class="review-section-head">
                <h3>Business</h3>
                <button type="button" class="review-edit" @click="goToStep(0)">Edit</button>
              </div>
              <dl class="review-dl">
                <dt>Legal name</dt><dd>{{ form.legalName || '—' }}</dd>
                <dt>Trading name</dt><dd>{{ form.tradingName || '—' }}</dd>
                <dt>Business type</dt><dd>{{ form.businessType || '—' }}</dd>
                <dt>CAC</dt><dd class="bw-mono">{{ form.cacNumber || '—' }}</dd>
                <dt>TIN</dt><dd class="bw-mono">{{ form.tin || '—' }}</dd>
                <dt>Address</dt><dd>{{ form.operatingAddress || '—' }}</dd>
                <dt>Stations</dt><dd class="bw-mono">{{ form.operatingStations || '—' }}</dd>
              </dl>
            </div>

            <div class="review-section">
              <div class="review-section-head">
                <h3>Primary contact</h3>
                <button type="button" class="review-edit" @click="goToStep(1)">Edit</button>
              </div>
              <dl class="review-dl">
                <dt>Full name</dt><dd>{{ form.primaryUserFullName }}</dd>
                <dt>Email</dt><dd>{{ form.primaryUserEmail }}</dd>
                <dt>Phone</dt><dd class="bw-mono">{{ form.primaryUserPhone || '—' }}</dd>
                <dt>Business email</dt><dd>{{ form.contactEmail }}</dd>
                <dt>Business phone</dt><dd class="bw-mono">{{ form.contactPhone }}</dd>
              </dl>
            </div>

            <div class="review-section">
              <div class="review-section-head">
                <h3>Limits</h3>
                <button type="button" class="review-edit" @click="goToStep(2)">Edit</button>
              </div>
              <dl class="review-dl">
                <dt>Daily cap</dt><dd>{{ dailyLimitFmt }}</dd>
              </dl>
            </div>
          </div>

          <div class="review-warning">
            <strong>This is final.</strong> Creating this vendor will provision their wallet
            and issue a one-time password. Double-check the email — it cannot be changed without admin intervention.
          </div>
        </section>

        <!-- Global error -->
        <p v-if="error" class="bw-alert danger" style="margin-top: var(--s-4)">{{ error }}</p>

        <!-- Nav -->
        <div class="nav-row">
          <button v-if="currentIndex > 0" type="button" class="bw-btn" :disabled="loading" @click="prev">
            ← Back
          </button>
          <button v-else type="button" class="bw-btn" @click="router.back()">Cancel</button>

          <span class="bw-spacer" />
          <span class="step-counter">Step {{ currentIndex + 1 }} of {{ STEPS.length }}</span>

          <button v-if="currentIndex < STEPS.length - 1" type="button" class="bw-btn primary" @click="next">
            Continue →
          </button>
          <button v-else type="button" class="bw-btn primary" :disabled="loading" @click="submit">
            {{ loading ? 'Creating…' : 'Create vendor' }}
          </button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.page-container { max-width: 720px; margin: 0 auto; }

.form-card { padding: var(--s-6); }
.form-subtitle { margin: 0 0 var(--s-5); }

.step-pane {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
  animation: fadeIn 0.25s var(--ease-out);
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s-3);
}
.col { display: flex; flex-direction: column; }

.field-hint {
  font-size: var(--t-xs);
  color: var(--text-muted);
  margin: 6px 0 0;
}

.field-error {
  font-size: var(--t-xs);
  color: var(--danger);
  margin: 4px 0 0;
  font-weight: 500;
}

.has-error { border-color: var(--danger) !important; box-shadow: 0 0 0 2px oklch(from var(--danger) l c h / 0.15) !important; }

.info-callout {
  padding: var(--s-3) var(--s-4);
  background: oklch(from var(--info) l c h / 0.06);
  border: 1px solid oklch(from var(--info) l c h / 0.25);
  border-radius: var(--r-md);
  color: var(--text-dim);
  font-size: var(--t-sm);
  line-height: 1.5;
}

/* Preset chips */
.limit-presets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}
.preset-chip {
  padding: 8px 14px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-dim);
  font-size: var(--t-sm);
  font-weight: 600;
  font-family: var(--font-mono);
  cursor: pointer;
  transition: all var(--dur-fast);
}
.preset-chip:hover { border-color: var(--brand); color: var(--brand); }
.preset-chip.active {
  border-color: var(--brand);
  background: oklch(70% 0.19 145 / 0.10);
  color: var(--brand);
}

/* Review */
.review-grid {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}
.review-section {
  padding: var(--s-4);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.review-section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--s-3);
}
.review-section-head h3 {
  margin: 0;
  font-size: var(--t-md);
  font-weight: 700;
  color: var(--text);
}
.review-edit {
  background: none;
  border: none;
  color: var(--brand);
  font-weight: 600;
  font-size: var(--t-sm);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--r-sm);
}
.review-edit:hover { background: oklch(70% 0.19 145 / 0.08); }

.review-dl {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: 8px 16px;
  margin: 0;
  font-size: var(--t-sm);
}
.review-dl dt { color: var(--text-muted); font-weight: 500; }
.review-dl dd { color: var(--text); margin: 0; word-break: break-word; }

.review-warning {
  margin-top: var(--s-4);
  padding: var(--s-3) var(--s-4);
  background: oklch(from var(--warn) l c h / 0.07);
  border: 1px solid oklch(from var(--warn) l c h / 0.30);
  border-radius: var(--r-md);
  color: var(--text-dim);
  font-size: var(--t-sm);
  line-height: 1.5;
}

/* Nav row */
.nav-row {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin-top: var(--s-6);
  padding-top: var(--s-4);
  border-top: 1px solid var(--border);
}
.step-counter {
  font-size: var(--t-xs);
  color: var(--text-muted);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* Success state */
.success-card {
  background: linear-gradient(135deg, oklch(70% 0.19 145 / 0.10), transparent);
  border-color: oklch(70% 0.19 145 / 0.25);
}
.password-card {
  border-color: oklch(78% 0.16 75 / 0.40);
  background: oklch(78% 0.16 75 / 0.05);
}
.temp-password {
  font-size: var(--t-2xl);
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: var(--s-3) 0;
  word-break: break-all;
  color: var(--warn);
}
.next-steps {
  color: var(--text-dim);
  font-size: var(--t-sm);
  padding-left: var(--s-5);
  line-height: 1.8;
  margin: var(--s-3) 0;
}
.action-row {
  display: flex;
  gap: var(--s-2);
  margin-top: var(--s-4);
}

/* Mobile */
@media (max-width: 640px) {
  .form-card { padding: var(--s-4); }
  .row { grid-template-columns: 1fr; }
  .review-dl { grid-template-columns: 1fr; gap: 2px 0; }
  .review-dl dt { margin-top: var(--s-2); font-size: var(--t-xs); }
  .nav-row { flex-wrap: wrap; }
  .step-counter { width: 100%; text-align: center; order: -1; }
}
</style>
