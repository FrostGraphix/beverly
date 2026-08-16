<script setup lang="ts">
import { ref } from 'vue';
import { api } from '../lib/api';
import AppShell from '../components/AppShell.vue';

/* ── Vend Simulator ── */
interface VendResult {
  vend_id: string;
  meter_number: string;
  amount_kobo: number;
  status: string;
  raw_response: any;
  duration_ms: number;
}

/* ── EIH Inspector ── */
interface RuleFiring {
  rule_id: string;
  rule_name: string;
  fired: boolean;
  score_contribution: number;
  reason: string;
}
interface EihResult {
  transaction_id: string;
  total_score: number;
  decision: 'pass' | 'block' | 'review';
  rules: RuleFiring[];
  evaluated_at: string;
}

/* ── Ledger Inspector ── */
interface LedgerEntry {
  id: string;
  wallet_id: string;
  direction: 'credit' | 'debit';
  amount_kobo: number;
  running_balance_kobo: number;
  entry_type: string;
  reference: string | null;
  created_at: string;
  raw_row: Record<string, any>;
  related_transaction: Record<string, any> | null;
  triggered_by: string | null;
}

/* ── Migrations ── */
interface Migration {
  version: string;
  name: string;
  status: 'applied' | 'pending';
  applied_at: string | null;
  checksum: string;
}

const tab = ref<'vend' | 'eih' | 'ledger' | 'migrations'>('vend');

// --- Vend Simulator ---
const vendMeter    = ref('');
const vendAmount   = ref(500);
const vendEnv      = ref<'test' | 'live'>('test');
const vendRunning  = ref(false);
const vendResult   = ref<VendResult | null>(null);
const vendError    = ref('');

async function runVend() {
  vendError.value = ''; vendResult.value = null;
  if (!vendMeter.value.trim()) { vendError.value = 'Meter number is required.'; return; }
  vendRunning.value = true;
  try {
    const r = await api.post<VendResult>('/api/v1/admin/dev/toolkit/simulate-vend', {
      meter_number: vendMeter.value.trim(),
      amount_kobo: vendAmount.value * 100,
      environment: vendEnv.value,
    });
    vendResult.value = r;
  } catch (e: any) { vendError.value = e.message ?? 'Simulation failed'; }
  finally { vendRunning.value = false; }
}

// --- EIH Inspector ---
const eihTxId      = ref('');
const eihRunning   = ref(false);
const eihResult    = ref<EihResult | null>(null);
const eihError     = ref('');

async function runEih() {
  eihError.value = ''; eihResult.value = null;
  if (!eihTxId.value.trim()) { eihError.value = 'Transaction ID is required.'; return; }
  eihRunning.value = true;
  try {
    const r = await api.post<EihResult>('/api/v1/admin/dev/toolkit/eih-inspect', {
      transaction_id: eihTxId.value.trim(),
    });
    eihResult.value = r;
  } catch (e: any) { eihError.value = e.message ?? 'Inspection failed'; }
  finally { eihRunning.value = false; }
}

// --- Ledger Inspector ---
const ledgerEntryId  = ref('');
const ledgerRunning  = ref(false);
const ledgerResult   = ref<LedgerEntry | null>(null);
const ledgerError    = ref('');

async function runLedger() {
  ledgerError.value = ''; ledgerResult.value = null;
  if (!ledgerEntryId.value.trim()) { ledgerError.value = 'Entry ID is required.'; return; }
  ledgerRunning.value = true;
  try {
    const r = await api.get<LedgerEntry>(`/api/v1/admin/dev/toolkit/ledger/${encodeURIComponent(ledgerEntryId.value.trim())}`);
    ledgerResult.value = r;
  } catch (e: any) { ledgerError.value = e.message ?? 'Lookup failed'; }
  finally { ledgerRunning.value = false; }
}

// --- Migrations ---
const migrations     = ref<Migration[]>([]);
const migsLoading    = ref(false);
const migsError      = ref('');
const runningMig     = ref<string | null>(null);
const dryRunResult   = ref<{ output: string; version: string } | null>(null);

async function loadMigrations() {
  migsLoading.value = true; migsError.value = '';
  try {
    const r = await api.get<{ migrations: Migration[] }>('/api/v1/admin/dev/migrations');
    migrations.value = r.migrations ?? [];
  } catch (e: any) { migsError.value = e.message ?? 'Failed to load'; }
  finally { migsLoading.value = false; }
}

async function dryRun(version: string) {
  runningMig.value = version; dryRunResult.value = null; migsError.value = '';
  try {
    const r = await api.post<{ output: string; version: string }>('/api/v1/admin/dev/migrations/dry-run', { version });
    dryRunResult.value = r;
  } catch (e: any) { migsError.value = e.message ?? 'Dry run failed'; }
  finally { runningMig.value = null; }
}

function onTabChange(t: typeof tab.value) {
  tab.value = t;
  if (t === 'migrations' && !migrations.value.length) loadMigrations();
}

function naira(kobo: number) {
  return '₦' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

function fmtJson(obj: any) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

function fmt(s: string | null) {
  return s ? new Date(s).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function decisionColor(d: EihResult['decision']) {
  return { pass: 'var(--brand)', block: 'var(--danger)', review: 'var(--warn, oklch(78% 0.16 75))' }[d];
}
</script>

<template>
  <AppShell title="Developer Toolkit">
    <!-- Sub-nav -->
    <div class="toolkit-nav">
      <button :class="['tnav-btn', { active: tab === 'vend' }]" @click="onTabChange('vend')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        Vend Simulator
      </button>
      <button :class="['tnav-btn', { active: tab === 'eih' }]" @click="onTabChange('eih')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        EIH Inspector
      </button>
      <button :class="['tnav-btn', { active: tab === 'ledger' }]" @click="onTabChange('ledger')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6h20v14H2zM2 10h20M16 14h2"/></svg>
        Ledger Inspector
      </button>
      <button :class="['tnav-btn', { active: tab === 'migrations' }]" @click="onTabChange('migrations')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6v20h12V8zM14 2v6h6M9 13h6M9 17h4"/></svg>
        Migrations
      </button>
    </div>

    <!-- ── VEND SIMULATOR ── -->
    <div v-if="tab === 'vend'" class="tool-pane">
      <div class="tool-header">
        <h2>Token Vend Simulator</h2>
        <p class="tool-desc">Run a test vend against a meter number without deducting wallet float. Inspects the raw disco API response.</p>
      </div>
      <div class="tool-body">
        <div class="tool-inputs">
          <div class="bw-form-group">
            <label class="bw-label">Meter Number</label>
            <input v-model="vendMeter" class="bw-input bw-mono" placeholder="04123456789" @keydown.enter="runVend" />
          </div>
          <div class="bw-form-group">
            <label class="bw-label">Amount (₦)</label>
            <input v-model.number="vendAmount" type="number" min="100" step="100" class="bw-input" />
          </div>
          <div class="bw-form-group">
            <label class="bw-label">Environment</label>
            <div class="bw-segmented">
              <button :class="['bw-seg', { active: vendEnv === 'test' }]" @click="vendEnv = 'test'">Test</button>
              <button :class="['bw-seg', { active: vendEnv === 'live' }]" @click="vendEnv = 'live'">Live</button>
            </div>
          </div>
          <div v-if="vendError" class="bw-error-banner">{{ vendError }}</div>
          <button class="bw-btn bw-btn-primary run-btn" :disabled="vendRunning" @click="runVend">
            <span v-if="vendRunning" class="btn-spinner" />
            {{ vendRunning ? 'Running vend…' : '▶ Run Simulator' }}
          </button>
        </div>

        <div v-if="vendResult" class="tool-result">
          <div class="result-meta">
            <div class="rmeta-item">
              <span class="rmeta-label">Status</span>
              <span :class="vendResult.status === 'success' ? 'bw-text-brand' : 'bw-text-danger'" class="bw-mono">{{ vendResult.status }}</span>
            </div>
            <div class="rmeta-item">
              <span class="rmeta-label">Vend ID</span>
              <span class="bw-mono bw-text-sm">{{ vendResult.vend_id }}</span>
            </div>
            <div class="rmeta-item">
              <span class="rmeta-label">Amount</span>
              <span>{{ naira(vendResult.amount_kobo) }}</span>
            </div>
            <div class="rmeta-item">
              <span class="rmeta-label">Duration</span>
              <span class="bw-mono">{{ vendResult.duration_ms }}ms</span>
            </div>
          </div>
          <div class="result-label">Raw Disco Response</div>
          <pre class="code-block">{{ fmtJson(vendResult.raw_response) }}</pre>
        </div>
      </div>
    </div>

    <!-- ── EIH INSPECTOR ── -->
    <div v-if="tab === 'eih'" class="tool-pane">
      <div class="tool-header">
        <h2>EIH Fraud Engine Inspector</h2>
        <p class="tool-desc">Replay a transaction through the fraud scoring engine with live rule evaluation. See which rules fired and why it passed or was blocked.</p>
      </div>
      <div class="tool-body">
        <div class="tool-inputs">
          <div class="bw-form-group">
            <label class="bw-label">Transaction ID</label>
            <input v-model="eihTxId" class="bw-input bw-mono" placeholder="txn_xxxxxxxxxxxx" @keydown.enter="runEih" />
          </div>
          <div v-if="eihError" class="bw-error-banner">{{ eihError }}</div>
          <button class="bw-btn bw-btn-primary run-btn" :disabled="eihRunning" @click="runEih">
            <span v-if="eihRunning" class="btn-spinner" />
            {{ eihRunning ? 'Evaluating…' : '▶ Replay Through EIH' }}
          </button>
        </div>

        <div v-if="eihResult" class="tool-result">
          <div class="result-meta">
            <div class="rmeta-item">
              <span class="rmeta-label">Decision</span>
              <span class="bw-mono" style="font-size:var(--t-lg);font-weight:700" :style="{ color: decisionColor(eihResult.decision) }">
                {{ eihResult.decision.toUpperCase() }}
              </span>
            </div>
            <div class="rmeta-item">
              <span class="rmeta-label">Total Score</span>
              <span class="bw-mono" style="font-size:var(--t-lg);font-weight:700">{{ eihResult.total_score }}</span>
            </div>
            <div class="rmeta-item">
              <span class="rmeta-label">Evaluated</span>
              <span class="bw-text-sm">{{ fmt(eihResult.evaluated_at) }}</span>
            </div>
          </div>

          <div class="result-label">Rules Evaluation</div>
          <div class="rules-table">
            <div class="rules-head">
              <span>Rule</span><span>Fired</span><span>Score</span><span>Reason</span>
            </div>
            <div
              v-for="r in eihResult.rules"
              :key="r.rule_id"
              :class="['rule-row', { 'rule-fired': r.fired }]"
            >
              <span class="rule-name bw-mono bw-text-sm">{{ r.rule_name }}</span>
              <span>
                <span v-if="r.fired" class="bw-badge bw-badge-danger">FIRED</span>
                <span v-else class="bw-badge bw-badge-neutral">—</span>
              </span>
              <span class="bw-mono bw-text-sm" :class="r.score_contribution > 0 ? 'bw-text-danger' : 'bw-text-muted'">
                {{ r.score_contribution > 0 ? `+${r.score_contribution}` : '0' }}
              </span>
              <span class="bw-text-sm rule-reason">{{ r.reason }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── LEDGER INSPECTOR ── -->
    <div v-if="tab === 'ledger'" class="tool-pane">
      <div class="tool-header">
        <h2>Wallet Ledger Inspector</h2>
        <p class="tool-desc">Drill into any wallet ledger entry by ID. View the raw DB row, the related transaction, and what triggered it.</p>
      </div>
      <div class="tool-body">
        <div class="tool-inputs">
          <div class="bw-form-group">
            <label class="bw-label">Ledger Entry ID</label>
            <input v-model="ledgerEntryId" class="bw-input bw-mono" placeholder="wle_xxxxxxxxxxxx" @keydown.enter="runLedger" />
          </div>
          <div v-if="ledgerError" class="bw-error-banner">{{ ledgerError }}</div>
          <button class="bw-btn bw-btn-primary run-btn" :disabled="ledgerRunning" @click="runLedger">
            <span v-if="ledgerRunning" class="btn-spinner" />
            {{ ledgerRunning ? 'Looking up…' : '▶ Inspect Entry' }}
          </button>
        </div>

        <div v-if="ledgerResult" class="tool-result">
          <div class="result-meta">
            <div class="rmeta-item">
              <span class="rmeta-label">Direction</span>
              <span :class="ledgerResult.direction === 'credit' ? 'bw-text-brand' : 'bw-text-danger'" class="bw-mono" style="font-weight:700">
                {{ ledgerResult.direction.toUpperCase() }}
              </span>
            </div>
            <div class="rmeta-item">
              <span class="rmeta-label">Amount</span>
              <span class="bw-mono">{{ naira(ledgerResult.amount_kobo) }}</span>
            </div>
            <div class="rmeta-item">
              <span class="rmeta-label">Running Balance</span>
              <span class="bw-mono">{{ naira(ledgerResult.running_balance_kobo) }}</span>
            </div>
            <div class="rmeta-item">
              <span class="rmeta-label">Type</span>
              <span class="bw-text-sm">{{ ledgerResult.entry_type }}</span>
            </div>
            <div class="rmeta-item">
              <span class="rmeta-label">Triggered By</span>
              <span class="bw-mono bw-text-sm">{{ ledgerResult.triggered_by ?? '—' }}</span>
            </div>
            <div class="rmeta-item">
              <span class="rmeta-label">Created</span>
              <span class="bw-text-sm">{{ fmt(ledgerResult.created_at) }}</span>
            </div>
          </div>

          <div class="ledger-grid">
            <div>
              <div class="result-label">Raw DB Row</div>
              <pre class="code-block">{{ fmtJson(ledgerResult.raw_row) }}</pre>
            </div>
            <div>
              <div class="result-label">Related Transaction</div>
              <pre class="code-block">{{ ledgerResult.related_transaction ? fmtJson(ledgerResult.related_transaction) : '(no related transaction)' }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── MIGRATIONS ── -->
    <div v-if="tab === 'migrations'" class="tool-pane">
      <div class="tool-header">
        <h2>Migration Runner</h2>
        <p class="tool-desc">View applied and pending Supabase migrations. Run a dry-run to preview what a migration will do before applying.</p>
      </div>

      <div v-if="migsError" class="bw-error-banner" style="margin-bottom:var(--s-3)">{{ migsError }}</div>

      <div v-if="dryRunResult" class="dry-run-result">
        <div class="dry-run-hd">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Dry run complete — {{ dryRunResult.version }}
          <button class="bw-btn bw-btn-ghost bw-btn-sm" style="margin-left:auto" @click="dryRunResult = null">Dismiss</button>
        </div>
        <pre class="code-block">{{ dryRunResult.output }}</pre>
      </div>

      <div v-if="migsLoading" class="bw-loading">Loading migrations…</div>
      <div v-else class="bw-table-wrapper">
        <table class="bw-table">
          <thead>
            <tr><th>Version</th><th>Name</th><th>Status</th><th>Applied At</th><th>Checksum</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="m in migrations" :key="m.version">
              <td class="bw-mono bw-text-sm">{{ m.version }}</td>
              <td class="bw-text-sm">{{ m.name }}</td>
              <td>
                <span :class="m.status === 'applied' ? 'bw-badge-success' : 'bw-badge-warn'" class="bw-badge">
                  {{ m.status }}
                </span>
              </td>
              <td class="bw-text-sm">{{ fmt(m.applied_at) }}</td>
              <td class="bw-mono bw-text-sm bw-text-muted">{{ m.checksum.slice(0, 8) }}…</td>
              <td>
                <button
                  v-if="m.status === 'pending'"
                  class="bw-btn bw-btn-ghost bw-btn-sm"
                  :disabled="runningMig === m.version"
                  @click="dryRun(m.version)"
                >
                  {{ runningMig === m.version ? 'Running…' : 'Dry Run' }}
                </button>
              </td>
            </tr>
            <tr v-if="!migrations.length && !migsLoading"><td colspan="6" class="bw-empty">No migrations found.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
/* Sub-nav */
.toolkit-nav {
  display: flex; gap: var(--s-1); flex-wrap: wrap;
  background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: var(--r-xl); padding: var(--s-1);
  backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%);
  margin-bottom: var(--s-5); width: fit-content;
}
.tnav-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px; border: 0; border-radius: calc(var(--r-xl) - 4px);
  background: transparent; color: var(--text-2); font-weight: 600; font-size: var(--t-sm);
  cursor: pointer; transition: background var(--dur-fast), color var(--dur-fast);
}
.tnav-btn:hover { background: var(--glass-bg-strong); color: var(--text); }
.tnav-btn.active { background: var(--glass-bg-strong); color: var(--text); box-shadow: var(--glass-shine); }

/* Tool pane */
.tool-pane { display: flex; flex-direction: column; gap: var(--s-4); }
.tool-header { }
.tool-header h2 { margin: 0 0 var(--s-1); font-size: var(--t-xl); }
.tool-desc { margin: 0; font-size: var(--t-sm); color: var(--text-2); max-width: 580px; }

.tool-body { display: grid; grid-template-columns: 320px 1fr; gap: var(--s-5); align-items: start; }
@media (max-width: 860px) { .tool-body { grid-template-columns: 1fr; } }

.tool-inputs {
  background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: var(--r-xl); padding: var(--s-4);
  backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
  display: flex; flex-direction: column; gap: var(--s-3);
}
.run-btn { display: flex; align-items: center; gap: var(--s-2); }

.tool-result {
  background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: var(--r-xl); padding: var(--s-4);
  backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
  display: flex; flex-direction: column; gap: var(--s-4);
}
.result-meta { display: flex; flex-wrap: wrap; gap: var(--s-4); }
.rmeta-item { display: flex; flex-direction: column; gap: 2px; }
.rmeta-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.result-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: var(--s-2); }

.code-block {
  background: oklch(0% 0 0 / 0.12); border: 1px solid var(--glass-border); border-radius: var(--r-md);
  padding: var(--s-3); font-family: var(--font-mono); font-size: 11px; line-height: 1.6;
  overflow: auto; max-height: 360px; white-space: pre; color: var(--text); tab-size: 2;
}

/* EIH rules table */
.rules-table { display: flex; flex-direction: column; gap: 1px; }
.rules-head {
  display: grid; grid-template-columns: 220px 70px 70px 1fr;
  padding: 6px 10px; font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--text-muted);
}
.rule-row {
  display: grid; grid-template-columns: 220px 70px 70px 1fr;
  padding: 8px 10px; gap: var(--s-2); align-items: center;
  border-radius: var(--r-md); transition: background var(--dur-fast);
}
.rule-row:hover { background: var(--glass-bg-strong); }
.rule-fired { background: oklch(from var(--danger) l c h / 0.06); }
.rule-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rule-reason { color: var(--text-muted); font-size: 11px; }

/* Ledger grid */
.ledger-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-4); }
@media (max-width: 640px) { .ledger-grid { grid-template-columns: 1fr; } }

/* Migrations */
.dry-run-result {
  background: oklch(from var(--brand) l c h / 0.08); border: 1px solid oklch(from var(--brand) l c h / 0.25);
  border-radius: var(--r-lg); padding: var(--s-4); margin-bottom: var(--s-4);
  display: flex; flex-direction: column; gap: var(--s-3);
}
.dry-run-hd { display: flex; align-items: center; gap: var(--s-2); color: var(--brand); font-size: var(--t-sm); font-weight: 600; }

/* Spinner */
@keyframes spin { to { transform: rotate(360deg); } }
.btn-spinner {
  display: inline-block; width: 14px; height: 14px;
  border: 2px solid oklch(100% 0 0 / 0.3); border-top-color: white;
  border-radius: 50%; animation: spin 0.7s linear infinite; flex-shrink: 0;
}
</style>
