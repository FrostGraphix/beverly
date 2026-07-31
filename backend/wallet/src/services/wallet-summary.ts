/**
 * Wallet KPI summary — pure aggregation helpers.
 *
 * Extracted from the admin route so the station-scoping rule and the money
 * arithmetic can be unit-tested without a database. The route owns fetching;
 * everything below is a pure function of rows already in memory.
 */

export interface WalletRow {
    id: string;
    owner_type: string;
    /**
     * Required for station scoping. The route MUST select this column — a
     * summary query that omits it filters every wallet out and silently
     * reports a zero float.
     */
    owner_id: string;
    status: string;
}

export interface WalletBalanceRow {
    wallet_id: string;
    ledger_balance_minor: number | string | null;
    active_holds_minor: number | string | null;
}

export interface StationOwners {
    vendors: Set<string>;
    customers: Set<string>;
}

export interface WalletSummary {
    walletCount: number;
    totalFloatMinor: number;
    totalBalanceMinor: number;
    totalHoldsMinor: number;
    vendorFloatMinor: number;
    customerFloatMinor: number;
    activeWallets: number;
    suspendedWallets: number;
    closedWallets: number;
    byStatus: Record<string, number>;
    byOwnerType: Record<string, number>;
}

/**
 * Restrict wallets to those owned by parties operating at the caller's
 * stations. `stationOwners === null` means estate-wide access (super-admin).
 */
export function scopeWalletsToStations(wallets: WalletRow[], stationOwners: StationOwners | null): WalletRow[] {
    if (!stationOwners) return wallets;
    return wallets.filter((wallet) => (wallet.owner_type === 'vendor'
        ? stationOwners.vendors.has(wallet.owner_id)
        : stationOwners.customers.has(wallet.owner_id)));
}

export function summarizeWallets(wallets: WalletRow[], balances: Map<string, WalletBalanceRow>): WalletSummary {
    let totalFloat = 0;
    let totalHolds = 0;
    let vendorFloat = 0;
    let customerFloat = 0;
    const byStatus: Record<string, number> = {};
    const byOwnerType: Record<string, number> = {};

    for (const wallet of wallets) {
        const balance = balances.get(wallet.id);
        const ledger = Number(balance?.ledger_balance_minor ?? 0);
        totalFloat += ledger;
        totalHolds += Number(balance?.active_holds_minor ?? 0);
        if (wallet.owner_type === 'vendor') vendorFloat += ledger;
        if (wallet.owner_type === 'customer') customerFloat += ledger;
        byStatus[wallet.status] = (byStatus[wallet.status] ?? 0) + 1;
        byOwnerType[wallet.owner_type] = (byOwnerType[wallet.owner_type] ?? 0) + 1;
    }

    return {
        walletCount: wallets.length,
        totalFloatMinor: totalFloat,
        totalBalanceMinor: totalFloat,
        totalHoldsMinor: totalHolds,
        vendorFloatMinor: vendorFloat,
        customerFloatMinor: customerFloat,
        activeWallets: byStatus.active ?? 0,
        suspendedWallets: byStatus.frozen ?? 0,
        closedWallets: byStatus.closed ?? 0,
        byStatus,
        byOwnerType,
    };
}

/**
 * Africa/Lagos is UTC+01:00 year-round with no DST, so the business day can be
 * pinned with a fixed offset. Using the process/browser local midnight instead
 * makes "today's revenue" depend on where the viewer happens to be.
 */
export const BUSINESS_TIMEZONE = 'Africa/Lagos';
const BUSINESS_UTC_OFFSET = '+01:00';

export function startOfBusinessDay(now: Date = new Date()): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: BUSINESS_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now);
    const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
    return new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00${BUSINESS_UTC_OFFSET}`);
}

export function sumMinor(rows: Array<{ amount_minor?: number | string | null }>): number {
    return rows.reduce((total, row) => total + Number(row.amount_minor ?? 0), 0);
}
