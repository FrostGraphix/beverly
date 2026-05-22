/**
 * Consumption aggregation service.
 *
 * refresh() calls the station-scoped Postgres aggregate refresh.
 * The DB function is idempotent.
 *
 * query() returns pre-aggregated rows from consumption_aggregates.
 *              Falls back to an empty array if the table doesn't exist yet
 *              (migration not yet applied).
 */
import { adminClient } from '../db/supabase.js';

export type PeriodType = 'day' | 'week' | 'month' | 'year';
export type ScopeType  = 'meter' | 'station' | 'cumulative';

export interface ConsumptionRow {
    scope:                ScopeType;
    scope_id:             string;
    period_type:          PeriodType;
    period_start:         string;   // ISO date string YYYY-MM-DD
    kwh_total:            number;
    transaction_count:    number;
    amount_minor_total:   number;
    last_refreshed_at:    string;
}

export interface ConsumptionQuery {
    scope:       ScopeType;
    scope_id?:   string;           // meter_id | station_id | 'ALL' | omit for all
    period_type: PeriodType;
    from?:       string;           // ISO date, inclusive
    to?:         string;           // ISO date, inclusive
    limit?:      number;           // default 120
}

interface MeterAggregateRow {
    station_id: string;
    meter_id: string;
    period_type: PeriodType;
    period_start: string;
    kwh_total: number;
    reading_count: number;
    last_refreshed_at: string;
}

function toConsumptionRow(scope: ScopeType, scopeId: string, row: Pick<MeterAggregateRow, 'period_type' | 'period_start' | 'kwh_total' | 'reading_count' | 'last_refreshed_at'>): ConsumptionRow {
    return {
        scope,
        scope_id: scopeId,
        period_type: row.period_type,
        period_start: row.period_start,
        kwh_total: Number(row.kwh_total ?? 0),
        transaction_count: Number(row.reading_count ?? 0),
        amount_minor_total: 0,
        last_refreshed_at: row.last_refreshed_at,
    };
}

function groupedRows(scope: ScopeType, rows: MeterAggregateRow[]): ConsumptionRow[] {
    const grouped = new Map<string, ConsumptionRow>();
    for (const row of rows) {
        const scopeId = scope === 'cumulative' ? 'ALL' : row.station_id;
        const key = `${scopeId}:${row.period_type}:${row.period_start}`;
        const current = grouped.get(key) ?? toConsumptionRow(scope, scopeId, row);
        if (grouped.has(key)) {
            current.kwh_total += Number(row.kwh_total ?? 0);
            current.transaction_count += Number(row.reading_count ?? 0);
            if (row.last_refreshed_at > current.last_refreshed_at) current.last_refreshed_at = row.last_refreshed_at;
        }
        grouped.set(key, current);
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

const DEFAULT_REFRESH_STATIONS = ['TUNGA', 'UMAISHA', 'OGUFA', 'KYAKALE', 'MUSHA'];

function normalizeRefreshStations(stationIds?: string[]): string[] {
    const ids = (stationIds?.length ? stationIds : DEFAULT_REFRESH_STATIONS)
        .map((value) => String(value || '').trim().toUpperCase())
        .filter((value) => /^[A-Z0-9_-]{2,64}$/.test(value));
    return [...new Set(ids)];
}

export async function refreshConsumptionAggregates(stationIds?: string[]): Promise<ConsumptionRefreshResult> {
    const t0 = Date.now();
    const stationList = normalizeRefreshStations(stationIds);
    if (!stationList.length) throw new Error('Consumption refresh requires at least one station');

    const stations: ConsumptionRefreshStationResult[] = [];
    for (const stationId of stationList) {
        const stationT0 = Date.now();
        const { data, error } = await adminClient.rpc(
            'refresh_meter_reading_aggregates_for_station' as never,
            { p_station_id: stationId } as never,
        );
        stations.push({
            stationId,
            ok: !error,
            durationMs: Date.now() - stationT0,
            result: data,
            error: error?.message,
        });
    }

    const result = {
        ok: stations.every((station) => station.ok),
        durationMs: Date.now() - t0,
        refreshedStations: stations.filter((station) => station.ok).length,
        failedStations: stations.filter((station) => !station.ok).length,
        stations,
    };
    return result;
}

// ── Query pre-aggregated data ─────────────────────────────────────────────────

export async function queryConsumption(opts: ConsumptionQuery): Promise<ConsumptionRow[]> {
    try {
        let meterQuery = adminClient
            .from('meter_consumption_aggregates')
            .select('station_id, meter_id, period_type, period_start, kwh_total, reading_count, last_refreshed_at')
            .eq('period_type', opts.period_type)
            .order('period_start', { ascending: false })
            .limit(opts.limit ?? 2000);

        if (opts.from) meterQuery = meterQuery.gte('period_start', opts.from);
        if (opts.to)   meterQuery = meterQuery.lte('period_start', opts.to);
        if (opts.scope === 'station' && opts.scope_id) meterQuery = meterQuery.eq('station_id', opts.scope_id);
        if (opts.scope === 'meter' && opts.scope_id)   meterQuery = meterQuery.eq('meter_id', opts.scope_id);

        const { data: meterRows, error: meterError } = await meterQuery;
        if (!meterError) {
            const rows = (meterRows ?? []) as MeterAggregateRow[];
            if (opts.scope === 'meter') {
                return rows.map((row) => toConsumptionRow('meter', row.meter_id, row));
            }
            return groupedRows(opts.scope, rows).slice(0, opts.limit ?? 120);
        }
        if (meterError.code !== '42P01') throw meterError;

        let q = adminClient
            .from('consumption_aggregates')
            .select('scope, scope_id, period_type, period_start, kwh_total, transaction_count, amount_minor_total, last_refreshed_at')
            .eq('scope', opts.scope)
            .eq('period_type', opts.period_type)
            .order('period_start', { ascending: false })
            .limit(opts.limit ?? 120);

        if (opts.scope_id) q = q.eq('scope_id', opts.scope_id);
        if (opts.from)     q = q.gte('period_start', opts.from);
        if (opts.to)       q = q.lte('period_start', opts.to);

        const { data, error } = await q;
        if (error) {
            // Table not yet created (migration pending) — return empty gracefully
            if (error.code === '42P01') return [];
            throw error;
        }
        return (data ?? []) as ConsumptionRow[];
    } catch {
        return [];
    }
}

// ── Station summary (latest period totals for every station) ──────────────────

export async function queryStationSummary(period_type: PeriodType): Promise<ConsumptionRow[]> {
    return queryConsumption({ scope: 'station', period_type, limit: 500 });
}

// ── Meter breakdown for a station ────────────────────────────────────────────

export async function queryMeterBreakdown(
    station_id: string,
    period_type: PeriodType,
    from?: string,
    to?: string,
): Promise<ConsumptionRow[]> {
    try {
        let q = adminClient
            .from('meter_consumption_aggregates')
            .select('station_id, meter_id, period_type, period_start, kwh_total, reading_count, last_refreshed_at')
            .eq('station_id', station_id)
            .eq('period_type', period_type)
            .order('period_start', { ascending: false })
            .limit(2000);

        if (from) q = q.gte('period_start', from);
        if (to)   q = q.lte('period_start', to);

        const { data, error } = await q;
        if (error) return [];
        return ((data ?? []) as MeterAggregateRow[]).map((row) => toConsumptionRow('meter', row.meter_id, row));
    } catch {
        return [];
    }
}
