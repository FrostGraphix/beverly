<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, ApiError, naira, shortDate } from '../lib/api';

interface Signal {
    id: string;
    signal_type: string;
    weight: number;
    detail: string;
}

interface Assessment {
    id: string;
    customer_id: string;
    purchase_order_id: string | null;
    meter_id: string;
    amount_minor: number;
    score: number;
    action: 'allow' | 'step_up' | 'block';
    resolved: boolean;
    resolution_note: string | null;
    resolved_at: string | null;
    created_at: string;
    fraud_signals: Signal[];
    customers?: { users?: { full_name?: string; phone?: string } };
}

const assessments = ref<Assessment[]>([]);
const loading      = ref(true);
const filterResolved = ref('false');
const filterMinScore = ref('50');

const ACTION_BADGE: Record<string, string> = {
    allow:   'bw-badge green',
    step_up: 'bw-badge yellow',
    block:   'bw-badge red',
};

async function load() {
    loading.value = true;
    const params = new URLSearchParams({
        resolved:  filterResolved.value,
        min_score: filterMinScore.value,
    });
    try {
        const data = await api.get<{ assessments: Assessment[] }>(`/api/v1/admin/fraud?${params}`);
        assessments.value = data.assessments;
    } catch { /* noop */ } finally {
        loading.value = false;
    }
}

// Resolve modal
const resolving   = ref(false);
const resolveNote = ref('');
const activeId    = ref('');
const resolveError = ref('');

function openResolve(id: string) {
    activeId.value    = id;
    resolveNote.value = '';
    resolveError.value = '';
}

async function submitResolve() {
    resolving.value = true;
    resolveError.value = '';
    try {
        await api.patch(`/api/v1/admin/fraud/${activeId.value}/resolve`, { note: resolveNote.value || undefined });
        const idx = assessments.value.findIndex(a => a.id === activeId.value);
        if (idx >= 0) assessments.value[idx].resolved = true;
        activeId.value = '';
    } catch (e: any) {
        resolveError.value = e instanceof ApiError ? e.message : 'Failed to resolve';
    } finally {
        resolving.value = false;
    }
}

function scoreColor(score: number): string {
    if (score >= 90) return 'oklch(60% 0.22 25)';
    if (score >= 70) return 'oklch(75% 0.18 85)';
    return 'var(--brand)';
}

onMounted(load);
</script>

<template>
  <AppShell title="Fraud Review">
    <template #topbar-end>
      <button class="bw-icon-btn" @click="load" title="Refresh">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
      </button>
    </template>

    <!-- Filters -->
    <div class="bw-toolbar">
      <label class="bw-label" style="margin:0">Min score</label>
      <select v-model="filterMinScore" class="bw-select sm" @change="load">
        <option value="0">All scores</option>
        <option value="50">≥ 50</option>
        <option value="70">≥ 70 (step-up)</option>
        <option value="90">≥ 90 (blocked)</option>
      </select>
      <select v-model="filterResolved" class="bw-select sm" @change="load">
        <option value="false">Open</option>
        <option value="true">Resolved</option>
        <option value="">All</option>
      </select>
      <button class="bw-btn sm" @click="load">Refresh</button>
    </div>

    <!-- Summary chips -->
    <div class="bw-stat-row">
      <div class="bw-stat-chip">
        <span class="bw-muted" style="font-size:var(--t-xs)">Total shown</span>
        <strong>{{ assessments.length }}</strong>
      </div>
      <div class="bw-stat-chip">
        <span class="bw-muted" style="font-size:var(--t-xs)">Step-up</span>
        <strong style="color:oklch(75% 0.18 85)">{{ assessments.filter(a => a.action === 'step_up').length }}</strong>
      </div>
      <div class="bw-stat-chip">
        <span class="bw-muted" style="font-size:var(--t-xs)">Blocked</span>
        <strong style="color:oklch(60% 0.22 25)">{{ assessments.filter(a => a.action === 'block').length }}</strong>
      </div>
    </div>

    <!-- Table -->
    <div class="bw-table-wrap">
      <table class="bw-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Meter</th>
            <th>Amount</th>
            <th style="text-align:center">Score</th>
            <th>Action</th>
            <th>Signals</th>
            <th>Date</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="8" style="text-align:center; padding:var(--s-8); color:var(--fg-2)">Loading…</td>
          </tr>
          <tr v-else-if="assessments.length === 0">
            <td colspan="8" style="text-align:center; padding:var(--s-8); color:var(--fg-2)">No flagged transactions</td>
          </tr>
          <tr v-for="a in assessments" :key="a.id" :class="{ 'bw-row-muted': a.resolved }">
            <td>
              <div style="font-weight:600; font-size:var(--t-sm)">{{ a.customers?.users?.full_name ?? '—' }}</div>
              <div style="font-size:var(--t-xs); color:var(--fg-2)">{{ a.customers?.users?.phone ?? '—' }}</div>
            </td>
            <td class="bw-mono" style="font-size:var(--t-sm)">{{ a.meter_id }}</td>
            <td style="font-weight:600">{{ naira(a.amount_minor) }}</td>
            <td style="text-align:center">
              <span class="bw-score-pill" :style="`background:${scoreColor(a.score)}22; color:${scoreColor(a.score)}`">
                {{ a.score }}
              </span>
            </td>
            <td><span :class="ACTION_BADGE[a.action] ?? 'bw-badge gray'">{{ a.action.replace('_', ' ') }}</span></td>
            <td>
              <div v-for="sig in a.fraud_signals" :key="sig.id" class="bw-signal-chip" :title="sig.detail">
                {{ sig.signal_type.replace(/_/g, ' ') }} <span class="bw-signal-weight">+{{ sig.weight }}</span>
              </div>
            </td>
            <td style="font-size:var(--t-xs); color:var(--fg-2); white-space:nowrap">{{ shortDate(a.created_at) }}</td>
            <td>
              <button
                v-if="!a.resolved"
                class="bw-btn sm"
                @click="openResolve(a.id)"
              >
                Resolve
              </button>
              <span v-else class="bw-muted" style="font-size:var(--t-xs)">Resolved</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Resolve modal -->
    <div v-if="activeId" class="bw-modal-backdrop" @click.self="activeId = ''">
      <div class="bw-modal">
        <div class="bw-modal-head">
          <strong>Resolve Fraud Signal</strong>
          <button class="bw-icon-btn" @click="activeId = ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <p class="bw-muted" style="font-size:var(--t-sm)">Mark this assessment as reviewed. Optionally add a note explaining the outcome.</p>
        <div class="bw-field">
          <label class="bw-label">Resolution note (optional)</label>
          <textarea v-model="resolveNote" class="bw-input" rows="3" placeholder="e.g. Verified legitimate — customer confirmed via phone" style="resize:vertical" />
        </div>
        <p v-if="resolveError" style="color:oklch(60% 0.22 25); font-size:var(--t-sm)">{{ resolveError }}</p>
        <div class="bw-modal-foot">
          <button class="bw-btn" @click="activeId = ''">Cancel</button>
          <button class="bw-btn primary" @click="submitResolve" :disabled="resolving">
            {{ resolving ? 'Saving…' : 'Mark resolved' }}
          </button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.bw-toolbar    { display:flex; gap:var(--s-3); flex-wrap:wrap; align-items:center; margin-bottom:var(--s-4); }
.bw-stat-row   { display:flex; gap:var(--s-3); flex-wrap:wrap; margin-bottom:var(--s-5); }
.bw-stat-chip  { background:var(--surface-1); border:1px solid var(--border); border-radius:var(--r-md); padding:var(--s-3) var(--s-4); display:flex; flex-direction:column; gap:var(--s-1); min-width:90px; }
.bw-score-pill { display:inline-block; border-radius:var(--r-md); padding:2px 8px; font-size:var(--t-sm); font-weight:700; }
.bw-signal-chip { display:inline-flex; align-items:center; gap:4px; background:var(--surface-2); border-radius:var(--r-sm); padding:1px 6px; font-size:10px; margin:1px; white-space:nowrap; }
.bw-signal-weight { font-weight:700; opacity:0.7; }
.bw-row-muted td { opacity:0.5; }
.bw-modal-backdrop { position:fixed; inset:0; background:oklch(0% 0 0 / 0.5); display:grid; place-items:center; z-index:200; }
.bw-modal { background:var(--surface-0); border:1px solid var(--border); border-radius:var(--r-xl); padding:var(--s-6); width:min(480px,90vw); display:flex; flex-direction:column; gap:var(--s-4); }
.bw-modal-head { display:flex; align-items:center; justify-content:space-between; }
.bw-modal-foot { display:flex; gap:var(--s-3); justify-content:flex-end; }
</style>
