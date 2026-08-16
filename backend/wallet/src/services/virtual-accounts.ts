/**
 * Virtual Account (DVA) service.
 *
 * Wraps Paystack Dedicated Virtual Accounts.
 * Each wallet can have one active NUBAN.  Funding arrives as charge.success
 * with channel='dedicated_nuban' — handled in webhooks.ts.
 */
import { adminClient } from '../db/supabase.js';
import {
    createPaystackCustomer,
    createDedicatedAccount,
    type DvaResult,
} from '../adapters/paystack.js';
import { logAction } from './audit.js';

export class VirtualAccountError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'VirtualAccountError';
    }
}

export interface VirtualAccount {
    id: string;
    wallet_id: string;
    owner_type: 'customer' | 'vendor';
    owner_id: string;
    paystack_customer_code: string | null;
    bank_name: string;
    bank_code: string;
    account_number: string;
    account_name: string;
    gateway: string;
    status: 'active' | 'inactive' | 'frozen';
    created_at: string;
}

export async function getVirtualAccount(walletId: string): Promise<VirtualAccount | null> {
    const { data } = await adminClient
        .from('virtual_accounts')
        .select('*')
        .eq('wallet_id', walletId)
        .eq('status', 'active')
        .maybeSingle();
    return (data as VirtualAccount) ?? null;
}

export async function getOrCreateVirtualAccount(opts: {
    walletId: string;
    ownerType: 'customer' | 'vendor';
    ownerId: string;
    email: string;
    name?: string | null;
    requestedBy: string;
}): Promise<VirtualAccount> {
    const existing = await getVirtualAccount(opts.walletId);
    if (existing) return existing;

    // Create Paystack customer first
    const [firstName, ...rest] = (opts.name ?? '').split(' ');
    let psCustomer: { customer_code: string };
    try {
        psCustomer = await createPaystackCustomer({
            email:     opts.email,
            firstName: firstName || undefined,
            lastName:  rest.join(' ') || undefined,
            metadata:  { wallet_id: opts.walletId, owner_type: opts.ownerType, owner_id: opts.ownerId },
        });
    } catch (e: any) {
        throw new VirtualAccountError(
            `Could not create Paystack customer: ${e.message}`,
            'paystack_customer_failed',
        );
    }

    // Assign DVA
    let dva: DvaResult;
    try {
        dva = await createDedicatedAccount({ customerId: psCustomer.customer_code });
    } catch (e: any) {
        throw new VirtualAccountError(
            `Could not assign virtual account: ${e.message}`,
            'dva_assignment_failed',
        );
    }

    const { data, error } = await adminClient
        .from('virtual_accounts')
        .insert({
            wallet_id:               opts.walletId,
            owner_type:              opts.ownerType,
            owner_id:                opts.ownerId,
            paystack_customer_code:  psCustomer.customer_code,
            bank_name:               dva.bank.name,
            bank_code:               String(dva.bank.id),
            account_number:          dva.account_number,
            account_name:            dva.account_name,
            status:                  'active',
            metadata:                { dva_id: dva.id, assigned: dva.assigned },
        })
        .select('*')
        .single();
    if (error || !data) {
        throw new VirtualAccountError(error?.message ?? 'DB insert failed', 'db_error');
    }

    await logAction({
        actorUserId: opts.requestedBy,
        actorType:   opts.ownerType === 'customer' ? 'customer' : 'vendor_user',
        action:      'virtual_account.created',
        targetType:  'wallet',
        targetId:    opts.walletId,
        after:       { accountNumber: dva.account_number, bankName: dva.bank.name },
    });

    return data as VirtualAccount;
}
