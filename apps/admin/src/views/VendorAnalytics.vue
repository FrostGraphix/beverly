<script setup lang="ts">
/**
 * Vendor Analytics — cross-vendor comparison & leaderboards.
 *
 * Sections:
 *   • KPI summary tiles
 *   • Leaderboard table (sortable by vend volume, count, funding, avg tx)
 *   • Status & risk distribution bars
 *   • Top-N stations table
 *
 * Endpoint:
 *   GET /api/v1/admin/vendors/analytics?period=7d|30d|90d|all
 *
 * Response shape (all amounts in minor units):
 * {
 *   period, generated_at,
 *   summary: { total, active, frozen, suspended, pending,
 *               total_vended_minor, total_funded_minor,
 *               avg_wallet_minor, total_transactions },
 *   leaderboard: [{ rank, id, legal_name, trading_name, status, risk_level,
 *                   vend_volume_minor, vend_count, funding_minor,
 *                   avg_tx_minor, last_active_at }],
 *   risk_breakdown: [{ level, count }],
 *   top_stations:   [{ station_id, station_name, vendor_count, vend_volume_minor }],
 * }
 */
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api, naira, shortDate } from '../lib/api';

const router = useRouter();

type Period = '7d' | '30d' | '90d' | 'all';
const period = ref<Period>('30d');

const data     = ref<any>(null);
const loading  = ref(false);
const error    = ref<string | null>(null);

// ─ Sort ───────────────────────────────────────────────────────
type SortKey = 'rank' | 'vend_volume_minor' | 'vend_count' | 'funding_minor' | 'avg_tx_minor' | 'last_active_at';
const sortKey = ref<SortKey>('vend_volume_minor');
const sortAsc = ref(false);

function setSort(k: SortKey) {
    if (sortKey.value === k) { sortAsc.value = !sortAsc.value; } else { sortKey.value = k; sortAsc.value = false; }
}
function sortIcon(k: SortKey) {
    if (sortKey.value !== k) return '↕';
    return sortAsc.value ? '↑' : '↓';
}

const leaderboard = computed(() => {
    const rows: any[] = data.value?.leaderboard ?? [];
    return [...rows].sort((a, b) => {
        const av = a[sortKey.value] ?? 0;
        const bv = b[sortKey.value] ?? 0;
        if (av < bv) return sortAsc.value ? -1 : 1;
        if (av > bv) return sortAsc.value ?  1 : -1;
        return 0;
    });
});

// ─ Data fetch ─────────────────────────────────────────────────
async function load() {
    loading.value = true;
    error.value   = null;
    try {
        data.value = await api.get<any>(`/api/v1/admin/vendors/analytics?period=${period.value}`);
    } catch (e: any) {
        error.value = e?.message ?? 'Failed to load analytics.';
    } finally { loading.value = false; }
}

function changePeriod(p: Period) { period.value = p; load(); }

// ─ Risk bar helpers ────────────────────────────────────────────
function riskColor(level: string) {
    return ({ high: 'danger', medium: 'warn', low: 'success' } as Record<string, string>)[level] ?? 'neutral';
}
function riskPct(count: number) {
    const total = data.value?.summary?.total ?? 1;
    return Math.round((count / total) * 100);
}

// ─ Status bar helpers ──────────────────────────────────────────
function statusColor(s: string) {
    return ({ approved: 'success', frozen: 'danger', suspended: 'warn', pending: 'neutral', closed: 'neutral' } as Record<string, string>)[s] ?? 'neutral';
}

const statusRows = computed(() => {
    const s = data.value?.summary;
    if (!s) return [];
    const total = s.total || 1;
    return [
        { label: 'Active',    key: 'active',    count: s.active    ?? 0, pct: Math.round(((s.active    ?? 0) / total) * 100), color: 'success' },
        { label: 'Pending',   key: 'pending',   count: s.pending   ?? 0, pct: Math.round(((s.pending   ?? 0) / total) * 100), color: 'neutral' },
        { label: 'Suspended', key: 'suspended', count: s.suspended ?? 0, pct: Math.round(((s.suspended ?? 0) / total) * 100), color: 'warn'    },
        { label: 'Frozen',    key: 'frozen',    count: s.frozen    ?? 0, pct: Math.round(((s.frozen    ?? 0) / total) * 100), color: 'danger'  },
    ].filter(r => r.count > 0);
});

function vStatusBadge(s: string) {
    return ({ approved: 'success', frozen: 'danger', suspended: 'warn', pending: 'neutral', closed: 'neutral' } as Record<string, string>)[s] ?? 'neutral';
}
function riskBadge(r: string) {
    return ({ high: 'danger', medium: 'warn', low: 'success' } as Record<string, string>)[r] ?? 'neutral';
}

onMounted(load);
</script>

<template>
  <AppShell title="Vendor Analytics">

    <!-- Page header -->
    <div class="va-topbar">
      <div class="va-breadcrumb">
        <button class="bw-btn sm" @click="router.push('/vendors')">← Vendors</button>
        <span class="va-slash">/</span>
        <span class="va-crumb">Analytics</span>
      </div>
      <div class="va-period-pills">
        <button
          v-for="p in (['7d','30d','90d','all'] as const)"
          :key="p"
          :class="['va-pill', { active: period === p }]"
          :aria-pressed="period === p"
          :disabled="loading"
          @click="changePeriod(p)"
        >{{ p === 'all' ? 'All time' : p }}</button>
      </div>
    </div>

    <!-- Error banner -->
    <div v-if="error && !data" class="bw-card va-error" role="alert">
      <h2 class="va-card-title">Analytics unavailable</h2>
      <p class="bw-muted">{{ error }}</p>
      <button class="bw-btn primary" :disabled="loading" @click="load">
        {{ loading ? 'Retrying…' : 'Try again' }}
      </button>
    </div>

    <!-- Skeleton / loading state -->
    <div v-if="loading && !data" class="bw-card empty bw-muted">Loading analytics…</div>

    <template v-else-if="data">

      <div v-if="error" class="bw-banner error" role="alert" style="margin-bottom: var(--s-3)">
        {{ error }}
        <button class="bw-btn sm" :disabled="loading" @click="load">Try again</button>
      </div>

      <!-- ── KPI tiles ───────────────────────────────────────── -->
      <div class="va-kpi-grid bw-mobile-kpi-grid">
        <div class="va-kpi brand">
          <p class="va-kpi-label">Total vended</p>
          <p class="va-kpi-value">{{ naira(data.summary.total_vended_minor) }}</p>
          <p class="va-kpi-sub">{{ data.summary.total_transactions?.toLocaleString() ?? '—' }} transactions</p>
        </div>
        <div class="va-kpi">
          <p class="va-kpi-label">Total funded</p>
          <p class="va-kpi-value">{{ naira(data.summary.total_funded_minor) }}</p>
          <p class="va-kpi-sub">across all vendors</p>
        </div>
        <div class="va-kpi">
          <p class="va-kpi-label">Avg wallet balance</p>
          <p class="va-kpi-value">{{ naira(data.summary.avg_wallet_minor) }}</p>
          <p class="va-kpi-sub">per active vendor</p>
        </div>
        <div class="va-kpi">
          <p class="va-kpi-label">Active vendors</p>
          <p class="va-kpi-value">{{ data.summary.active ?? 0 }}</p>
          <p class="va-kpi-sub">of {{ data.summary.total }} registered</p>
        </div>
      </div>

      <!-- ── Two-column split: leaderboard + breakdown ──────── -->
      <div class="va-split">

        <!-- Leaderboard -->
        <div class="bw-card flush va-leader-card">
          <div class="va-card-head">
            <h2 class="va-card-title">Leaderboard</h2>
            <p class="va-card-sub bw-muted">Sorted by {{ sortKey.replace(/_minor$/, '').replace(/_/g, ' ') }}</p>
          </div>
          <div class="bw-t-wrap">
            <table class="bw-table va-table">
              <thead>
                <tr>
                  <th class="va-th-sort" @click="setSort('rank')">#{{ sortIcon('rank') }}</th>
                  <th>Vendor</th>
                  <th class="va-th-sort" @click="setSort('vend_volume_minor')" style="text-align:right">
                    Vend vol {{ sortIcon('vend_volume_minor') }}
                  </th>
                  <th class="va-th-sort" @click="setSort('vend_count')" style="text-align:right">
                    Txns {{ sortIcon('vend_count') }}
                  </th>
                  <th class="va-th-sort" @click="setSort('funding_minor')" style="text-align:right">
                    Funded {{ sortIcon('funding_minor') }}
                  </th>
                  <th class="va-th-sort" @click="setSort('avg_tx_minor')" style="text-align:right">
                    Avg tx {{ sortIcon('avg_tx_minor') }}
                  </th>
                  <th class="va-th-sort" @click="setSort('last_active_at')">Last active {{ sortIcon('last_active_at') }}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(v, i) in leaderboard"
                  :key="v.id"
                  class="va-leader-row"
                >
                  <td>
                    <span :class="['va-rank', i < 3 ? `top${i+1}` : '']">{{ i + 1 }}</span>
                  </td>
                  <td>
                    <div class="va-vendor-cell">
                      <div class="va-avatar">{{ (v.legal_name ?? '?')[0]?.toUpperCase() }}</div>
                      <div>
                        <p class="va-vendor-name">{{ v.legal_name }}</p>
                        <p v-if="v.trading_name" class="va-vendor-trade bw-muted">{{ v.trading_name }}</p>
                      </div>
                    </div>
                    <div class="va-badges">
                      <span :class="['bw-badge', vStatusBadge(v.status)]">{{ v.status }}</span>
                      <span :class="['bw-badge', riskBadge(v.risk_level)]">{{ v.risk_level }}</span>
                    </div>
                  </td>
                  <td class="bw-money va-num">{{ naira(v.vend_volume_minor) }}</td>
                  <td class="va-num">{{ (v.vend_count ?? 0).toLocaleString() }}</td>
                  <td class="bw-money va-num">{{ naira(v.funding_minor) }}</td>
                  <td class="bw-money va-num bw-muted">{{ naira(v.avg_tx_minor) }}</td>
                  <td class="bw-mono bw-muted" style="font-size: var(--t-xs)">{{ v.last_active_at ? shortDate(v.last_active_at) : '—' }}</td>
                  <td>
                    <button class="bw-btn sm" @click="router.push(`/vendors/${v.id}`)">View</button>
                  </td>
                </tr>
                <tr v-if="!leaderboard.length">
                  <td colspan="8" class="bw-muted" style="text-align:center;padding:var(--s-6)">No vendor data for this period.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Right column: status + risk + top stations -->
        <div class="va-right-col">

          <!-- Status distribution -->
          <div class="bw-card va-dist-card">
            <h2 class="va-card-title">Status distribution</h2>
            <div class="va-dist-rows">
              <div v-for="row in statusRows" :key="row.key" class="va-dist-row">
                <div class="va-dist-meta">
                  <span class="va-dist-label">{{ row.label }}</span>
                  <span class="bw-mono va-dist-count">{{ row.count }}</span>
                </div>
                <div class="va-dist-track">
                  <div
                    class="va-dist-fill"
                    :class="row.color"
                    :style="{ width: `${row.pct}%` }"
                  />
                </div>
                <span class="va-dist-pct bw-muted">{{ row.pct }}%</span>
              </div>
            </div>
          </div>

          <!-- Risk breakdown -->
          <div class="bw-card va-dist-card">
            <h2 class="va-card-title">Risk profile</h2>
            <div class="va-dist-rows">
              <div
                v-for="rb in (data.risk_breakdown ?? [])"
                :key="rb.level"
                class="va-dist-row"
              >
                <div class="va-dist-meta">
                  <span :class="['bw-badge', riskColor(rb.level)]" style="font-size: 11px">{{ rb.level }}</span>
                  <span class="bw-mono va-dist-count">{{ rb.count }}</span>
                </div>
                <div class="va-dist-track">
                  <div
                    class="va-dist-fill"
                    :class="riskColor(rb.level)"
                    :style="{ width: `${riskPct(rb.count)}%` }"
                  />
                </div>
                <span class="va-dist-pct bw-muted">{{ riskPct(rb.count) }}%</span>
              </div>
              <p v-if="!(data.risk_breakdown?.length)" class="bw-muted" style="font-size: var(--t-sm)">No data.</p>
            </div>
          </div>

          <!-- Top stations -->
          <div class="bw-card flush va-stations-card">
            <div class="va-card-head" style="padding: var(--s-4) var(--s-4) 0">
              <h2 class="va-card-title">Top stations</h2>
              <p class="va-card-sub bw-muted">by vend volume this period</p>
            </div>
            <ul class="va-station-list">
              <li
                v-for="(st, i) in (data.top_stations ?? []).slice(0, 8)"
                :key="st.station_id"
                class="va-station-row"
              >
                <span class="va-station-rank bw-muted">{{ i + 1 }}</span>
                <div class="va-station-info">
                  <p class="va-station-name">{{ st.station_name ?? st.station_id }}</p>
                  <p class="va-station-meta bw-muted bw-mono">{{ st.vendor_count }} vendor{{ st.vendor_count !== 1 ? 's' : '' }}</p>
                </div>
                <span class="bw-money va-station-vol">{{ naira(st.vend_volume_minor) }}</span>
              </li>
              <li v-if="!(data.top_stations?.length)" class="bw-muted" style="padding: var(--s-4); font-size: var(--t-sm)">No station data.</li>
            </ul>
          </div>

        </div>
      </div>

      <!-- Footer: generated_at -->
      <p class="va-footer bw-muted">
        Analytics as of {{ data.generated_at ? new Date(data.generated_at).toLocaleString() : '—' }} · period: {{ data.period }}
      </p>

    </template>

  </AppShell>
</template>

<style scoped>
/* ── Topbar ── */
.va-topbar {
  display: flex; justify-content: space-between; align-items: center;
  flex-wrap: wrap; gap: var(--s-3); margin-bottom: var(--s-4);
}
.va-breadcrumb { display: flex; align-items: center; gap: var(--s-2); }
.va-slash { color: var(--text-muted); }
.va-crumb { font-weight: 600; font-size: var(--t-sm); }

/* Period pills */
.va-period-pills { display: flex; gap: var(--s-1); background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: var(--r-lg); padding: 3px; backdrop-filter: blur(12px) saturate(140%); -webkit-backdrop-filter: blur(12px) saturate(140%); }
.va-pill { background: transparent; border: none; padding: 6px 14px; border-radius: calc(var(--r-lg) - 2px); font-size: var(--t-sm); font-weight: 600; cursor: pointer; color: var(--text-muted); transition: all 0.15s; }
.va-pill:hover { color: var(--text); background: var(--glass-bg-strong); }
.va-pill.active { background: var(--brand); color: oklch(8% 0.04 145); box-shadow: 0 2px 8px oklch(from var(--brand) l c h / 0.35); }
.va-pill:disabled { cursor: not-allowed; opacity: 0.65; }
.va-error { padding: var(--s-5); }
.va-error p { margin: var(--s-2) 0 var(--s-4); }

/* ── KPI grid ── */
.va-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--s-3); margin-bottom: var(--s-4); }
.va-kpi {
  background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: var(--r-lg);
  padding: var(--s-4); backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
}
.va-kpi.brand {
  background: linear-gradient(135deg, oklch(from var(--brand) l c h / 0.1), transparent);
  border-color: oklch(from var(--brand) l c h / 0.28);
}
.va-kpi-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); margin: 0 0 6px; }
.va-kpi-value { font-family: var(--font-mono); font-weight: 700; font-size: var(--t-lg); margin: 0; }
.va-kpi.brand .va-kpi-value { color: var(--brand); }
.va-kpi-sub { font-size: var(--t-xs); color: var(--text-muted); margin: 4px 0 0; }

/* ── Layout split ── */
.va-split { display: grid; grid-template-columns: 1fr 340px; gap: var(--s-4); align-items: start; margin-bottom: var(--s-3); }

/* ── Leaderboard ── */
.va-leader-card { overflow: hidden; }
.va-card-head { padding: var(--s-4); border-bottom: 1px solid var(--glass-border); }
.va-card-title { font-size: var(--t-base); font-weight: 700; margin: 0 0 2px; }
.va-card-sub   { font-size: var(--t-xs); margin: 0; }

.va-table th { cursor: default; }
.va-th-sort { cursor: pointer; user-select: none; white-space: nowrap; }
.va-th-sort:hover { color: var(--brand); }

.va-leader-row:hover { background: var(--glass-bg); cursor: default; }

.va-rank {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 50%;
  font-weight: 700; font-size: var(--t-xs);
  background: var(--glass-bg); border: 1px solid var(--glass-border);
}
.va-rank.top1 { background: oklch(78% 0.17 85 / 0.18); border-color: oklch(78% 0.17 85 / 0.5); color: oklch(78% 0.17 85); }
.va-rank.top2 { background: oklch(72% 0.06 220 / 0.18); border-color: oklch(72% 0.06 220 / 0.5); color: oklch(72% 0.06 220); }
.va-rank.top3 { background: oklch(60% 0.12 40 / 0.18); border-color: oklch(60% 0.12 40 / 0.5); color: oklch(60% 0.12 40); }

.va-vendor-cell { display: flex; gap: var(--s-3); align-items: center; margin-bottom: 4px; }
.va-avatar {
  width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
  background: linear-gradient(135deg, var(--brand-300), var(--brand-600));
  display: grid; place-items: center;
  font-size: 13px; font-weight: 700; color: oklch(8% 0.04 145);
}
.va-vendor-name  { font-weight: 600; font-size: var(--t-sm); margin: 0; }
.va-vendor-trade { font-size: var(--t-xs); margin: 0; }
.va-badges { display: flex; gap: var(--s-1); flex-wrap: wrap; padding-left: calc(32px + var(--s-3)); }
.va-num { text-align: right; font-size: var(--t-sm); font-weight: 600; }

/* ── Right column ── */
.va-right-col { display: flex; flex-direction: column; gap: var(--s-4); }

/* Distribution card */
.va-dist-card { padding: var(--s-4); }
.va-dist-rows { display: flex; flex-direction: column; gap: var(--s-3); margin-top: var(--s-3); }
.va-dist-row  { display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; gap: 4px var(--s-2); align-items: center; }
.va-dist-meta { display: flex; justify-content: space-between; align-items: center; grid-column: 1; }
.va-dist-count{ font-size: var(--t-xs); }
.va-dist-label{ font-size: var(--t-sm); font-weight: 600; }
.va-dist-track{ height: 6px; border-radius: 3px; background: var(--glass-bg-strong); overflow: hidden; grid-column: 1; }
.va-dist-fill { height: 100%; border-radius: 3px; transition: width 0.4s var(--ease-out); }
.va-dist-fill.success { background: var(--success, oklch(65% 0.16 145)); }
.va-dist-fill.warn    { background: var(--warn,    oklch(72% 0.17 65));  }
.va-dist-fill.danger  { background: var(--danger,  oklch(60% 0.22 20));  }
.va-dist-fill.neutral { background: var(--text-muted); }
.va-dist-pct  { font-size: var(--t-xs); grid-column: 2; grid-row: 2; }

/* Top stations */
.va-stations-card { overflow: hidden; }
.va-station-list { list-style: none; margin: 0; padding: var(--s-2) 0; }
.va-station-row  {
  display: grid; grid-template-columns: 28px 1fr auto;
  gap: var(--s-2); align-items: center;
  padding: 10px var(--s-4);
  border-top: 1px solid var(--glass-border);
  font-size: var(--t-sm);
}
.va-station-rank  { font-size: var(--t-xs); font-weight: 700; text-align: center; }
.va-station-name  { font-weight: 600; margin: 0; }
.va-station-meta  { font-size: var(--t-xs); margin: 0; }
.va-station-vol   { font-weight: 700; font-size: var(--t-sm); white-space: nowrap; }

/* ── Footer ── */
.va-footer { font-size: var(--t-xs); text-align: right; margin-top: var(--s-2); }

/* ── Responsive ── */
@media (max-width: 1100px) {
  .va-split { grid-template-columns: 1fr; }
  .va-right-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
}
@media (max-width: 640px) {
  .va-topbar { flex-direction: column; align-items: flex-start; }
  .va-kpi-grid { grid-template-columns: 1fr 1fr; }
  .va-right-col { display: flex; flex-direction: column; }
  .va-table th:nth-child(n+4), .va-table td:nth-child(n+4) { display: none; }
}
</style>
