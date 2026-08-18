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
import { listFaqs } from './support.js';

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
    adminOemConfig?: boolean;
    
    // Vendor Intents
    vendorFloatBalance?: boolean;
    vendorSettlementHistory?: boolean;
    vendorVendCredentials?: boolean;
    vendorKycStatus?: boolean;
    
    // Customer Intents
    customerWalletBalance?: boolean;
    customerMeterOrders?: boolean;
    customerVendPin?: boolean;
    customerSupportChat?: boolean;
    customerKycStatus?: boolean;
    customerMeterRelayControl?: boolean;

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
        adminOemConfig: has('oem', 'sparkmeter', 'calinmeter', 'ihemeter', 'hexing', 'conlog', 'sanxing', 'oem credentials', 'meter manufacturer', 'oem endpoints'),

        // Vendor
        vendorFloatBalance: has('my float', 'merchant balance', 'vendor balance', 'organization balance'),
        vendorSettlementHistory: has('my settlement', 'vendor settlement', 'settlement report'),
        vendorVendCredentials: has('vend credential', 'vending key', 'station scope'),

        // Customer
        customerWalletBalance: has('my balance', 'wallet balance', 'how much money', 'my account balance'),
        customerMeterOrders: has('my token', 'purchase history', 'last order', 'electricity token', 'meter order'),
        customerVendPin: has('vend pin', 'my pin', 'reset pin'),
        customerSupportChat: has('help', 'support ticket', 'open issue', 'customer care'),
        customerMeterRelayControl: has('turn off meter', 'disconnect meter', 'turn off my meter', 'shut off meter', 'turn on meter', 'reconnect meter', 'relay control', 'switch off meter', 'switch on meter', 'trip meter'),

        // General
        faqHelp: has('faq', 'faqs', 'help', 'how to', 'tariff rate', 'error code', 'meter tamper', 'sgc keychange', 'knowledge base', 'guide', 'support'),
    };
}

export interface BuiltAcobotContext {
    contextText: string;
    detectedIntents: string[];
    deniedIntents: string[];
    permissionStatus: 'granted' | 'denied' | 'partial';
    directFaqAnswer?: string;
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

            // ── 2. Beverly CRM Domain Data & KYC Review ──
            if ((portal === 'crm' || portal === 'admin') && intentKey === 'adminCustomerOnboarding') {
                contextSections.push(
                    `[DATA: BEVERLY CRM CUSTOMER ONBOARDING]\n` +
                    `- Active Mode: Pre-filled Customer Action Card & CSV Template.\n` +
                    `- Template File: Beverly_Customer_Import_Template.csv\n` +
                    `- Customer Fields: full_name, phone_number, email, meter_number, address.`
                );
            }

            if ((portal === 'crm' || portal === 'admin') && (intentKey === 'adminKycReview' || intentKey === 'adminCustomers')) {
                const { count: pendingKyc } = await adminClient.from('customers').select('id', { count: 'exact', head: true }).eq('kyc_status', 'pending');
                const { count: verifiedKyc } = await adminClient.from('customers').select('id', { count: 'exact', head: true }).eq('kyc_status', 'verified');
                contextSections.push(
                    `[DATA: BEVERLY CRM KYC & COMPLIANCE STATS]\n` +
                    `- Pending KYC Submissions Awaiting Review: ${pendingKyc ?? 0}\n` +
                    `- Verified Customers: ${verifiedKyc ?? 0}`
                );
            }

            if ((portal === 'crm' || portal === 'admin') && intentKey === 'adminOemConfig') {
                const { data: oemList } = await adminClient
                    .from('oem_manufacturers')
                    .select('id, slug, display_name, status, vending_strategy, capabilities');

                const { data: oemCreds } = await adminClient
                    .from('oem_credentials')
                    .select('oem_id, auth_strategy, base_url');

                contextSections.push(
                    `[DATA: BEVERLY CRM OEM MANUFACTURERS & CREDENTIALS REGISTRY]\n` +
                    `- Registered OEMs: ${JSON.stringify(oemList ?? [], null, 2)}\n` +
                    `- OEM Credentials: ${JSON.stringify(oemCreds ?? [], null, 2)}\n` +
                    `- Operational Mode: Beverly AI is natively active for diagnosing and querying all OEM meter integrations.`
                );
            }

            if (portal === 'crm' && intentKey === 'adminDisputes') {
                const { count } = await adminClient.from('disputes').select('id', { count: 'exact', head: true }).eq('status', 'open');
                contextSections.push(`[DATA: BEVERLY CRM OPEN DISPUTES]\n- Open Disputes Count: ${count ?? 0}`);
            }

            // ── 3. Vendor Merchant Domain Data & KYC ──
            if (portal === 'vendor' && actor.vendorOrganizationId && (intentKey === 'vendorFloatBalance' || intentKey === 'vendorKycStatus')) {
                const { data: vendorData } = await adminClient
                    .from('vendor_organizations')
                    .select('id, name, status, float_balance_minor, settlement_bank_name, settlement_account_number')
                    .eq('id', actor.vendorOrganizationId)
                    .single();

                if (vendorData) {
                    const floatMajor = ((vendorData.float_balance_minor ?? 0) / 100).toFixed(2);
                    contextSections.push(
                        `[LIVE MERCHANT ORGANIZATION & KYC CONTEXT]\n` +
                        `- Merchant Name: ${vendorData.name ?? 'N/A'}\n` +
                        `- Organization Status: ${String(vendorData.status).toUpperCase()}\n` +
                        `- Merchant Float Balance: ₦${floatMajor}\n` +
                        `- Settlement Account: ${vendorData.settlement_bank_name ?? 'N/A'} (${vendorData.settlement_account_number ?? 'N/A'})`
                    );
                }
            }

            // ── 4. Customer Wallet Domain Data & KYC ──
            if (portal === 'customer' && actor.customerId && (intentKey === 'customerWalletBalance' || intentKey === 'customerKycStatus')) {
                const { data: customerData } = await adminClient
                    .from('customers')
                    .select('id, full_name, phone, email, wallet_balance_minor, kyc_tier, kyc_status, status')
                    .eq('id', actor.customerId)
                    .single();

                if (customerData) {
                    const { count: meterCount } = await adminClient
                        .from('meters')
                        .select('id', { count: 'exact', head: true })
                        .eq('customer_id', actor.customerId);

                    const limitByTier: Record<number, string> = {
                        0: '₦50,000 per purchase / Max 1 meter',
                        1: '₦100,000 per purchase / Max 5 meters',
                        2: '₦200,000 per purchase / Max 10 meters',
                    };

                    const tierLevel = customerData.kyc_tier ?? 0;
                    const balanceMajor = ((customerData.wallet_balance_minor ?? 0) / 100).toFixed(2);

                    contextSections.push(
                        `[LIVE CUSTOMER PROFILE & KYC CONTEXT]\n` +
                        `- Customer Name: ${customerData.full_name ?? 'N/A'}\n` +
                        `- Email: ${customerData.email ?? 'N/A'}\n` +
                        `- Phone: ${customerData.phone ?? 'N/A'}\n` +
                        `- Account Status: ${String(customerData.status).toUpperCase()}\n` +
                        `- KYC Tier: Tier ${tierLevel} (${tierLevel === 0 ? 'Unverified' : tierLevel === 1 ? 'BVN Verified' : 'NIN & ID Verified'})\n` +
                        `- KYC Verification Status: ${String(customerData.kyc_status ?? 'unverified').toUpperCase()}\n` +
                        `- Vending Limit: ${limitByTier[tierLevel] ?? limitByTier[0]}\n` +
                        `- Wallet Balance: ₦${balanceMajor}\n` +
                        `- Linked Meters Count: ${meterCount ?? 0}`
                    );
                }
            }

            if (intentKey === 'customerMeterRelayControl' && actor.customerId) {
                const { data: meters } = await adminClient
                    .from('meters')
                    .select('id, meter_number, oem_brand, is_active')
                    .eq('customer_id', actor.customerId);

                contextSections.push(
                    `[DATA: CUSTOMER METER RELAY CONTROL]\n` +
                    `- Linked Smart Meters: ${JSON.stringify(meters ?? [], null, 2)}\n` +
                    `- Security Policy: Customers ARE PERMITTED to turn off/on their OWN smart meters.\n` +
                    `- Action Proposal Card Required: Output structured action-card with action "METER_RELAY_OFF" or "METER_RELAY_ON" and meterNumber parameter. User confirms via Vend PIN in UI.`
                );
            }

            // ── 5. General FAQ Knowledge Data ──
            if (intentKey === 'faqHelp') {
                const faqs = await listFaqs({
                    audience: portal === 'admin' || portal === 'crm' ? 'all' : (portal as 'customer' | 'vendor'),
                    limit: 10,
                });
                if (faqs.length > 0) {
                    const faqList = faqs.map((f) => `- Q: ${f.question}\n  A: ${f.answer}`).join('\n');
                    contextSections.push(`[DATA: PUBLISHED SUPPORT FAQS FOR ${portal.toUpperCase()}]\n${faqList}`);
                }
            }
        } catch (err: any) {
            contextSections.push(`[DATA FETCH NOTICE: ${intentKey}]\n${err?.message ?? 'Query skipped.'}`);
        }
    }

    // ── 5. Knowledge Base (FAQ) Intent & Direct Answer Interceptor ──
    let directFaqAnswer: string | undefined = undefined;
    const trimmedPrompt = userPrompt.trim();

    // Ignore short conversational prompts (e.g. "hi", "hello", "yes", "no") from direct FAQ interception
    const stopWords = new Set(['hi', 'hello', 'hey', 'yo', 'thanks', 'thank you', 'ok', 'okay', 'yes', 'no', 'how', 'do', 'i', 'the', 'a', 'an', 'what', 'is', 'for', 'to', 'my', 'me', 'in', 'on', 'at', 'with']);
    const promptWords = trimmedPrompt.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));

    if (trimmedPrompt.length >= 4 && promptWords.length > 0) {
        try {
            // First try full prompt search
            let matchingFaqs = await listFaqs({
                search: trimmedPrompt,
                audience: portal === 'admin' || portal === 'crm' ? 'all' : (portal as 'customer' | 'vendor'),
                limit: 5,
            });

            // Fallback: If full prompt yields no results, search by top significant keywords
            if (matchingFaqs.length === 0 && promptWords.length > 0) {
                const keywordTerm = promptWords.join(' ');
                matchingFaqs = await listFaqs({
                    search: keywordTerm,
                    audience: portal === 'admin' || portal === 'crm' ? 'all' : (portal as 'customer' | 'vendor'),
                    limit: 5,
                });
            }

            if (matchingFaqs.length > 0) {
                const topFaq = matchingFaqs[0];
                const cleanPrompt = trimmedPrompt.toLowerCase().replace(/[^a-z0-9]/g, '');
                const cleanFaqQ = topFaq.question.toLowerCase().replace(/[^a-z0-9]/g, '');

                // High-confidence direct answer match check
                const isDirectMatch =
                    cleanFaqQ.includes(cleanPrompt) ||
                    cleanPrompt.includes(cleanFaqQ) ||
                    promptWords.every((word) => cleanFaqQ.includes(word));

                if (isDirectMatch) {
                    directFaqAnswer = `**${topFaq.question}**\n\n${topFaq.answer}`;
                }

                const faqSummary = matchingFaqs.map((f) => `- Q: ${f.question}\n  A: ${f.answer}`).join('\n');
                contextSections.push(`[KNOWLEDGE BASE MATCHES (BEVERLY SUPPORT FAQS)]\n${faqSummary}`);
            }
        } catch {
            // Skip FAQ context gracefully if DB fetch encounters a temporary error
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
        directFaqAnswer,
    };
}
