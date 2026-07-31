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
import { fetchAllRows } from './paged-query.js';

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
    /** Naira minor units actually spent through the Beverly wallet. */
    amount_minor_total:   number;
    /**
     * Naira minor units of energy *consumed*, valued at the tariff in force on
     * each reading date. This is not the same number as amount_minor_total:
     * wallet spend counts what customers paid Beverly, energy value counts what
     * the meters actually recorded. A site can have millions of naira of
     * consumption and zero wallet spend when its customers vend elsewhere —
     * which is exactly the estate's current state, and why every consumption
     * page read "₦0.00" while the meters had logged ₦43m of energy.
     *
     * Computed by refresh_meter_reading_aggregates_for_station and stored on
     * the aggregate; we surface it rather than recomputing it.
     */
    energy_value_minor:   number;
    /** kWh that resolved to a tariff, and kWh that did not. */
    priced_kwh:           number;
    unpriced_kwh:         number;
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
    /** Naira (major units) as stored by the aggregate refresh. */
    tariff_value_ngn: number | null;
    priced_kwh: number | null;
    unpriced_kwh: number | null;
    last_refreshed_at: string;
}

/** The aggregate stores naira; every wallet API speaks minor units. */
function nairaToMinor(value: unknown): number {
    return Math.round(Number(value ?? 0) * 100);
}

/**
 * Station ids are the join key between three independently-written tables
 * (daily_meter_readings, meter_consumption_aggregates, purchase_orders) and the
 * OEM feed that seeds them. Any of those can hand us `tunga`, ` TUNGA `, or
 * `Tunga`. Canonicalise on every read so one physical station can never split
 * into two rows on a report, and so spend never fails to join onto kWh.
 */
export function canonicalStationId(value: unknown): string {
    return String(value ?? '').trim().toUpperCase();
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
        energy_value_minor: nairaToMinor(row.tariff_value_ngn),
        priced_kwh: Number(row.priced_kwh ?? 0),
        unpriced_kwh: Number(row.unpriced_kwh ?? 0),
        station_id: canonicalStationId(row.station_id),
        meter_id: row.meter_id,
        customer_id: row.customer_id ?? null,
        customer_name: row.customer_name ?? null,
        last_refreshed_at: row.last_refreshed_at,
    };
}

function groupedRows(scope: ScopeType, rows: MeterAggregateRow[]): ConsumptionRow[] {
    const grouped = new Map<string, ConsumptionRow>();
    for (const row of rows) {
        const scopeId = scope === 'cumulative' ? 'ALL' : canonicalStationId(row.station_id);
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
        existing.energy_value_minor += nairaToMinor(row.tariff_value_ngn);
        existing.priced_kwh += Number(row.priced_kwh ?? 0);
        existing.unpriced_kwh += Number(row.unpriced_kwh ?? 0);
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

/**
 * Last-resort seed list, used only when the station registry itself is
 * unreachable. It is NOT the set of stations Beverly operates — that set is
 * whatever `list_consumption_station_ids()` reports. Hardcoding the estate here
 * was the bug: onboarding a sixth station left its aggregates permanently
 * stale, because no caller ever named it and the default never grew.
 */
const DEFAULT_REFRESH_STATIONS = ['KYAKALE', 'MUSHA', 'UMAISHA', 'TUNGA', 'OGUFA'];

function normalizeRefreshStations(stationIds: string[]): string[] {
    return [...new Set(stationIds.map(canonicalStationId).filter(Boolean))];
}

/**
 * Every station id known to the consumption pipeline: any station with meter
 * readings, with existing aggregates, or assigned to a vendor organisation.
 * Discovered from the database so a newly onboarded station is covered the
 * moment its first reading lands, with no code change.
 */
export async function listConsumptionStationIds(): Promise<string[]> {
    const { data, error } = await adminClient.rpc('list_consumption_station_ids');
    if (error) throw new Error(`Could not list consumption stations: ${error.message}`);
    const ids: string[] = ((data ?? []) as unknown[]).map((row) => canonicalStationId(
        typeof row === 'string' ? row : (row as { station_id?: unknown } | null)?.station_id,
    ));
    return [...new Set(ids.filter(Boolean))].sort();
}

/** Discovered estate, falling back to the seed list only if discovery fails. */
async function resolveRefreshStations(stationIds?: string[]): Promise<string[]> {
    const explicit = normalizeRefreshStations(stationIds ?? []);
    if (explicit.length) return explicit;
    try {
        const discovered = await listConsumptionStationIds();
        if (discovered.length) return discovered;
    } catch {
        // Registry unreachable — fall through to the seed list rather than
        // refreshing nothing at all.
    }
    return normalizeRefreshStations(DEFAULT_REFRESH_STATIONS);
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
 * PostgREST puts `.in()` lists in the query string, so an unbounded list of
 * meter ids becomes a request URL long enough for the gateway to reject —
 * which surfaced as "spend unavailable" on exactly the busiest stations.
 * Fetch in chunks instead.
 */
const IN_FILTER_CHUNK = 200;

function chunk<T>(values: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
        out.push(values.slice(index, index + size));
    }
    return out;
}

/**
 * kWh lives in meter_consumption_aggregates; naira lives in purchase_orders.
 * The previous implementation hardcoded amount_minor_total to 0, so every
 * consumption view reported ₦0.00 spend as though it were a real figure.
 * Fetch the real totals and fold them onto the matching buckets.
 *
 * Station and cumulative rows are filtered by *station*, not by the meter ids
 * that happen to carry aggregates: a station's revenue includes orders for
 * meters that have no reading history yet, and station-scoped rows must total
 * every naira taken at that site.
 */
async function attachSpend(
    rows: ConsumptionRow[],
    scope: ScopeType,
    ids: { meterIds: string[]; stationIds: string[] },
    periodType: PeriodType,
    from?: string,
    to?: string,
): Promise<void> {
    const filterColumn = scope === 'meter' ? 'meter_id' : 'station_id';
    const filterValues = scope === 'meter' ? ids.meterIds : ids.stationIds;
    if (!rows.length || !filterValues.length) return;

    const batches = await Promise.all(chunk(filterValues, IN_FILTER_CHUNK).map((values) =>
        fetchAllRows<any>(() => {
            let query = adminClient
                .from('purchase_orders')
                .select('id, meter_id, station_id, amount_minor, created_at')
                .in(filterColumn, values)
                .eq('status', 'delivered')
                .order('id');
            if (from) query = query.gte('created_at', `${from}T00:00:00Z`);
            if (to)   query = query.lte('created_at', `${to}T23:59:59Z`);
            return query;
        }),
    ));

    const byBucket = new Map<string, number>();
    for (const order of batches.flat()) {
        const bucket = periodKey(periodType, String(order.created_at).slice(0, 10));
        for (const key of [
            `meter:${order.meter_id}:${bucket}`,
            `station:${canonicalStationId(order.station_id)}:${bucket}`,
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

/**
 * Trim grouped rows without cutting a period in half.
 *
 * Rows arrive newest-first, ordered by period then station. A blind
 * `.slice(0, limit)` could land mid-period and drop the last few stations of
 * the oldest kept bucket — that period would then read as though those
 * stations consumed nothing. Cut on a period boundary instead, so every
 * displayed period holds every station the caller is entitled to see.
 */
function limitWholePeriods(rows: ConsumptionRow[], limit: number): ConsumptionRow[] {
    if (rows.length <= limit) return rows;
    const cutoff = rows[limit - 1].period_start;
    const whole = rows.filter((row) => row.period_start > cutoff);
    // A single period wider than the limit still has to return something.
    return whole.length ? whole : rows.slice(0, limit);
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

    const aggregateRows = await fetchAllRows<MeterAggregateRow>(() => {
        let query = adminClient
            .from('meter_consumption_aggregates')
            .select('station_id, meter_id, customer_id, customer_name, period_type, period_start, kwh_total, reading_count, tariff_value_ngn, priced_kwh, unpriced_kwh, last_refreshed_at')
            .eq('period_type', opts.period_type)
            .order('period_start', { ascending: false })
            .order('station_id')
            .order('meter_id');

        if (authority.kind === 'stations') query = query.in('station_id', authority.stationIds);
        if (authority.kind === 'meters')   query = query.in('meter_id', authority.meterIds);
        if (opts.from) query = query.gte('period_start', opts.from);
        if (opts.to)   query = query.lte('period_start', opts.to);
        if (opts.scope === 'station' && opts.scope_id) {
            query = query.eq('station_id', canonicalStationId(opts.scope_id));
        }
        if (opts.scope === 'meter' && opts.scope_id) {
            query = query.eq('meter_id', String(opts.scope_id).trim());
        }
        return query;
    });
    const rows = opts.scope === 'meter'
        ? aggregateRows.map((row) => toConsumptionRow('meter', row.meter_id, row)).slice(0, opts.limit ?? 2000)
        : limitWholePeriods(groupedRows(opts.scope, aggregateRows), opts.limit ?? 120);

    if (opts.withSpend) {
        await attachSpend(
            rows,
            opts.scope,
            {
                meterIds: [...new Set(aggregateRows.map((row) => String(row.meter_id ?? '').trim()).filter(Boolean))],
                // An explicitly-scoped caller gets their whole assignment, so a
                // station that took payments but has no readings yet still
                // contributes its revenue. Otherwise fall back to the stations
                // actually present in the result.
                stationIds: authority.kind === 'stations'
                    ? authority.stationIds
                    : [...new Set(aggregateRows.map((row) => canonicalStationId(row.station_id)).filter(Boolean))],
            },
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

/**
 * Meter rows are one per meter *per period*. The estate's largest site has 726
 * meters, so a monthly view is ~9.4k rows and the old 2000 cap silently hid
 * three quarters of the meters — the page looked complete and was not. The cap
 * is now high enough for a real site; callers surface `truncated` when it still
 * bites (e.g. a daily view over a long window) so the shortfall is stated
 * rather than hidden.
 */
export const METER_BREAKDOWN_MAX_ROWS = 20000;

export async function queryMeterBreakdown(
    station_id: string,
    period_type: PeriodType,
    authority: ConsumptionAuthority,
    from?: string,
    to?: string,
    withSpend = false,
    limit: number = METER_BREAKDOWN_MAX_ROWS,
): Promise<ConsumptionRow[]> {
    return queryConsumption(
        { scope: 'meter', period_type, from, to, limit, scope_id: undefined, withSpend },
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
