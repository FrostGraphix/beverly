/**
 * Beverly AI RBAC Adapter (`acobot-rbac.ts`)
 *
 * Integrates intent permission checks with Beverly's single source of truth for
 * staff and portal role permissions (`backend/wallet/src/services/rbac.ts`).
 *
 * Partitioned into:
 * 1. Wallet Admin Intents (Financial Float, Settlements, Funding, Reconciliation)
 * 2. Beverly CRM Intents (Customer Account Management, Onboarding, KYC, Support, Disputes)
 * 3. Vendor Portal Intents (Merchant Float, Credentials, Invoices)
 * 4. Customer Portal Intents (Meter Balance, Buying Tokens, Orders)
 */
import type { Actor } from '../plugins/auth.js';
import { roleHasPermission } from './rbac.js';

export interface AcobotIntentResult {
    key: string;
    label: string;
    requiredPermission?: string;
    allowedActorTypes: Array<'staff' | 'vendor_user' | 'customer'>;
    isAllowed: boolean;
    reason?: string;
}

// ── 1. Wallet Admin Domain Intents (Financial & Vending Ops) ───────
export const WALLET_ADMIN_INTENT_PERMISSIONS: Record<string, { permission: string; label: string }> = {
    adminLiquidity: { permission: 'wallet.dashboard.view', label: 'View org-wide liquidity & float reserves' },
    adminFundingQueue: { permission: 'wallet.funding.view', label: 'View funding approval queue' },
    adminApproveFunding: { permission: 'wallet.funding.approve', label: 'Approve vendor funding requests' },
    adminRefunds: { permission: 'wallet.refunds.manage', label: 'Manage & approve customer refunds' },
    adminSettlements: { permission: 'wallet.settlement.view', label: 'View settlement batches & audit rollups' },
    adminReconciliation: { permission: 'wallet.reconciliation.run', label: 'Run daily reconciliation' },
    adminAudit: { permission: 'wallet.audit.view', label: 'View system security audit logs' },
    adminAccess: { permission: 'wallet.access.manage', label: 'Manage role assignments & permissions' },
};

// ── 2. Beverly CRM Domain Intents (Customer & Relationship Management) ──
export const CRM_ADMIN_INTENT_PERMISSIONS: Record<string, { permission: string; label: string }> = {
    adminCustomerOnboarding: { permission: 'wallet.customers.view', label: 'Onboard and register new CRM customers' },
    adminCustomers: { permission: 'wallet.customers.view', label: 'View and manage customer profiles' },
    adminDisputes: { permission: 'wallet.disputes.manage', label: 'Resolve dispute tickets & evidence' },
    adminSupport: { permission: 'wallet.support.manage', label: 'Manage support desk & live chat' },
    adminFraud: { permission: 'wallet.fraud.review', label: 'Review fraud alerts & velocity triggers' },
    adminKycReview: { permission: 'wallet.customers.view', label: 'Review customer KYC documents & compliance' },
};

export const VENDOR_INTENTS = new Set([
    'vendorFloatBalance',
    'vendorSettlementHistory',
    'vendorVendCredentials',
    'vendorStationScope',
    'vendorWhtCertificates',
    'vendorInvoices',
]);

export const CUSTOMER_INTENTS = new Set([
    'customerWalletBalance',
    'customerMeterOrders',
    'customerVendPin',
    'customerSupportChat',
    'customerKycStatus',
    'customerVirtualAccount',
]);

/**
 * Checks whether an authenticated actor has permission to execute a specific Beverly AI intent.
 */
export async function checkAcobotIntentPermission(
    actor: Actor,
    intentKey: string,
): Promise<{ allowed: boolean; reason?: string }> {
    // 1. Check Wallet Admin Intents
    const walletConfig = WALLET_ADMIN_INTENT_PERMISSIONS[intentKey];
    if (walletConfig) {
        if (actor.type !== 'staff') {
            return { allowed: false, reason: `Intent '${intentKey}' requires staff role elevated privileges.` };
        }
        const hasGrant = await roleHasPermission(actor.role, walletConfig.permission);
        if (!hasGrant) {
            return {
                allowed: false,
                reason: `Role '${actor.role}' lacks required permission '${walletConfig.permission}' for ${walletConfig.label}.`,
            };
        }
        return { allowed: true };
    }

    // 2. Check Beverly CRM Intents
    const crmConfig = CRM_ADMIN_INTENT_PERMISSIONS[intentKey];
    if (crmConfig) {
        if (actor.type !== 'staff') {
            return { allowed: false, reason: `Intent '${intentKey}' requires CRM staff access privileges.` };
        }
        const hasGrant = await roleHasPermission(actor.role, crmConfig.permission);
        if (!hasGrant) {
            return {
                allowed: false,
                reason: `Role '${actor.role}' lacks required permission '${crmConfig.permission}' for ${crmConfig.label}.`,
            };
        }
        return { allowed: true };
    }

    // 3. Check Vendor Merchant Intents
    if (VENDOR_INTENTS.has(intentKey)) {
        if (actor.type === 'vendor_user' || ['super-admin', 'operations-manager', 'finance-checker'].includes(actor.role)) {
            return { allowed: true };
        }
        return { allowed: false, reason: `Intent '${intentKey}' is restricted to merchant/vendor organization accounts.` };
    }

    // 4. Check Customer Personal Intents
    if (CUSTOMER_INTENTS.has(intentKey)) {
        if (actor.type === 'customer' || actor.type === 'staff') {
            return { allowed: true };
        }
        return { allowed: false, reason: `Intent '${intentKey}' is restricted to authenticated customer accounts.` };
    }

    // Default: General FAQ / Help intents allowed for authenticated actors
    return { allowed: true };
}

/**
 * Evaluates all intent keys for an actor to generate a permission matrix.
 */
export async function getPermittedIntentsForActor(actor: Actor): Promise<AcobotIntentResult[]> {
    const results: AcobotIntentResult[] = [];
    const allIntentsMap = {
        ...WALLET_ADMIN_INTENT_PERMISSIONS,
        ...CRM_ADMIN_INTENT_PERMISSIONS,
    };

    for (const [key, config] of Object.entries(allIntentsMap)) {
        const check = await checkAcobotIntentPermission(actor, key);
        results.push({
            key,
            label: config.label,
            requiredPermission: config.permission,
            allowedActorTypes: ['staff'],
            isAllowed: check.allowed,
            reason: check.reason,
        });
    }

    return results;
}
