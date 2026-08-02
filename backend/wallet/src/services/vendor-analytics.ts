import { adminClient } from '../db/supabase.js';
import { PAYMENT_SUCCEEDED_STATUSES } from './payment-status.js';

export type VendorAnalyticsPeriod = '7d' | '30d' | '90d' | 'all';

interface VendorRow {
    id: string;
    legal_name: string;
    trading_name: string | null;
    status: string;
    risk_level?: string | null;
}

interface OrderRow {
    actor_id: string;
    station_id: string | null;
    amount_minor: number;
    created_at: string;
}

interface FundingRow {
    actor_id: string;
    amount_minor: number;
}

interface WalletRow {
    id: string;
    owner_id: string;
}

interface BalanceRow {
    wallet_id: string;
    ledger_balance_minor: number;
}

async function fetchAllRows<T>(build: () => any): Promise<T[]> {
    const rows: T[] = [];
    const pageSize = 1_000;
    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await build().range(offset, offset + pageSize - 1);
        if (error) throw error;
        const page = (data ?? []) as T[];
        rows.push(...page);
        if (page.length < pageSize) return rows;
    }
}

function emptyAnalytics(period: VendorAnalyticsPeriod) {
    return {
        period,
        generated_at: new Date().toISOString(),
        summary: {
            total: 0, active: 0, frozen: 0, suspended: 0, pending: 0,
            total_vended_minor: 0, total_funded_minor: 0,
            avg_wallet_minor: 0, total_transactions: 0,
        },
        leaderboard: [],
        risk_breakdown: [],
        top_stations: [],
    };
}

export function buildVendorAnalytics(input: {
    period: VendorAnalyticsPeriod;
    vendors: VendorRow[];
    orders: OrderRow[];
    funding: FundingRow[];
    wallets: WalletRow[];
    balances: BalanceRow[];
}) {
    const metrics = new Map(input.vendors.map((vendor) => [vendor.id, {
        vend_volume_minor: 0,
        vend_count: 0,
        funding_minor: 0,
        last_active_at: null as string | null,
    }]));

    for (const order of input.orders) {
        const row = metrics.get(order.actor_id);
        if (!row) continue;
        row.vend_volume_minor += Number(order.amount_minor ?? 0);
        row.vend_count += 1;
        if (!row.last_active_at || order.created_at > row.last_active_at) row.last_active_at = order.created_at;
    }
    for (const payment of input.funding) {
        const row = metrics.get(payment.actor_id);
        if (row) row.funding_minor += Number(payment.amount_minor ?? 0);
    }

    const walletOwner = new Map(input.wallets.map((wallet) => [wallet.id, wallet.owner_id]));
    const balances = new Map<string, number>();
    for (const balance of input.balances) {
        const ownerId = walletOwner.get(balance.wallet_id);
        if (ownerId) balances.set(ownerId, Number(balance.ledger_balance_minor ?? 0));
    }

    const leaderboard = input.vendors.map((vendor) => {
        const row = metrics.get(vendor.id)!;
        return {
            ...vendor,
            risk_level: vendor.risk_level ?? 'unrated',
            ...row,
            avg_tx_minor: row.vend_count ? Math.round(row.vend_volume_minor / row.vend_count) : 0,
        };
    }).sort((a, b) => b.vend_volume_minor - a.vend_volume_minor)
        .map((vendor, index) => ({ rank: index + 1, ...vendor }));

    const activeVendors = input.vendors.filter((vendor) => vendor.status === 'approved');
    const activeBalance = activeVendors.reduce((sum, vendor) => sum + (balances.get(vendor.id) ?? 0), 0);
    const riskCounts = new Map<string, number>();
    for (const vendor of input.vendors) {
        const level = vendor.risk_level ?? 'unrated';
        riskCounts.set(level, (riskCounts.get(level) ?? 0) + 1);
    }

    const stations = new Map<string, { vendorIds: Set<string>; vend_volume_minor: number }>();
    for (const order of input.orders) {
        const stationId = String(order.station_id ?? '').trim().toUpperCase();
        if (!stationId) continue;
        const row = stations.get(stationId) ?? { vendorIds: new Set<string>(), vend_volume_minor: 0 };
        row.vendorIds.add(order.actor_id);
        row.vend_volume_minor += Number(order.amount_minor ?? 0);
        stations.set(stationId, row);
    }

    return {
        period: input.period,
        generated_at: new Date().toISOString(),
        summary: {
            total: input.vendors.length,
            active: activeVendors.length,
            frozen: input.vendors.filter((vendor) => vendor.status === 'frozen').length,
            suspended: input.vendors.filter((vendor) => vendor.status === 'suspended').length,
            pending: input.vendors.filter((vendor) => vendor.status.startsWith('pending')).length,
            total_vended_minor: input.orders.reduce((sum, order) => sum + Number(order.amount_minor ?? 0), 0),
            total_funded_minor: input.funding.reduce((sum, payment) => sum + Number(payment.amount_minor ?? 0), 0),
            avg_wallet_minor: activeVendors.length ? Math.round(activeBalance / activeVendors.length) : 0,
            total_transactions: input.orders.length,
        },
        leaderboard,
        risk_breakdown: [...riskCounts.entries()].map(([level, count]) => ({ level, count })),
        top_stations: [...stations.entries()]
            .map(([station_id, row]) => ({
                station_id,
                station_name: station_id,
                vendor_count: row.vendorIds.size,
                vend_volume_minor: row.vend_volume_minor,
            }))
            .sort((a, b) => b.vend_volume_minor - a.vend_volume_minor),
    };
}

export async function getVendorAnalytics(
    period: VendorAnalyticsPeriod,
    stationIds: string[] | null,
) {
    if (stationIds?.length === 0) return emptyAnalytics(period);

    const vendors = await fetchAllRows<VendorRow>(() => {
        let query = adminClient
            .from('vendor_organizations')
            .select('id, legal_name, trading_name, status')
            .neq('status', 'closed')
            .order('id');
        if (stationIds) query = query.overlaps('operating_stations', stationIds);
        return query;
    });
    if (!vendors.length) return emptyAnalytics(period);

    const vendorIds = vendors.map((vendor) => vendor.id);
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : null;
    const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : null;

    const [orders, funding, wallets] = await Promise.all([
        fetchAllRows<OrderRow>(() => {
            let query = adminClient.from('purchase_orders')
                .select('actor_id, station_id, amount_minor, created_at')
                .eq('actor_type', 'vendor')
                .eq('status', 'delivered')
                .in('actor_id', vendorIds)
                .order('created_at', { ascending: false });
            if (since) query = query.gte('created_at', since);
            return query;
        }),
        fetchAllRows<FundingRow>(() => {
            let query = adminClient.from('payment_transactions')
                .select('actor_id, amount_minor, created_at')
                .eq('actor_type', 'vendor')
                .eq('purpose', 'wallet_funding')
                .in('status', Array.from(PAYMENT_SUCCEEDED_STATUSES))
                .in('actor_id', vendorIds)
                .order('created_at', { ascending: false });
            if (since) query = query.gte('created_at', since);
            return query;
        }),
        fetchAllRows<WalletRow>(() => adminClient.from('wallets')
            .select('id, owner_id')
            .eq('owner_type', 'vendor')
            .in('owner_id', vendorIds)
            .order('id')),
    ]);

    const walletIds = wallets.map((wallet) => wallet.id);
    const balances = walletIds.length
        ? await fetchAllRows<BalanceRow>(() => adminClient.from('v_wallet_balances')
            .select('wallet_id, ledger_balance_minor')
            .in('wallet_id', walletIds)
            .order('wallet_id'))
        : [];

    return buildVendorAnalytics({ period, vendors, orders, funding, wallets, balances });
}
