<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../lib/api';
import AppShell from '../components/AppShell.vue';

/* ── Schema Explorer ── */
interface Column {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  is_pk: boolean;
  fk_table: string | null;
  fk_column: string | null;
  description: string | null;
}
interface DbTable {
  name: string;
  schema: string;
  row_estimate: number | null;
  columns: Column[];
  indexes: string[];
}

/* ── Role Matrix ── */
interface MatrixRole {
  id: string;
  label: string;
}
interface MatrixPermission {
  key: string;
  label: string;
  group: string;
  roles: string[];   // role IDs that have this permission
}

/* ── Deploy Log ── */
interface Deploy {
  id: string;
  sha: string;
  short_sha: string;
  message: string;
  author: string;
  environment: 'production' | 'staging' | 'dev';
  deployed_at: string;
  deploy_duration_s: number | null;
  status: 'success' | 'failed' | 'rolling';
}

const tab = ref<'schema' | 'matrix' | 'deploys'>('schema');

// --- Schema ---
const tables      = ref<DbTable[]>([]);
const schemaLoad  = ref(false);
const schemaErr   = ref('');
const activeTable = ref<DbTable | null>(null);
const schSearch   = ref('');

const filteredTables = computed(() =>
  tables.value.filter(t => !schSearch.value || t.name.toLowerCase().includes(schSearch.value.toLowerCase()))
);

async function loadSchema() {
  schemaLoad.value = true; schemaErr.value = '';
  try {
    const r = await api.get<{ tables: DbTable[] }>('/api/v1/admin/dev/schema');
    tables.value = r.tables ?? [];
    if (tables.value.length && !activeTable.value) activeTable.value = tables.value[0];
  } catch (e: any) { schemaErr.value = e.message ?? 'Failed to load schema'; }
  finally { schemaLoad.value = false; }
}

// --- Role Matrix ---
const matrixRoles = ref<MatrixRole[]>([]);
const matrixPerms = ref<MatrixPermission[]>([]);
const matrixLoad  = ref(false);
const matrixErr   = ref('');
const matrixGroup = ref('');

const matrixGroups = computed(() => [...new Set(matrixPerms.value.map(p => p.group))].sort());
const matrixFiltered = computed(() =>
  matrixGroup.value ? matrixPerms.value.filter(p => p.group === matrixGroup.value) : matrixPerms.value
);

async function loadMatrix() {
  matrixLoad.value = true; matrixErr.value = '';
  try {
    const r = await api.get<{ roles: MatrixRole[]; permissions: MatrixPermission[] }>('/api/v1/admin/dev/role-matrix');
    matrixRoles.value = r.roles ?? [];
    matrixPerms.value = r.permissions ?? [];
  } catch (e: any) { matrixErr.value = e.message ?? 'Failed to load'; }
  finally { matrixLoad.value = false; }
}

function hasRole(perm: MatrixPermission, roleId: string) {
  return perm.roles.includes(roleId);
}

// --- Deploy Log ---
const deploys    = ref<Deploy[]>([]);
const deplLoad   = ref(false);
const deplErr    = ref('');
const deplEnv    = ref('');

const deplFiltered = computed(() =>
  deplEnv.value ? deploys.value.filter(d => d.environment === deplEnv.value) : deploys.value
);

async function loadDeploys() {
  deplLoad.value = true; deplErr.value = '';
  try {
    const r = await api.get<{ deploys: Deploy[] }>('/api/v1/admin/dev/deploy-log');
    deploys.value = r.deploys ?? [];
  } catch (e: any) { deplErr.value = e.message ?? 'Failed to load'; }
  finally { deplLoad.value = false; }
}

function switchTab(t: typeof tab.value) {
  tab.value = t;
  if (t === 'schema' && !tables.value.length) loadSchema();
  if (t === 'matrix' && !matrixRoles.value.length) loadMatrix();
  if (t === 'deploys' && !deploys.value.length) loadDeploys();
}

function fmt(s: string) {
  return new Date(s).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

function typeColor(type: string) {
  if (type.includes('int') || type.includes('float') || type.includes('numeric') || type.includes('decimal')) return 'type-num';
  if (type.includes('bool')) return 'type-bool';
  if (type.includes('timestamp') || type.includes('date')) return 'type-date';
  if (type.includes('uuid') || type.includes('text') || type.includes('char') || type.includes('varchar')) return 'type-str';
  if (type.includes('json')) return 'type-json';
  return 'type-other';
}

onMounted(loadSchema);
</script>

<template>
  <AppShell title="Schema Explorer">
    <!-- Tabs -->
    <div class="bw-segmented" style="max-width:400px; margin-bottom:var(--s-4)">
      <button :class="['bw-seg', { active: tab === 'schema' }]" @click="switchTab('schema')">Schema</button>
      <button :class="['bw-seg', { active: tab === 'matrix' }]" @click="switchTab('matrix')">Role Matrix</button>
      <button :class="['bw-seg', { active: tab === 'deploys' }]" @click="switchTab('deploys')">Deploy Log</button>
    </div>

    <!-- ── SCHEMA EXPLORER ── -->
    <div v-if="tab === 'schema'">
      <div v-if="schemaErr" class="bw-error-banner" style="margin-bottom:var(--s-3)">{{ schemaErr }}</div>
      <div v-if="schemaLoad" class="bw-loading">Loading schema…</div>
      <div v-else class="schema-layout">
        <!-- Table list -->
        <div class="schema-sidebar">
          <input v-model="schSearch" class="bw-input schema-search" placeholder="Filter tables…" />
          <div class="table-list">
            <button
              v-for="t in filteredTables"
              :key="t.name"
              :class="['table-btn', { active: activeTable?.name === t.name }]"
              @click="activeTable = t"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" style="flex-shrink:0"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              <span class="table-btn-name">{{ t.name }}</span>
              <span v-if="t.row_estimate != null" class="table-btn-count">{{ t.row_estimate.toLocaleString() }}</span>
            </button>
            <div v-if="!filteredTables.length" class="bw-empty" style="padding:var(--s-3)">No tables match.</div>
          </div>
        </div>

        <!-- Column details -->
        <div class="schema-detail">
          <div v-if="activeTable">
            <div class="schema-detail-hd">
              <h3 class="bw-mono">{{ activeTable.schema }}.{{ activeTable.name }}</h3>
              <span v-if="activeTable.row_estimate != null" class="bw-text-muted bw-text-sm">
                ~{{ activeTable.row_estimate.toLocaleString() }} rows
              </span>
            </div>

            <!-- Indexes -->
            <div v-if="activeTable.indexes.length" class="schema-indexes">
              <span class="schema-section-label">Indexes</span>
              <div class="index-chips">
                <code v-for="idx in activeTable.indexes" :key="idx" class="index-chip">{{ idx }}</code>
              </div>
            </div>

            <!-- Columns -->
            <div class="schema-cols-table">
              <div class="schema-cols-head">
                <span>Column</span><span>Type</span><span>Nullable</span><span>Default</span><span>Ref</span><span>Notes</span>
              </div>
              <div v-for="col in activeTable.columns" :key="col.name" :class="['schema-col-row', { 'col-pk': col.is_pk }]">
                <div class="col-name-cell">
                  <span v-if="col.is_pk" class="pk-badge" title="Primary key">PK</span>
                  <code :class="['col-name', { 'col-name-pk': col.is_pk }]">{{ col.name }}</code>
                </div>
                <code :class="['col-type', typeColor(col.type)]">{{ col.type }}</code>
                <span class="bw-text-sm" :class="col.nullable ? 'bw-text-muted' : 'bw-text-brand'">
                  {{ col.nullable ? 'YES' : 'NO' }}
                </span>
                <code class="bw-text-sm bw-text-muted col-default">{{ col.default ?? '—' }}</code>
                <span class="bw-text-sm bw-text-muted">
                  <span v-if="col.fk_table" class="fk-ref">
                    → <code>{{ col.fk_table }}.{{ col.fk_column }}</code>
                  </span>
                  <span v-else>—</span>
                </span>
                <span class="bw-text-sm bw-text-muted col-notes">{{ col.description ?? '' }}</span>
              </div>
            </div>
          </div>
          <div v-else class="schema-empty">Select a table to inspect its columns.</div>
        </div>
      </div>
    </div>

    <!-- ── ROLE MATRIX ── -->
    <div v-if="tab === 'matrix'">
      <div v-if="matrixErr" class="bw-error-banner" style="margin-bottom:var(--s-3)">{{ matrixErr }}</div>
      <div v-if="matrixLoad" class="bw-loading">Loading…</div>
      <div v-else>
        <div class="matrix-controls">
          <select v-model="matrixGroup" class="bw-select" style="max-width:220px">
            <option value="">All permission groups</option>
            <option v-for="g in matrixGroups" :key="g" :value="g">{{ g }}</option>
          </select>
        </div>
        <div class="matrix-scroll">
          <table class="matrix-table">
            <thead>
              <tr>
                <th class="matrix-perm-col">Permission</th>
                <th v-for="role in matrixRoles" :key="role.id" class="matrix-role-col">
                  <div class="role-hd">{{ role.label }}</div>
                </th>
              </tr>
            </thead>
            <tbody>
              <template v-for="group in matrixGroups.filter(g => !matrixGroup || g === matrixGroup)" :key="group">
                <tr class="matrix-group-row">
                  <td :colspan="matrixRoles.length + 1" class="matrix-group-label">{{ group }}</td>
                </tr>
                <tr v-for="perm in matrixFiltered.filter(p => p.group === group)" :key="perm.key">
                  <td class="matrix-perm-cell">
                    <span class="perm-label">{{ perm.label }}</span>
                    <code class="perm-key">{{ perm.key }}</code>
                  </td>
                  <td v-for="role in matrixRoles" :key="role.id" class="matrix-check-cell">
                    <span v-if="hasRole(perm, role.id)" class="check-yes" aria-label="Allowed">✓</span>
                    <span v-else class="check-no" aria-label="Denied">—</span>
                  </td>
                </tr>
              </template>
              <tr v-if="!matrixFiltered.length"><td :colspan="matrixRoles.length + 1" class="bw-empty">No permissions found.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ── DEPLOY LOG ── -->
    <div v-if="tab === 'deploys'">
      <div v-if="deplErr" class="bw-error-banner" style="margin-bottom:var(--s-3)">{{ deplErr }}</div>
      <div class="deploys-filter">
        <select v-model="deplEnv" class="bw-select" style="max-width:180px">
          <option value="">All environments</option>
          <option value="production">Production</option>
          <option value="staging">Staging</option>
          <option value="dev">Dev</option>
        </select>
        <button type="button" class="bw-btn bw-btn-ghost bw-btn-sm" @click.prevent="loadDeploys">↺ Refresh</button>
      </div>
      <div v-if="deplLoad" class="bw-loading">Loading…</div>
      <div v-else class="bw-table-wrapper">
        <table class="bw-table">
          <thead>
            <tr><th>SHA</th><th>Message</th><th>Author</th><th>Environment</th><th>Status</th><th>Duration</th><th>Deployed At</th></tr>
          </thead>
          <tbody>
            <tr v-for="d in deplFiltered" :key="d.id">
              <td>
                <a :href="`https://github.com/acob/beverly/commit/${d.sha}`" target="_blank" rel="noopener" class="sha-link bw-mono">
                  {{ d.short_sha }}
                </a>
              </td>
              <td class="bw-text-sm commit-msg">{{ d.message }}</td>
              <td class="bw-text-sm">{{ d.author }}</td>
              <td>
                <span :class="{
                  'bw-badge-danger':  d.environment === 'production',
                  'bw-badge-warn':    d.environment === 'staging',
                  'bw-badge-neutral': d.environment === 'dev',
                }" class="bw-badge">{{ d.environment }}</span>
              </td>
              <td>
                <span :class="{
                  'bw-badge-success': d.status === 'success',
                  'bw-badge-danger':  d.status === 'failed',
                  'bw-badge-warn':    d.status === 'rolling',
                }" class="bw-badge">{{ d.status }}</span>
              </td>
              <td class="bw-mono bw-text-sm bw-text-muted">
                {{ d.deploy_duration_s != null ? `${d.deploy_duration_s}s` : '—' }}
              </td>
              <td class="bw-text-sm">{{ fmt(d.deployed_at) }}</td>
            </tr>
            <tr v-if="!deplFiltered.length && !deplLoad"><td colspan="7" class="bw-empty">No deployments found.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
/* Schema Layout */
.schema-layout { display: grid; grid-template-columns: 220px 1fr; gap: var(--s-4); min-height: 600px; }
@media (max-width: 760px) { .schema-layout { grid-template-columns: 1fr; } }

.schema-sidebar {
  background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: var(--r-xl); overflow: hidden;
  backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
  display: flex; flex-direction: column; max-height: 700px;
}
.schema-search {
  border-radius: 0 !important; border: none !important; border-bottom: 1px solid var(--glass-border) !important;
  box-shadow: none !important; background: transparent !important;
}
.table-list { overflow-y: auto; flex: 1; }
.table-btn {
  width: 100%; display: flex; align-items: center; gap: 7px;
  padding: 8px var(--s-3); border: 0; background: transparent; color: var(--text);
  font-size: var(--t-sm); cursor: pointer; text-align: left;
  transition: background var(--dur-fast);
  border-bottom: 1px solid var(--glass-border);
}
.table-btn:last-child { border-bottom: none; }
.table-btn:hover { background: var(--glass-bg-strong); }
.table-btn.active { background: oklch(from var(--brand) l c h / 0.12); color: var(--brand); }
.table-btn-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); }
.table-btn-count { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }

.schema-detail {
  background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: var(--r-xl); padding: var(--s-4);
  backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
  overflow-x: auto;
}
.schema-detail-hd { display: flex; align-items: baseline; gap: var(--s-3); margin-bottom: var(--s-3); }
.schema-detail-hd h3 { margin: 0; font-size: var(--t-lg); }
.schema-section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.schema-indexes { display: flex; align-items: center; gap: var(--s-3); margin-bottom: var(--s-3); flex-wrap: wrap; }
.index-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.index-chip {
  font-size: 10px; padding: 2px 7px; border-radius: var(--r-sm);
  background: var(--glass-bg-strong); border: 1px solid var(--glass-border); color: var(--text);
}

.schema-cols-table { min-width: 600px; }
.schema-cols-head {
  display: grid; grid-template-columns: 200px 140px 80px 120px 160px 1fr;
  padding: 6px 10px; font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--text-muted); border-bottom: 1px solid var(--glass-border);
}
.schema-col-row {
  display: grid; grid-template-columns: 200px 140px 80px 120px 160px 1fr;
  padding: 8px 10px; border-bottom: 1px solid var(--glass-border); align-items: center; gap: var(--s-2);
}
.schema-col-row:last-child { border-bottom: none; }
.schema-col-row:hover { background: var(--glass-bg-strong); }
.col-pk { background: oklch(from var(--brand) l c h / 0.04); }
.col-name-cell { display: flex; align-items: center; gap: 5px; overflow: hidden; }
.pk-badge {
  font-size: 9px; font-weight: 800; padding: 1px 4px; border-radius: 3px; flex-shrink: 0;
  background: oklch(from var(--brand) l c h / 0.18); color: var(--brand); letter-spacing: 0.05em;
}
.col-name { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-name-pk { color: var(--brand); font-weight: 700; }
.col-type { font-size: 11px; padding: 2px 6px; border-radius: var(--r-sm); }
.type-num  { background: oklch(65% 0.18 270 / 0.12); color: oklch(65% 0.18 270); }
.type-str  { background: oklch(from var(--brand) l c h / 0.10); color: var(--brand); }
.type-bool { background: oklch(78% 0.16 75 / 0.12); color: oklch(78% 0.16 75); }
.type-date { background: oklch(72% 0.13 220 / 0.12); color: oklch(72% 0.13 220); }
.type-json { background: oklch(65% 0.16 50 / 0.12); color: oklch(65% 0.16 50); }
.type-other { background: var(--glass-bg-strong); color: var(--text-muted); }
.col-default { max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fk-ref code { font-size: 10px; color: oklch(72% 0.13 220); }
.col-notes { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.schema-empty { display: grid; place-items: center; height: 200px; color: var(--text-muted); font-size: var(--t-sm); }

/* Role Matrix */
.matrix-controls { margin-bottom: var(--s-3); }
.matrix-scroll { overflow-x: auto; }
.matrix-table { width: 100%; border-collapse: collapse; }
.matrix-perm-col { min-width: 240px; width: 240px; }
.matrix-role-col { min-width: 100px; width: 100px; text-align: center; }
.matrix-table th {
  background: var(--glass-bg-strong); border-bottom: 2px solid var(--glass-border);
  padding: 10px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--text-muted);
}
.matrix-table td { padding: 7px 12px; border-bottom: 1px solid var(--glass-border); }
.matrix-table tr:hover td { background: var(--glass-bg); }
.matrix-group-row td { background: var(--glass-bg-strong) !important; }
.matrix-group-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.role-hd { font-size: 12px; color: var(--text); }
.matrix-perm-cell { display: flex; flex-direction: column; gap: 2px; }
.perm-label { font-size: var(--t-sm); font-weight: 500; }
.perm-key { font-size: 10px; color: var(--text-muted); }
.matrix-check-cell { text-align: center; }
.check-yes { color: var(--brand); font-weight: 700; font-size: var(--t-md); }
.check-no  { color: var(--text-muted); opacity: 0.4; }

/* Deploy Log */
.deploys-filter { display: flex; gap: var(--s-2); margin-bottom: var(--s-3); align-items: center; }
.sha-link { color: var(--brand); text-decoration: none; font-size: 12px; }
.sha-link:hover { text-decoration: underline; }
.commit-msg { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
