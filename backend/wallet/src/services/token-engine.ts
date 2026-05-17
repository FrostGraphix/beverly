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
import { env } from '../config/env.js';

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
    const base = PRICE_BY_TARIFF[id];
    const tax = TAX_BY_TARIFF[id];
    if (base === undefined || tax === undefined) {
        throw new TokenEngineError(`unknown tariff ${tariffId}`, 'unknown_tariff');
    }
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
}

export async function lookupMeter(meterId: string): Promise<MeterInfo> {
    // Energy backend lookup. Returns 200 + 1 row or 404.
    const data = await energyCall<{ records: Array<{
        meterId: string;
        customerId: string;
        customerName: string;
        stationId: string;
        tariffId: string;
    }>; }>('/api/account/read', {
        method: 'POST',
        body: JSON.stringify({ meterId, pageNumber: 1, pageSize: 1 }),
    });
    const row = data.records?.[0];
    if (!row) throw new TokenEngineError(`meter not found ${meterId}`, 'meter_not_found');
    return {
        meterId: row.meterId,
        customerId: row.customerId,
        customerName: row.customerName,
        stationId: row.stationId,
        tariffId: row.tariffId,
    };
}

export interface GenerateTokenInput {
    meterId: string;
    customerId: string;
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
}

export async function generateCreditToken(input: GenerateTokenInput): Promise<GenerateTokenResult> {
    const data = await energyCall<{
        token: string;
        tokenRecordId: string;
        units: number;
        amount: number;
        createdAt: string;
    }>('/api/token/creditTokenRecord/create', {
        method: 'POST',
        body: JSON.stringify({
            meterId: input.meterId,
            customerId: input.customerId,
            amount: input.amountMinor / 100,
            units: input.units,
            tariffId: input.tariffId,
            externalReference: input.reference,
        }),
    });
    return {
        token: data.token,
        tokenRecordId: data.tokenRecordId,
        amountMinor: Math.round(data.amount * 100),
        units: data.units,
        generatedAt: data.createdAt,
    };
}

export interface RemoteSendInput {
    meterId: string;
    amountMinor: number;
    units: number;
    tariffId: string;
    reference: string;
}

export interface RemoteSendResult {
    taskId: string;
    status: 'pending' | 'success' | 'failed' | 'unknown';
}

export async function createRemoteSendTask(input: RemoteSendInput): Promise<RemoteSendResult> {
    const data = await energyCall<{ taskId: string; status: string }>(
        '/api/RemoteMeterTask/SendCreditToken',
        {
            method: 'POST',
            body: JSON.stringify({
                meterId: input.meterId,
                amount: input.amountMinor / 100,
                units: input.units,
                tariffId: input.tariffId,
                externalReference: input.reference,
            }),
        },
    );
    return {
        taskId: data.taskId,
        status: (data.status as RemoteSendResult['status']) ?? 'pending',
    };
}

export async function pollRemoteSendStatus(taskId: string): Promise<RemoteSendResult> {
    const data = await energyCall<{ taskId: string; status: string }>(
        `/api/RemoteMeterTask/GetTaskStatus?taskId=${encodeURIComponent(taskId)}`,
        { method: 'GET' },
    );
    return {
        taskId: data.taskId,
        status: (data.status as RemoteSendResult['status']) ?? 'unknown',
    };
}
