<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../lib/api';
import AppShell from '../components/AppShell.vue';

interface SandboxStatus {
  mode: 'live' | 'test';
  test_wallets_seeded: number;
  mock_vends_run: number;
  last_activity: string | null;
}

interface ActivityEntry {
  id: string;
  action: string;
  detail: string;
  actor: string;
  ts: string;
}

const status   = ref<SandboxStatus | null>(null);
const activity = ref<ActivityEntry[]>([]);
const loading  = ref(false);
const error    = ref('');
const toggling = ref(false);
const seeding  = ref(false);
const seedErr  = ref('');
const mockErr  = ref('');
const mocking  = ref(false);
const seedLog  = ref<string | null>(null);
const mockLog  = ref<string | null>(null);

const seedForm = ref({ org_id: '', org_type: 'vendor' as 'vendor' | 'customer', amount_naira: 10000 });
const mockForm = ref({ meter_number: '', amount_naira: 1000, mock_response: 'success' as 'success' | 'disco_error' | 'timeout' | 'invalid_meter' });

async function load() {
  loading.value = true; error.value = '';
  try {
    const [s, a] = await Promise.all([
      api.get<SandboxStatus>('/api/v1/admin/dev/sandbox/status'),
      api.get<{ activity: ActivityEntry[] }>('/api/v1/admin/dev/sandbox/activity'),
    ]);
    status.value = s;
    activity.value = a.activity ?? [];
  } catch (e: any) { error.value = e.message ?? 'Failed to load'; }
  finally { loading.value = false; }
}

async function toggleMode() {
  if (!status.value) return;
  const next = status.value.mode === 'live' ? 'test' : 'live';
  if (next === 'live' && !confirm('Switch to LIVE mode? Real transactions will be processed.')) return;
  toggling.value = true;
  try {
    await api.post('/api/v1/admin/dev/sandbox/mode', { mode: next });
    await load();
  } catch (e: any) { error.value = e.message ?? 'Failed to switch mode'; }
  finally { toggling.value = false; }
}

async function seedWallet() {
  seedErr.value = ''; seedLog.value = null;
  if (!seedForm.value.org_id.trim()) { seedErr.value = 'Org ID is required.'; return; }
  if (seedForm.value.amount_naira < 1) { seedErr.value = 'Amount must be at least ₦1.'; return; }
  seeding.value = true;
  try {
    const r = await api.post<{ wallet_id: string; new_balance_kobo: number }>('/api/v1/admin/dev/sandbox/seed-wallet', {
      org_id: seedForm.value.org_id.trim(),
      org_type: seedForm.value.org_type,
      amount_kobo: seedForm.value.amount_naira * 100,
    });
    seedLog.value = `✓ Seeded ${naira(r.new_balance_kobo)} → wallet ${r.wallet_id}`;
    await load();
  } catch (e: any) { seedErr.value = e.message ?? 'Failed to seed'; }
  finally { seeding.value = false; }
}

async function mockVend() {
  mockErr.value = ''; mockLog.value = null;
  if (!mockForm.value.meter_number.trim()) { mockErr.value = 'Meter number is required.'; return; }
  mocking.value = true;
  try {
    const r = await api.post<{ raw_response: any; vend_id: string }>('/api/v1/admin/dev/sandbox/mock-vend', {
      meter_number: mockForm.value.meter_number.trim(),
      amount_kobo: mockForm.value.amount_naira * 100,
      mock_response: mockForm.value.mock_response,
    });
    mockLog.value = JSON.stringify(r.raw_response, null, 2);
  } catch (e: any) { mockErr.value = e.message ?? 'Vend failed'; }
  finally { mocking.value = false; }
}

function naira(kobo: number) {
  return '₦' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
}
function fmt(s: string | null) {
  return s ? new Date(s).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

onMounted(load);
</script>

<template>
  <AppShell title="Sandbox Environment">
    <div v-if="loading && !status" class="bw-loading">Loading…</div>
    <div v-if="error" class="bw-error-banner" style="margin-bottom:var(--s-3)">{{ error }}</div>

    <div v-if="status">
      <!-- Mode banner -->
      <div :class="['mode-banner', status.mode === 'test' ? 'mode-test' : 'mode-live']">
        <div class="mode-indicator">
          <span class="mode-dot" />
          <strong>{{ status.mode === 'test' ? 'TEST MODE' : 'LIVE MODE' }}</strong>
        </div>
        <p class="mode-desc">
          <span v-if="status.mode === 'test'">No real transactions. All vends and wallet operations are simulated. Safe to experiment.</span>
          <span v-else>Real mode — actual Paystack charges, real disco API calls, production data.</span>
        </p>
        <button class="bw-btn bw-btn-ghost bw-btn-sm" :disabled="toggling" @click="toggleMode">
          {{ toggling ? 'Switching…' : (status.mode === 'test' ? '→ Switch to Live' : '→ Switch to Test') }}
        </button>
      </div>

      <!-- Stats row -->
      <div class="sandbox-kpis">
        <div class="bw-kpi">
          <span class="bw-kpi-label">Test Wallets Seeded</span>
          <span class="bw-kpi-val">{{ status.test_wallets_seeded }}</span>
        </div>
        <div class="bw-kpi">
          <span class="bw-kpi-label">Mock Vends Run</span>
          <span class="bw-kpi-val">{{ status.mock_vends_run }}</span>
        </div>
        <div class="bw-kpi">
          <span class="bw-kpi-label">Last Activity</span>
          <span class="bw-kpi-val bw-text-sm">{{ fmt(status.last_activity) }}</span>
        </div>
      </div>

      <div class="sandbox-tools">
        <!-- Seed wallet -->
        <div class="sandbox-card">
          <div class="sandbox-card-hd">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6h20v14H2zM2 10h20M16 14h2"/></svg>
            <h3>Seed Test Wallet</h3>
          </div>
          <p class="sandbox-card-desc">Add fake float to a vendor or customer wallet in test mode. No real money moves.</p>
          <div class="bw-form-group">
            <label class="bw-label">Org ID</label>
            <input v-model="seedForm.org_id" class="bw-input bw-mono" placeholder="vendor_xxxx or customer_xxxx" />
          </div>
          <div class="form-row">
            <div class="bw-form-group">
              <label class="bw-label">Org Type</label>
              <select v-model="seedForm.org_type" class="bw-select">
                <option value="vendor">Vendor</option>
                <option value="customer">Customer</option>
              </select>
            </div>
            <div class="bw-form-group">
              <label class="bw-label">Amount (₦)</label>
              <input v-model.number="seedForm.amount_naira" type="number" min="1" class="bw-input" />
            </div>
          </div>
          <div v-if="seedErr" class="bw-error-banner" style="margin-bottom:var(--s-2)">{{ seedErr }}</div>
          <div v-if="seedLog" class="seed-log">{{ seedLog }}</div>
          <button class="bw-btn bw-btn-primary" :disabled="seeding || status.mode === 'live'" @click="seedWallet">
            {{ seeding ? 'Seeding…' : `Seed ₦${seedForm.amount_naira.toLocaleString()}` }}
          </button>
          <p v-if="status.mode === 'live'" class="bw-text-muted bw-text-sm" style="margin-top:var(--s-1)">Switch to Test mode to seed wallets.</p>
        </div>

        <!-- Mock vend -->
        <div class="sandbox-card">
          <div class="sandbox-card-hd">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            <h3>Mock Meter Vend</h3>
          </div>
          <p class="sandbox-card-desc">Trigger a simulated vend against a meter number. Inspects the raw disco API response without deducting wallet float.</p>
          <div class="bw-form-group">
            <label class="bw-label">Meter Number</label>
            <input v-model="mockForm.meter_number" class="bw-input bw-mono" placeholder="04123456789" />
          </div>
          <div class="form-row">
            <div class="bw-form-group">
              <label class="bw-label">Amount (₦)</label>
              <input v-model.number="mockForm.amount_naira" type="number" min="100" class="bw-input" />
            </div>
            <div class="bw-form-group">
              <label class="bw-label">Simulated Response</label>
              <select v-model="mockForm.mock_response" class="bw-select">
                <option value="success">Success</option>
                <option value="disco_error">Disco Error</option>
                <option value="timeout">Timeout</option>
                <option value="invalid_meter">Invalid Meter</option>
              </select>
            </div>
          </div>
          <div v-if="mockErr" class="bw-error-banner" style="margin-bottom:var(--s-2)">{{ mockErr }}</div>
          <button class="bw-btn bw-btn-primary" :disabled="mocking" @click="mockVend" style="margin-bottom:var(--s-2)">
            {{ mocking ? 'Running…' : 'Run Mock Vend' }}
          </button>
          <div v-if="mockLog">
            <div class="inspect-label">Raw Disco Response</div>
            <pre class="code-block">{{ mockLog }}</pre>
          </div>
        </div>
      </div>

      <!-- Activity log -->
      <h3 class="section-hd">Recent Sandbox Activity</h3>
      <div class="bw-table-wrapper">
        <table class="bw-table">
          <thead><tr><th>Action</th><th>Detail</th><th>Actor</th><th>Time</th></tr></thead>
          <tbody>
            <tr v-for="a in activity" :key="a.id">
              <td class="bw-text-sm"><span class="action-chip">{{ a.action }}</span></td>
              <td class="bw-text-sm">{{ a.detail }}</td>
              <td class="bw-mono bw-text-sm">{{ a.actor }}</td>
              <td class="bw-text-sm">{{ fmt(a.ts) }}</td>
            </tr>
            <tr v-if="!activity.length"><td colspan="4" class="bw-empty">No sandbox activity yet.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.mode-banner {
  border-radius: var(--r-lg); padding: var(--s-4); margin-bottom: var(--s-4);
  display: flex; flex-direction: column; gap: var(--s-2);
}
.mode-test { background: oklch(from var(--brand) l c h / 0.08); border: 1px solid oklch(from var(--brand) l c h / 0.25); }
.mode-live { background: oklch(from var(--warn, oklch(78% 0.16 75)) l c h / 0.08); border: 1px solid oklch(from var(--warn, oklch(78% 0.16 75)) l c h / 0.30); }
.mode-indicator { display: flex; align-items: center; gap: var(--s-2); }
.mode-dot {
  width: 10px; height: 10px; border-radius: 50%;
  .mode-test & { background: var(--brand); box-shadow: 0 0 0 3px oklch(from var(--brand) l c h / 0.25); }
  .mode-live & { background: oklch(78% 0.16 75); box-shadow: 0 0 0 3px oklch(78% 0.16 75 / 0.25); }
}
.mode-indicator strong { font-size: var(--t-md); letter-spacing: 0.05em; }
.mode-desc { margin: 0; font-size: var(--t-sm); color: var(--text-2); }

.sandbox-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--s-3); margin-bottom: var(--s-5); }

.sandbox-tools { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-4); margin-bottom: var(--s-5); }
@media (max-width: 720px) { .sandbox-tools { grid-template-columns: 1fr; } }

.sandbox-card {
  background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: var(--r-xl); padding: var(--s-4);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
  display: flex; flex-direction: column; gap: var(--s-3);
}
.sandbox-card-hd { display: flex; align-items: center; gap: var(--s-2); }
.sandbox-card-hd h3 { margin: 0; font-size: var(--t-md); }
.sandbox-card-desc { margin: 0; font-size: var(--t-sm); color: var(--text-2); }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
.seed-log {
  font-family: var(--font-mono); font-size: var(--t-sm); color: var(--brand);
  background: oklch(from var(--brand) l c h / 0.08); border: 1px solid oklch(from var(--brand) l c h / 0.2);
  border-radius: var(--r-md); padding: var(--s-2) var(--s-3);
}
.code-block {
  background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: var(--r-md);
  padding: var(--s-3); font-family: var(--font-mono); font-size: 11px; line-height: 1.6;
  overflow: auto; max-height: 280px; white-space: pre; color: var(--text);
}
.inspect-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: var(--s-1); }
.action-chip {
  font-family: var(--font-mono); font-size: 10px; padding: 2px 7px;
  background: var(--glass-bg-strong); border: 1px solid var(--glass-border);
  border-radius: var(--r-sm); color: var(--text);
}
.section-hd { font-size: var(--t-md); font-weight: 700; margin: 0 0 var(--s-3); }
</style>
