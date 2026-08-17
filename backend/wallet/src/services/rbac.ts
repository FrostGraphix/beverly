/**
 * RBAC core — permission catalog, role defaults, and DB-backed resolution.
 *
 * This is the single source of truth for wallet staff permissions. Both the
 * admin route plugin (URL → permission mapping) and the auth plugin's
 * `requirePermission()` decorator resolve grants through here, so every
 * staff-facing surface enforces the same policy.
 */
import { adminClient } from '../db/supabase.js';

export interface PermissionCatalogEntry {
    key: string;
    label: string;
    group: string;
    risk: 'low' | 'medium' | 'high' | 'critical';
}

export const PERMISSION_CATALOG: PermissionCatalogEntry[] = [
    { key: 'wallet.dashboard.view', label: 'View operations dashboard', group: 'Overview', risk: 'low' },
    { key: 'wallet.vendors.review', label: 'Review vendor applications', group: 'Vendors', risk: 'medium' },
    { key: 'wallet.vendors.manage', label: 'Create and manage vendors', group: 'Vendors', risk: 'high' },
    { key: 'wallet.customers.view', label: 'View customer accounts', group: 'Customers', risk: 'high' },
    { key: 'wallet.funding.view', label: 'View funding queue', group: 'Money', risk: 'medium' },
    { key: 'wallet.funding.approve', label: 'Approve vendor funding', group: 'Money', risk: 'critical' },
    { key: 'wallet.vending.monitor', label: 'Monitor vending activity', group: 'Money', risk: 'medium' },
    { key: 'wallet.refunds.manage', label: 'Approve refunds', group: 'Operations', risk: 'critical' },
    { key: 'wallet.disputes.manage', label: 'Resolve disputes', group: 'Operations', risk: 'medium' },
    { key: 'wallet.support.manage', label: 'Manage support (FAQ, tickets, chat)', group: 'Operations', risk: 'medium' },
    { key: 'wallet.settlement.view', label: 'View settlement batches', group: 'Operations', risk: 'medium' },
    { key: 'wallet.reconciliation.run', label: 'Run reconciliation', group: 'Operations', risk: 'high' },
    { key: 'wallet.fraud.review', label: 'Resolve fraud reviews', group: 'Compliance', risk: 'high' },
    { key: 'wallet.privacy.review', label: 'Review privacy requests', group: 'Compliance', risk: 'high' },
    { key: 'wallet.audit.view', label: 'View audit and security events', group: 'Compliance', risk: 'high' },
    { key: 'wallet.flags.manage', label: 'Manage feature flags', group: 'Launch', risk: 'critical' },
    { key: 'wallet.access.manage', label: 'Manage roles and permissions', group: 'Access', risk: 'critical' },
    { key: 'wallet.consumption.view', label: 'View consumption analytics', group: 'Analytics', risk: 'low' },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
    'super-admin': PERMISSION_CATALOG.map((p) => p.key),
    'operations-manager': [
        'wallet.dashboard.view', 'wallet.vendors.review', 'wallet.vending.monitor',
        'wallet.customers.view', 'wallet.disputes.manage', 'wallet.support.manage', 'wallet.settlement.view', 'wallet.reconciliation.run',
        'wallet.fraud.review', 'wallet.audit.view', 'wallet.consumption.view',
    ],
    'finance-checker': [
        'wallet.dashboard.view', 'wallet.funding.view', 'wallet.funding.approve',
        'wallet.refunds.manage', 'wallet.settlement.view', 'wallet.reconciliation.run',
        'wallet.audit.view',
    ],
    account: [
        'wallet.dashboard.view', 'wallet.funding.view', 'wallet.customers.view', 'wallet.vending.monitor',
        'wallet.settlement.view', 'wallet.reconciliation.run',
    ],
};

export const ROLE_LABELS: Record<string, string> = {
    'super-admin': 'Super Admin',
    'operations-manager': 'Operations Manager',
    'finance-checker': 'Finance Checker',
    account: 'Account Officer',
};

export const ROLE_LEGACY_NAMES: Record<string, string> = {
    'super-admin': 'admin',
    'operations-manager': 'ops',
    'finance-checker': 'analyst',
    account: 'finance',
};

// Seed flag — runs once per server lifetime, not on every request.
let _accessDefaultsSeeded = false;
let _accessDefaultsPromise: Promise<void> | null = null;

export async function ensureAccessDefaults(): Promise<void> {
    if (_accessDefaultsSeeded) return;
    // Deduplicate concurrent calls during startup (e.g. multiple requests arriving before the first finishes).
    if (_accessDefaultsPromise) return _accessDefaultsPromise;
    _accessDefaultsPromise = (async () => {
        for (const [roleKey, label] of Object.entries(ROLE_LABELS)) {
            await adminClient.from('roles').upsert({
                name: ROLE_LEGACY_NAMES[roleKey] ?? roleKey,
                role_key: roleKey,
                role_name: label,
                label,
                description: roleKey === 'super-admin'
                    ? 'Full wallet administration and access control.'
                    : 'Wallet administration role managed by Beverly access policy.',
            }, { onConflict: 'role_key' });
        }
        for (const [roleKey, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
            for (const permission of permissions) {
                await adminClient.from('permissions').upsert({
                    role_key: roleKey,
                    route_hash: permission,
                }, { onConflict: 'role_key,route_hash' });
            }
        }
        _accessDefaultsSeeded = true;
    })();
    return _accessDefaultsPromise;
}

export async function permissionsForRole(role: string): Promise<Set<string>> {
    await ensureAccessDefaults();
    if (role === 'super-admin') return new Set(PERMISSION_CATALOG.map((p) => p.key));
    const { data } = await adminClient.from('permissions').select('route_hash').eq('role_key', role);
    return new Set((data ?? []).map((p: any) => p.route_hash));
}

export async function roleHasPermission(role: string, permission: string): Promise<boolean> {
    const grants = await permissionsForRole(role);
    return grants.has(permission);
}
