<script setup lang="ts">
/**
 * Permissions catalog (read reference).
 *
 * Permission-centric view: every permission key, grouped, risk-tagged, with a
 * cross-role coverage grid showing which roles currently grant it. To EDIT
 * which permissions a role has, use the Roles page (per-role matrix).
 *
 * Source: GET /api/v1/admin/access  (catalog + roles + permissions).
 */
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';

interface PermissionCatalogItem {
    key: string; label: string; group: string;
    risk: 'low' | 'medium' | 'high' | 'critical';
}
interface RoleRow { role_key: string; role_name: string; }
interface PermissionRow { role_key: string; route_hash: string; }
interface AccessResponse {
    catalog: PermissionCatalogItem[];
    roles: RoleRow[];
    permissions: PermissionRow[];
    staff: unknown[];
}

const STAFF_ROLES = ['super-admin', 'operations-manager', 'finance-checker', 'account'];

const loading = ref(true);
const error = ref<string | null>(null);
const catalog = ref<PermissionCatalogItem[]>([]);
const roles = ref<RoleRow[]>([]);
const permissions = ref<PermissionRow[]>([]);

const search = ref('');
const riskFilter = ref<'' | 'low' | 'medium' | 'high' | 'critical'>('');

// role_key → Set(route_hash)
const grantsByRole = computed(() => {
    const m = new Map<string, Set<string>>();
    for (const p of permissions.value) {
        if (!m.has(p.role_key)) m.set(p.role_key, new Set());
        m.get(p.role_key)!.add(p.route_hash);
    }
    return m;
});

const filteredCatalog = computed(() => {
    const q = search.value.trim().toLowerCase();
    return catalog.value.filter((i) =>
        (!riskFilter.value || i.risk === riskFilter.value) &&
        (!q || i.key.toLowerCase().includes(q) || i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q)),
    );
});

const grouped = computed(() => {
    const m = new Map<string, PermissionCatalogItem[]>();
    for (const i of filteredCatalog.value) {
        if (!m.has(i.group)) m.set(i.group, []);
        m.get(i.group)!.push(i);
    }
    return [...m.entries()].map(([group, items]) => ({ group, items }));
});

const riskSummary = computed(() => {
    const out = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const i of catalog.value) (out as any)[i.risk]++;
    return out;
});

function roleHas(roleKey: string, permKey: string) {
    return grantsByRole.value.get(roleKey)?.has(permKey) ?? false;
}

function roleName(key: string) {
    return roles.value.find((r) => r.role_key === key)?.role_name ?? key;
}

function riskClass(r: string) {
    return ({ critical: 'danger', high: 'warn', medium: 'info', low: 'neutral' } as Record<string, string>)[r] ?? 'neutral';
}

const displayRoles = computed(() =>
    STAFF_ROLES.filter((k) => roles.value.some((r) => r.role_key === k)),
);

async function load() {
    loading.value = true;
    error.value = null;
    try {
        const d = await api.get<AccessResponse>('/api/v1/admin/access');
        catalog.value = d.catalog;
        roles.value = d.roles;
        permissions.value = d.permissions;
    } catch (e: any) {
        error.value = e?.message ?? 'Failed to load permissions catalog.';
    } finally {
        loading.value = false;
    }
}

onMounted(load);
</script>

<template>
  <AppShell title="Permissions">

    <div v-if="error" class="bw-banner error">{{ error }}</div>

    <!-- Risk summary -->
    <div class="kpi-grid">
      <div class="kpi-tile">
        <p class="kpi-label">Total permissions</p>
        <p class="kpi-value">{{ catalog.length }}</p>
        <p class="kpi-sub">across {{ grouped.length }} groups</p>
      </div>
      <div class="kpi-tile">
        <p class="kpi-label">Critical</p>
        <p class="kpi-value" style="color: var(--danger)">{{ riskSummary.critical }}</p>
        <p class="kpi-sub">highest-risk actions</p>
      </div>
      <div class="kpi-tile">
        <p class="kpi-label">High</p>
        <p class="kpi-value" style="color: var(--warn)">{{ riskSummary.high }}</p>
        <p class="kpi-sub">elevated risk</p>
      </div>
      <div class="kpi-tile">
        <p class="kpi-label">Medium / Low</p>
        <p class="kpi-value">{{ riskSummary.medium + riskSummary.low }}</p>
        <p class="kpi-sub">routine actions</p>
      </div>
    </div>

    <!-- Filters + hint -->
    <div class="bw-card filter-card">
      <div class="filter-row">
        <input class="bw-input" v-model="search" placeholder="Search permission, label, or group…" style="flex: 1; min-width: 200px" />
        <select class="bw-input" v-model="riskFilter" style="width: 160px">
          <option value="">All risk levels</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <RouterLink to="/roles" class="bw-btn" style="text-decoration: none">Edit in Roles →</RouterLink>
      </div>
      <p class="hint">
        This is a read-only catalog. To grant or revoke a permission for a role, open the
        <RouterLink to="/roles" class="link">Roles</RouterLink> page and toggle it in the role matrix.
      </p>
    </div>

    <!-- Catalog with coverage grid -->
    <div v-if="loading" class="bw-card empty">Loading…</div>

    <div v-else class="bw-card flush">
      <div class="bw-t-wrap">
        <table class="bw-table perm-table">
          <thead>
            <tr>
              <th class="perm-col">Permission</th>
              <th>Risk</th>
              <th v-for="rk in displayRoles" :key="rk" class="role-col">{{ roleName(rk) }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="grp in grouped" :key="grp.group">
              <tr class="group-row">
                <td :colspan="2 + displayRoles.length">{{ grp.group }}</td>
              </tr>
              <tr v-for="item in grp.items" :key="item.key">
                <td class="perm-col">
                  <div class="perm-label">{{ item.label }}</div>
                  <div class="bw-mono perm-key">{{ item.key }}</div>
                </td>
                <td><span :class="['bw-badge', riskClass(item.risk)]">{{ item.risk }}</span></td>
                <td v-for="rk in displayRoles" :key="rk" class="cov-cell">
                  <span v-if="roleHas(rk, item.key)" class="cov-yes" :title="`${roleName(rk)} has this`">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7l3 3 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </span>
                  <span v-else class="cov-no" :title="`${roleName(rk)} does not have this`">·</span>
                </td>
              </tr>
            </template>
            <tr v-if="!grouped.length">
              <td :colspan="2 + displayRoles.length" class="bw-muted empty">No permissions match.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </AppShell>
</template>

<style scoped>
.bw-banner.error { background: oklch(from var(--danger) l c h / 0.08); border: 1px solid oklch(from var(--danger) l c h / 0.30); color: var(--danger); border-radius: var(--r-md); padding: var(--s-3) var(--s-4); margin-bottom: var(--s-3); font-size: var(--t-sm); }
.empty { text-align: center; padding: var(--s-6); }

.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--s-3); margin-bottom: var(--s-3); }
.kpi-tile { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: var(--s-4); }
.kpi-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); margin: 0 0 6px; }
.kpi-value { font-family: var(--font-mono); font-weight: 700; font-size: var(--t-xl); margin: 0; }
.kpi-sub { font-size: var(--t-xs); color: var(--text-muted); margin: 4px 0 0; }

.filter-card { margin-bottom: var(--s-3); }
.filter-row { display: flex; gap: var(--s-3); align-items: center; flex-wrap: wrap; }
.hint { font-size: var(--t-xs); color: var(--text-muted); margin: var(--s-3) 0 0; }
.link { color: var(--brand); text-decoration: underline; }

.perm-table th.role-col { text-align: center; font-size: var(--t-xs); white-space: nowrap; }
.perm-col { min-width: 240px; }
.perm-label { font-weight: 600; font-size: var(--t-sm); }
.perm-key { font-size: 10px; color: var(--text-muted); margin-top: 2px; }

.group-row td {
  background: var(--surface-2);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding: 6px var(--s-3) !important;
}

.cov-cell { text-align: center; }
.cov-yes { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: oklch(from var(--brand) l c h / 0.15); color: var(--brand); }
.cov-no { color: var(--text-faint); font-weight: 700; }

@media (max-width: 640px) {
  .filter-row { flex-direction: column; align-items: stretch; }
}
</style>
