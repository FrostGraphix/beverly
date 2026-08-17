/**
 * Beverly AI Context Builder (`acobot-context.ts`)
 *
 * Constructs permission-safe database context blocks for Beverly AI model prompts.
 * Explicitly partitioned across:
 * 1. Wallet Admin (`admin`)
 * 2. Beverly CRM (`crm`)
 * 3. Customer Portal (`customer`)
 * 4. Vendor Console (`vendor`)
 */
import type { Actor } from '../plugins/auth.js';
import { adminClient } from '../db/supabase.js';
import { checkAcobotIntentPermission } from './acobot-rbac.js';

export interface DetectedIntents {
    // Wallet Admin Intents
    adminLiquidity?: boolean;
    adminFundingQueue?: boolean;
    adminMeterApprovals?: boolean;
    adminExceptions?: boolean;
    adminSettlements?: boolean;
    adminReconciliation?: boolean;

    // Beverly CRM Intents
    adminCustomerOnboarding?: boolean;
    adminCustomers?: boolean;
    adminDisputes?: boolean;
    adminSupport?: boolean;
    adminKycReview?: boolean;
    
    // Vendor Intents
    vendorFloatBalance?: boolean;
    vendorSettlementHistory?: boolean;
    vendorVendCredentials?: boolean;
    
    // Customer Intents
    customerWalletBalance?: boolean;
    customerMeterOrders?: boolean;
    customerVendPin?: boolean;
    customerSupportChat?: boolean;

    // General
    faqHelp?: boolean;
}

export function detectIntentsFromPrompt(prompt: string): DetectedIntents {
    const q = prompt.toLowerCase();
    const has = (...words: string[]) => words.some((w) => q.includes(w));

    return {
        // Wallet Admin
        adminLiquidity: has('liquidity', 'float reserve', 'total float', 'system balance', 'total balance'),
        adminFundingQueue: has('funding queue', 'pending funding', 'approve funding', 'vendor funding'),
        adminMeterApprovals: has('meter approval', 'meter claim', 'pending meter', 'unclaimed meter'),
        adminExceptions: has('exception', 'error log', 'system failure', 'gateway error', 'webhook failure'),
        adminSettlements: has('settlement batch', 'daily settlement', 'settled sales', 'settlement audit'),
        adminReconciliation: has('reconciliation', 'reconcile', 'ledger variance'),

        // Beverly CRM
        adminCustomerOnboarding: has('upload customer', 'add customer', 'register customer', 'new customer', 'onboard customer', 'import customer', 'customer import'),
        adminCustomers: has('customer list', 'customer profile', 'crm account', 'customer detail'),
        adminDisputes: has('dispute', 'chargeback', 'refund claim', 'disputed transaction'),
        adminSupport: has('support ticket', 'helpdesk', 'live chat', 'support desk'),
        adminKycReview: has('kyc', 'compliance', 'document review', 'identity verification'),

        // Vendor
        vendorFloatBalance: has('my float', 'merchant balance', 'vendor balance', 'organization balance'),
        vendorSettlementHistory: has('my settlement', 'vendor settlement', 'settlement report'),
        vendorVendCredentials: has('vend credential', 'vending key', 'station scope'),

        // Customer
        customerWalletBalance: has('my balance', 'wallet balance', 'how much money', 'my account balance'),
        customerMeterOrders: has('my token', 'purchase history', 'last order', 'electricity token', 'meter order'),
        customerVendPin: has('vend pin', 'my pin', 'reset pin'),
        customerSupportChat: has('help', 'support ticket', 'open issue', 'customer care'),

        // General
        faqHelp: has('how to', 'tariff rate', 'error code', 'meter tamper', 'sgc keychange'),
    };
}

export interface BuiltAcobotContext {
    contextText: string;
    detectedIntents: string[];
    deniedIntents: string[];
    permissionStatus: 'granted' | 'denied' | 'partial';
}

export async function buildAcobotContext(
    actor: Actor,
    portal: 'admin' | 'crm' | 'customer' | 'vendor',
    userPrompt: string,
): Promise<BuiltAcobotContext> {
    const detectedFlags = detectIntentsFromPrompt(userPrompt);
    const detectedIntents: string[] = [];
    const deniedIntents: string[] = [];
    const contextSections: string[] = [];

    // Actor Identity Banner
    contextSections.push(
        `[USER IDENTITY]\n` +
        `- Actor Type: ${actor.type}\n` +
        `- User Role: ${actor.role}\n` +
        `- Target Portal: ${portal.toUpperCase()}\n` +
        `- Actor ID: ${actor.actorId}\n` +
        (actor.vendorOrganizationId ? `- Vendor Org ID: ${actor.vendorOrganizationId}\n` : '') +
        (actor.customerId ? `- Customer ID: ${actor.customerId}\n` : '')
    );

    for (const [intentKey, isActive] of Object.entries(detectedFlags)) {
        if (!isActive) continue;
        detectedIntents.push(intentKey);

        const rbacCheck = await checkAcobotIntentPermission(actor, intentKey);
        if (!rbacCheck.allowed) {
            deniedIntents.push(intentKey);
            contextSections.push(
                `[PERMISSION DENIED: ${intentKey}]\n` +
                `Reason: ${rbacCheck.reason ?? 'Restricted by role permission rules.'}`
            );
            continue;
        }

        // Fetch scoped domain data based on portal partition & intent
        try {
            // ── 1. Wallet Admin Domain Data ──
            if (portal === 'admin' && intentKey === 'adminLiquidity') {
                const { count } = await adminClient.from('wallets').select('id', { count: 'exact', head: true });
                contextSections.push(`[DATA: WALLET ADMIN LIQUIDITY]\n- System Wallets Monitored: ${count ?? 0}`);
            }

            if (portal === 'admin' && intentKey === 'adminMeterApprovals') {
                const { count } = await adminClient.from('meter_approvals').select('id', { count: 'exact', head: true }).eq('status', 'pending');
                contextSections.push(`[DATA: METER APPROVALS QUEUE]\n- Pending Approvals Count: ${count ?? 0}`);
            }

            if (portal === 'admin' && intentKey === 'adminSettlements') {
                const { data } = await adminClient.from('settlement_batches').select('id, batch_date, total_gross_minor, status').order('batch_date', { ascending: false }).limit(3);
                contextSections.push(`[DATA: DAILY SETTLEMENT ROLLUPS]\n` + JSON.stringify(data ?? [], null, 2));
            }

            // ── 2. Beverly CRM Domain Data ──
            if ((portal === 'crm' || portal === 'admin') && intentKey === 'adminCustomerOnboarding') {
                contextSections.push(
                    `[DATA: BEVERLY CRM CUSTOMER ONBOARDING]\n` +
                    `- Active Mode: Pre-filled Customer Action Card & CSV Template.\n` +
                    `- Template File: Beverly_Customer_Import_Template.csv\n` +
                    `- Customer Fields: full_name, phone_number, email, meter_number, address.`
                );
            }

            if (portal === 'crm' && intentKey === 'adminDisputes') {
                const { count } = await adminClient.from('disputes').select('id', { count: 'exact', head: true }).eq('status', 'open');
                contextSections.push(`[DATA: BEVERLY CRM OPEN DISPUTES]\n- Open Disputes Count: ${count ?? 0}`);
            }

            // ── 3. Vendor Merchant Domain Data ──
            if (portal === 'vendor' && intentKey === 'vendorFloatBalance' && actor.vendorOrganizationId) {
                const { data } = await adminClient.from('vendor_organizations').select('id, name, float_balance_minor').eq('id', actor.vendorOrganizationId).single();
                contextSections.push(`[DATA: MERCHANT FLOAT BALANCE]\n` + JSON.stringify(data ?? {}, null, 2));
            }

            // ── 4. Customer Wallet Domain Data ──
            if (portal === 'customer' && intentKey === 'customerWalletBalance' && actor.customerId) {
                const { data } = await adminClient.from('customers').select('id, full_name, wallet_balance_minor').eq('id', actor.customerId).single();
                contextSections.push(`[DATA: CUSTOMER WALLET BALANCE]\n` + JSON.stringify(data ?? {}, null, 2));
            }
        } catch (err: any) {
            contextSections.push(`[DATA FETCH NOTICE: ${intentKey}]\n${err?.message ?? 'Query skipped.'}`);
        }
    }

    const permissionStatus: 'granted' | 'denied' | 'partial' =
        deniedIntents.length === 0
            ? 'granted'
            : detectedIntents.length === deniedIntents.length
            ? 'denied'
            : 'partial';

    return {
        contextText: contextSections.join('\n\n'),
        detectedIntents,
        deniedIntents,
        permissionStatus,
    };
}
