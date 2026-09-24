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
import { resolveVatRateBasisPoints } from './vat-policy.js';
import { calculateVendingVatBreakdown } from './vending-vat.js';
import { resolveOemConfig, resolveOemAuthHeader, DEFAULT_OEM_SLUG } from './oem-registry.js';
import {
    buildCalinmeterBearerHeader,
    buildCalinmeterCreditTokenPayload,
    buildCalinmeterRemoteTokenPayload,
    buildCalinmeterStandbyConfirmPayload,
    buildCalinmeterTaskConfirmPayload,
    buildCalinmeterTaskLookupPayload,
    collectCalinmeterTaskRows as collectTaskRows,
    findCalinmeterMeter,
    getCalinmeterAccountRows as accountRows,
    normalizeCalinmeterBoolean as normalizeBoolean,
    normalizeCalinmeterMeterRow as normalizeMeterRow,
    normalizeCalinmeterRemoteRemark as normalizeRemoteRemark,
    normalizeCalinmeterStations,
    parseCalinmeterCreditTokenResponse,
    parseCalinmeterTaskRow as taskResultFromRow,
} from '../adapters/calinmeter-v1.js';

export { normalizeRemoteRemark };

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

export function cleanFloatingNumbersInMessage(raw: string): string {
    return raw.replace(/(\d+\.\d{4,})/g, (match) => {
        const val = parseFloat(match);
        return isNaN(val) ? match : val.toFixed(2);
    });
}

export function classifyEnergyFailure(
    payload: { code?: number; msg?: string; reason?: string },
    fallbackCode: string,
): { message: string; code: string; retryable: boolean } {
    const rawMessage = payload.reason || payload.msg || `energy backend returned code ${payload.code}`;
    const cleanedMessage = cleanFloatingNumbersInMessage(rawMessage);
    const normalized = cleanedMessage.toLowerCase();
    const meterOffline = /meter\s*(?:no\.?\s*)?\(?[a-z0-9-]+\)?\s+is\s+offline/.test(normalized)
        || /reading\s+fail/.test(normalized)
        || /meter[^.]{0,80}(?:offline|not\s+online|unreachable)/.test(normalized);

    if (meterOffline) return { message: cleanedMessage, code: 'meter_offline', retryable: true };

    const isQuotaError = normalized.includes('available balance is') || normalized.includes('insufficient balance') || normalized.includes('balance not enough') || normalized.includes('quota');
    if (isQuotaError) {
        return {
            message: `Calinmeter HES vending quota is insufficient (${cleanedMessage}). Administrator action is required to top up OEM quota.`,
            code: 'oem_insufficient_quota',
            retryable: false,
        };
    }

    return {
        message: cleanedMessage,
        code: fallbackCode,
        retryable: payload.code === 99 || payload.code === 429,
    };
}

function upstreamFailure(payload: { code?: number; msg?: string; reason?: string }, fallbackCode: string) {
    const failure = classifyEnergyFailure(payload, fallbackCode);
    return new TokenEngineError(failure.message, failure.code, failure.retryable);
}

const ENERGY_AUTHORIZATION_REJECTION_TTL_MS = 5 * 60_000;
let energyAuthorizationRejectedUntil = 0;

export type EnergyVendReadiness =
    | { ok: true }
    | { ok: false; code: 'energy_authorization_missing' | 'energy_authorization_misconfigured' | 'energy_authorization_rejected'; message: string };

export function inspectEnergyVendAuthorization(
    authorizationPassword: string | null | undefined,
    loginPassword: string | null | undefined,
): EnergyVendReadiness {
    const authorization = String(authorizationPassword ?? '').trim();
    const login = String(loginPassword ?? '').trim();
    if (!authorization) return { ok: false, code: 'energy_authorization_missing', message: 'Energy vending authorization is not configured.' };
    if (login && authorization === login) {
        return { ok: false, code: 'energy_authorization_misconfigured', message: 'Energy vending authorization must differ from the upstream login password.' };
    }
    return { ok: true };
}

export function isEnergyAuthorizationRejectedResponse(payload: { msg?: string; reason?: string }): boolean {
    return /(?:incorrect|invalid)\s+authorization\s+password/i.test(`${payload.reason ?? ''} ${payload.msg ?? ''}`.trim());
}

export function assertEnergyVendReady(now = Date.now()): void {
    const configured = inspectEnergyVendAuthorization(env.ENERGY_AUTHORIZATION_PASSWORD, env.UPSTREAM_PASSWORD);
    if (!configured.ok) throw new TokenEngineError(configured.message, configured.code);
    if (energyAuthorizationRejectedUntil > now) {
        throw new TokenEngineError('Energy vending authorization was rejected. Administrator action is required.', 'energy_authorization_rejected');
    }
}

// Phase 6 unification: resolves the target OEM's base URL + auth header from the
// shared oem_manufacturers/oem_credentials registry (see oem-registry.ts) when
// `oemId` is given or the default (Calinmeter) row is seeded there. Production
// must use that registry identity. The legacy environment pair is available only
// when the registry is explicitly disabled, preventing accidental 0001 vending.
export async function resolveEnergyTarget(oemId?: string, stationId?: string | null): Promise<{ baseUrl: string; authHeader: { name: string; value: string } | null }> {
    // Legacy credentials are manufacturer-scoped. Installation routing must use
    // the new installation registry and may never masquerade as station scope.
    void stationId;
    const oemConfig = await resolveOemConfig(oemId);
    const authHeaderFromOem = resolveOemAuthHeader(oemConfig);
    if (oemConfig && oemConfig.baseUrl && authHeaderFromOem) {
        return { baseUrl: oemConfig.baseUrl, authHeader: authHeaderFromOem };
    }
    if (oemId || (env.NODE_ENV === 'production' && !env.OEM_REGISTRY_DISABLED)) {
        throw new TokenEngineError('OEM energy backend not configured', 'oem_energy_not_configured');
    }
    return {
        baseUrl: env.ENERGY_BACKEND_URL || '',
        authHeader: buildCalinmeterBearerHeader(env.ENERGY_BEARER_TOKEN),
    };
}

async function energyCall<T>(path: string, init: RequestInit = {}, oemId?: string, stationId?: string | null): Promise<T> {
    const { baseUrl, authHeader } = await resolveEnergyTarget(oemId, stationId);
    if (!baseUrl || !authHeader) {
        throw new TokenEngineError('energy backend not configured', 'energy_not_configured');
    }
    const res = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
            [authHeader.name]: authHeader.value,
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
    effectivePricePerKwh: number;
}

export function resolveTariffPricing(tariffId: string): TariffInfo {
    const id = tariffId.toUpperCase().trim();
    const base = PRICE_BY_TARIFF[id] ?? 350;
    return {
        tariffId: id,
        basePricePerKwh: base,
        effectivePricePerKwh: base,
    };
}

export async function resolveTariffPricingAsync(tariffId: string): Promise<TariffInfo> {
    const id = tariffId.toUpperCase().trim();
    try {
        const { data } = await adminClient
            .from('tariff_rate_history')
            .select('unit_price_ngn, effective_price_ngn, tariff_name')
            .eq('tariff_id', id)
            .maybeSingle();

        if (data && typeof data.unit_price_ngn === 'number' && data.unit_price_ngn > 0) {
            const price = Number(data.effective_price_ngn || data.unit_price_ngn);
            return {
                tariffId: id,
                basePricePerKwh: price,
                effectivePricePerKwh: price,
            };
        }
    } catch {
        // Fall back to static map if DB lookup is unavailable
    }
    return resolveTariffPricing(id);
}

export interface PurchasePreview {
    amountMinor: number;
    units: number;            // kWh
    effectivePricePerKwh: number;
    taxAmountMinor: number;
    energyAmountMinor: number;
    grossAmountMinor: number;
    vatRateBasisPoints: number;
    tariffId: string;
}

export function previewPurchase(
    energyAmountMinor: number,
    tariffId: string,
    vatRateBasisPoints = env.VENDING_VAT_BASIS_POINTS,
): PurchasePreview {
    if (energyAmountMinor <= 0) throw new TokenEngineError('amount must be positive', 'invalid_amount');
    const t = resolveTariffPricing(tariffId);
    const vat = calculateVendingVatBreakdown(energyAmountMinor, vatRateBasisPoints);
    const naira = vat.energyAmountMinor / 100;
    const units = naira / t.basePricePerKwh;
    return {
        amountMinor: vat.grossAmountMinor,
        units: Number(units.toFixed(4)),
        effectivePricePerKwh: t.effectivePricePerKwh,
        taxAmountMinor: vat.vatAmountMinor,
        energyAmountMinor: vat.energyAmountMinor,
        grossAmountMinor: vat.grossAmountMinor,
        vatRateBasisPoints: vat.vatRateBasisPoints,
        tariffId: t.tariffId,
    };
}

export async function previewPurchaseWithPolicy(
    amountMinor: number,
    tariffId: string,
    at = new Date(),
): Promise<PurchasePreview> {
    const vatRateBasisPoints = await resolveVatRateBasisPoints(at);
    const t = await resolveTariffPricingAsync(tariffId);
    const vat = calculateVendingVatBreakdown(amountMinor, vatRateBasisPoints);
    const naira = vat.energyAmountMinor / 100;
    const units = naira / t.basePricePerKwh;
    return {
        amountMinor: vat.grossAmountMinor,
        units: Number(units.toFixed(4)),
        effectivePricePerKwh: t.effectivePricePerKwh,
        taxAmountMinor: vat.vatAmountMinor,
        energyAmountMinor: vat.energyAmountMinor,
        grossAmountMinor: vat.grossAmountMinor,
        vatRateBasisPoints: vat.vatRateBasisPoints,
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
    isThreePhase?: boolean | null;
    sgc?: string | null;
    resolutionSource?: 'energy_account' | 'local_binding' | 'energy_low_purchase_report' | 'archived_contract_sample';
    liveVerified?: boolean;
    /**
     * Phase 6 unification: which OEM this meter belongs to (from
     * account_bindings.oem_id when resolved locally, or the oemId the caller
     * already knew and passed into lookupMeter). Undefined/null means "unknown —
     * treat as the default OEM," which is exactly today's single-tenant behavior
     * (every existing meter predates OEM tagging). Threaded into generateCreditToken/
     * createRemoteSendTask so a vend for a tagged meter targets the right upstream.
     */
    oemId?: string | null;
}

export async function lookupMeter(
    meterId: string,
    opts: { allowArchivedFallback?: boolean; allowHistoricalFallback?: boolean; oemId?: string | null } = {},
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
        }, opts.oemId ?? undefined);
        if (!upstreamSucceeded(data)) throw upstreamFailure(data, 'energy_query_failed');
        const meter = findCalinmeterMeter(data, normalizedMeterId);
        if (meter) {
            let isThreePhase = meter.isThreePhase ?? null;
            let sgc = meter.sgc ?? null;
            if (isThreePhase === null || !sgc) {
                const meta = await lookupMeterMeta(normalizedMeterId, opts.oemId);
                if (isThreePhase === null) isThreePhase = meta.isThreePhase;
                if (!sgc) sgc = meta.sgc;
            }
            return {
                ...meter,
                isThreePhase,
                sgc,
                resolutionSource: 'energy_account',
                liveVerified: true,
                oemId: opts.oemId ?? null,
            };
        }
    } catch (error) {
        if (!(error instanceof TokenEngineError)) throw error;
        upstreamError = error;
        // Upstream misses/outages can still be served from local account bindings.
    }

    const fallback = await lookupLocalAccountBinding(normalizedMeterId);
    if (fallback) return fallback;

    if (opts.allowHistoricalFallback) {
        const historical = await lookupHistoricalLowPurchaseReport(normalizedMeterId, opts.oemId).catch((error) => {
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

async function lookupMeterMeta(meterId: string, oemId?: string | null): Promise<{ isThreePhase: boolean | null; sgc: string | null }> {
    try {
        const data = await energyCall<{
            code?: number;
            msg?: string;
            reason?: string;
            data?: { data?: Array<Record<string, unknown>>; records?: Array<Record<string, unknown>>; list?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
            result?: { data?: Array<Record<string, unknown>>; records?: Array<Record<string, unknown>>; list?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
        }>('/api/meter/read', {
            method: 'POST',
            body: JSON.stringify({ meterId, pageNumber: 1, pageSize: 20 }),
        }, oemId ?? undefined);
        if (!upstreamSucceeded(data)) return { isThreePhase: null, sgc: null };
        const row = accountRows(data).find((item) => String(item.meterId || item.meter_id || item.id || '').trim() === meterId);
        if (!row) return { isThreePhase: null, sgc: null };
        return {
            isThreePhase: normalizeBoolean(row.isThreePhase ?? row.is_three_phase ?? row.threePhase),
            sgc: String(row.sgc ?? row.SGC ?? '').trim() || null,
        };
    } catch {
        return { isThreePhase: null, sgc: null };
    }
}

async function lookupLocalAccountBinding(meterId: string): Promise<MeterInfo | null> {
    const { data } = await adminClient
        .from('account_bindings')
        .select('customer_id, meter_id, tariff_id, station_id, remark, meter_type, detail_json, oem_id')
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
        isThreePhase: data.meter_type === 'three_phase'
            || normalizeBoolean((data.detail_json as any)?.isThreePhase ?? (data.detail_json as any)?.is_three_phase) === true,
        resolutionSource: 'local_binding',
        liveVerified: true,
        // Nullable — every account_binding predating Phase 0's retrofit has no
        // oem_id yet. A null value here is treated as "default OEM" downstream,
        // which is exactly correct since every such row is a real Calinmeter meter.
        oemId: (data as any).oem_id ?? null,
    };
}

async function lookupHistoricalLowPurchaseReport(meterId: string, oemId?: string | null): Promise<MeterInfo | null> {
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
    }, oemId ?? undefined);
    if (!upstreamSucceeded(data)) throw upstreamFailure(data, 'energy_report_query_failed');
    const row = accountRows(data).find((item) => String(item.meterId || item.meter_id || item.customerId || '').trim() === meterId);
    if (!row) return null;
    return {
        ...normalizeMeterRow(row, meterId),
        protocolVersion: null,
        communicationWay: null,
        resolutionSource: 'energy_low_purchase_report',
        liveVerified: false,
        oemId: oemId ?? null,
    };
}

function archivedMeterFallbackEnabled() {
    return env.ENERGY_ENABLE_ARCHIVED_METER_FALLBACK === true;
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
    oemId: string | null;
    oemSlug: string | null;
    oemName: string | null;
    status: 'active' | 'disabled';
}

// Keyed by oemId (default-OEM key '' when none given) so a future second OEM's
// station list can't collide with Calinmeter's cached one.
const stationsCache = new Map<string, { at: number; data: StationInfo[] }>();
const STATIONS_TTL_MS = 5 * 60 * 1000;

export async function listStations(opts: { force?: boolean; oemId?: string | null } = {}): Promise<StationInfo[]> {
    const cacheKey = opts.oemId ?? '';
    const cached = stationsCache.get(cacheKey);
    if (!opts.force && cached && Date.now() - cached.at < STATIONS_TTL_MS) {
        return cached.data;
    }
    // Upstream returns: { code, reason, result: { total, data: [{ stationId, name, ... }] } }
    const owner = await resolveOemConfig(opts.oemId ?? undefined);
    const resp = await energyCall<{
        code?: number;
        result?: { total?: number; data?: Array<{ stationId: string; name: string; remark?: string | null; status?: unknown }> };
    }>('/api/station/read', {
        method: 'POST',
        body: JSON.stringify({ pageNumber: 1, pageSize: 500 }),
    }, opts.oemId ?? undefined);
    const stations: StationInfo[] = normalizeCalinmeterStations(resp, {
        oemId: owner?.oemId ?? null,
        oemSlug: owner?.slug ?? null,
        oemName: owner?.displayName ?? null,
    });
    stationsCache.set(cacheKey, { at: Date.now(), data: stations });
    return stations;
}

export async function listStationDirectory(opts: { force?: boolean } = {}): Promise<StationInfo[]> {
    const { data, error } = await adminClient
        .from('oem_manufacturers')
        .select('id')
        .eq('status', 'active')
        .order('display_name');
    if (error) throw new TokenEngineError(error.message, 'oem_directory_unavailable', true);
    const owners = (data ?? []).map((row) => String(row.id || '').trim()).filter(Boolean);
    if (!owners.length) return listStations({ force: opts.force });
    const results = await Promise.allSettled(owners.map((oemId) => listStations({ force: opts.force, oemId })));
    const stations = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    if (!stations.length) {
        const fallbackStations = await listStations({ force: opts.force });
        if (!fallbackStations.length) {
            throw new TokenEngineError('No OEM station directory is available', 'stations_unavailable', true);
        }
        return fallbackStations;
    }
    return stations.sort((left, right) => `${left.oemName}:${left.name}`.localeCompare(`${right.oemName}:${right.name}`));
}

export function invalidateStationsCache() {
    stationsCache.clear();
}

export interface GenerateTokenInput {
    meterId: string;
    customerId: string;
    customerName?: string | null;
    stationId?: string | null;
    amountMinor: number;
    units: number;
    tariffId: string;
    isThreePhase?: boolean | null;
    /** Supply Group Code — lets the resolver apply an SGC-level S1/S2 rule. */
    sgc?: string | null;
    /** External reference for traceability — usually purchase_order_id */
    reference: string;
    /** Phase 6: which OEM to vend against (see MeterInfo.oemId). */
    oemId?: string | null;
    /** Vendor/Operator name for OEM token records. */
    vendorName?: string | null;
    operatorName?: string | null;
}

export interface GenerateTokenResult {
    token: string;
    tokenRecordId: string;
    amountMinor: number;
    units: number;
    generatedAt: string;
    upstreamPayload: Record<string, unknown>;
}

export function buildCreditTokenPayload(input: GenerateTokenInput, opts: { isPreview?: boolean; isS2?: boolean } = {}) {
    return buildCalinmeterCreditTokenPayload({
        ...input,
        authorizationPassword: env.ENERGY_AUTHORIZATION_PASSWORD ?? '',
    }, opts);
}

/**
 * Resolve the effective STS token format (isS2) using the shared override store:
 *   per-meter override → SGC rule → phase fallback.
 * Reads the same Supabase tables the CRM writes (meter_token_overrides, sgc_token_rules).
 * Any lookup failure (incl. tables not yet migrated) falls back to the phase guess.
 */
export async function resolveEffectiveIsS2(input: GenerateTokenInput): Promise<boolean> {
    const meterId = String(input.meterId || '').trim();
    if (meterId) {
        try {
            const { data } = await adminClient
                .from('meter_token_overrides')
                .select('is_s2')
                .eq('meter_id', meterId)
                .maybeSingle();
            if (data && typeof (data as any).is_s2 === 'boolean') return (data as any).is_s2;
        } catch { /* table may not exist yet */ }
    }

    let sgc = String(input.sgc || '').trim();
    if (!sgc && meterId) {
        sgc = (await lookupMeterMeta(meterId, input.oemId)).sgc ?? '';
    }
    if (sgc) {
        try {
            const { data } = await adminClient
                .from('sgc_token_rules')
                .select('is_s2')
                .eq('sgc', sgc)
                .maybeSingle();
            if (data && typeof (data as any).is_s2 === 'boolean') return (data as any).is_s2;
        } catch { /* table may not exist yet */ }
    }

    return input.isThreePhase === true;
}

/**
 * Guards against silently building an STS token payload for an OEM that doesn't
 * speak STS. `direct_credit` (an OEM that credits a meter in real time with no
 * physical token) is reserved in the schema (oem_manufacturers.vending_strategy)
 * but its actual code path has NOT been built. SparkMeter direct-credit behavior
 * is uncertified, so building it now would be speculative, untestable code with
 * no real spec to verify against. Fails loudly and
 * specifically instead of vending Calinmeter's STS shape at a non-STS OEM.
 */
async function assertVendingStrategySupported(oemId?: string | null): Promise<void> {
    const config = await resolveOemConfig(oemId ?? DEFAULT_OEM_SLUG);
    if (config?.vendingStrategy === 'direct_credit') {
        throw new TokenEngineError(
            `${config.displayName} is configured for direct-credit vending, which is not yet implemented in the wallet backend. STS token generation cannot be used for this OEM.`,
            'vending_strategy_not_implemented',
        );
    }
}

export async function generateCreditToken(input: GenerateTokenInput): Promise<GenerateTokenResult> {
    assertEnergyVendReady();
    await assertVendingStrategySupported(input.oemId);
    const isS2 = await resolveEffectiveIsS2(input);
    const response = await energyCall<{
        code?: number;
        msg?: string;
        reason?: string;
        data?: Record<string, unknown>;
        result?: Record<string, unknown>;
    }>('/api/token/creditToken/generate', {
        method: 'POST',
        body: JSON.stringify(buildCreditTokenPayload(input, { isS2 })),
    }, input.oemId ?? undefined, input.stationId ?? undefined);
    if (!upstreamSucceeded(response)) {
        if (isEnergyAuthorizationRejectedResponse(response)) {
            energyAuthorizationRejectedUntil = Date.now() + ENERGY_AUTHORIZATION_REJECTION_TTL_MS;
            throw new TokenEngineError('Energy vending authorization was rejected. Administrator action is required.', 'energy_authorization_rejected');
        }
        throw upstreamFailure(response, 'token_generation_failed');
    }
    const result = parseCalinmeterCreditTokenResponse(response, {
        reference: input.reference,
        amountMinor: input.amountMinor,
        units: input.units,
        generatedAtFallback: new Date().toISOString(),
    });
    if (!result) {
        throw new TokenEngineError('energy backend did not return a token', 'token_missing');
    }
    return result;
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
    /** Phase 6: which OEM to dispatch the remote-send task against. */
    oemId?: string | null;
}

export interface RemoteSendResult {
    taskId: string;
    status: 'pending' | 'success' | 'failed' | 'unknown';
    remark?: string | null;
}

function cleanToken(value: string) {
    return String(value || '').replace(/\s+/g, '');
}

export function buildRemoteTokenTaskPayload(input: RemoteSendInput) {
    return buildCalinmeterRemoteTokenPayload(input);
}

export function buildRemoteTaskConfirmPayload(response: unknown) {
    return buildCalinmeterTaskConfirmPayload(response);
}

export function buildRemoteTokenTaskLookupPayload(input: Pick<RemoteSendInput, 'meterId'>) {
    return buildCalinmeterTaskLookupPayload(input.meterId);
}

export function buildRemoteTokenStandbyConfirmPayload(response: unknown, input: Pick<RemoteSendInput, 'meterId' | 'token'>) {
    return buildCalinmeterStandbyConfirmPayload(response, input.meterId, input.token);
}

function isAcceptedRemoteConfirm(response: { code?: number; msg?: string; reason?: string }) {
    const text = `${response.msg ?? ''} ${response.reason ?? ''}`.toLowerCase();
    return response.code === 99 && text.includes('no data has been changed');
}

function taskRowForRemoteSend(response: unknown, input: Pick<RemoteSendInput, 'meterId' | 'token'> & { taskId?: string | number | null }) {
    const meterId = String(input.meterId || '').trim();
    const token = cleanToken(input.token);
    const taskId = Number(input.taskId);
    return collectTaskRows(response)
        .filter((row) => !Number.isFinite(taskId) || Number(row.id ?? row.taskId ?? row.recordId) === taskId)
        .find((row) => String(row.meterId || '').trim() === meterId && (!token || cleanToken(String(row.data || row.token || '')) === token)) ?? null;
}

function tokenRejectError(task: RemoteSendResult) {
    const normalized = normalizeRemoteRemark(task.remark);
    if (normalized.includes('already been used') || normalized.includes('already used')) {
        return new TokenEngineError('Token has already been used or entered into the meter.', 'token_already_used');
    }
    if (normalized.includes('already sent') || normalized.includes('already exists')) {
        return new TokenEngineError('Token has already been sent over the air to this meter.', 'token_already_sent');
    }
    return new TokenEngineError(`Remote meter rejected token: ${normalized}`, 'remote_token_rejected');
}

async function waitForRemoteTokenTerminal(input: RemoteSendInput & { taskId: string }, attempts = 12, intervalMs = 5000): Promise<RemoteSendResult> {
    let latest: RemoteSendResult = { taskId: input.taskId, status: 'pending', remark: null };
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (attempt) await new Promise((resolve) => setTimeout(resolve, intervalMs));
        const lookupResponse = await energyCall<{
            code?: number;
            msg?: string;
            reason?: string;
            data?: Record<string, unknown>;
            result?: Record<string, unknown>;
        }>(
            '/API/RemoteMeterTask/GetTokenTask',
            {
                method: 'POST',
                body: JSON.stringify(buildRemoteTokenTaskLookupPayload(input)),
            },
            input.oemId ?? undefined,
            input.stationId ?? undefined,
        );
        if (!upstreamSucceeded(lookupResponse)) throw upstreamFailure(lookupResponse, 'remote_status_failed');
        const row = taskRowForRemoteSend(lookupResponse, input);
        if (!row) continue;
        latest = taskResultFromRow(row, input.taskId);
        if (latest.status === 'success' || latest.status === 'failed') return latest;
    }
    return latest;
}

export async function createRemoteSendTask(input: RemoteSendInput): Promise<RemoteSendResult> {
    // Deduplication check: query Calinmeter for pre-existing task row before sending CreateTokenTask
    if (input.meterId && input.token) {
        const existingLookup = await energyCall<{
            code?: number;
            msg?: string;
            reason?: string;
            data?: Record<string, unknown>;
            result?: Record<string, unknown>;
        }>(
            '/API/RemoteMeterTask/GetTokenTask',
            {
                method: 'POST',
                body: JSON.stringify(buildRemoteTokenTaskLookupPayload(input)),
            },
            input.oemId ?? undefined,
            input.stationId ?? undefined,
        ).catch(() => null);

        if (existingLookup && upstreamSucceeded(existingLookup)) {
            const existingRow = taskRowForRemoteSend(existingLookup, input);
            if (existingRow) {
                const existingTaskId = String(existingRow.id ?? existingRow.taskId ?? existingRow.recordId);
                const existingResult = taskResultFromRow(existingRow, existingTaskId);
                if (existingResult.status === 'success') {
                    return {
                        taskId: existingTaskId,
                        status: 'success',
                        remark: existingResult.remark || 'Token was already sent over the air to this meter.',
                    };
                }
                if (existingResult.status === 'pending') {
                    return await waitForRemoteTokenTerminal({ ...input, taskId: existingTaskId });
                }
            }
        }
    }

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
        input.oemId ?? undefined,
        input.stationId ?? undefined,
    );
    if (!upstreamSucceeded(response)) throw upstreamFailure(response, 'remote_send_failed');
    let confirmPayload = buildRemoteTaskConfirmPayload(response);
    if (!confirmPayload.length) {
        const lookupResponse = await energyCall<{
            code?: number;
            msg?: string;
            reason?: string;
            data?: Record<string, unknown>;
            result?: Record<string, unknown>;
        }>(
            '/API/RemoteMeterTask/GetTokenTask',
            {
                method: 'POST',
                body: JSON.stringify(buildRemoteTokenTaskLookupPayload(input)),
            },
            input.oemId ?? undefined,
            input.stationId ?? undefined,
        );
        if (!upstreamSucceeded(lookupResponse)) throw upstreamFailure(lookupResponse, 'remote_send_lookup_failed');
        confirmPayload = buildRemoteTokenStandbyConfirmPayload(lookupResponse, input);
    }
    const taskId = String(confirmPayload[0]?.id || input.reference);
    if (confirmPayload.length) {
        const confirmResponse = await energyCall<{ code?: number; msg?: string; reason?: string }>(
            '/API/RemoteMeterTask/UpdateTokenTask',
            {
                method: 'POST',
                body: JSON.stringify(confirmPayload),
            },
            input.oemId ?? undefined,
            input.stationId ?? undefined,
        );
        if (!upstreamSucceeded(confirmResponse) && !isAcceptedRemoteConfirm(confirmResponse)) {
            throw upstreamFailure(confirmResponse, 'remote_send_confirm_failed');
        }
    } else {
        throw new TokenEngineError('Token task created but confirm id was not returned', 'remote_send_confirm_id_missing');
    }
    const finalTask = await waitForRemoteTokenTerminal({ ...input, taskId });
    if (finalTask.status === 'failed') throw tokenRejectError(finalTask);
    return finalTask;
}

export async function pollRemoteSendStatus(taskId: string, context: Partial<Pick<RemoteSendInput, 'meterId' | 'token' | 'oemId' | 'stationId'>> = {}): Promise<RemoteSendResult> {
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
            body: JSON.stringify(context.meterId ? buildRemoteTokenTaskLookupPayload({ meterId: context.meterId }) : { taskId, pageNumber: 1, pageSize: 10, orderBy: 'createDate desc' }),
        },
        context.oemId ?? undefined,
        context.stationId ?? undefined,
    );
    if (!upstreamSucceeded(response)) throw upstreamFailure(response, 'remote_status_failed');
    const row = taskRowForRemoteSend(response, { meterId: context.meterId ?? '', token: context.token ?? '', taskId }) || collectTaskRows(response).find((item) => Number(item.id ?? item.taskId ?? item.recordId) === Number(taskId));
    return row ? taskResultFromRow(row, taskId) : { taskId, status: 'unknown', remark: null };
}
