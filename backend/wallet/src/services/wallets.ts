/**
 * Wallet service.
 * Provisioning + lookup.  Money operations live in ledger.ts.
 */
import { adminClient } from '../db/supabase.js';

export type OwnerType = 'vendor' | 'customer';

export interface Wallet {
    id: string;
    owner_type: OwnerType;
    owner_id: string;
    currency: string;
    status: 'active' | 'frozen' | 'closed';
    daily_debit_cap_minor: number | null;
    monthly_debit_cap_minor: number | null;
    created_at: string;
}

export class WalletStateError extends Error {
    constructor(message: string, public code: string, public status = 409) {
        super(message);
        this.name = 'WalletStateError';
    }
}

export function assertWalletCanTransact(wallet: Pick<Wallet, 'status'> | null | undefined, action = 'transact'): asserts wallet is Wallet {
    if (!wallet) {
        throw new WalletStateError('Wallet not found.', 'wallet_missing', 404);
    }
    if (wallet.status === 'frozen') {
        throw new WalletStateError(`Wallet is frozen. It cannot ${action} until an admin reactivates it.`, 'wallet_frozen', 403);
    }
    if (wallet.status === 'closed') {
        throw new WalletStateError(`Wallet is closed. It cannot ${action}.`, 'wallet_closed', 403);
    }
    if (wallet.status !== 'active') {
        throw new WalletStateError(`Wallet is not active. It cannot ${action}.`, 'wallet_inactive', 403);
    }
}

export async function getOrCreateWallet(
    ownerType: OwnerType,
    ownerId: string,
    opts: { dailyCapMinor?: number; monthlyCapMinor?: number } = {},
): Promise<Wallet> {
    const { data: existing } = await adminClient
        .from('wallets')
        .select('*')
        .eq('owner_type', ownerType)
        .eq('owner_id', ownerId)
        .maybeSingle();
    if (existing) return existing as Wallet;

    const { data, error } = await adminClient
        .from('wallets')
        .insert({
            owner_type: ownerType,
            owner_id: ownerId,
            daily_debit_cap_minor: opts.dailyCapMinor ?? null,
            monthly_debit_cap_minor: opts.monthlyCapMinor ?? null,
        })
        .select('*')
        .single();
    if (error) throw new Error(`wallet creation failed: ${error.message}`);
    return data as Wallet;
}

export async function findWalletByOwner(ownerType: OwnerType, ownerId: string): Promise<Wallet | null> {
    const { data } = await adminClient
        .from('wallets')
        .select('*')
        .eq('owner_type', ownerType)
        .eq('owner_id', ownerId)
        .maybeSingle();
    return (data as Wallet) ?? null;
}

export async function setWalletStatus(
    walletId: string,
    status: 'active' | 'frozen' | 'closed',
): Promise<Wallet> {
    const { data: before, error: beforeError } = await adminClient
        .from('wallets')
        .select('*')
        .eq('id', walletId)
        .maybeSingle();
    if (beforeError || !before) {
        throw new WalletStateError(beforeError?.message ?? 'Wallet not found.', 'wallet_not_found', 404);
    }
    if ((before as Wallet).status === 'closed' && status !== 'closed') {
        throw new WalletStateError('Closed wallets cannot be reactivated. Create a replacement wallet instead.', 'wallet_closed_final', 409);
    }

    const { data, error } = await adminClient
        .from('wallets')
        .update({ status })
        .eq('id', walletId)
        .select('*')
        .single();
    if (error) throw new Error(`wallet status update failed: ${error.message}`);
    return data as Wallet;
}
