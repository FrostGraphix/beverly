/**
 * Consumption aggregation service.
 *
 * refresh() calls the station-scoped Postgres aggregate refresh.
 * The DB function is idempotent and reconciling (it prunes orphaned rows).
 *
 * queryConsumption() reads pre-aggregated rows from meter_consumption_aggregates.
 *
 * SCOPING CONTRACT
 * ----------------
 * These tables are read with the service role, which bypasses RLS. Row-level
 * policies exist as defence-in-depth but do NOT gate this path — authority is
 * enforced here, in application code.
 *
 * Every query therefore takes a required `ConsumptionAuthority`. It is not an
 * optional filter: there is no way to call this service without stating whose
 * data you are entitled to read. `{ kind: 'all' }` has to be constructed
 * deliberately, so an omitted or undefined scope can never silently widen into
 * "every meter in every station" — which is what the previous
 * `scope_id?: string` signature did whenever the caller left it undefined.
 */
import { adminClient } from '../db/supabase.js';
import { listStations } from './token-engine.js';

export type PeriodType = 'day' | 'week' | 'month' | 'year';
export type ScopeType  = 'meter' | 'station' | 'cumulative';

/**
 * Who the caller is allowed to see. Construct via the helpers below rather
 * than inline, so every widening of authority is greppable.
 */
export type ConsumptionAuthority =
    | { kind: 'all' }
    | { kind: 'stations'; stationIds: string[] }
    | { kind: 'meters'; meterIds: string[] };

/** Super-admin: every station. The only unscoped authority. */
export const allStations = (): ConsumptionAuthority => ({ kind: 'all' });

/** Staff or vendor: confined to an explicit station list. */
export const stationsAuthority = (stationIds: string[]): ConsumptionAuthority => ({
    kind: 'stations',
    stationIds: normalizeIds(stationIds, true),
});

/** Customer: confined to an explicit meter list. */
export const metersAuthority = (meterIds: string[]): ConsumptionAuthority => ({
    kind: 'meters',
    meterIds: normalizeIds(meterIds, false),
});

function normalizeIds(values: string[], upper: boolean): string[] {
    return [...new Set((values ?? [])
        .map((value) => {
            const trimmed = String(value ?? '').trim();
            return upper ? trimmed.toUpperCase() : trimmed;
        })
        .filter(Boolean))];
}

/**
 * An authority that resolves to nothing must yield nothing. A staff member with
 * no station assignment, or a customer with no meters, sees an empty series —
 * never the full estate.
 */
function isEmptyAuthority(authority: ConsumptionAuthority): boolean {
    if (authority.kind === 'all') return false;
    if (authority.kind === 'stations') return authority.stationIds.length === 0;
    return authority.meterIds.length === 0;
}

export interface ConsumptionRow {
    scope:                ScopeType;
    scope_id:             string;
    period_type:          PeriodType;
    period_start:         string;   // ISO date string YYYY-MM-DD
    kwh_total:            number;
    reading_count:        number;
    /** @deprecated Counts daily readings, not transactions. Use reading_count. */
    transaction_count:    number;
    /** Naira minor units actually spent on this scope/period. */
    amount_minor_total:   number;
    station_id?:          string;
    meter_id?:            string;
    customer_id?:         string | null;
    customer_name?:       string | null;
    last_refreshed_at:    string;
}

export interface ConsumptionQuery {
    scope:       ScopeType;
    /** Narrows *within* the caller's authority. Never widens it. */
    scope_id?:   string;
    period_type: PeriodType;
    from?:       string;           // ISO date, inclusive
    to?:         string;           // ISO date, inclusive
    limit?:      number;
    /** Include naira spend per bucket (extra query). Default false. */
    withSpend?:  boolean;
}

interface MeterAggregateRow {
    station_id: string;
    meter_id: string;
    customer_id: string | null;
    customer_name: string | null;
    period_type: PeriodType;
    period_start: string;
    kwh_total: number;
    reading_count: number;
    last_refreshed_at: string;
}

function toConsumptionRow(
    scope: ScopeType,
    scopeId: string,
    row: MeterAggregateRow,
): ConsumptionRow {
    const readingCount = Number(row.reading_count ?? 0);
    return {
        scope,
        scope_id: scopeId,
        period_type: row.period_type,
        period_start: row.period_start,
        kwh_total: Number(row.kwh_total ?? 0),
        reading_count: readingCount,
        transaction_count: readingCount,
        amount_minor_total: 0,
        station_id: row.station_id,
        meter_id: row.meter_id,
        customer_id: row.customer_id ?? null,
        customer_name: row.customer_name ?? null,
        last_refreshed_at: row.last_refreshed_at,
    };
}

function groupedRows(scope: ScopeType, rows: MeterAggregateRow[]): ConsumptionRow[] {
    const grouped = new Map<string, ConsumptionRow>();
    for (const row of rows) {
        const scopeId = scope === 'cumulative' ? 'ALL' : row.station_id;
        const key = `${scopeId}:${row.period_type}:${row.period_start}`;
        const existing = grouped.get(key);
        if (!existing) {
            const seed = toConsumptionRow(scope, scopeId, row);
            // Grouped rows span many meters — per-meter identity is meaningless here.
            delete seed.meter_id;
            delete seed.customer_id;
            delete seed.customer_name;
            if (scope === 'cumulative') delete seed.station_id;
            grouped.set(key, seed);
            continue;
        }
        existing.kwh_total += Number(row.kwh_total ?? 0);
        existing.reading_count += Number(row.reading_count ?? 0);
        existing.transaction_count = existing.reading_count;
        if (row.last_refreshed_at > existing.last_refreshed_at) {
            existing.last_refreshed_at = row.last_refreshed_at;
        }
    }
    return [...grouped.values()].sort((a, b) => b.period_start.localeCompare(a.period_start));
}

// ── Trigger DB-level refresh ──────────────────────────────────────────────────

export interface ConsumptionRefreshStationResult {
    stationId: string;
    ok: boolean;
    durationMs: number;
    result?: unknown;
    error?: string;
}

export interface ConsumptionRefreshResult {
    ok: boolean;
    durationMs: number;
    refreshedStations: number;
    failedStations: number;
    stations: ConsumptionRefreshStationResult[];
}

export const DEFAULT_REFRESH_STATIONS = ['TUNGA', 'UMAISHA', 'OGUFA', 'KYAKALE', 'MUSHA'];

async function resolveRefreshStations(stationIds?: string[]): Promise<string[]> {
    const source = stationIds?.length ? stationIds : (await listStations()).map((station) => station.stationId);
    const ids = (source.length ? source : DEFAULT_REFRESH_STATIONS)
        .map((value) => String(value ?? '').trim().toUpperCase())
        .filter(Boolean);
    return [...new Set(ids)];
}

export async function refreshConsumptionAggregates(stationIds?: string[]): Promise<ConsumptionRefreshResult> {
    const t0 = Date.now();
    const stationList = await resolveRefreshStations(stationIds);
    if (!stationList.length) throw new Error('Consumption refresh requires at least one station');

    const stations: ConsumptionRefreshStationResult[] = [];
    for (const stationId of stationList) {
        const stationT0 = Date.now();
        const { data, error } = await adminClient.rpc(
            'refresh_meter_reading_aggregates_for_station',
            { p_station_id: stationId },
        );
        stations.push({
            stationId,
            ok: !error,
            durationMs: Date.now() - stationT0,
            result: data ?? undefined,
            error: error?.message,
        });
    }

    const failedStations = stations.filter((station) => !station.ok).length;
    return {
        ok: failedStations === 0,
        durationMs: Date.now() - t0,
        refreshedStations: stations.length - failedStations,
        failedStations,
        stations,
    };
}

// ── Spend enrichment ─────────────────────────────────────────────────────────

function periodKey(periodType: PeriodType, isoDate: string): string {
    const date = new Date(`${isoDate}T00:00:00Z`);
    if (periodType === 'day') return isoDate;
    if (periodType === 'year') return `${date.getUTCFullYear()}-01-01`;
    if (periodType === 'month') {
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
    }
    // week: snap back to Monday, matching Postgres date_trunc('week', …)
    const day = date.getUTCDay();
    const delta = day === 0 ? 6 : day - 1;
    date.setUTCDate(date.getUTCDate() - delta);
    return date.toISOString().slice(0, 10);
}

/**
 * kWh lives in meter_consumption_aggregates; naira lives in purchase_orders.
 * The previous implementation hardcoded amount_minor_total to 0, so every
 * consumption view reported ₦0.00 spend as though it were a real figure.
 * Fetch the real totals and fold them onto the matching buckets.
 */
async function attachSpend(
    rows: ConsumptionRow[],
    meterIds: string[],
    periodType: PeriodType,
    from?: string,
    to?: string,
): Promise<void> {
    if (!rows.length || !meterIds.length) return;

    let query = adminClient
        .from('purchase_orders')
        .select('meter_id, station_id, amount_minor, created_at')
        .in('meter_id', meterIds)
        .eq('status', 'delivered');
    if (from) query = query.gte('created_at', `${from}T00:00:00Z`);
    if (to)   query = query.lte('created_at', `${to}T23:59:59Z`);

    const { data, error } = await query;
    if (error) throw error;

    const byBucket = new Map<string, number>();
    for (const order of (data ?? []) as any[]) {
        const bucket = periodKey(periodType, String(order.created_at).slice(0, 10));
        for (const key of [
            `meter:${order.meter_id}:${bucket}`,
            `station:${String(order.station_id ?? '').toUpperCase()}:${bucket}`,
            `cumulative:ALL:${bucket}`,
        ]) {
            byBucket.set(key, (byBucket.get(key) ?? 0) + Number(order.amount_minor ?? 0));
        }
    }

    for (const row of rows) {
        const id = row.scope === 'meter' ? row.meter_id : row.scope_id;
        row.amount_minor_total = byBucket.get(`${row.scope}:${id}:${row.period_start}`) ?? 0;
    }
}

// ── Query pre-aggregated data ─────────────────────────────────────────────────

/**
 * @param authority REQUIRED. The caller's data entitlement. See ConsumptionAuthority.
 */
export async function queryConsumption(
    opts: ConsumptionQuery,
    authority: ConsumptionAuthority,
): Promise<ConsumptionRow[]> {
    if (isEmptyAuthority(authority)) return [];

    let query = adminClient
        .from('meter_consumption_aggregates')
        .select('station_id, meter_id, customer_id, customer_name, period_type, period_start, kwh_total, reading_count, last_refreshed_at')
        .eq('period_type', opts.period_type)
        .order('period_start', { ascending: false })
        .limit(Math.max(1, Math.min(Number(opts.limit ?? 2000), 5000)));

    // Authority first — a single .in() replaces the previous per-station fan-out.
    if (authority.kind === 'stations') query = query.in('station_id', authority.stationIds);
    if (authority.kind === 'meters')   query = query.in('meter_id', authority.meterIds);

    if (opts.from) query = query.gte('period_start', opts.from);
    if (opts.to)   query = query.lte('period_start', opts.to);

    // scope_id narrows within authority. Requests outside it match nothing,
    // because the authority predicate above is ANDed with this one.
    if (opts.scope === 'station' && opts.scope_id) {
        query = query.eq('station_id', String(opts.scope_id).toUpperCase());
    }
    if (opts.scope === 'meter' && opts.scope_id) {
        query = query.eq('meter_id', opts.scope_id);
    }

    const { data, error } = await query;
    if (error) {
        // Aggregates not migrated yet — an empty series is the honest answer.
        if (error.code === '42P01') return [];
        throw error;
    }

    const aggregateRows = (data ?? []) as MeterAggregateRow[];
    const rows = opts.scope === 'meter'
        ? aggregateRows.map((row) => toConsumptionRow('meter', row.meter_id, row))
        : groupedRows(opts.scope, aggregateRows).slice(0, opts.limit ?? 120);

    if (opts.withSpend) {
        await attachSpend(
            rows,
            [...new Set(aggregateRows.map((row) => row.meter_id))],
            opts.period_type,
            opts.from,
            opts.to,
        );
    }
    return rows;
}

// ── Station summary (latest period totals for every station in authority) ─────

export async function queryStationSummary(
    period_type: PeriodType,
    authority: ConsumptionAuthority,
): Promise<ConsumptionRow[]> {
    return queryConsumption({ scope: 'station', period_type, limit: 500 }, authority);
}

// ── Meter breakdown for a station ────────────────────────────────────────────

export async function queryMeterBreakdown(
    station_id: string,
    period_type: PeriodType,
    authority: ConsumptionAuthority,
    from?: string,
    to?: string,
): Promise<ConsumptionRow[]> {
    return queryConsumption(
        { scope: 'meter', period_type, from, to, limit: 2000, scope_id: undefined },
        // Intersect the requested station with the caller's authority so a
        // station they cannot see yields nothing rather than everything.
        intersectStation(authority, station_id),
    );
}

function intersectStation(authority: ConsumptionAuthority, stationId: string): ConsumptionAuthority {
    const wanted = String(stationId ?? '').trim().toUpperCase();
    if (!wanted) return { kind: 'stations', stationIds: [] };
    if (authority.kind === 'all') return { kind: 'stations', stationIds: [wanted] };
    if (authority.kind === 'stations') {
        return { kind: 'stations', stationIds: authority.stationIds.includes(wanted) ? [wanted] : [] };
    }
    // A meter-scoped caller (customer) stays meter-scoped; the station filter
    // is applied by the caller's own authority, not widened by this argument.
    return authority;
}
