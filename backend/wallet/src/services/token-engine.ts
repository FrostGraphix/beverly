/**
 * Token Engine — bridge to the existing energy backend.
 *
 * Same source of truth as the CRM token flow.  Used by:
 *   • Vendor vending
 *   • Customer direct-purchase
 *   • Customer wallet purchase
 *
 * Responsibilities:
 *   • Tariff lookup
 *   • Unit computation
 *   • Token generation via existing energy API
 *   • Remote-send task creation + status poll
 *
 * Calls go through env.ENERGY_BACKEND_URL with env.ENERGY_BEARER_TOKEN.
 */
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { adminClient } from '../db/supabase.js';

const TAX_BY_TARIFF: Record<string, number> = {
    RESIDENTIAL: 0,
    COMMERCIAL: 0,
    KOLO: 0.075,
    PRODUCTIVE: 0,
    PUBLIC: 0,
};
const PRICE_BY_TARIFF: Record<string, number> = {
    RESIDENTIAL: 350,
    COMMERCIAL: 350,
    KOLO: 450,
    PRODUCTIVE: 350,
    PUBLIC: 350,
};

export class TokenEngineError extends Error {
    constructor(message: string, public code: string, public retryable = false) {
        super(message);
        this.name = 'TokenEngineError';
    }
}

function upstreamSucceeded(payload: { code?: number; msg?: string; reason?: string }) {
    const code = payload.code;
    if (code === undefined || code === null) return true;
    if (code === 0 || code === 200) return true;
    const text = `${payload.msg ?? ''} ${payload.reason ?? ''}`.toLowerCase();
    return text.includes('success');
}

function upstreamFailure(payload: { code?: number; msg?: string; reason?: string }, fallbackCode: string) {
    const message = payload.reason || payload.msg || `energy backend returned code ${payload.code}`;
    return new TokenEngineError(message, fallbackCode, payload.code === 99 || payload.code === 429);
}

async function energyCall<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!env.ENERGY_BACKEND_URL || !env.ENERGY_BEARER_TOKEN) {
        throw new TokenEngineError('energy backend not configured', 'energy_not_configured');
    }
    const res = await fetch(`${env.ENERGY_BACKEND_URL}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${env.ENERGY_BEARER_TOKEN}`,
            'Content-Type': 'application/json',
            ...(init.headers ?? {}),
        },
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new TokenEngineError(
            `energy backend ${res.status}: ${body.slice(0, 200)}`,
            res.status >= 500 ? 'energy_5xx' : 'energy_4xx',
            res.status >= 500 || res.status === 429,
        );
    }
    return (await res.json()) as T;
}

export interface TariffInfo {
    tariffId: string;
    basePricePerKwh: number;
    taxRate: number;
    effectivePricePerKwh: number;
}

export function resolveTariffPricing(tariffId: string): TariffInfo {
    const id = tariffId.toUpperCase();
    const base = PRICE_BY_TARIFF[id] ?? 350;
    const tax = TAX_BY_TARIFF[id] ?? 0;
    return {
        tariffId: id,
        basePricePerKwh: base,
        taxRate: tax,
        effectivePricePerKwh: base * (1 + tax),
    };
}

export interface PurchasePreview {
    amountMinor: number;
    units: number;            // kWh
    effectivePricePerKwh: number;
    taxAmountMinor: number;
    tariffId: string;
}

export function previewPurchase(amountMinor: number, tariffId: string): PurchasePreview {
    if (amountMinor <= 0) throw new TokenEngineError('amount must be positive', 'invalid_amount');
    const t = resolveTariffPricing(tariffId);
    const naira = amountMinor / 100;
    const units = naira / t.effectivePricePerKwh;
    const taxMinor = Math.round(amountMinor * (t.taxRate / (1 + t.taxRate)));
    return {
        amountMinor,
        units: Number(units.toFixed(4)),
        effectivePricePerKwh: t.effectivePricePerKwh,
        taxAmountMinor: taxMinor,
        tariffId: t.tariffId,
    };
}

export interface MeterInfo {
    meterId: string;
    customerId: string;
    customerName: string;
    stationId: string;
    tariffId: string;
    protocolVersion?: string | null;
    communicationWay?: string | null;
    resolutionSource?: 'energy_account' | 'local_binding' | 'energy_low_purchase_report' | 'archived_contract_sample';
    liveVerified?: boolean;
}

export async function lookupMeter(
    meterId: string,
    opts: { allowArchivedFallback?: boolean; allowHistoricalFallback?: boolean } = {},
): Promise<MeterInfo> {
    const normalizedMeterId = meterId.trim();
    // Energy backend lookup. Returns 200 + 1 row or 404.
    let upstreamError: TokenEngineError | null = null;
    try {
        const data = await energyCall<{
            code?: number;
            msg?: string;
            reason?: string;
            records?: Array<{
                meterId?: string;
                meter_id?: string;
                customerId?: string;
                customer_id?: string;
                customerName?: string;
                customer_name?: string;
                stationId?: string;
                station_id?: string;
                SITE_ID?: string;
                tariffId?: string;
                tariff_id?: string;
                protocolVersion?: string;
                protocol_version?: string;
                communicationWay?: string;
                communication_way?: string;
            }>;
            rows?: Array<Record<string, unknown>>;
            data?: { data?: Array<Record<string, unknown>>; records?: Array<Record<string, unknown>>; list?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
            result?: { data?: Array<Record<string, unknown>>; records?: Array<Record<string, unknown>>; list?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
        }>('/api/account/read', {
            method: 'POST',
            body: JSON.stringify({ meterId: normalizedMeterId, pageNumber: 1, pageSize: 50 }),
        });
        if (!upstreamSucceeded(data)) throw upstreamFailure(data, 'energy_query_failed');
        const row = accountRows(data).find((item) => String(item.meterId || item.meter_id || '').trim() === normalizedMeterId);
        if (row) return { ...normalizeMeterRow(row, normalizedMeterId), resolutionSource: 'energy_account', liveVerified: true };
    } catch (error) {
        if (!(error instanceof TokenEngineError)) throw error;
        upstreamError = error;
        // Upstream misses/outages can still be served from local account bindings.
    }

    const fallback = await lookupLocalAccountBinding(normalizedMeterId);
    if (fallback) return fallback;

    if (opts.allowHistoricalFallback) {
        const historical = await lookupHistoricalLowPurchaseReport(normalizedMeterId).catch((error) => {
            if (error instanceof TokenEngineError) {
                if (!upstreamError || error.retryable) upstreamError = error;
                return null;
            }
            throw error;
        });
        if (historical) return historical;
    }

    if (opts.allowArchivedFallback) {
        const archived = lookupArchivedMeterSample(normalizedMeterId);
        if (archived) return archived;
    }

    if (upstreamError?.code === 'energy_not_configured') throw upstreamError;
    if (upstreamError?.retryable) {
        throw new TokenEngineError(
            'Meter lookup service is temporarily unavailable and this meter is not yet in the local binding catalog.',
            'meter_lookup_unavailable',
            true,
        );
    }
    throw new TokenEngineError(`meter not found ${normalizedMeterId}`, 'meter_not_found');
}

function accountRows(payload: {
    records?: Array<Record<string, unknown>>;
    rows?: Array<Record<string, unknown>>;
    data?: { data?: Array<Record<string, unknown>>; records?: Array<Record<string, unknown>>; list?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
    result?: { data?: Array<Record<string, unknown>>; records?: Array<Record<string, unknown>>; list?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
}): Array<Record<string, unknown>> {
    if (Array.isArray(payload.records)) return payload.records;
    if (Array.isArray(payload.rows)) return payload.rows;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && !Array.isArray(payload.data) && Array.isArray(payload.data.data)) return payload.data.data;
    if (payload.data && !Array.isArray(payload.data) && Array.isArray(payload.data.records)) return payload.data.records;
    if (payload.data && !Array.isArray(payload.data) && Array.isArray(payload.data.list)) return payload.data.list;
    if (Array.isArray(payload.result)) return payload.result;
    if (payload.result && !Array.isArray(payload.result) && Array.isArray(payload.result.data)) return payload.result.data;
    if (payload.result && !Array.isArray(payload.result) && Array.isArray(payload.result.records)) return payload.result.records;
    if (payload.result && !Array.isArray(payload.result) && Array.isArray(payload.result.list)) return payload.result.list;
    return [];
}

function normalizeMeterRow(row: Record<string, unknown>, requestedMeterId: string): MeterInfo {
    const meter = String(row.meterId || row.meter_id || requestedMeterId).trim();
    const customerId = String(row.customerId || row.customer_id || row.id || meter).trim();
    const station = String(row.stationId || row.station_id || row.SITE_ID || row.customerAddress || row.customer_address || '').trim();
    return {
        meterId: meter,
        customerId,
        customerName: String(row.customerName || row.customer_name || row.name || `Customer ${meter}`).trim(),
        stationId: station || 'UNKNOWN',
        tariffId: String(row.tariffId || row.tariff_id || '').trim() || 'RESIDENTIAL',
        protocolVersion: String(row.protocolVersion || row.protocol_version || '').trim() || null,
        communicationWay: String(row.communicationWay || row.communication_way || '').trim() || null,
    };
}

async function lookupLocalAccountBinding(meterId: string): Promise<MeterInfo | null> {
    const { data } = await adminClient
        .from('account_bindings')
        .select('customer_id, meter_id, tariff_id, station_id, remark')
        .eq('meter_id', meterId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (!data) return null;
    return {
        meterId: String(data.meter_id),
        customerId: String(data.customer_id),
        customerName: String(data.remark || `Customer ${data.meter_id}`),
        stationId: String(data.station_id || 'UNKNOWN'),
        tariffId: String(data.tariff_id || 'RESIDENTIAL'),
        protocolVersion: null,
        communicationWay: null,
        resolutionSource: 'local_binding',
        liveVerified: true,
    };
}

async function lookupHistoricalLowPurchaseReport(meterId: string): Promise<MeterInfo | null> {
    const now = new Date();
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - 180);
    const payload = {
        meterId,
        customerId: meterId,
        dateRange: [from.toISOString(), now.toISOString()],
        lowLimit: 999999,
        pageNumber: 1,
        pageSize: 100,
    };
    const data = await energyCall<{
        code?: number;
        msg?: string;
        reason?: string;
        records?: Array<Record<string, unknown>>;
        rows?: Array<Record<string, unknown>>;
        data?: { data?: Array<Record<string, unknown>>; records?: Array<Record<string, unknown>>; list?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
        result?: { data?: Array<Record<string, unknown>>; records?: Array<Record<string, unknown>>; list?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
    }>('/API/PrepayReport/LowPurchaseSituation', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
    if (!upstreamSucceeded(data)) throw upstreamFailure(data, 'energy_report_query_failed');
    const row = accountRows(data).find((item) => String(item.meterId || item.meter_id || item.customerId || '').trim() === meterId);
    if (!row) return null;
    return {
        ...normalizeMeterRow(row, meterId),
        protocolVersion: null,
        communicationWay: null,
        resolutionSource: 'energy_low_purchase_report',
        liveVerified: false,
    };
}

function archivedMeterFallbackEnabled() {
    if (env.NODE_ENV === 'production') return env.ENERGY_ENABLE_ARCHIVED_METER_FALLBACK === true;
    return env.ENERGY_ENABLE_ARCHIVED_METER_FALLBACK !== false;
}

function findRepoFile(relativePath: string) {
    const candidates = [
        path.resolve(process.cwd(), relativePath),
        path.resolve(process.cwd(), '..', relativePath),
        path.resolve(process.cwd(), '..', '..', relativePath),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function rowsFromUnknownJson(value: unknown): Array<Record<string, unknown>> {
    const rows: Array<Record<string, unknown>> = [];
    const walk = (node: unknown) => {
        if (Array.isArray(node)) {
            for (const item of node) walk(item);
            return;
        }
        if (!node || typeof node !== 'object') return;
        const record = node as Record<string, unknown>;
        if (record.meterId || record.meter_id || record.customerId || record.customer_id) rows.push(record);
        for (const item of Object.values(record)) walk(item);
    };
    walk(value);
    return rows;
}

export function lookupArchivedMeterSample(meterId: string): MeterInfo | null {
    if (!archivedMeterFallbackEnabled()) return null;
    const files = [
        'contracts/samples/api__account__read.json',
        'contracts/samples/API__PrepayReport__LowPurchaseSituation.json',
        'contracts/samples/api__customer__read.json',
    ];
    for (const relative of files) {
        const filePath = findRepoFile(relative);
        if (!filePath) continue;
        try {
            const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
            const row = rowsFromUnknownJson(parsed)
                .find((item) => String(item.meterId || item.meter_id || item.customerId || item.customer_id || '').trim() === meterId);
            if (row) {
                return {
                    ...normalizeMeterRow(row, meterId),
                    protocolVersion: null,
                    communicationWay: null,
                    resolutionSource: 'archived_contract_sample',
                    liveVerified: false,
                };
            }
        } catch {
            // Bad archived samples should never block the live lookup pipeline.
        }
    }
    return null;
}

// ─ Station listing ──────────────────────────────────────────────
//
// Stations come from the upstream energy backend (POST /api/station/read).
// Cached in-process for 5 minutes since the list is stable.

export interface StationInfo {
    stationId: string;
    name: string;
    remark?: string | null;
}

let stationsCache: { at: number; data: StationInfo[] } | null = null;
const STATIONS_TTL_MS = 5 * 60 * 1000;

export async function listStations(opts: { force?: boolean } = {}): Promise<StationInfo[]> {
    if (!opts.force && stationsCache && Date.now() - stationsCache.at < STATIONS_TTL_MS) {
        return stationsCache.data;
    }
    // Upstream returns: { code, reason, result: { total, data: [{ stationId, name, ... }] } }
    const resp = await energyCall<{
        code?: number;
        result?: { total?: number; data?: Array<{ stationId: string; name: string; remark?: string | null }> };
    }>('/api/station/read', {
        method: 'POST',
        body: JSON.stringify({ pageNumber: 1, pageSize: 500 }),
    });
    const raw = resp.result?.data ?? [];
    // Exclude system noise rows (legacy "admin", "0001" placeholder)
    const stations: StationInfo[] = raw
        .filter((s) => s.stationId && s.stationId.toUpperCase() !== 'ADMIN')
        .map((s) => ({ stationId: s.stationId, name: s.name ?? s.stationId, remark: s.remark ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name));
    stationsCache = { at: Date.now(), data: stations };
    return stations;
}

export function invalidateStationsCache() {
    stationsCache = null;
}

export interface GenerateTokenInput {
    meterId: string;
    customerId: string;
    customerName?: string | null;
    stationId?: string | null;
    amountMinor: number;
    units: number;
    tariffId: string;
    /** External reference for traceability — usually purchase_order_id */
    reference: string;
}

export interface GenerateTokenResult {
    token: string;
    tokenRecordId: string;
    amountMinor: number;
    units: number;
    generatedAt: string;
    upstreamPayload: Record<string, unknown>;
}

export function buildCreditTokenPayload(input: GenerateTokenInput, opts: { isPreview?: boolean } = {}) {
    const amount = Math.round((input.amountMinor / 100) * 100) / 100;
    return {
        customerId: input.customerId,
        meterId: input.meterId,
        tariffId: input.tariffId,
        authorizationPassword: env.ENERGY_AUTHORIZATION_PASSWORD ?? '',
        remark: `Beverly vend ${input.reference}`,
        isPreview: opts.isPreview ?? false,
        isVendByTotalPaid: true,
        amount,
        totalUnit: input.units,
        payDebtPercent: 0,
        paymentMethod: 'Cash',
        isS2: false,
    };
}

export async function generateCreditToken(input: GenerateTokenInput): Promise<GenerateTokenResult> {
    if (!env.ENERGY_AUTHORIZATION_PASSWORD) {
        throw new TokenEngineError('energy authorization password not configured', 'energy_authorization_missing');
    }
    const response = await energyCall<{
        code?: number;
        msg?: string;
        reason?: string;
        data?: Record<string, unknown>;
        result?: Record<string, unknown>;
    }>('/api/token/creditToken/generate', {
        method: 'POST',
        body: JSON.stringify(buildCreditTokenPayload(input)),
    });
    if (!upstreamSucceeded(response)) throw upstreamFailure(response, 'token_generation_failed');
    const data = (response.result || response.data || response) as Record<string, unknown>;
    const token = String(data.token || data.tokenFirst || '').trim();
    if (!token) {
        throw new TokenEngineError('energy backend did not return a token', 'token_missing');
    }
    return {
        token,
        tokenRecordId: String(data.tokenRecordId || data.receiptId || data.id || input.reference),
        amountMinor: Math.round(Number(data.amount ?? data.totalPaid ?? input.amountMinor / 100) * 100),
        units: Number(data.units ?? data.totalUnit ?? input.units),
        generatedAt: String(data.createdAt || data.createTime || data.createDate || new Date().toISOString()),
        upstreamPayload: data,
    };
}

export function buildCreditTokenPreviewPlan(input: GenerateTokenInput) {
    return {
        endpoint: '/api/token/creditToken/generate',
        method: 'POST',
        liveWrite: false,
        payload: buildCreditTokenPayload(input, { isPreview: true }),
    };
}

export interface RemoteSendInput {
    customerId: string;
    customerName?: string | null;
    meterId: string;
    stationId: string;
    protocolVersion?: string | null;
    token: string;
    reference: string;
}

export interface RemoteSendResult {
    taskId: string;
    status: 'pending' | 'success' | 'failed' | 'unknown';
}

function cleanToken(value: string) {
    return String(value || '').replace(/\s+/g, '');
}

export function buildRemoteTokenTaskPayload(input: RemoteSendInput) {
    const token = cleanToken(input.token);
    return [{
        customerId: input.customerId || input.meterId,
        customerName: input.customerName ?? '',
        meterId: input.meterId,
        version: input.protocolVersion || '2.2',
        flag: 'A120',
        name: 'Send Token',
        dataItem: 'Send Token',
        dataDefault: '',
        dataPrefix: '',
        data: token,
        stationId: input.stationId,
        remark: `Beverly remote token ${input.reference}`,
    }];
}

export async function createRemoteSendTask(input: RemoteSendInput): Promise<RemoteSendResult> {
    const response = await energyCall<{
        code?: number;
        msg?: string;
        reason?: string;
        data?: Record<string, unknown>;
        result?: Record<string, unknown>;
    }>(
        '/API/RemoteMeterTask/CreateTokenTask',
        {
            method: 'POST',
            body: JSON.stringify(buildRemoteTokenTaskPayload(input)),
        },
    );
    if (!upstreamSucceeded(response)) throw upstreamFailure(response, 'remote_send_failed');
    const data = (response.result || response.data || response) as Record<string, unknown>;
    return {
        taskId: String(data.taskId || data.id || data.recordId || input.reference),
        status: normalizeRemoteTaskStatus(data.status),
    };
}

export async function pollRemoteSendStatus(taskId: string): Promise<RemoteSendResult> {
    const response = await energyCall<{
        code?: number;
        msg?: string;
        reason?: string;
        data?: Record<string, unknown>;
        result?: Record<string, unknown>;
    }>(
        '/API/RemoteMeterTask/GetTokenTask',
        {
            method: 'POST',
            body: JSON.stringify({ taskId, pageNumber: 1, pageSize: 1 }),
        },
    );
    if (!upstreamSucceeded(response)) throw upstreamFailure(response, 'remote_status_failed');
    const data = (response.result || response.data || response) as Record<string, unknown>;
    return {
        taskId: String(data.taskId || data.id || taskId),
        status: normalizeRemoteTaskStatus(data.status),
    };
}

function normalizeRemoteTaskStatus(status: unknown): RemoteSendResult['status'] {
    const value = String(status ?? '').trim().toLowerCase();
    if (['1', 'success', 'successful', 'done', 'completed'].includes(value)) return 'success';
    if (['2', 'failed', 'failure', 'error'].includes(value)) return 'failed';
    if (['0', '3', 'pending', 'processing', 'standby', 'queued'].includes(value)) return 'pending';
    return 'unknown';
}
