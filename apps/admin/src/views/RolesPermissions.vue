<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import StationMultiSelect from '../components/StationMultiSelect.vue';
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
    station_id?: string | null;
    station_ids?: string[];
    suspended?: boolean;
}
interface AccessResponse {
    catalog: PermissionCatalogItem[]; roles: RoleRow[];
    permissions: PermissionRow[]; staff: StaffRow[];
    /** role_key → default permissions. Its keys are the system roles. */
    defaults?: Record<string, string[]>;
}

/* ─── State ───────────────────────────────────────────────────────────── */
const auth        = useStaffAuthStore();
const router      = useRouter();
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
const expandedStaff = ref<string[]>([]);

/* invite */
const inviteOpen = ref(false);
const inviteStep = ref(1);
const draft = ref({ email: '', fullName: '', roleKey: 'account', stationIds: [] as string[], tempPassword: '' });

/* custom role editor */
const roleEditor = ref({ open: false, creating: true, roleKey: '', name: '', description: '', permissions: [] as string[] });

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
/*
 * System roles come from the server payload (GET /access → defaults) rather than
 * a second hardcoded list that can drift from SYSTEM_ROLE_KEYS on the backend.
 * The literal is only a pre-load fallback.
 */
const systemRoleKeys = ref<string[]>(['super-admin', 'operations-manager', 'finance-checker', 'account']);
const isSystemRole = (roleKey: string) => systemRoleKeys.value.includes(roleKey);

/* Permissions the backend refuses to grant to a custom role — mirrors
   RESTRICTED_TO_SYSTEM_ROLES in backend/wallet/src/services/role-identity.ts. */
const RESTRICTED_TO_SYSTEM_ROLES = ['dev.console'];

/* ─── Helpers ─────────────────────────────────────────────────────────── */
const ROLE_COLORS: Record<string, string> = { 'super-admin': 'sa', 'operations-manager': 'om', 'finance-checker': 'fc', account: 'ac' };
/* Custom roles get a stable colour derived from their key, so two custom roles
   are visually distinguishable instead of all inheriting the amber of Account. */
const CUSTOM_ROLE_COLORS = ['c1', 'c2', 'c3', 'c4'];
const ROLE_DESCS: Record<string, string> = {
    'super-admin':          'Full system access. Can change roles, permissions, and all financial controls.',
    'operations-manager':   'Monitors vending activity, resolves disputes, reviews vendors, and runs reconciliation.',
    'finance-checker':      'Reviews and approves funding, manages refunds, and views settlement reports.',
    account:                'Day-to-day account officer — views funding queue, monitors vending, and reads settlements.',
};

function rc(key: string) {
    if (ROLE_COLORS[key]) return ROLE_COLORS[key];
    let hash = 5381;
    for (let i = 0; i < key.length; i++) hash = ((hash << 5) + hash + key.charCodeAt(i)) & 0x7fffffff;
    return CUSTOM_ROLE_COLORS[hash % CUSTOM_ROLE_COLORS.length];
}
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
function staffKey(u: StaffRow) {
    return String(u.auth_user_id || u.user_id || u.email || u.id || `${u.user_name}:${u.role_key}`);
}
function isStaffExpanded(u: StaffRow) {
    return expandedStaff.value.includes(staffKey(u));
}
function toggleStaffExpanded(u: StaffRow) {
    const key = staffKey(u);
    expandedStaff.value = isStaffExpanded(u)
        ? expandedStaff.value.filter((k) => k !== key)
        : [...expandedStaff.value, key];
}

/* ─── API ─────────────────────────────────────────────────────────────── */
async function load() {
    loading.value = true;
    try {
        const d = await api.get<AccessResponse>('/api/v1/admin/access');
        catalog.value     = d.catalog;
        roles.value       = d.roles;
        permissions.value = d.permissions;
        staff.value       = d.staff;
        if (d.defaults && Object.keys(d.defaults).length) systemRoleKeys.value = Object.keys(d.defaults);
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

function openRoleEditor(role?: RoleRow) {
    if (!canManage.value || loading.value) return;
    const existingPermissions = role ? permissions.value.filter(p => p.role_key === role.role_key).map(p => p.route_hash) : [];
    roleEditor.value = {
        open: true, creating: !role, roleKey: role?.role_key ?? '', name: role?.role_name ?? '',
        description: role?.description ?? '', permissions: existingPermissions,
    };
}
function toggleEditorPermission(key: string) {
    roleEditor.value.permissions = roleEditor.value.permissions.includes(key)
        ? roleEditor.value.permissions.filter(p => p !== key)
        : [...roleEditor.value.permissions, key];
}

function isGrantableToRole(key: string, roleKey: string) {
    return !RESTRICTED_TO_SYSTEM_ROLES.includes(key) || isSystemRole(roleKey);
}

/* Critical grants selected in the editor — surfaced before save, mirroring the
   confirmation the matrix already demands for a single critical toggle. */
const editorCriticalPermissions = computed(() =>
    catalog.value.filter(i => i.risk === 'critical' && roleEditor.value.permissions.includes(i.key)),
);
const editorNameValid = computed(() => roleEditor.value.name.trim().length >= 2);
const editorCanSave = computed(() =>
    editorNameValid.value && roleEditor.value.permissions.length > 0 && !saving.value,
);

function requestSaveRole() {
    if (!canManage.value || !editorCanSave.value) return;
    const critical = editorCriticalPermissions.value;
    if (!critical.length) { void saveRole(); return; }
    confirm.value = {
        title: roleEditor.value.creating ? 'Create role with critical permissions' : 'Save critical permissions',
        body: `${roleEditor.value.name.trim()} will hold ${critical.length} critical permission${critical.length > 1 ? 's' : ''}:\n\n${critical.map(i => `• ${i.label}`).join('\n')}\n\nStaff in this role gain these abilities immediately. The change is audit-logged.`,
        label: roleEditor.value.creating ? 'Yes, create role' : 'Yes, save role',
        danger: true,
        fn: () => saveRole(),
    };
}

async function saveRole() {
    if (!canManage.value || !editorNameValid.value || !roleEditor.value.permissions.length) return;
    saving.value = true;
    try {
        if (roleEditor.value.creating) {
            const res = await api.post<{ role: RoleRow }>('/api/v1/admin/access/roles', {
                name: roleEditor.value.name, description: roleEditor.value.description, permissions: roleEditor.value.permissions,
            });
            selectedRole.value = res.role.role_key;
            toast('Custom role created.');
        } else {
            await api.patch(`/api/v1/admin/access/roles/${roleEditor.value.roleKey}`, {
                name: roleEditor.value.name, description: roleEditor.value.description,
            });
            await api.put(`/api/v1/admin/access/roles/${roleEditor.value.roleKey}/permissions`, { permissions: roleEditor.value.permissions });
            toast('Custom role updated.');
        }
        roleEditor.value.open = false;
        await load();
    } catch (e: any) {
        // Zod rejections carry field-level detail the bare message drops.
        const details = Array.isArray(e?.details)
            ? e.details.map((d: any) => `${d.path}: ${d.message}`).join('; ')
            : (Array.isArray(e?.details?.permissions) ? e.details.permissions.join(', ') : '');
        toast(details ? `${e?.message ?? 'Could not save custom role'} (${details})` : (e?.message ?? 'Could not save custom role'), 'err');
    }
    finally { saving.value = false; }
}
function requestDeleteRole(role?: RoleRow) {
    if (!role || !canManage.value || isSystemRole(role.role_key)) return;
    confirm.value = {
        title: 'Delete custom role', body: `Delete ${role.role_name}? Staff must be reassigned first.`,
        label: 'Delete role', danger: true, fn: () => deleteRole(role),
    };
}
async function deleteRole(role: RoleRow) {
    saving.value = true;
    try {
        await api.del(`/api/v1/admin/access/roles/${role.role_key}`);
        selectedRole.value = 'super-admin';
        toast('Custom role deleted.');
        await load();
    } catch (e: any) { toast(e?.message ?? 'Could not delete role', 'err'); }
    finally { saving.value = false; }
}

function requestSuspension(user: StaffRow) {
    if (!canManage.value || !user.auth_user_id || saving.value) return;
    const suspended = !user.suspended;
    confirm.value = {
        title: suspended ? 'Suspend staff user' : 'Reactivate staff user',
        body: `${suspended ? 'Suspend' : 'Reactivate'} ${user.user_name || user.email}? ${suspended ? 'Their active sessions will be ended immediately.' : 'They can sign in again immediately.'}`,
        label: suspended ? 'Suspend user' : 'Reactivate user', danger: suspended,
        fn: () => doSuspension(user, suspended),
    };
}
async function doSuspension(user: StaffRow, suspended: boolean) {
    saving.value = true;
    try {
        await api.patch(`/api/v1/admin/access/users/${user.auth_user_id}/suspension`, { suspended });
        toast(`${user.user_name || user.email} ${suspended ? 'suspended' : 'reactivated'}.`);
        await load();
    } catch (e: any) { toast(e?.message ?? 'Could not update user status', 'err'); }
    finally { saving.value = false; }
}
function requestPasswordReset(user: StaffRow) {
    if (!canManage.value || !user.auth_user_id || saving.value) return;
    confirm.value = {
        title: 'Reset staff password',
        body: `Reset ${user.user_name || user.email}'s password? All current sessions will end.`,
        label: 'Reset password', danger: true,
        fn: () => doPasswordReset(user),
    };
}
async function doPasswordReset(user: StaffRow) {
    saving.value = true;
    try {
        const res = await api.post<{ temporaryPassword: string }>(`/api/v1/admin/access/users/${user.auth_user_id}/reset-password`, {});
        revealTempPw(res.temporaryPassword);
        toast('Password reset.');
    } catch (e: any) { toast(e?.message ?? 'Could not reset password', 'err'); }
    finally { saving.value = false; }
}
function requestSessionRevocation(user: StaffRow) {
    if (!canManage.value || !user.auth_user_id || saving.value) return;
    confirm.value = {
        title: 'Revoke active sessions', body: `End every active session for ${user.user_name || user.email}?`,
        label: 'Revoke sessions', danger: true, fn: () => doSessionRevocation(user),
    };
}
async function doSessionRevocation(user: StaffRow) {
    saving.value = true;
    try {
        await api.post(`/api/v1/admin/access/users/${user.auth_user_id}/revoke-sessions`, {});
        toast('Active sessions revoked.');
    } catch (e: any) { toast(e?.message ?? 'Could not revoke sessions', 'err'); }
    finally { saving.value = false; }
}
function viewAuditTrail(user: StaffRow) {
    router.push({ path: '/audit', query: { actor: user.auth_user_id ?? undefined } });
}

function openInvite() {
    inviteStep.value = 1;
    inviteOpen.value = true;
}

function closeInvite() {
    inviteOpen.value = false;
    inviteStep.value = 1;
}

function continueInvite() {
    if (inviteStep.value === 1 && (!draft.value.fullName.trim() || !draft.value.email.trim())) return;
    if (inviteStep.value === 2 && !draft.value.stationIds.length) return;
    inviteStep.value = Math.min(3, inviteStep.value + 1);
}

async function updateStaffStations(user: StaffRow, stationIds: string[]) {
    if (!canManage.value || !user.auth_user_id || !stationIds.length) return;
    saving.value = true;
    try {
        await api.patch(`/api/v1/admin/access/users/${user.auth_user_id}/station`, { stationIds });
        toast(`${user.user_name || user.email} assigned to ${stationIds.length} stations.`);
        await load();
    } catch (e: any) { toast(e?.message ?? 'Could not update station', 'err'); }
    finally { saving.value = false; }
}

/* ─── Create staff ────────────────────────────────────────────────────── */
async function createStaff() {
    if (!canManage.value) return;
    saving.value = true;
    try {
        const res = await api.post<{
            temporaryPassword: string;
            invitationDelivery: { status: 'sent' | 'not_sent'; reason?: 'disabled' | 'not_configured' | 'provider_error' };
        }>('/api/v1/admin/access/users', {
            email: draft.value.email, fullName: draft.value.fullName,
            roleKey: draft.value.roleKey, stationIds: draft.value.stationIds,
            temporaryPassword: draft.value.tempPassword || undefined,
        });
        const invitedEmail = draft.value.email;
        closeInvite();
        draft.value = { email: '', fullName: '', roleKey: 'account', stationIds: [], tempPassword: '' };
        await load();
        revealTempPw(res.temporaryPassword);
        toast(`Staff user created. Invitation sent to ${invitedEmail}.`);
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
onMounted(() => { void load(); });
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
        <!-- Above every other overlay: the role editor stays open behind this
             dialog, and all .ac-overlay share a z-index, so without the bump
             the later-teleported editor would paint over the confirmation. -->
        <div v-if="confirm" class="ac-overlay ac-overlay--top" @click.self="confirm = null">
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

    <teleport to="body">
      <transition name="ac-overlay">
        <div v-if="roleEditor.open" class="ac-overlay" @click.self="roleEditor.open = false" @keydown.esc="roleEditor.open = false">
          <form
            class="ac-role-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ac-role-editor-title"
            @submit.prevent="requestSaveRole"
          >
            <div class="ac-invite-head">
              <div>
                <p class="ac-overline">Custom access role</p>
                <h3 id="ac-role-editor-title">{{ roleEditor.creating ? 'Create custom role' : 'Edit custom role' }}</h3>
              </div>
              <button type="button" class="bw-icon-btn" aria-label="Close role editor" @click="roleEditor.open = false">×</button>
            </div>
            <div class="ac-fields">
              <div class="ac-field">
                <label class="bw-label" for="ac-role-name">Role name</label>
                <input
                  id="ac-role-name"
                  ref="roleNameInput"
                  v-model="roleEditor.name"
                  class="bw-input"
                  placeholder="Compliance Reviewer"
                  required
                  minlength="2"
                  maxlength="64"
                />
              </div>
              <div class="ac-field">
                <label class="bw-label">Description</label>
                <input v-model="roleEditor.description" class="bw-input" placeholder="Reviews compliance exceptions" maxlength="240" />
              </div>
            </div>
            <div class="ac-editor-permissions">
              <div class="ac-editor-label">
                <label class="bw-label">Permissions</label>
                <span>{{ roleEditor.permissions.length }} selected</span>
              </div>
              <div v-for="grp in grouped" :key="grp.g" class="ac-editor-group">
                <p>{{ grp.g }}</p>
                <label
                  v-for="item in grp.items"
                  :key="item.key"
                  :class="['ac-editor-permission', !isGrantableToRole(item.key, roleEditor.roleKey) && 'is-blocked']"
                >
                  <input
                    type="checkbox"
                    :checked="roleEditor.permissions.includes(item.key)"
                    :disabled="!isGrantableToRole(item.key, roleEditor.roleKey)"
                    @change="toggleEditorPermission(item.key)"
                  />
                  <span>{{ item.label }}</span>
                  <em v-if="!isGrantableToRole(item.key, roleEditor.roleKey)" class="ac-editor-blocked">system roles only</em>
                  <em v-else :class="`risk-${item.risk}`">{{ item.risk }}</em>
                </label>
              </div>
            </div>

            <!-- Critical grants are called out before save, not after. -->
            <div v-if="editorCriticalPermissions.length" class="ac-editor-warning" role="status">
              <strong>{{ editorCriticalPermissions.length }} critical permission{{ editorCriticalPermissions.length > 1 ? 's' : '' }} selected</strong>
              <span>{{ editorCriticalPermissions.map(i => i.label).join(', ') }}</span>
            </div>
            <p v-if="!roleEditor.permissions.length" class="ac-editor-hint">
              Select at least one permission — a role with none can sign in but reach nothing.
            </p>

            <div class="ac-invite-actions">
              <button type="button" class="bw-btn ghost" @click="roleEditor.open = false">Cancel</button>
              <button class="bw-btn primary" :disabled="!editorCanSave">
                {{ saving ? 'Saving…' : (roleEditor.creating ? 'Create role' : 'Save role') }}
              </button>
            </div>
          </form>
        </div>
      </transition>
    </teleport>

    <!-- ══ INVITE MODAL ══════════════════════════════════════════════════ -->
    <teleport to="body">
      <transition name="ac-overlay">
        <div v-if="inviteOpen" class="ac-overlay" @click.self="closeInvite">
          <div class="ac-invite">
            <div class="ac-invite-head">
              <div>
                <p class="ac-overline">New staff member</p>
                <h3>Create wallet admin user</h3>
              </div>
              <button class="bw-icon-btn" aria-label="Close staff setup" @click="closeInvite">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <form @submit.prevent="createStaff">
              <ol class="ac-steps" aria-label="Staff setup progress">
                <li v-for="(label, index) in ['Identity', 'Access', 'Review']" :key="label" :class="{ 'is-active': inviteStep === index + 1, 'is-done': inviteStep > index + 1 }">
                  <span>{{ index + 1 }}</span>{{ label }}
                </li>
              </ol>
              <div v-if="inviteStep === 1" class="ac-fields">
                <div class="ac-field">
                  <label class="bw-label">Full name</label>
                  <input v-model="draft.fullName" class="bw-input" placeholder="Ada Okonkwo" required />
                </div>
                <div class="ac-field">
                  <label class="bw-label">Work email</label>
                  <input v-model="draft.email" class="bw-input" type="email" placeholder="ada@company.ng" required />
                </div>
              </div>

              <div v-else-if="inviteStep === 2" class="ac-invite-grid">
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

                <div class="ac-field ac-field--full">
                  <label class="bw-label">Assigned stations</label>
                  <StationMultiSelect v-model="draft.stationIds" placeholder="Search stations" />
                  <p class="ac-field-help">This staff member only sees assigned stations.</p>
                </div>
              </div>

              <div v-else class="ac-invite-grid">
                <div class="ac-stack-col">
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
                </div>
                <dl class="ac-invite-review">
                  <div><dt>Staff</dt><dd>{{ draft.fullName }}</dd></div>
                  <div><dt>Email</dt><dd>{{ draft.email }}</dd></div>
                  <div><dt>Role</dt><dd>{{ roles.find(r => r.role_key === draft.roleKey)?.role_name }}</dd></div>
                  <div><dt>Stations</dt><dd>{{ draft.stationIds.join(', ') }}</dd></div>
                  <div class="ac-invite-email"><dt>Email invitation</dt><dd>Creation completes only after Resend confirms delivery to this work email. The message includes the Beverly Admin link and sign-in details.</dd></div>
                </dl>
              </div>

              <div class="ac-invite-actions">
                <button type="button" class="bw-btn ghost" @click="inviteStep > 1 ? inviteStep-- : closeInvite()">{{ inviteStep > 1 ? 'Back' : 'Cancel' }}</button>
                <button v-if="inviteStep < 3" type="button" class="bw-btn primary" :disabled="inviteStep === 1 ? !draft.email || !draft.fullName : !draft.stationIds.length" @click="continueInvite">Continue</button>
                <button v-else class="bw-btn primary" :disabled="saving">
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
          <button v-if="canManage" class="bw-btn primary" :disabled="loading" @click="openRoleEditor()">Create role</button>
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
            <div v-if="canManage && !isSystemRole(selectedRole)" class="ac-role-management">
              <button class="bw-btn ghost" @click="openRoleEditor(selRoleRow)">Edit role</button>
              <button class="bw-btn danger" @click="requestDeleteRole(selRoleRow)">Delete role</button>
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
            <div class="ac-table-scroll">
              <table class="ac-perm-table">
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Permission</th>
                    <th>Route key</th>
                    <th>Risk</th>
                    <th class="ac-access-col">Access</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="grp in grouped" :key="grp.g">
                    <tr class="ac-group-row">
                      <td class="ac-group-cell">{{ grp.g }}</td>
                      <td />
                      <td />
                      <td />
                      <td class="ac-group-progress-cell">
                        <div class="ac-group-progress">
                          <div class="ac-group-bar">
                            <div class="ac-group-fill" :style="{ width: groupProgress(grp.items) + '%' }" />
                          </div>
                          <span class="ac-group-tally">{{ grp.items.filter(i => rolePermSet.has(i.key)).length }}/{{ grp.items.length }}</span>
                        </div>
                      </td>
                    </tr>
                    <tr v-for="item in grp.items" :key="item.key" :class="['ac-perm-table-row', rolePermSet.has(item.key) && 'is-on']">
                      <td class="ac-empty-group-cell" />
                      <td>
                        <div class="ac-perm-left">
                          <div :class="['ac-perm-dot', `risk-${item.risk}`]" />
                          <span class="ac-perm-label">{{ item.label }}</span>
                        </div>
                      </td>
                      <td>
                        <code class="ac-perm-key">{{ item.key }}</code>
                      </td>
                      <td>
                        <span :class="['ac-risk-badge', `risk-${item.risk}`]">{{ item.risk }}</span>
                      </td>
                      <td class="ac-access-cell">
                        <button
                          :class="['ac-toggle-btn', rolePermSet.has(item.key) && 'is-on', selectedRole === 'super-admin' && 'is-locked']"
                          :disabled="saving || !canManage || selectedRole === 'super-admin'"
                          @click="requestToggle(item)"
                        >
                          <div :class="['ac-toggle', rolePermSet.has(item.key) && 'is-on', selectedRole === 'super-admin' && 'is-locked']">
                            <div class="ac-toggle-thumb" />
                          </div>
                          <span class="ac-toggle-label">{{ rolePermSet.has(item.key) ? 'On' : 'Off' }}</span>
                        </button>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
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

          <button class="bw-btn primary" :disabled="!canManage" @click="openInvite">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add staff
          </button>
          <button class="bw-btn ghost ac-add-role" :disabled="!canManage || loading" @click="activeTab = 'matrix'; openRoleEditor()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/><circle cx="12" cy="12" r="8"/></svg>
            Add role
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
          <button v-if="canManage && !staffSearch && !staffRole" class="bw-btn primary" @click="openInvite">Add first staff user</button>
        </div>

        <!-- Grid -->
        <div v-else class="ac-staff-grid">
          <article v-for="u in filteredStaff" :key="staffKey(u)" :class="['ac-staff-card', `rc-${rc(u.role_key)}`, isStaffExpanded(u) && 'is-expanded']">
            <!-- Card accent line -->
            <div class="ac-card-accent" />

            <button class="ac-staff-summary" @click="toggleStaffExpanded(u)">
            <div class="ac-staff-top">
              <div :class="['ac-staff-avatar', `rc-${rc(u.role_key)}`]">{{ initials(u.role_key) }}</div>
              <div class="ac-staff-identity">
                <strong>{{ u.user_name || '—' }}</strong>
                <span>{{ u.email || 'No email' }}</span>
              </div>
              <span :class="['ac-status-pip', u.confirmed_at ? 'pip-ok' : 'pip-wait']" :title="u.confirmed_at ? 'Confirmed' : 'Invitation pending'" />
                <div class="ac-staff-role-pill">{{ roles.find(r => r.role_key === u.role_key)?.role_name || u.role_key }}</div>
                <svg :class="['ac-expand-caret', isStaffExpanded(u) && 'is-open']" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M5 7l5 6 5-6" />
                </svg>
            </div>
            </button>

            <div v-if="isStaffExpanded(u)" class="ac-staff-details">
            <dl class="ac-staff-meta">
              <div>
                <dt>Last active</dt>
                <dd>{{ relTime(u.last_sign_in_at) }}</dd>
              </div>
              <div>
                <dt>Account</dt>
                <dd>{{ u.suspended ? 'Suspended' : (u.confirmed_at ? 'Confirmed' : 'Pending invite') }}</dd>
              </div>
              <div>
                <dt>Permissions</dt>
                <dd>{{ catalog.filter(i => permissions.some(p => p.role_key === u.role_key && p.route_hash === i.key)).length }} grants</dd>
              </div>
              <div>
                <dt>Stations</dt>
                <dd>{{ (u.station_ids?.length ? u.station_ids : u.station_id ? [u.station_id] : []).join(', ') || 'Unassigned' }}</dd>
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
            </div>

            <!-- Role selector -->
            <div v-if="isStaffExpanded(u)" class="ac-staff-role">
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

            <div v-if="isStaffExpanded(u)" class="ac-staff-role">
              <label class="bw-label" style="margin-bottom:5px">Stations</label>
              <StationMultiSelect
                :model-value="u.station_ids?.length ? u.station_ids : u.station_id ? [u.station_id] : []"
                :disabled="saving || !canManage || !u.auth_user_id || u.role_key === 'super-admin'"
                @update:model-value="updateStaffStations(u, $event)"
              />
            </div>

            <div v-if="isStaffExpanded(u)" class="ac-staff-actions">
              <button class="bw-btn ghost" :disabled="!canManage || saving || !u.auth_user_id" @click="viewAuditTrail(u)">Audit trail</button>
              <button class="bw-btn ghost" :disabled="!canManage || saving || !u.auth_user_id" @click="requestSessionRevocation(u)">Revoke sessions</button>
              <button class="bw-btn ghost" :disabled="!canManage || saving || !u.auth_user_id" @click="requestPasswordReset(u)">Reset password</button>
              <button :class="['bw-btn', u.suspended ? 'primary' : 'danger']" :disabled="!canManage || saving || !u.auth_user_id || u.auth_user_id === auth.user?.id" @click="requestSuspension(u)">
                {{ u.suspended ? 'Reactivate user' : 'Suspend user' }}
              </button>
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
/* Custom-role palette — distinct from the four system-role hues above. */
.rc-c1 { --rc: 236 72 153; --rc-fg: #f472b6; }    /* pink    */
.rc-c2 { --rc: 6 182 212;  --rc-fg: #22d3ee; }    /* cyan    */
.rc-c3 { --rc: 132 204 22; --rc-fg: #a3e635; }    /* lime    */
.rc-c4 { --rc: 168 85 247; --rc-fg: #c084fc; }    /* purple  */

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
/* Confirmations stack above the dialog that raised them. Teleport anchors are
   created in template order, so at equal z-index the role editor (declared
   later) would paint over the confirmation and hide it entirely. */
.ac-overlay--top { z-index: 260; }
.ac-overlay-enter-active, .ac-overlay-leave-active { transition: opacity .22s var(--ease-out); }
.ac-overlay-enter-from, .ac-overlay-leave-to { opacity: 0; }
.ac-overlay-enter-active > *, .ac-overlay-leave-active > * { transition: transform .22s var(--ease-out), opacity .22s var(--ease-out); }
.ac-overlay-enter-from > *, .ac-overlay-leave-to > * { transform: scale(.95) translateY(10px); opacity: 0; }

/* Confirm dialog */
.ac-dialog {
  width: min(480px, 100%);
  background: var(--glass-bg-strong); border: 1px solid var(--glass-border-strong);
  border-radius: var(--r-2xl); padding: 2rem;
  display: flex; flex-direction: column; gap: 1rem;
  backdrop-filter: blur(36px) saturate(200%);
  -webkit-backdrop-filter: blur(36px) saturate(200%);
  box-shadow: var(--glass-shine), var(--glass-shadow-float);
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
  background: var(--glass-bg-strong); border: 1px solid var(--glass-border-strong);
  border-radius: var(--r-2xl); padding: 2rem;
  display: flex; flex-direction: column; gap: 1.5rem;
  backdrop-filter: blur(36px) saturate(200%);
  -webkit-backdrop-filter: blur(36px) saturate(200%);
  box-shadow: var(--glass-shine), var(--glass-shadow-float);
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
  width: min(780px, 100%);
  max-height: min(92vh, 860px);
  background: var(--glass-bg-strong); border: 1px solid var(--glass-border-strong);
  border-radius: var(--r-2xl);
  overflow: auto;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(36px) saturate(200%);
  -webkit-backdrop-filter: blur(36px) saturate(200%);
  box-shadow: var(--glass-shine), var(--glass-shadow-float);
}
.ac-invite-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 1.35rem 1.35rem 0;
}
.ac-invite-head h3 { margin: 4px 0 0; font-size: var(--t-lg); font-weight: 700; letter-spacing: -0.015em; }
.ac-invite form {
  padding: 1rem 1.35rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: .9rem;
  overflow-y: auto;
  min-height: 0;
}
.ac-fields { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
.ac-field { display: flex; flex-direction: column; gap: 4px; }
.ac-field--full { grid-column: 1 / -1; }
.ac-field-help { margin: 4px 0 0; color: var(--text-muted); font-size: var(--t-xs); }
.ac-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0; padding: 0; list-style: none; }
.ac-steps li { display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: var(--t-xs); font-weight: 700; }
.ac-steps li::after { content: ''; height: 1px; flex: 1; background: var(--border); }
.ac-steps li:last-child::after { display: none; }
.ac-steps span { width: 24px; height: 24px; display: grid; place-items: center; border: 1px solid var(--border); border-radius: 50%; }
.ac-steps .is-active { color: var(--text); }
.ac-steps .is-active span, .ac-steps .is-done span { border-color: var(--brand); background: var(--brand); color: var(--on-brand); }

.ac-invite-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, .95fr);
  gap: .85rem;
  align-items: start;
}
.ac-stack-col { display: flex; flex-direction: column; gap: .75rem; }

.ac-role-grid { display: grid; grid-template-columns: 1fr; gap: 7px; }
.ac-role-pick {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: .55rem;
  padding: 9px 10px;
  border-radius: var(--r-md);
  border: 1px solid var(--border); background: var(--surface-2);
  cursor: pointer; transition: all var(--dur-fast);
}
.ac-role-pick:hover { border-color: rgba(var(--rc), .4); background: rgba(var(--rc), .06); }
.ac-role-pick.is-picked { border-color: rgba(var(--rc), .55); background: rgba(var(--rc), .12); box-shadow: 0 0 0 3px rgba(var(--rc), .12); }
.ac-role-pick-badge { width: 24px; height: 24px; border-radius: 6px; display: grid; place-items: center; background: rgba(var(--rc), .22); color: rgb(var(--rc)); font-size: 10px; font-weight: 900; }
.ac-role-pick-name  { font-size: var(--t-xs); font-weight: 700; color: var(--text-dim); text-align: left; }
.ac-role-pick.is-picked .ac-role-pick-name { color: rgb(var(--rc)); }
.ac-role-pick-count { font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); text-align: right; }

.ac-perm-preview { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-lg); padding: .75rem; }
.ac-perm-chips  { display: flex; flex-wrap: wrap; gap: 5px; max-height: 174px; overflow: auto; }
.ac-chip {
  padding: 2px 8px; border-radius: var(--r-full);
  border: 1px solid rgba(var(--rk), .3);
  background: rgba(var(--rk), .12);
  color: rgb(var(--rk)); font-size: var(--t-2xs); font-weight: 700;
  text-transform: capitalize;
}
.ac-empty-chips { font-size: var(--t-sm); color: var(--text-muted); }
.ac-invite-review { margin: 0; padding: .75rem; display: grid; gap: .65rem; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface-2); }
.ac-invite-review div { display: grid; gap: 2px; }
.ac-invite-review dt { color: var(--text-muted); font-size: var(--t-2xs); font-weight: 700; text-transform: uppercase; }
.ac-invite-review dd { margin: 0; color: var(--text); font-size: var(--t-sm); overflow-wrap: anywhere; }
.ac-invite-actions { display: flex; justify-content: flex-end; gap: .6rem; padding-top: .25rem; }

/* ═══════════════════════════════════════════════════════════════════════
   PAGE BODY
   ═══════════════════════════════════════════════════════════════════════ */
.ac-page { display: flex; flex-direction: column; gap: 0; }

/* ── Command header ──────────────────────────────────────────────────── */
.ac-header {
  display: none;
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
  background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: var(--r-2xl); overflow: hidden;
  display: flex; flex-direction: column;
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
}
.ac-matrix-head {
  padding: 1rem 1.1rem; display: flex; justify-content: space-between;
  align-items: flex-start; gap: 1.5rem;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(135deg, color-mix(in oklab, var(--surface-2) 92%, #000), var(--surface));
}
.ac-matrix-identity { display: flex; gap: .75rem; align-items: flex-start; min-width: 0; }
.ac-matrix-avatar {
  width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
  display: grid; place-items: center; font-size: var(--t-md); font-weight: 900;
  background: rgba(var(--rc), .22); color: rgb(var(--rc));
  border: 1px solid rgba(var(--rc), .3);
  box-shadow: 0 4px 16px rgba(var(--rc), .2);
}
.ac-matrix-identity h2 { margin: 1px 0 0; font-size: clamp(1.05rem, 2.1vw, 1.35rem); font-weight: 800; letter-spacing: -0.02em; }
.ac-matrix-desc { margin: .25rem 0 0; color: var(--text-muted); font-size: 12px; max-width: 380px; line-height: 1.4; }
.ac-matrix-gauges { display: flex; gap: .75rem; align-items: center; flex-shrink: 0; }

/* Coverage ring */
.ac-ring-wrap { position: relative; width: 62px; height: 62px; flex-shrink: 0; }
.ac-ring { width: 62px; height: 62px; }
.ac-ring-bg { stroke: var(--surface-3); }
.ac-ring-fg { stroke: var(--brand); stroke-linecap: round; transition: stroke-dasharray .7s cubic-bezier(.4,0,.2,1); filter: drop-shadow(0 0 6px var(--brand-glow)); }
.ac-ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.ac-ring-center strong { font-size: .85rem; font-weight: 900; line-height: 1; font-family: var(--font-mono); }
.ac-ring-center span   { font-size: 8px; color: var(--text-muted); letter-spacing: .06em; text-transform: uppercase; margin-top: 1px; }

/* Risk grid */
.ac-risk-grid { display: grid; grid-template-columns: repeat(4, minmax(36px, 1fr)); gap: 5px; }
.ac-risk-tile {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 5px 7px; border-radius: 8px;
  border: 1px solid rgba(var(--rk), .25);
  background: rgba(var(--rk), .1);
  min-width: 38px;
}
.ac-risk-tile strong { font-size: var(--t-sm); font-weight: 900; color: rgb(var(--rk)); font-family: var(--font-mono); line-height: 1; }
.ac-risk-tile span   { font-size: 8px; color: rgb(var(--rk)); font-weight: 700; letter-spacing: .07em; }

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
.ac-groups { padding: .5rem 0; }
.ac-table-scroll { overflow-x: auto; }
.ac-perm-table {
  width: 100%;
  min-width: 760px;
  border-collapse: separate;
  border-spacing: 0;
  font-variant-numeric: tabular-nums;
}
.ac-perm-table th {
  text-align: left;
  padding: .62rem .9rem;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .11em;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  background: color-mix(in oklab, var(--surface) 92%, #000);
  white-space: nowrap;
}
.ac-perm-table td {
  padding: .48rem .9rem;
  border-bottom: 1px solid var(--border-soft);
  vertical-align: middle;
}
.ac-group-row td {
  background: color-mix(in oklab, var(--surface-2) 88%, #000);
  border-bottom: 1px solid var(--border);
}
.ac-group-cell {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .11em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.ac-empty-group-cell { width: 1px; padding: 0 !important; }
.ac-group-progress-cell { text-align: right; }
.ac-group-progress { display: flex; align-items: center; gap: .6rem; }
.ac-group-bar { width: 64px; height: 3px; background: var(--surface-3); border-radius: 2px; overflow: hidden; }
.ac-group-fill { height: 100%; background: linear-gradient(90deg, var(--brand-300), var(--brand)); border-radius: 2px; transition: width .5s cubic-bezier(.4,0,.2,1); }
.ac-group-tally { font-size: 10px; font-weight: 700; font-family: var(--font-mono); color: var(--text-muted); }
.ac-perm-table-row.is-on td { background: oklch(from var(--brand) l c h / .06); }
.ac-perm-table-row:hover td { background: color-mix(in oklab, var(--surface-2) 82%, #000); }

.ac-perm-left { display: flex; align-items: flex-start; gap: .75rem; min-width: 0; }
.ac-perm-dot { width: 7px; height: 7px; border-radius: 50%; background: rgba(var(--rk), .4); border: 1.5px solid rgb(var(--rk)); margin-top: 5px; flex-shrink: 0; }
.is-on .ac-perm-dot { background: rgb(var(--rk)); box-shadow: 0 0 8px rgba(var(--rk), .5); }
.ac-perm-label { display: block; font-size: 13px; font-weight: 600; letter-spacing: 0; color: var(--text-dim); white-space: nowrap; }
.is-on .ac-perm-label { color: var(--text); }
.ac-perm-key {
  display: block;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-faint);
  margin-top: 0;
  max-width: 270px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ac-risk-badge {
  padding: 2px 7px; border-radius: 6px;
  border: 1px solid rgba(var(--rk), .3);
  background: rgba(var(--rk), .12);
  color: rgb(var(--rk)); font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .07em; white-space: nowrap;
}
.ac-access-col,
.ac-access-cell { text-align: right; }
.ac-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: .5rem;
  border: none;
  background: transparent;
  color: var(--text-muted);
  padding: 0;
  cursor: pointer;
}
.ac-toggle-btn:disabled { opacity: .6; cursor: default; }
.ac-toggle-label {
  min-width: 18px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
}
/* Toggle */
.ac-toggle {
  width: 36px; height: 20px; border-radius: 999px; flex-shrink: 0;
  background: var(--surface-3); border: 1px solid var(--border);
  position: relative; transition: background .2s, border-color .2s;
  cursor: pointer;
}
.ac-toggle.is-on { background: var(--brand); border-color: oklch(from var(--brand) l c h / .6); box-shadow: 0 0 0 3px var(--brand-glow); }
.ac-toggle.is-locked { background: var(--brand); border-color: oklch(from var(--brand) l c h / .6); opacity: .75; }
.ac-toggle-thumb {
  width: 14px; height: 14px; border-radius: 50%; background: var(--text-faint);
  position: absolute; top: 2px; left: 2px;
  transition: transform .2s cubic-bezier(.34,1.56,.64,1), background .2s;
  box-shadow: 0 1px 4px rgba(0,0,0,.3);
}
.ac-toggle.is-on .ac-toggle-thumb,
.ac-toggle.is-locked .ac-toggle-thumb { transform: translateX(16px); background: #fff; }

/* ─────────────────────────────────────────────────────────────────────
   STAFF TAB
   ───────────────────────────────────────────────────────────────────── */
.ac-staff-wrap { display: flex; flex-direction: column; gap: var(--s-4); }
.ac-staff-bar {
  display: flex; align-items: center; gap: .75rem; flex-wrap: wrap;
  background: var(--glass-bg-strong); border: 1px solid var(--glass-border);
  border-radius: var(--r-xl); padding: .75rem 1rem;
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
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
  background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: var(--r-xl);
  padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem;
  position: relative; overflow: hidden;
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
  transition: border-color var(--dur-fast), transform var(--dur-fast), box-shadow var(--dur-fast);
}
.ac-staff-card:hover { border-color: rgba(var(--rc), .4); transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,.2); }
.ac-card-accent {
  position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, rgb(var(--rc)), rgba(var(--rc), .3));
  border-radius: 0 0 2px 2px;
}
.ac-staff-summary {
  border: none;
  background: transparent;
  padding: 0;
  width: 100%;
  text-align: left;
  cursor: pointer;
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
.ac-staff-role-pill {
  padding: 4px 10px;
  border-radius: var(--r-full);
  border: 1px solid rgba(var(--rc), .3);
  color: rgb(var(--rc));
  background: rgba(var(--rc), .11);
  font-size: var(--t-2xs);
  font-weight: 700;
  white-space: nowrap;
}
.ac-status-pip { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.pip-ok   { background: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
.pip-wait { background: var(--warn);  box-shadow: 0 0 0 3px oklch(from var(--warn) l c h / .2); }
.ac-expand-caret {
  width: 16px;
  height: 16px;
  color: var(--text-faint);
  transition: transform var(--dur-fast), color var(--dur-fast);
}
.ac-expand-caret.is-open {
  transform: rotate(180deg);
  color: var(--text-dim);
}
.ac-staff-details {
  margin-top: .85rem;
  display: flex;
  flex-direction: column;
  gap: .75rem;
}

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

.ac-role-editor {
  width: min(760px, calc(100vw - 2rem)); max-height: min(760px, calc(100vh - 2rem));
  overflow: auto; padding: 1.25rem; border: 1px solid var(--border); border-radius: var(--r-xl);
  background: var(--surface); box-shadow: var(--shadow-xl);
}
.ac-editor-permissions { margin-top: 1rem; border: 1px solid var(--border); border-radius: var(--r-lg); overflow: hidden; }
.ac-editor-label { display: flex; justify-content: space-between; padding: .75rem 1rem; background: var(--surface-2); }
.ac-editor-label span { color: var(--text-muted); font-size: var(--t-xs); }
.ac-editor-group { padding: .75rem 1rem; border-top: 1px solid var(--border); }
.ac-editor-group p { margin: 0 0 .45rem; font-size: var(--t-xs); font-weight: 800; color: var(--text-muted); }
.ac-editor-permission { display: flex; align-items: center; gap: .6rem; padding: .35rem 0; cursor: pointer; font-size: var(--t-sm); }
.ac-editor-permission input { accent-color: var(--green); }
.ac-editor-permission em { margin-left: auto; font-style: normal; font-size: var(--t-2xs); text-transform: uppercase; }
.ac-editor-permission.is-blocked { opacity: .55; cursor: not-allowed; }
.ac-editor-blocked {
  margin-left: auto; font-style: normal; font-size: var(--t-2xs);
  text-transform: uppercase; color: var(--text-faint);
}
.ac-editor-warning {
  display: flex; flex-direction: column; gap: 3px;
  margin-top: .75rem; padding: .6rem .8rem;
  border: 1px solid oklch(from var(--danger) l c h / .35);
  border-radius: var(--r-md);
  background: oklch(from var(--danger) l c h / .10);
  font-size: var(--t-xs);
}
.ac-editor-warning strong { color: var(--danger); }
.ac-editor-warning span { color: var(--text-muted); }
.ac-editor-hint { margin: .6rem 0 0; font-size: var(--t-xs); color: var(--text-muted); }
.ac-role-management { display: flex; gap: .5rem; margin-left: auto; }
.ac-role-management .bw-btn { white-space: nowrap; }

.ac-staff-actions {
  display: flex; flex-wrap: wrap; gap: .5rem;
  padding: .9rem 1rem 1rem; border-top: 1px solid var(--border);
}
.ac-staff-actions .bw-btn { font-size: var(--t-xs); padding: .45rem .65rem; }

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
  .ac-invite-grid { grid-template-columns: 1fr; }
  .ac-role-grid { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .ac-header-inner { flex-direction: column; }
  .ac-kpi-strip { width: 100%; justify-content: stretch; }
  .ac-kpi { flex: 1; min-width: 0; padding: 1rem; }
  .ac-tab { padding: .6rem .875rem; font-size: var(--t-xs); }
  .ac-staff-grid { grid-template-columns: 1fr; }
  .ac-perm-table { min-width: 680px; }
  .ac-staff-meta { grid-template-columns: 1fr 1fr; }
  .ac-staff-bar { flex-direction: column; align-items: stretch; }
}
</style>
