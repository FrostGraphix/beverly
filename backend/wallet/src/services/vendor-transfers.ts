import { adminClient } from '../db/supabase.js';
import crypto from 'node:crypto';

export interface VendorTransferInput {
    sourceVendorId: string;
    destinationVendorId: string;
    amountMinor: number;
    reason: string;
    idempotencyKey: string;
    requestedBy: string;
}

export interface VendorTransfer {
    id: string;
    status: 'completed';
    source_vendor_id: string;
    destination_vendor_id: string;
    source_vendor_name: string;
    destination_vendor_name: string;
    source_wallet_id: string;
    destination_wallet_id: string;
    amount_minor: number;
    currency: string;
    reason: string;
    idempotency_key: string;
    debit_entry_id: string;
    credit_entry_id: string;
    source_balance_after_minor: number;
    destination_balance_after_minor: number;
    created_by: string;
    created_at: string;
}

const PUBLIC_TRANSFER_COLUMNS = 'id, status, source_vendor_id, destination_vendor_id, source_vendor_name, destination_vendor_name, source_wallet_id, destination_wallet_id, amount_minor, currency, reason, idempotency_key, debit_entry_id, credit_entry_id, source_balance_after_minor, destination_balance_after_minor, created_by, created_at' as const;

export interface TransferVendorOption {
    vendorId: string;
    walletId: string;
    name: string;
    currency: string;
    availableMinor: number;
}

export interface VendorTransferPreview {
    amountMinor: number;
    currency: string;
    sourceBalanceAfterMinor: number;
    destinationBalanceAfterMinor: number;
}

export interface VendorTransferRateLimit {
    count: number;
    limit: number;
    exceeded: boolean;
    retryAfterSeconds: number;
}

export class VendorTransferError extends Error {
    constructor(message: string, public code: string, public status: number) {
        super(message);
        this.name = 'VendorTransferError';
    }
}

export async function observeVendorTransferRateLimit(input: {
    actorUserId: string;
    ip: string;
    maxRequests: number;
    windowSeconds: number;
}): Promise<VendorTransferRateLimit> {
    const keyHash = crypto
        .createHash('sha256')
        .update(`${input.actorUserId}|${input.ip}`)
        .digest('hex');
    const { data, error } = await adminClient.rpc('fn_observe_wallet_rate_limit', {
        p_scope: 'admin.vendor_transfer.create',
        p_key_hash: keyHash,
        p_window_seconds: input.windowSeconds,
        p_max_requests: input.maxRequests,
    });
    if (error) {
        throw new VendorTransferError('Transfer rate-limit verification is unavailable.', 'rate_limit_unavailable', 503);
    }
    const row = data as Record<string, unknown>;
    return {
        count: Number(row.count),
        limit: Number(row.limit),
        exceeded: row.exceeded === true,
        retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds)),
    };
}

function publicError(message: string): VendorTransferError {
    if (/insufficient available balance/i.test(message)) {
        return new VendorTransferError('The source vendor does not have enough available balance.', 'insufficient_balance', 409);
    }
    if (/source wallet is not active/i.test(message)) {
        return new VendorTransferError('The source vendor wallet is not active.', 'source_wallet_inactive', 409);
    }
    if (/destination wallet is not active/i.test(message)) {
        return new VendorTransferError('The destination vendor wallet is not active.', 'destination_wallet_inactive', 409);
    }
    if (/source and destination vendors must differ/i.test(message)) {
        return new VendorTransferError('Choose two different vendors.', 'same_vendor', 400);
    }
    if (/idempotency key payload mismatch/i.test(message)) {
        return new VendorTransferError('This request key was already used for a different transfer.', 'idempotency_conflict', 409);
    }
    if (/daily debit cap exceeded/i.test(message)) {
        return new VendorTransferError('This transfer would exceed the source wallet daily debit cap.', 'daily_debit_cap_exceeded', 409);
    }
    if (/monthly debit cap exceeded/i.test(message)) {
        return new VendorTransferError('This transfer would exceed the source wallet monthly debit cap.', 'monthly_debit_cap_exceeded', 409);
    }
    if (/wallet currencies must match/i.test(message)) {
        return new VendorTransferError('Source and destination wallet currencies do not match.', 'currency_mismatch', 409);
    }
    if (/vendor transfers are disabled/i.test(message)) {
        return new VendorTransferError('Vendor balance transfers are currently disabled.', 'vendor_transfers_disabled', 503);
    }
    return new VendorTransferError('The transfer could not be completed.', 'vendor_transfer_failed', 422);
}

export async function transferVendorBalance(input: VendorTransferInput): Promise<VendorTransfer> {
    const { data, error } = await adminClient.rpc('fn_admin_transfer_vendor_balance', {
        p_source_vendor_id: input.sourceVendorId,
        p_destination_vendor_id: input.destinationVendorId,
        p_amount_minor: input.amountMinor,
        p_reason: input.reason,
        p_idempotency_key: input.idempotencyKey,
        p_created_by: input.requestedBy,
    });
    if (error) throw publicError(error.message ?? 'vendor transfer failed');
    if (!data || typeof data !== 'object') {
        throw new VendorTransferError('Transfer confirmation is temporarily unavailable.', 'transfer_result_missing', 503);
    }
    return data as VendorTransfer;
}

export async function listTransferVendors(search = ''): Promise<TransferVendorOption[]> {
    const safeSearch = search.trim().replace(/[(),]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
    let query = adminClient
        .from('vendor_organizations')
        .select('id, legal_name, trading_name')
        .eq('status', 'approved')
        .order('trading_name', { ascending: true })
        .limit(25);
    if (safeSearch) query = query.or(`legal_name.ilike.%${safeSearch}%,trading_name.ilike.%${safeSearch}%`);
    const { data: vendors, error: vendorError } = await query;
    if (vendorError) throw new VendorTransferError('Vendor wallets could not be loaded.', 'vendor_lookup_failed', 503);
    const vendorIds = (vendors ?? []).map((vendor) => vendor.id);
    if (!vendorIds.length) return [];
    const { data: wallets, error: walletError } = await adminClient
        .from('wallets').select('id, owner_id, currency').eq('owner_type', 'vendor').eq('status', 'active').in('owner_id', vendorIds);
    if (walletError) throw new VendorTransferError('Vendor wallets could not be loaded.', 'vendor_lookup_failed', 503);
    const walletIds = (wallets ?? []).map((wallet) => wallet.id);
    const { data: balances, error: balanceError } = walletIds.length
        ? await adminClient.from('v_wallet_balances').select('wallet_id, available_balance_minor').in('wallet_id', walletIds)
        : { data: [], error: null };
    if (balanceError) throw new VendorTransferError('Vendor balances could not be loaded.', 'vendor_lookup_failed', 503);
    const walletByVendor = new Map((wallets ?? []).map((wallet) => [wallet.owner_id, wallet]));
    const balanceByWallet = new Map((balances ?? []).map((balance) => [balance.wallet_id, Number(balance.available_balance_minor)]));
    return (vendors ?? []).flatMap((vendor) => {
        const wallet = walletByVendor.get(vendor.id);
        return wallet ? [{
            vendorId: vendor.id,
            walletId: wallet.id,
            name: vendor.trading_name || vendor.legal_name,
            currency: wallet.currency,
            availableMinor: balanceByWallet.get(wallet.id) ?? 0,
        }] : [];
    });
}

export async function previewVendorTransfer(input: Pick<VendorTransferInput, 'sourceVendorId' | 'destinationVendorId' | 'amountMinor'>): Promise<VendorTransferPreview> {
    if (input.sourceVendorId === input.destinationVendorId) throw publicError('source and destination vendors must differ');
    const { data, error } = await adminClient.rpc('fn_preview_admin_vendor_balance_transfer', {
        p_source_vendor_id: input.sourceVendorId,
        p_destination_vendor_id: input.destinationVendorId,
        p_amount_minor: input.amountMinor,
    });
    if (error) throw publicError(error.message ?? 'vendor transfer preview failed');
    if (!data || typeof data !== 'object') {
        throw new VendorTransferError('Transfer preview is temporarily unavailable.', 'transfer_preview_missing', 503);
    }
    const row = data as Record<string, unknown>;
    return {
        amountMinor: Number(row.amount_minor),
        currency: String(row.currency),
        sourceBalanceAfterMinor: Number(row.source_balance_after_minor),
        destinationBalanceAfterMinor: Number(row.destination_balance_after_minor),
    };
}

export async function listVendorTransfers(opts: { limit?: number; cursor?: string } = {}): Promise<{ transfers: VendorTransfer[]; nextCursor: string | null }> {
    const limit = opts.limit ?? 25;
    let query = adminClient.from('vendor_wallet_transfers').select(PUBLIC_TRANSFER_COLUMNS).order('created_at', { ascending: false }).limit(limit + 1);
    if (opts.cursor) query = query.lt('created_at', opts.cursor);
    const { data, error } = await query;
    if (error) throw new VendorTransferError('Transfer history could not be loaded.', 'transfer_history_failed', 503);
    const rows = (data ?? []) as VendorTransfer[];
    return { transfers: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1]?.created_at ?? null : null };
}

export async function getVendorTransfer(id: string): Promise<VendorTransfer | null> {
    const { data, error } = await adminClient.from('vendor_wallet_transfers').select(PUBLIC_TRANSFER_COLUMNS).eq('id', id).maybeSingle();
    if (error) throw new VendorTransferError('Transfer receipt could not be loaded.', 'transfer_detail_failed', 503);
    return (data as VendorTransfer | null) ?? null;
}
