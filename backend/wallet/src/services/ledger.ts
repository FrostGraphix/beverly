/**
 * Universal wallet ledger.
 *
 * All money movement flows through here.  Postgres function `fn_post_ledger_entry`
 * does the row-locking, idempotency, and balance computation atomically.
 *
 * Rules enforced upstream by DB:
 *   • Entries are immutable (no UPDATE / DELETE).
 *   • Idempotency key is unique.
 *   • Debits cannot exceed available balance (ledger - active holds).
 *
 * Service-layer responsibilities:
 *   • Compose idempotency keys deterministically per use case.
 *   • Translate DB errors to typed app errors.
 *   • Pair every entry with an audit log write.
 */
import { adminClient } from '../db/supabase.js';
import { logAction } from './audit.js';

export type EntryType =
    | 'funding_credit'
    | 'payment_credit'
    | 'purchase_debit'
    | 'meter_order_debit'
    | 'manual_credit'
    | 'manual_debit'
    | 'reversal_credit'
    | 'reversal_debit'
    | 'fee_debit'
    | 'promo_credit';

export interface LedgerEntry {
    id: string;
    wallet_id: string;
    direction: 'credit' | 'debit';
    amount_minor: number;
    balance_after_minor: number;
    entry_type: EntryType;
    reference_type: string | null;
    reference_id: string | null;
    idempotency_key: string;
    memo: string | null;
    created_by: string;
    created_at: string;
}

export interface PostEntryInput {
    walletId: string;
    direction: 'credit' | 'debit';
    amountMinor: number;
    entryType: EntryType;
    referenceType?: string | null;
    referenceId?: string | null;
    idempotencyKey: string;
    memo?: string | null;
    createdBy: string;
    /** Optional audit context */
    audit?: {
        actorType: 'staff' | 'vendor_user' | 'customer' | 'system' | 'webhook';
        actorRole?: string | null;
        ip?: string | null;
        userAgent?: string | null;
        correlationId?: string | null;
    };
}

export class LedgerError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'LedgerError';
    }
}

export async function postEntry(input: PostEntryInput): Promise<LedgerEntry> {
    if (input.amountMinor <= 0) {
        throw new LedgerError('amount must be positive', 'invalid_amount');
    }
    if (!input.idempotencyKey) {
        throw new LedgerError('idempotencyKey is required', 'missing_idempotency_key');
    }

    const { data, error } = await adminClient.rpc('fn_post_ledger_entry', {
        p_wallet_id: input.walletId,
        p_direction: input.direction,
        p_amount_minor: input.amountMinor,
        p_entry_type: input.entryType,
        p_reference_type: input.referenceType ?? null,
        p_reference_id: input.referenceId ?? null,
        p_idempotency_key: input.idempotencyKey,
        p_memo: input.memo ?? null,
        p_created_by: input.createdBy,
    });

    if (error) {
        if (/insufficient available balance/i.test(error.message)) {
            throw new LedgerError(error.message, 'insufficient_balance');
        }
        if (/wallet not active/i.test(error.message)) {
            throw new LedgerError(error.message, 'wallet_inactive');
        }
        if (/wallet not found/i.test(error.message)) {
            throw new LedgerError(error.message, 'wallet_not_found');
        }
        throw new LedgerError(error.message, 'ledger_error');
    }

    const entry = data as LedgerEntry;

    // best-effort audit, never block ledger on audit failure
    await logAction({
        actorUserId: input.createdBy,
        actorType: input.audit?.actorType ?? 'system',
        actorRole: input.audit?.actorRole ?? null,
        action: `ledger.${input.entryType}`,
        targetType: 'wallet',
        targetId: input.walletId,
        after: {
            entryId: entry.id,
            direction: entry.direction,
            amountMinor: entry.amount_minor,
            balanceAfterMinor: entry.balance_after_minor,
        },
        metadata: {
            referenceType: input.referenceType ?? null,
            referenceId: input.referenceId ?? null,
            idempotencyKey: input.idempotencyKey,
        },
        ip: input.audit?.ip ?? null,
        userAgent: input.audit?.userAgent ?? null,
        correlationId: input.audit?.correlationId ?? null,
    }).catch(() => undefined);

    return entry;
}

export interface HoldInput {
    walletId: string;
    amountMinor: number;
    referenceType?: string | null;
    referenceId?: string | null;
    idempotencyKey: string;
    ttlSeconds?: number; // default 900 (15 min)
    createdBy: string;
}

export interface Hold {
    id: string;
    wallet_id: string;
    amount_minor: number;
    status: 'active' | 'captured' | 'released' | 'expired';
    expires_at: string;
    captured_at: string | null;
    released_at: string | null;
    reference_type: string | null;
    reference_id: string | null;
    created_at: string;
}

export async function createHold(input: HoldInput): Promise<Hold> {
    if (input.amountMinor <= 0) throw new LedgerError('amount must be positive', 'invalid_amount');
    const ttl = input.ttlSeconds ?? 900;
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

    // pre-check: balance must cover this hold + existing
    const bal = await getBalance(input.walletId);
    if (bal.availableMinor < input.amountMinor) {
        throw new LedgerError('insufficient available balance for hold', 'insufficient_balance');
    }

    const { data, error } = await adminClient
        .from('wallet_holds')
        .insert({
            wallet_id: input.walletId,
            amount_minor: input.amountMinor,
            reference_type: input.referenceType ?? null,
            reference_id: input.referenceId ?? null,
            idempotency_key: input.idempotencyKey,
            expires_at: expiresAt,
            status: 'active',
            created_by: input.createdBy,
        })
        .select('*')
        .single();

    if (error) {
        if (error.code === '23505') {
            // duplicate idempotency key — fetch existing
            const { data: existing } = await adminClient
                .from('wallet_holds')
                .select('*')
                .eq('idempotency_key', input.idempotencyKey)
                .single();
            if (existing) return existing as Hold;
        }
        throw new LedgerError(error.message, 'hold_error');
    }
    return data as Hold;
}

export interface CaptureInput {
    holdId: string;
    entryType: EntryType;
    referenceType?: string | null;
    referenceId?: string | null;
    idempotencyKey: string;
    memo?: string | null;
    createdBy: string;
}

export async function captureHold(input: CaptureInput): Promise<LedgerEntry> {
    const { data, error } = await adminClient.rpc('fn_capture_hold', {
        p_hold_id: input.holdId,
        p_entry_type: input.entryType,
        p_reference_type: input.referenceType ?? null,
        p_reference_id: input.referenceId ?? null,
        p_idempotency_key: input.idempotencyKey,
        p_memo: input.memo ?? null,
        p_created_by: input.createdBy,
    });
    if (error) throw new LedgerError(error.message, 'capture_error');
    return data as LedgerEntry;
}

export async function releaseHold(holdId: string): Promise<Hold> {
    const { data, error } = await adminClient.rpc('fn_release_hold', { p_hold_id: holdId });
    if (error) throw new LedgerError(error.message, 'release_error');
    return data as Hold;
}

export interface Balance {
    walletId: string;
    ledgerBalanceMinor: number;
    activeHoldsMinor: number;
    availableMinor: number;
    currency: string;
    status: string;
}

export async function getBalance(walletId: string): Promise<Balance> {
    const { data, error } = await adminClient
        .from('v_wallet_balances')
        .select('*')
        .eq('wallet_id', walletId)
        .single();
    if (error) {
        if (/v_wallet_balances/i.test(error.message)) {
            return getBalanceFromLedger(walletId);
        }
        throw new LedgerError(error.message, 'balance_error');
    }
    return {
        walletId: data.wallet_id,
        ledgerBalanceMinor: Number(data.ledger_balance_minor),
        activeHoldsMinor: Number(data.active_holds_minor),
        availableMinor: Number(data.available_balance_minor),
        currency: data.currency,
        status: data.status,
    };
}

async function getBalanceFromLedger(walletId: string): Promise<Balance> {
    const { data: wallet, error: walletError } = await adminClient
        .from('wallets')
        .select('id, currency, status')
        .eq('id', walletId)
        .single();
    if (walletError || !wallet) {
        throw new LedgerError(walletError?.message ?? 'wallet not found', 'balance_error');
    }

    const { data: entries, error: entriesError } = await adminClient
        .from('wallet_ledger_entries')
        .select('direction, amount_minor')
        .eq('wallet_id', walletId);
    if (entriesError) throw new LedgerError(entriesError.message, 'balance_error');

    const ledgerBalanceMinor = (entries ?? []).reduce((sum, entry) => {
        const amount = Number(entry.amount_minor ?? 0);
        return entry.direction === 'credit' ? sum + amount : sum - amount;
    }, 0);

    const { data: holds, error: holdsError } = await adminClient
        .from('wallet_holds')
        .select('amount_minor')
        .eq('wallet_id', walletId)
        .eq('status', 'active');
    if (holdsError) throw new LedgerError(holdsError.message, 'balance_error');

    const activeHoldsMinor = (holds ?? []).reduce((sum, hold) => sum + Number(hold.amount_minor ?? 0), 0);

    return {
        walletId,
        ledgerBalanceMinor,
        activeHoldsMinor,
        availableMinor: ledgerBalanceMinor - activeHoldsMinor,
        currency: wallet.currency,
        status: wallet.status,
    };
}

export async function getEntries(
    walletId: string,
    opts: { limit?: number; cursorAt?: string } = {},
): Promise<LedgerEntry[]> {
    let q = adminClient
        .from('wallet_ledger_entries')
        .select('*')
        .eq('wallet_id', walletId)
        .order('created_at', { ascending: false })
        .limit(opts.limit ?? 50);

    if (opts.cursorAt) q = q.lt('created_at', opts.cursorAt);
    const { data, error } = await q;
    if (error) throw new LedgerError(error.message, 'entries_error');
    return data as LedgerEntry[];
}
