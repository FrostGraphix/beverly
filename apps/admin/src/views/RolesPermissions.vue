<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, shortDate } from '../lib/api';
import { useStaffAuthStore } from '../stores/auth';

/* ─── Types ──────────────────────────────────────────────────────────── */
interface PermissionCatalogItem {
    key: string; label: string; group: string;
    risk: 'low' | 'medium' | 'high' | 'critical';
}
interface RoleRow {
    role_key: string; role_name: string;
    label?: string | null; description?: string | null;
}
interface PermissionRow { role_key: string; route_hash: string; }
interface StaffRow {
    id?: string; auth_user_id: string | null; user_id: string | null;
    user_name: string; email: string | null; role_key: string;
    last_sign_in_at: string | null; confirmed_at: string | null; updated_at?: string | null;
}
interface AccessResponse {
    catalog: PermissionCatalogItem[]; roles: RoleRow[];
    permissions: PermissionRow[]; staff: StaffRow[];
}

/* ─── State ───────────────────────────────────────────────────────────── */
const auth        = useStaffAuthStore();
const loading     = ref(true);
const saving      = ref(false);
const catalog     = ref<PermissionCatalogItem[]>([]);
const roles       = ref<RoleRow[]>([]);
const permissions = ref<PermissionRow[]>([]);
const staff       = ref<StaffRow[]>([]);
const activeTab   = ref<'matrix' | 'staff'>('matrix');
const selectedRole = ref('super-admin');
const staffSearch  = ref('');
const staffRole    = ref('');

/* invite */
const inviteOpen = ref(false);
const draft = ref({ email: '', fullName: '', roleKey: 'account', tempPassword: '' });

/* confirm */
const confirm = ref<{ title: string; body: string; label: string; danger: boolean; fn: () => Promise<void> } | null>(null);
const confirmBusy = ref(false);

/* temp-password reveal */
const tempPw = ref<string | null>(null);
const tempPwCopied = ref(false);
const tempCountdown = ref(60);
let countdown: ReturnType<typeof setInterval> | null = null;

/* toasts */
const toasts = ref<{ id: number; msg: string; kind: 'ok' | 'err' }[]>([]);
let seq = 0;

/* ─── Computed ────────────────────────────────────────────────────────── */
const canManage   = computed(() => auth.user?.role === 'super-admin');
const selRoleRow  = computed(() => roles.value.find(r => r.role_key === selectedRole.value) ?? roles.value[0]);
const rolePermSet = computed(() => new Set(permissions.value.filter(p => p.role_key === selectedRole.value).map(p => p.route_hash)));
const grouped     = computed(() => {
    const m = new Map<string, PermissionCatalogItem[]>();
    for (const i of catalog.value) { if (!m.has(i.group)) m.set(i.group, []); m.get(i.group)!.push(i); }
    return [...m.entries()].map(([g, items]) => ({ g, items }));
});
const coverage    = computed(() => catalog.value.length ? Math.round((rolePermSet.value.size / catalog.value.length) * 100) : 0);
const filteredStaff = computed(() => {
    let s = staff.value;
    if (staffRole.value) s = s.filter(u => u.role_key === staffRole.value);
    const q = staffSearch.value.trim().toLowerCase();
    return q ? s.filter(u => [u.user_name, u.email, u.role_key].some(v => String(v ?? '').toLowerCase().includes(q))) : s;
});
const riskCounts = computed(() => {
    const out = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const i of catalog.value) if (rolePermSet.value.has(i.key)) (out as any)[i.risk]++;
    return out;
});
const staffByRole = computed(() => {
    const m = new Map<string, number>();
    for (const u of staff.value) m.set(u.role_key, (m.get(u.role_key) ?? 0) + 1);
    return m;
});

/* ─── Helpers ─────────────────────────────────────────────────────────── */
const ROLE_COLORS: Record<string, string> = { 'super-admin': 'sa', 'operations-manager': 'om', 'finance-checker': 'fc', account: 'ac' };
const ROLE_DESCS: Record<string, string> = {
    'super-admin':          'Full system access. Can change roles, permissions, and all financial controls.',
    'operations-manager':   'Monitors vending activity, resolves disputes, reviews vendors, and runs reconciliation.',
    'finance-checker':      'Reviews and approves funding, manages refunds, and views settlement reports.',
    account:                'Day-to-day account officer — views funding queue, monitors vending, and reads settlements.',
};

function rc(key: string) { return ROLE_COLORS[key] ?? 'ac'; }
function initials(key: string) {
    const label = roles.value.find(r => r.role_key === key)?.role_name ?? key;
    return label.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
function permCount(key: string) { return permissions.value.filter(p => p.role_key === key).length; }
function relTime(iso: string | null) {
    if (!iso) return 'Never signed in';
    const d = Math.floor((Date.now() - +new Date(iso)) / 60000);
    if (d < 1)   return 'Just now';
    if (d < 60)  return `${d}m ago`;
    if (d < 1440) return `${Math.floor(d / 60)}h ago`;
    if (d < 10080) return `${Math.floor(d / 1440)}d ago`;
    return shortDate(iso);
}
function toast(msg: string, kind: 'ok' | 'err' = 'ok') {
    const id = ++seq;
    toasts.value.push({ id, msg, kind });
    setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 4200);
}
function groupProgress(items: PermissionCatalogItem[]) {
    return Math.round((items.filter(i => rolePermSet.value.has(i.key)).length / items.length) * 100);
}

/* ─── API ─────────────────────────────────────────────────────────────── */
async function load() {
    loading.value = true;
    try {
        const d = await api.get<AccessResponse>('/api/v1/admin/access');
        catalog.value     = d.catalog;
        roles.value       = d.roles.filter(r => ['super-admin', 'operations-manager', 'finance-checker', 'account'].includes(r.role_key));
        permissions.value = d.permissions;
        staff.value       = d.staff;
        if (!roles.value.some(r => r.role_key === selectedRole.value)) selectedRole.value = roles.value[0]?.role_key ?? 'super-admin';
    } catch (e: any) { toast(e?.message ?? 'Failed to load access policy', 'err'); }
    finally { loading.value = false; }
}

/* ─── Permission toggle ───────────────────────────────────────────────── */
function requestToggle(item: PermissionCatalogItem) {
    if (!canManage.value || selectedRole.value === 'super-admin' || saving.value) return;
    const on = rolePermSet.value.has(item.key);
    if (item.risk === 'critical') {
        confirm.value = {
            title:  on ? 'Revoke critical permission' : 'Grant critical permission',
            body:   `"${item.label}" carries critical risk.\n\n${on ? 'Revoking' : 'Granting'} this will immediately ${on ? 'restrict' : 'extend'} what ${selRoleRow.value?.role_name ?? selectedRole.value} staff can do. The change is audit-logged.`,
            label:  on ? 'Yes, revoke' : 'Yes, grant',
            danger: true,
            fn:     () => doToggle(item),
        };
    } else { doToggle(item); }
}
async function doToggle(item: PermissionCatalogItem) {
    const next = new Set(rolePermSet.value);
    next.has(item.key) ? next.delete(item.key) : next.add(item.key);
    saving.value = true;
    try {
        await api.put(`/api/v1/admin/access/roles/${selectedRole.value}/permissions`, { permissions: [...next] });
        toast(`${selRoleRow.value?.role_name} permissions updated.`);
        await load();
    } catch (e: any) { toast(e?.message ?? 'Could not update permissions', 'err'); }
    finally { saving.value = false; }
}

/* ─── Role change ─────────────────────────────────────────────────────── */
function requestRoleChange(user: StaffRow, next: string) {
    if (!canManage.value || !user.auth_user_id || next === user.role_key) return;
    const name = roles.value.find(r => r.role_key === next)?.role_name ?? next;
    const from = roles.value.find(r => r.role_key === user.role_key)?.role_name ?? user.role_key;
    confirm.value = {
        title:  'Change staff role',
        body:   `Move ${user.user_name || user.email} from ${from} → ${name}?\n\nPermissions update on their next request.`,
        label:  'Change role',
        danger: false,
        fn:     () => doRoleChange(user, next),
    };
}
async function doRoleChange(user: StaffRow, roleKey: string) {
    saving.value = true;
    try {
        await api.patch(`/api/v1/admin/access/users/${user.auth_user_id}/role`, { roleKey });
        const name = roles.value.find(r => r.role_key === roleKey)?.role_name ?? roleKey;
        toast(`${user.user_name || user.email} moved to ${name}.`);
        await load();
    } catch (e: any) { toast(e?.message ?? 'Could not update role', 'err'); }
    finally { saving.value = false; }
}

/* ─── Create staff ────────────────────────────────────────────────────── */
async function createStaff() {
    if (!canManage.value) return;
    saving.value = true;
    try {
        const res = await api.post<{ temporaryPassword: string }>('/api/v1/admin/access/users', {
            email: draft.value.email, fullName: draft.value.fullName,
            roleKey: draft.value.roleKey, temporaryPassword: draft.value.tempPassword || undefined,
        });
        inviteOpen.value = false;
        draft.value = { email: '', fullName: '', roleKey: 'account', tempPassword: '' };
        await load();
        revealTempPw(res.temporaryPassword);
        toast('Staff user created.');
    } catch (e: any) { toast(e?.message ?? 'Could not create user', 'err'); }
    finally { saving.value = false; }
}

/* ─── Temp password ───────────────────────────────────────────────────── */
function revealTempPw(pw: string) {
    tempPw.value = pw; tempPwCopied.value = false; tempCountdown.value = 60;
    clearInterval(countdown!);
    countdown = setInterval(() => { if (--tempCountdown.value <= 0) closeTempPw(); }, 1000);
}
function closeTempPw() { clearInterval(countdown!); tempPw.value = null; }
async function copyTempPw() {
    if (!tempPw.value) return;
    await navigator.clipboard.writeText(tempPw.value);
    tempPwCopied.value = true;
    setTimeout(() => (tempPwCopied.value = false), 2500);
}

/* ─── Confirm helper ──────────────────────────────────────────────────── */
async function runConfirm() {
    if (!confirm.value) return;
    confirmBusy.value = true;
    try { await confirm.value.fn(); }
    finally { confirmBusy.value = false; confirm.value = null; }
}

onUnmounted(() => { if (countdown) clearInterval(countdown); });
onMounted(load);
</script>

<template>
  <AppShell title="Roles & Team">

    <!-- ══ TOAST STACK ══════════════════════════════════════════════════ -->
    <teleport to="body">
      <div class="ac-toasts">
        <transition-group name="ac-toast">
          <div v-for="t in toasts" :key="t.id" :class="['ac-toast', t.kind === 'err' ? 'ac-toast--err' : 'ac-toast--ok']">
            <span class="ac-toast-dot" />
            {{ t.msg }}
          </div>
        </transition-group>
      </div>
    </teleport>

    <!-- ══ CONFIRM ══════════════════════════════════════════════════════ -->
    <teleport to="body">
      <transition name="ac-overlay">
        <div v-if="confirm" class="ac-overlay" @click.self="confirm = null">
          <div :class="['ac-dialog', confirm.danger && 'ac-dialog--danger']">
            <div class="ac-dialog-glyph">
              <svg v-if="confirm.danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
            </div>
            <h3>{{ confirm.title }}</h3>
            <p>{{ confirm.body }}</p>
            <div class="ac-dialog-foot">
              <button class="bw-btn ghost" @click="confirm = null">Cancel</button>
              <button :class="['bw-btn', confirm.danger ? 'danger' : 'primary']" :disabled="confirmBusy" @click="runConfirm">
                {{ confirmBusy ? 'Working…' : confirm.label }}
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- ══ TEMP-PASSWORD ════════════════════════════════════════════════ -->
    <teleport to="body">
      <transition name="ac-overlay">
        <div v-if="tempPw" class="ac-overlay" @click.self="closeTempPw">
          <div class="ac-pwcard">
            <div class="ac-pwcard-top">
              <div class="ac-pwcard-lock">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              </div>
              <div>
                <p class="ac-overline">Temporary password</p>
                <h3>Share via approved secure channel only</h3>
                <p class="ac-sub">Shown <strong>once</strong> — closes in {{ tempCountdown }}s</p>
              </div>
            </div>
            <div class="ac-pw-reveal">
              <code>{{ tempPw }}</code>
              <button :class="['ac-copy-btn', tempPwCopied && 'ac-copy-btn--done']" @click="copyTempPw">
                <svg v-if="!tempPwCopied" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                {{ tempPwCopied ? 'Copied!' : 'Copy' }}
              </button>
            </div>
            <button class="bw-btn ghost" style="width:100%;justify-content:center" @click="closeTempPw">Dismiss</button>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- ══ INVITE MODAL ══════════════════════════════════════════════════ -->
    <teleport to="body">
      <transition name="ac-overlay">
        <div v-if="inviteOpen" class="ac-overlay" @click.self="inviteOpen = false">
          <div class="ac-invite">
            <div class="ac-invite-head">
              <div>
                <p class="ac-overline">New staff member</p>
                <h3>Create wallet admin user</h3>
              </div>
              <button class="bw-icon-btn" @click="inviteOpen = false">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <form @submit.prevent="createStaff">
              <div class="ac-fields">
                <div class="ac-field">
                  <label class="bw-label">Full name</label>
                  <input v-model="draft.fullName" class="bw-input" placeholder="Ada Okonkwo" required />
                </div>
                <div class="ac-field">
                  <label class="bw-label">Work email</label>
                  <input v-model="draft.email" class="bw-input" type="email" placeholder="ada@company.ng" required />
                </div>
              </div>

              <!-- Role picker -->
              <div class="ac-field ac-field--full">
                <label class="bw-label">Assign role</label>
                <div class="ac-role-grid">
                  <button
                    v-for="r in roles.filter(r => r.role_key !== 'super-admin')"
                    :key="r.role_key"
                    type="button"
                    :class="['ac-role-pick', `rc-${rc(r.role_key)}`, draft.roleKey === r.role_key && 'is-picked']"
                    @click="draft.roleKey = r.role_key"
                  >
                    <span class="ac-role-pick-badge">{{ initials(r.role_key) }}</span>
                    <span class="ac-role-pick-name">{{ r.role_name }}</span>
                    <span class="ac-role-pick-count">{{ permCount(r.role_key) }} perms</span>
                  </button>
                </div>
              </div>

              <!-- Permission preview for picked role -->
              <div class="ac-perm-preview">
                <p class="bw-label" style="margin-bottom:8px">What they can do</p>
                <div class="ac-perm-chips">
                  <span
                    v-for="item in catalog.filter(i => permissions.some(p => p.role_key === draft.roleKey && p.route_hash === i.key))"
                    :key="item.key"
                    :class="['ac-chip', `risk-${item.risk}`]"
                  >{{ item.label }}</span>
                  <span v-if="!catalog.filter(i => permissions.some(p => p.role_key === draft.roleKey && p.route_hash === i.key)).length" class="ac-empty-chips">No permissions assigned to this role yet.</span>
                </div>
              </div>

              <div class="ac-field ac-field--full">
                <label class="bw-label">Temp password <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-faint)">(auto-generated if blank)</span></label>
                <input v-model="draft.tempPassword" class="bw-input bw-mono" minlength="12" placeholder="Leave blank to auto-generate" />
              </div>

              <div class="ac-invite-actions">
                <button type="button" class="bw-btn ghost" @click="inviteOpen = false">Cancel</button>
                <button class="bw-btn primary" :disabled="saving || !draft.email || !draft.fullName">
                  {{ saving ? 'Creating…' : 'Create staff user' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- ══════════════════════════════════════════ PAGE BODY ═══════════ -->
    <div class="ac-page">

      <!-- ── COMMAND HEADER ───────────────────────────────────────────── -->
      <header class="ac-header">
        <div class="ac-header-glow" />
        <div class="ac-header-inner">
          <div class="ac-header-left">
            <p class="ac-overline">Access Control</p>
            <h1 class="ac-header-title">Roles &amp; Permissions</h1>
            <p class="ac-header-sub">Define exactly who can move money, approve refunds, run reconciliation, and control launch gates.</p>
          </div>
          <div class="ac-kpi-strip">
            <div class="ac-kpi">
              <span class="ac-kpi-num">{{ roles.length }}</span>
              <span class="ac-kpi-lbl">Roles</span>
            </div>
            <div class="ac-kpi-sep" />
            <div class="ac-kpi">
              <span class="ac-kpi-num">{{ catalog.length }}</span>
              <span class="ac-kpi-lbl">Permissions</span>
            </div>
            <div class="ac-kpi-sep" />
            <div class="ac-kpi">
              <span class="ac-kpi-num">{{ staff.length }}</span>
              <span class="ac-kpi-lbl">Staff</span>
            </div>
            <div class="ac-kpi-sep" />
            <div class="ac-kpi">
              <span class="ac-kpi-num">{{ staff.filter(u => u.confirmed_at).length }}</span>
              <span class="ac-kpi-lbl">Active</span>
            </div>
          </div>
        </div>

        <!-- Read-only notice -->
        <div v-if="!canManage && !loading" class="ac-readonly-bar">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="7" width="9" height="7" rx="1.5"/><path d="M6 7V5a2 2 0 014 0v2"/></svg>
          Read-only — only Super Admins can modify roles or assign users
        </div>
      </header>

      <!-- ── TAB BAR ──────────────────────────────────────────────────── -->
      <div class="ac-tabbar">
        <button :class="['ac-tab', activeTab === 'matrix' && 'ac-tab--on']" @click="activeTab = 'matrix'">
          <svg viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zm8 0a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2h-2zm-8 8a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zm8 0a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2h-2z"/></svg>
          Permission Matrix
        </button>
        <button :class="['ac-tab', activeTab === 'staff' && 'ac-tab--on']" @click="activeTab = 'staff'">
          <svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zm8 0a3 3 0 11-6 0 3 3 0 016 0zM.458 18C1.7 14.533 5.1 12 9 12c1.418 0 2.75.375 3.9 1.025A6.979 6.979 0 0013 18H.458zm18 0a6.979 6.979 0 00-4.9-6.025C14.25 12.375 15.582 12 17 12c1.98 0 3.763.8 5.07 2.088A7.014 7.014 0 0122 18h-3.542z"/></svg>
          Staff
          <span class="ac-tab-count">{{ staff.length }}</span>
        </button>
        <div class="ac-tabbar-trail" />
      </div>

      <!-- ══ MATRIX TAB ══════════════════════════════════════════════════ -->
      <div v-show="activeTab === 'matrix'" class="ac-matrix-layout">

        <!-- Role rail -->
        <aside class="ac-rail">
          <p class="ac-section-label">Select role to inspect</p>

          <!-- Skeleton -->
          <template v-if="loading">
            <div v-for="i in 4" :key="i" class="ac-skel ac-skel--role" />
          </template>

          <button
            v-else
            v-for="r in roles"
            :key="r.role_key"
            :class="['ac-role-btn', `rc-${rc(r.role_key)}`, selectedRole === r.role_key && 'is-active']"
            @click="selectedRole = r.role_key"
          >
            <div :class="['ac-role-avatar', `rc-${rc(r.role_key)}`]">{{ initials(r.role_key) }}</div>
            <div class="ac-role-info">
              <strong>{{ r.role_name }}</strong>
              <span>{{ permCount(r.role_key) }}/{{ catalog.length }} grants</span>
            </div>
            <div class="ac-role-head-count">
              <svg viewBox="0 0 14 14" fill="currentColor"><path d="M7 7a3 3 0 100-6 3 3 0 000 6zm-5 7a5 5 0 0110 0H2z"/></svg>
              {{ staffByRole.get(r.role_key) ?? 0 }}
            </div>
          </button>
        </aside>

        <!-- Matrix panel -->
        <section class="ac-matrix">

          <!-- Panel header -->
          <div class="ac-matrix-head">
            <div class="ac-matrix-identity">
              <div :class="['ac-matrix-avatar', `rc-${rc(selectedRole)}`]">{{ initials(selectedRole) }}</div>
              <div>
                <p class="ac-overline">Permission matrix</p>
                <h2>{{ selRoleRow?.role_name }}</h2>
                <p class="ac-matrix-desc">{{ selRoleRow?.description || ROLE_DESCS[selectedRole] || 'Operational role for the Beverly wallet workspace.' }}</p>
              </div>
            </div>

            <div class="ac-matrix-gauges">
              <!-- Coverage ring -->
              <div class="ac-ring-wrap">
                <svg class="ac-ring" viewBox="0 0 72 72">
                  <circle cx="36" cy="36" r="28" fill="none" stroke-width="7" class="ac-ring-bg" />
                  <circle
                    cx="36" cy="36" r="28" fill="none" stroke-width="7"
                    class="ac-ring-fg"
                    :style="{ strokeDasharray: `${(coverage / 100) * 175.9} 175.9` }"
                    transform="rotate(-90 36 36)"
                  />
                </svg>
                <div class="ac-ring-center">
                  <strong>{{ coverage }}%</strong>
                  <span>coverage</span>
                </div>
              </div>

              <!-- Risk breakdown -->
              <div class="ac-risk-grid">
                <div v-for="(label, key) in { critical: 'CRIT', high: 'HIGH', medium: 'MED', low: 'LOW' }" :key="key" :class="['ac-risk-tile', `risk-${key}`]">
                  <strong>{{ (riskCounts as any)[key] }}</strong>
                  <span>{{ label }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Locked notice -->
          <div v-if="selectedRole === 'super-admin'" class="ac-locked-bar">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/></svg>
            <span>Super Admin always holds every permission — the matrix is locked to prevent accidental lockout.</span>
          </div>

          <!-- Groups skeleton -->
          <div v-if="loading" class="ac-groups">
            <div v-for="i in 3" :key="i">
              <div class="ac-skel ac-skel--label" />
              <div class="ac-perm-list">
                <div v-for="j in 3" :key="j" class="ac-skel ac-skel--perm" />
              </div>
            </div>
          </div>

          <!-- Groups -->
          <div v-else class="ac-groups">
            <div v-for="grp in grouped" :key="grp.g" class="ac-group">
              <!-- Group header with progress bar -->
              <div class="ac-group-head">
                <span class="ac-section-label">{{ grp.g }}</span>
                <div class="ac-group-progress">
                  <div class="ac-group-bar">
                    <div class="ac-group-fill" :style="{ width: groupProgress(grp.items) + '%' }" />
                  </div>
                  <span class="ac-group-tally">{{ grp.items.filter(i => rolePermSet.has(i.key)).length }}/{{ grp.items.length }}</span>
                </div>
              </div>

              <div class="ac-perm-list">
                <button
                  v-for="item in grp.items"
                  :key="item.key"
                  :class="[
                    'ac-perm-row',
                    rolePermSet.has(item.key) && 'is-on',
                    selectedRole === 'super-admin' && 'is-locked',
                  ]"
                  :disabled="saving || !canManage || selectedRole === 'super-admin'"
                  @click="requestToggle(item)"
                >
                  <!-- Left: label + key -->
                  <div class="ac-perm-left">
                    <div :class="['ac-perm-dot', `risk-${item.risk}`]" />
                    <div>
                      <span class="ac-perm-label">{{ item.label }}</span>
                      <code class="ac-perm-key">{{ item.key }}</code>
                    </div>
                  </div>

                  <!-- Risk badge -->
                  <span :class="['ac-risk-badge', `risk-${item.risk}`]">{{ item.risk }}</span>

                  <!-- Toggle -->
                  <div :class="['ac-toggle', rolePermSet.has(item.key) && 'is-on', selectedRole === 'super-admin' && 'is-locked']">
                    <div class="ac-toggle-thumb" />
                  </div>
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- ══ STAFF TAB ═══════════════════════════════════════════════════ -->
      <div v-show="activeTab === 'staff'" class="ac-staff-wrap">

        <!-- Toolbar -->
        <div class="ac-staff-bar">
          <div class="bw-input-wrap" style="flex:1;min-width:180px">
            <svg class="bw-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input v-model="staffSearch" class="bw-input" placeholder="Search name or email…" />
          </div>

          <div class="ac-filters">
            <button :class="['ac-filter', staffRole === '' && 'is-active']" @click="staffRole = ''">
              All <span>{{ staff.length }}</span>
            </button>
            <button
              v-for="r in roles"
              :key="r.role_key"
              :class="['ac-filter', `rc-${rc(r.role_key)}`, staffRole === r.role_key && 'is-active']"
              @click="staffRole = staffRole === r.role_key ? '' : r.role_key"
            >
              {{ initials(r.role_key) }} <span>{{ staffByRole.get(r.role_key) ?? 0 }}</span>
            </button>
          </div>

          <button class="bw-btn primary" :disabled="!canManage" @click="inviteOpen = true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add staff
          </button>
        </div>

        <!-- Skeleton -->
        <div v-if="loading" class="ac-staff-grid">
          <div v-for="i in 6" :key="i" class="ac-skel ac-skel--staff" />
        </div>

        <!-- Empty -->
        <div v-else-if="!filteredStaff.length" class="ac-empty">
          <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="32" cy="22" r="10"/><path d="M10 54c0-12.15 9.85-22 22-22s22 9.85 22 22"/><line x1="50" y1="40" x2="50" y2="54"/><line x1="43" y1="47" x2="57" y2="47"/></svg>
          <p>{{ staffSearch || staffRole ? 'No staff match your filters.' : 'No staff users yet.' }}</p>
          <button v-if="canManage && !staffSearch && !staffRole" class="bw-btn primary" @click="inviteOpen = true">Add first staff user</button>
        </div>

        <!-- Grid -->
        <div v-else class="ac-staff-grid">
          <article v-for="u in filteredStaff" :key="u.auth_user_id || u.user_id || u.email || u.id" :class="['ac-staff-card', `rc-${rc(u.role_key)}`]">
            <!-- Card accent line -->
            <div class="ac-card-accent" />

            <div class="ac-staff-top">
              <div :class="['ac-staff-avatar', `rc-${rc(u.role_key)}`]">{{ initials(u.role_key) }}</div>
              <div class="ac-staff-identity">
                <strong>{{ u.user_name || '—' }}</strong>
                <span>{{ u.email || 'No email' }}</span>
              </div>
              <span :class="['ac-status-pip', u.confirmed_at ? 'pip-ok' : 'pip-wait']" :title="u.confirmed_at ? 'Confirmed' : 'Invitation pending'" />
            </div>

            <dl class="ac-staff-meta">
              <div>
                <dt>Last active</dt>
                <dd>{{ relTime(u.last_sign_in_at) }}</dd>
              </div>
              <div>
                <dt>Account</dt>
                <dd>{{ u.confirmed_at ? 'Confirmed' : 'Pending invite' }}</dd>
              </div>
              <div>
                <dt>Permissions</dt>
                <dd>{{ catalog.filter(i => permissions.some(p => p.role_key === u.role_key && p.route_hash === i.key)).length }} grants</dd>
              </div>
            </dl>

            <!-- Mini permission badges -->
            <div class="ac-staff-grants">
              <span
                v-for="g in [...new Set(catalog.filter(i => permissions.some(p => p.role_key === u.role_key && p.route_hash === i.key)).map(i => i.group))].slice(0, 4)"
                :key="g"
                class="ac-grant-chip"
              >{{ g }}</span>
              <span v-if="[...new Set(catalog.filter(i => permissions.some(p => p.role_key === u.role_key && p.route_hash === i.key)).map(i => i.group))].length > 4" class="ac-grant-more">
                +{{ [...new Set(catalog.filter(i => permissions.some(p => p.role_key === u.role_key && p.route_hash === i.key)).map(i => i.group))].length - 4 }}
              </span>
            </div>

            <!-- Role selector -->
            <div class="ac-staff-role">
              <label class="bw-label" style="margin-bottom:5px">Role</label>
              <div class="ac-select-wrap">
                <select
                  class="bw-select"
                  :value="u.role_key"
                  :disabled="saving || !canManage || !u.auth_user_id"
                  @change="requestRoleChange(u, ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="r in roles" :key="r.role_key" :value="r.role_key">{{ r.role_name }}</option>
                </select>
              </div>
            </div>
          </article>
        </div>
      </div>

    </div><!-- /ac-page -->
  </AppShell>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════════
   ROLE COLOR TOKENS
   ═══════════════════════════════════════════════════════════════════════ */
.rc-sa { --rc: 139 92 246; --rc-fg: #a78bfa; }   /* violet  */
.rc-om { --rc: 59 130 246; --rc-fg: #60a5fa; }    /* blue    */
.rc-fc { --rc: 16 185 129; --rc-fg: #34d399; }    /* emerald */
.rc-ac { --rc: 245 158 11; --rc-fg: #fbbf24; }    /* amber   */

/* ═══════════════════════════════════════════════════════════════════════
   RISK PALETTE
   ═══════════════════════════════════════════════════════════════════════ */
.risk-critical { --rk: 239 68 68;   --rk-fg: #f87171; }
.risk-high     { --rk: 249 115 22;  --rk-fg: #fb923c; }
.risk-medium   { --rk: 234 179 8;   --rk-fg: #facc15; }
.risk-low      { --rk: 34 197 94;   --rk-fg: #4ade80; }

/* ═══════════════════════════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════════════════════════ */
.ac-toasts { position: fixed; bottom: 28px; right: 28px; z-index: 999; display: flex; flex-direction: column-reverse; gap: 10px; pointer-events: none; }
.ac-toast {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 18px; border-radius: var(--r-md);
  font-size: var(--t-sm); font-weight: 600;
  border: 1px solid; pointer-events: auto;
  backdrop-filter: blur(20px) saturate(150%);
  box-shadow: 0 8px 32px rgba(0,0,0,.35);
}
.ac-toast-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.ac-toast--ok  { background: oklch(from var(--brand)  l c h / .14); color: var(--brand);  border-color: oklch(from var(--brand)  l c h / .30); }
.ac-toast--err { background: oklch(from var(--danger) l c h / .14); color: var(--danger); border-color: oklch(from var(--danger) l c h / .30); }
.ac-toast-enter-active, .ac-toast-leave-active { transition: all .25s var(--ease-out); }
.ac-toast-enter-from, .ac-toast-leave-to { opacity: 0; transform: translateX(16px) scale(.95); }

/* ═══════════════════════════════════════════════════════════════════════
   OVERLAY / DIALOGS
   ═══════════════════════════════════════════════════════════════════════ */
.ac-overlay {
  position: fixed; inset: 0; z-index: 200;
  display: grid; place-items: center; padding: 1.5rem;
  background: oklch(0% 0 0 / .72);
  backdrop-filter: blur(6px) saturate(120%);
}
.ac-overlay-enter-active, .ac-overlay-leave-active { transition: opacity .22s var(--ease-out); }
.ac-overlay-enter-from, .ac-overlay-leave-to { opacity: 0; }
.ac-overlay-enter-active > *, .ac-overlay-leave-active > * { transition: transform .22s var(--ease-out), opacity .22s var(--ease-out); }
.ac-overlay-enter-from > *, .ac-overlay-leave-to > * { transform: scale(.95) translateY(10px); opacity: 0; }

/* Confirm dialog */
.ac-dialog {
  width: min(480px, 100%);
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--r-2xl); padding: 2rem;
  display: flex; flex-direction: column; gap: 1rem;
  box-shadow: 0 24px 80px rgba(0,0,0,.5);
}
.ac-dialog--danger { border-color: oklch(from var(--danger) l c h / .3); }
.ac-dialog-glyph {
  width: 48px; height: 48px; border-radius: var(--r-lg);
  display: grid; place-items: center;
  background: oklch(from var(--warn) l c h / .15); color: var(--warn);
}
.ac-dialog--danger .ac-dialog-glyph { background: oklch(from var(--danger) l c h / .15); color: var(--danger); }
.ac-dialog-glyph svg { width: 22px; height: 22px; }
.ac-dialog h3 { margin: 0; font-size: var(--t-lg); font-weight: 700; letter-spacing: -0.015em; }
.ac-dialog p  { margin: 0; color: var(--text-dim); font-size: var(--t-sm); white-space: pre-line; line-height: 1.65; }
.ac-dialog-foot { display: flex; justify-content: flex-end; gap: .75rem; padding-top: .5rem; }

/* Temp-password card */
.ac-pwcard {
  width: min(520px, 100%);
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--r-2xl); padding: 2rem;
  display: flex; flex-direction: column; gap: 1.5rem;
  box-shadow: 0 24px 80px rgba(0,0,0,.5);
}
.ac-pwcard-top { display: flex; gap: 1.25rem; align-items: flex-start; }
.ac-pwcard-lock {
  width: 52px; height: 52px; flex-shrink: 0; border-radius: var(--r-lg);
  display: grid; place-items: center;
  background: oklch(from var(--brand) l c h / .16); color: var(--brand);
}
.ac-pwcard-lock svg { width: 24px; height: 24px; }
.ac-pwcard-top h3 { margin: 0 0 4px; font-size: var(--t-md); font-weight: 700; }
.ac-sub { margin: 0; font-size: var(--t-sm); color: var(--text-dim); }
.ac-pw-reveal {
  display: flex; align-items: center; gap: 1rem;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--r-lg); padding: 1.25rem 1.25rem;
}
.ac-pw-reveal code {
  flex: 1; font-family: var(--font-mono); font-size: 1.05rem;
  letter-spacing: .05em; color: var(--text); word-break: break-all;
}
.ac-copy-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: var(--r-md);
  border: 1px solid var(--border); background: var(--surface-3);
  color: var(--text-dim); font-size: var(--t-sm); font-weight: 600;
  cursor: pointer; white-space: nowrap; flex-shrink: 0;
  transition: all var(--dur-fast);
}
.ac-copy-btn svg { width: 13px; height: 13px; }
.ac-copy-btn:hover { border-color: var(--border-strong); color: var(--text); }
.ac-copy-btn--done { background: oklch(from var(--brand) l c h / .16); border-color: oklch(from var(--brand) l c h / .4); color: var(--brand); }

/* Invite modal */
.ac-invite {
  width: min(620px, 100%);
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--r-2xl); overflow: hidden;
  box-shadow: 0 24px 80px rgba(0,0,0,.5);
}
.ac-invite-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 2rem 2rem 0;
}
.ac-invite-head h3 { margin: 4px 0 0; font-size: var(--t-lg); font-weight: 700; letter-spacing: -0.015em; }
.ac-invite form { padding: 1.5rem 2rem 2rem; display: flex; flex-direction: column; gap: 1.25rem; }
.ac-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.ac-field { display: flex; flex-direction: column; gap: 6px; }
.ac-field--full { grid-column: 1 / -1; }

.ac-role-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ac-role-pick {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 14px 10px; border-radius: var(--r-lg);
  border: 1px solid var(--border); background: var(--surface-2);
  cursor: pointer; transition: all var(--dur-fast);
}
.ac-role-pick:hover { border-color: rgba(var(--rc), .4); background: rgba(var(--rc), .06); }
.ac-role-pick.is-picked { border-color: rgba(var(--rc), .55); background: rgba(var(--rc), .12); box-shadow: 0 0 0 3px rgba(var(--rc), .12); }
.ac-role-pick-badge { width: 36px; height: 36px; border-radius: var(--r-md); display: grid; place-items: center; background: rgba(var(--rc), .22); color: rgb(var(--rc)); font-size: var(--t-xs); font-weight: 900; }
.ac-role-pick-name  { font-size: var(--t-sm); font-weight: 700; color: var(--text-dim); }
.ac-role-pick.is-picked .ac-role-pick-name { color: rgb(var(--rc)); }
.ac-role-pick-count { font-size: var(--t-2xs); color: var(--text-muted); font-family: var(--font-mono); }

.ac-perm-preview { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 1rem; }
.ac-perm-chips  { display: flex; flex-wrap: wrap; gap: 6px; }
.ac-chip {
  padding: 3px 10px; border-radius: var(--r-full);
  border: 1px solid rgba(var(--rk), .3);
  background: rgba(var(--rk), .12);
  color: rgb(var(--rk)); font-size: var(--t-2xs); font-weight: 700;
  text-transform: capitalize;
}
.ac-empty-chips { font-size: var(--t-sm); color: var(--text-muted); }
.ac-invite-actions { display: flex; justify-content: flex-end; gap: .75rem; padding-top: .5rem; }

/* ═══════════════════════════════════════════════════════════════════════
   PAGE BODY
   ═══════════════════════════════════════════════════════════════════════ */
.ac-page { display: flex; flex-direction: column; gap: 0; }

/* ── Command header ──────────────────────────────────────────────────── */
.ac-header {
  position: relative; overflow: hidden;
  padding: clamp(2rem, 5vw, 3.5rem) clamp(1.5rem, 4vw, 3rem);
  border-radius: var(--r-2xl);
  background: linear-gradient(140deg, oklch(12% .02 260) 0%, oklch(8% .01 260) 100%);
  border: 1px solid oklch(100% 0 0 / .07);
  margin-bottom: var(--s-5);
}
.ac-header-glow {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(60% 50% at 90% 0%, oklch(70% 0.19 145 / .20) 0%, transparent 70%),
    radial-gradient(40% 60% at 5% 100%, oklch(68% 0.17 280 / .18) 0%, transparent 60%);
}
.ac-header-inner { position: relative; display: flex; justify-content: space-between; align-items: flex-start; gap: 2rem; flex-wrap: wrap; }
.ac-header-title { margin: .25rem 0 0; font-size: clamp(2rem, 5vw, 3.6rem); font-weight: 800; letter-spacing: -.05em; line-height: 1; }
.ac-header-sub   { margin: .75rem 0 0; color: var(--text-muted); font-size: var(--t-base); max-width: 520px; line-height: 1.55; }
.ac-kpi-strip {
  display: flex; align-items: center;
  background: oklch(100% 0 0 / .05); border: 1px solid oklch(100% 0 0 / .1);
  border-radius: var(--r-xl); overflow: hidden; flex-shrink: 0; align-self: flex-start; margin-top: 4px;
}
.ac-kpi { padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 4px; min-width: 72px; }
.ac-kpi-num { font-size: 1.75rem; font-weight: 900; letter-spacing: -.03em; font-family: var(--font-mono); line-height: 1; }
.ac-kpi-lbl { font-size: var(--t-2xs); text-transform: uppercase; letter-spacing: .1em; color: var(--text-muted); font-weight: 700; }
.ac-kpi-sep { width: 1px; align-self: stretch; background: oklch(100% 0 0 / .08); }

.ac-readonly-bar {
  position: relative; margin-top: 1.25rem;
  display: flex; align-items: center; gap: .6rem;
  padding: .6rem 1rem; border-radius: var(--r-md);
  background: oklch(from var(--warn) l c h / .1);
  border: 1px solid oklch(from var(--warn) l c h / .25);
  color: var(--warn); font-size: var(--t-sm); font-weight: 600;
}
.ac-readonly-bar svg { width: 14px; height: 14px; flex-shrink: 0; }

/* ── Tab bar ─────────────────────────────────────────────────────────── */
.ac-tabbar {
  display: flex; align-items: center; gap: 4px;
  border-bottom: 1px solid var(--border);
  padding: 0 2px; margin-bottom: var(--s-5); flex-shrink: 0;
}
.ac-tabbar-trail { flex: 1; }
.ac-tab {
  display: inline-flex; align-items: center; gap: .5rem;
  padding: .7rem 1.25rem; border: none; background: transparent;
  color: var(--text-muted); font: 600 var(--t-sm) var(--font-sans);
  cursor: pointer; position: relative; border-radius: var(--r-md) var(--r-md) 0 0;
  transition: color var(--dur-fast), background var(--dur-fast);
  letter-spacing: -0.01em;
}
.ac-tab svg { width: 15px; height: 15px; flex-shrink: 0; }
.ac-tab:hover { color: var(--text-dim); background: var(--surface-2); }
.ac-tab--on { color: var(--text); }
.ac-tab--on::after {
  content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 2px;
  background: var(--brand); border-radius: 2px 2px 0 0;
  box-shadow: 0 0 10px var(--brand-glow);
}
.ac-tab-count {
  background: var(--surface-3); border-radius: var(--r-full);
  padding: 1px 7px; font-size: var(--t-2xs); font-weight: 700;
  font-family: var(--font-mono); color: var(--text-muted);
}
.ac-tab--on .ac-tab-count { background: var(--brand-glow); color: var(--brand); }

/* ─────────────────────────────────────────────────────────────────────
   MATRIX LAYOUT
   ───────────────────────────────────────────────────────────────────── */
.ac-matrix-layout { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: var(--s-4); align-items: start; }

/* Rail */
.ac-rail { position: sticky; top: 68px; display: flex; flex-direction: column; gap: 6px; }
.ac-role-btn {
  display: flex; align-items: center; gap: .75rem; width: 100%; padding: .875rem;
  border: 1px solid var(--border); border-radius: var(--r-xl);
  background: var(--surface-2); color: var(--text); text-align: left;
  cursor: pointer; transition: all var(--dur-fast);
}
.ac-role-btn:hover { border-color: rgba(var(--rc), .4); background: rgba(var(--rc), .06); transform: translateX(2px); }
.ac-role-btn.is-active {
  background: rgba(var(--rc), .12); border-color: rgba(var(--rc), .5);
  box-shadow: inset 3px 0 0 rgb(var(--rc));
}
.ac-role-avatar {
  width: 40px; height: 40px; border-radius: var(--r-lg); flex-shrink: 0;
  display: grid; place-items: center; font-size: var(--t-xs); font-weight: 900;
  background: rgba(var(--rc), .22); color: rgb(var(--rc));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.18);
}
.ac-role-info { flex: 1; min-width: 0; }
.ac-role-info strong { display: block; font-size: var(--t-sm); font-weight: 700; letter-spacing: -0.01em; }
.ac-role-info span   { display: block; font-size: var(--t-2xs); color: var(--text-muted); margin-top: 2px; font-family: var(--font-mono); }
.ac-role-head-count { display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: var(--t-2xs); color: var(--text-faint); font-family: var(--font-mono); }
.ac-role-head-count svg { width: 12px; height: 12px; }

/* Matrix panel */
.ac-matrix {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--r-2xl); overflow: hidden;
  display: flex; flex-direction: column;
}
.ac-matrix-head {
  padding: 1.75rem 2rem; display: flex; justify-content: space-between;
  align-items: flex-start; gap: 1.5rem;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(135deg, var(--surface-2), var(--surface));
}
.ac-matrix-identity { display: flex; gap: 1.125rem; align-items: flex-start; min-width: 0; }
.ac-matrix-avatar {
  width: 54px; height: 54px; border-radius: var(--r-xl); flex-shrink: 0;
  display: grid; place-items: center; font-size: var(--t-md); font-weight: 900;
  background: rgba(var(--rc), .22); color: rgb(var(--rc));
  border: 1px solid rgba(var(--rc), .3);
  box-shadow: 0 4px 16px rgba(var(--rc), .2);
}
.ac-matrix-identity h2 { margin: 3px 0 0; font-size: clamp(1.4rem, 2.5vw, 2rem); font-weight: 800; letter-spacing: -0.03em; }
.ac-matrix-desc { margin: .4rem 0 0; color: var(--text-muted); font-size: var(--t-sm); max-width: 480px; line-height: 1.55; }
.ac-matrix-gauges { display: flex; gap: 1rem; align-items: center; flex-shrink: 0; }

/* Coverage ring */
.ac-ring-wrap { position: relative; width: 84px; height: 84px; flex-shrink: 0; }
.ac-ring { width: 84px; height: 84px; }
.ac-ring-bg { stroke: var(--surface-3); }
.ac-ring-fg { stroke: var(--brand); stroke-linecap: round; transition: stroke-dasharray .7s cubic-bezier(.4,0,.2,1); filter: drop-shadow(0 0 6px var(--brand-glow)); }
.ac-ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.ac-ring-center strong { font-size: 1.05rem; font-weight: 900; line-height: 1; font-family: var(--font-mono); }
.ac-ring-center span   { font-size: 9px; color: var(--text-muted); letter-spacing: .06em; text-transform: uppercase; margin-top: 1px; }

/* Risk grid */
.ac-risk-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
.ac-risk-tile {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 7px 10px; border-radius: var(--r-md);
  border: 1px solid rgba(var(--rk), .25);
  background: rgba(var(--rk), .1);
  min-width: 46px;
}
.ac-risk-tile strong { font-size: var(--t-md); font-weight: 900; color: rgb(var(--rk)); font-family: var(--font-mono); line-height: 1; }
.ac-risk-tile span   { font-size: 9px; color: rgb(var(--rk)); font-weight: 700; letter-spacing: .07em; }

/* Locked bar */
.ac-locked-bar {
  display: flex; align-items: center; gap: .7rem;
  margin: 0; padding: .9rem 2rem;
  background: oklch(from var(--brand) l c h / .08);
  border-bottom: 1px solid oklch(from var(--brand) l c h / .2);
  font-size: var(--t-sm); font-weight: 600; color: var(--brand);
}
.ac-locked-bar svg { width: 16px; height: 16px; flex-shrink: 0; }

/* Permission groups */
.ac-groups { display: flex; flex-direction: column; gap: 0; padding: .5rem 0; }
.ac-group { padding: 1.25rem 2rem; border-bottom: 1px solid var(--border); }
.ac-group:last-child { border-bottom: none; }
.ac-group-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: .875rem; }
.ac-group-progress { display: flex; align-items: center; gap: .6rem; }
.ac-group-bar { width: 72px; height: 4px; background: var(--surface-3); border-radius: 2px; overflow: hidden; }
.ac-group-fill { height: 100%; background: linear-gradient(90deg, var(--brand-300), var(--brand)); border-radius: 2px; transition: width .5s cubic-bezier(.4,0,.2,1); }
.ac-group-tally { font-size: var(--t-2xs); font-weight: 700; font-family: var(--font-mono); color: var(--text-muted); }
.ac-perm-list { display: flex; flex-direction: column; gap: 4px; }
.ac-perm-row {
  display: grid; grid-template-columns: 1fr auto 48px; gap: .75rem; align-items: center;
  padding: .875rem 1rem; border: 1px solid transparent; border-radius: var(--r-lg);
  background: transparent; color: var(--fg, inherit); text-align: left;
  cursor: pointer; transition: all var(--dur-fast);
}
.ac-perm-row:hover:not(:disabled) { background: var(--surface-2); border-color: var(--border); transform: translateX(2px); }
.ac-perm-row.is-on { background: oklch(from var(--brand) l c h / .07); border-color: oklch(from var(--brand) l c h / .25); }
.ac-perm-row.is-locked { cursor: default; }
.ac-perm-row:disabled { opacity: .6; }

.ac-perm-left { display: flex; align-items: flex-start; gap: .75rem; min-width: 0; }
.ac-perm-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(var(--rk), .4); border: 1.5px solid rgb(var(--rk)); margin-top: 5px; flex-shrink: 0; }
.is-on .ac-perm-dot { background: rgb(var(--rk)); box-shadow: 0 0 8px rgba(var(--rk), .5); }
.ac-perm-label { display: block; font-size: var(--t-sm); font-weight: 600; letter-spacing: -0.01em; color: var(--text-dim); }
.is-on .ac-perm-label { color: var(--text); }
.ac-perm-key { display: block; font-family: var(--font-mono); font-size: var(--t-2xs); color: var(--text-faint); margin-top: 2px; }

.ac-risk-badge {
  padding: 3px 9px; border-radius: var(--r-sm);
  border: 1px solid rgba(var(--rk), .3);
  background: rgba(var(--rk), .12);
  color: rgb(var(--rk)); font-size: var(--t-2xs); font-weight: 700;
  text-transform: uppercase; letter-spacing: .07em; white-space: nowrap;
}
/* Toggle */
.ac-toggle {
  width: 42px; height: 24px; border-radius: 999px; flex-shrink: 0;
  background: var(--surface-3); border: 1px solid var(--border);
  position: relative; transition: background .2s, border-color .2s;
  cursor: pointer;
}
.ac-toggle.is-on { background: var(--brand); border-color: oklch(from var(--brand) l c h / .6); box-shadow: 0 0 0 3px var(--brand-glow); }
.ac-toggle.is-locked { background: var(--brand); border-color: oklch(from var(--brand) l c h / .6); opacity: .75; }
.ac-toggle-thumb {
  width: 18px; height: 18px; border-radius: 50%; background: var(--text-faint);
  position: absolute; top: 2px; left: 2px;
  transition: transform .2s cubic-bezier(.34,1.56,.64,1), background .2s;
  box-shadow: 0 1px 4px rgba(0,0,0,.3);
}
.ac-toggle.is-on .ac-toggle-thumb,
.ac-toggle.is-locked .ac-toggle-thumb { transform: translateX(18px); background: #fff; }

/* ─────────────────────────────────────────────────────────────────────
   STAFF TAB
   ───────────────────────────────────────────────────────────────────── */
.ac-staff-wrap { display: flex; flex-direction: column; gap: var(--s-4); }
.ac-staff-bar {
  display: flex; align-items: center; gap: .75rem; flex-wrap: wrap;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--r-xl); padding: .75rem 1rem;
}
.ac-filters { display: flex; gap: .4rem; flex-wrap: wrap; }
.ac-filter {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 12px; border-radius: var(--r-full);
  border: 1px solid var(--border); background: transparent;
  color: var(--text-muted); font-size: var(--t-sm); font-weight: 600;
  cursor: pointer; font-family: var(--font-sans); transition: all var(--dur-fast);
}
.ac-filter span { font-family: var(--font-mono); font-size: var(--t-2xs); color: inherit; opacity: .7; }
.ac-filter:hover { background: var(--surface-2); color: var(--text-dim); border-color: var(--border-strong); }
.ac-filter.is-active { background: var(--surface-3); color: var(--text); border-color: var(--border-strong); font-weight: 700; }
.ac-filter.rc-sa.is-active { background: rgba(139,92,246,.14); border-color: rgba(139,92,246,.35); color: #a78bfa; }
.ac-filter.rc-om.is-active { background: rgba(59,130,246,.14); border-color: rgba(59,130,246,.35); color: #60a5fa; }
.ac-filter.rc-fc.is-active { background: rgba(16,185,129,.14); border-color: rgba(16,185,129,.35); color: #34d399; }
.ac-filter.rc-ac.is-active { background: rgba(245,158,11,.14); border-color: rgba(245,158,11,.35); color: #fbbf24; }

.ac-staff-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--s-3); }
.ac-staff-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-xl);
  padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem;
  position: relative; overflow: hidden;
  transition: border-color var(--dur-fast), transform var(--dur-fast), box-shadow var(--dur-fast);
}
.ac-staff-card:hover { border-color: rgba(var(--rc), .4); transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,.2); }
.ac-card-accent {
  position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, rgb(var(--rc)), rgba(var(--rc), .3));
  border-radius: 0 0 2px 2px;
}
.ac-staff-top { display: flex; align-items: center; gap: .75rem; }
.ac-staff-avatar {
  width: 42px; height: 42px; border-radius: var(--r-lg); flex-shrink: 0;
  display: grid; place-items: center; font-size: var(--t-xs); font-weight: 900;
  background: rgba(var(--rc), .2); color: rgb(var(--rc));
  border: 1px solid rgba(var(--rc), .3);
  box-shadow: 0 3px 12px rgba(var(--rc), .2);
}
.ac-staff-identity { flex: 1; min-width: 0; }
.ac-staff-identity strong { display: block; font-size: var(--t-sm); font-weight: 700; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ac-staff-identity span   { display: block; font-size: var(--t-xs); color: var(--text-muted); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ac-status-pip { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.pip-ok   { background: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
.pip-wait { background: var(--warn);  box-shadow: 0 0 0 3px oklch(from var(--warn) l c h / .2); }

.ac-staff-meta {
  display: grid; grid-template-columns: 1fr 1fr 1fr; gap: .4rem;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--r-lg); padding: .75rem;
}
.ac-staff-meta div { display: flex; flex-direction: column; gap: 2px; }
.ac-staff-meta dt { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: var(--text-faint); font-weight: 700; }
.ac-staff-meta dd { margin: 0; font-size: var(--t-xs); font-weight: 600; color: var(--text-dim); }

.ac-staff-grants { display: flex; flex-wrap: wrap; gap: 5px; }
.ac-grant-chip {
  padding: 2px 8px; border-radius: var(--r-sm);
  background: var(--surface-2); border: 1px solid var(--border);
  font-size: var(--t-2xs); font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .06em;
}
.ac-grant-more {
  padding: 2px 8px; border-radius: var(--r-sm);
  background: var(--surface-3); border: 1px solid var(--border);
  font-size: var(--t-2xs); font-weight: 700; color: var(--text-faint);
  font-family: var(--font-mono);
}
.ac-staff-role { display: flex; flex-direction: column; }
.ac-select-wrap { position: relative; }
.ac-select-wrap .bw-select { width: 100%; }

/* ─────────────────────────────────────────────────────────────────────
   SHARED PRIMITIVES
   ───────────────────────────────────────────────────────────────────── */
.ac-overline { margin: 0 0 4px; font-size: var(--t-2xs); font-weight: 800; text-transform: uppercase; letter-spacing: .14em; color: var(--brand); }
.ac-section-label { font-size: var(--t-2xs); font-weight: 700; text-transform: uppercase; letter-spacing: .12em; color: var(--text-faint); }

/* Skeletons */
.ac-skel { border-radius: var(--r-lg); overflow: hidden; position: relative; background: var(--surface-2); }
.ac-skel::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent 0%, var(--surface-3) 50%, transparent 100%);
  background-size: 200% 100%; animation: ac-shimmer 1.6s infinite;
}
@keyframes ac-shimmer { to { background-position: -200% 0; } }
.ac-skel--role  { height: 68px; border-radius: var(--r-xl); }
.ac-skel--label { height: 12px; width: 70px; }
.ac-skel--perm  { height: 52px; border-radius: var(--r-lg); }
.ac-skel--staff { height: 240px; border-radius: var(--r-xl); }

/* Empty state */
.ac-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 1rem; padding: 5rem 2rem; text-align: center;
  border: 1px dashed var(--border); border-radius: var(--r-2xl);
}
.ac-empty svg { width: 56px; height: 56px; color: var(--text-faint); }
.ac-empty p { color: var(--text-muted); font-size: var(--t-base); margin: 0; }

/* ═══════════════════════════════════════════════════════════════════════
   RESPONSIVE
   ═══════════════════════════════════════════════════════════════════════ */
@media (max-width: 1100px) {
  .ac-matrix-head { flex-direction: column; gap: 1.25rem; }
  .ac-matrix-gauges { flex-direction: row; align-self: flex-start; }
}
@media (max-width: 900px) {
  .ac-matrix-layout { grid-template-columns: 1fr; }
  .ac-rail { position: static; display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
  .ac-rail > .ac-section-label { grid-column: 1/-1; }
  .ac-matrix-identity { flex-direction: column; }
  .ac-kpi-strip { flex-wrap: wrap; }
  .ac-fields { grid-template-columns: 1fr; }
  .ac-role-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 640px) {
  .ac-header-inner { flex-direction: column; }
  .ac-kpi-strip { width: 100%; justify-content: stretch; }
  .ac-kpi { flex: 1; min-width: 0; padding: 1rem; }
  .ac-tab { padding: .6rem .875rem; font-size: var(--t-xs); }
  .ac-staff-grid { grid-template-columns: 1fr; }
  .ac-perm-row { grid-template-columns: 1fr auto; }
  .ac-perm-row .ac-toggle { display: none; }
  .ac-perm-row.is-on { background: oklch(from var(--brand) l c h / .1); }
  .ac-staff-meta { grid-template-columns: 1fr 1fr; }
  .ac-staff-bar { flex-direction: column; align-items: stretch; }
}
</style>
