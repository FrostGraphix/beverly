import { requireTelemetryReading, type CanonicalTelemetryReading } from '@beverly/oem-contracts';
import { z } from 'zod';
import { adminClient } from '../db/supabase.js';

const providerReading = z.object({
    site_id: z.string(), meter_id: z.string(), customer_id: z.string().nullable().optional(),
    timestamp: z.string(), energy: z.number().nullable().optional(),
    voltage_avg: z.number().nullable().optional(), current_avg: z.number().nullable().optional(),
    power_factor_avg: z.number().nullable().optional(), credit_wallet_balance: z.number().nullable().optional(),
    state: z.string(), type: z.string(),
}).passthrough();
const observedReading = z.object({
    site: z.string().min(1),
    meter: z.object({ serial_number: z.string().min(1), customer: z.object({ id: z.string().min(1) }).nullable() }),
    timestamp: z.string(), energy: z.number().nullable().optional(),
    voltage_avg: z.number().nullable().optional(), current_avg: z.number().nullable().optional(),
    power_factor_avg: z.number().nullable().optional(), state: z.string(), type: z.literal('reading'),
}).passthrough();
const providerPage = z.object({
    data: z.array(z.unknown()).max(200),
    pagination: z.object({ count: z.number().int().nonnegative(), has_more: z.boolean(), cursor: z.string().nullable() }),
});

export interface StoredTelemetryReading extends CanonicalTelemetryReading {
    readonly providerPayload: Record<string, unknown>;
}
export interface TelemetryPage {
    readonly readings: readonly StoredTelemetryReading[];
    readonly quarantine: readonly { reason: string; providerPayload: unknown }[];
    readonly nextCursor: string | null;
    readonly hasMore: boolean;
}
export interface TelemetryStore {
    rpc(name: string, input: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

/** Normalize only fields documented by Koios v2; unknown semantics remain explicit. */
export function normalizeSparkMeterTelemetryPage(input: unknown): TelemetryPage {
    const page = providerPage.parse(input);
    const readings: StoredTelemetryReading[] = [];
    const quarantine: { reason: string; providerPayload: unknown }[] = [];
    for (const candidate of page.data) {
        const legacy = providerReading.safeParse(candidate);
        const observed = observedReading.safeParse(candidate);
        if (!legacy.success && !observed.success) {
            quarantine.push({ reason: 'invalid_provider_reading', providerPayload: candidate });
            continue;
        }
        try {
            const reading = observed.success ? observed.data : legacy.data!;
            const state = observed.success
                ? ({ ElectricalMeterStateOn: 'on', ElectricalMeterStateOff: 'off' } as Record<string, string>)[reading.state]
                : reading.state;
            const canonical = requireTelemetryReading({
                externalSiteId: observed.success ? observed.data.site : legacy.data!.site_id,
                externalMeterId: observed.success ? observed.data.meter.serial_number : legacy.data!.meter_id,
                externalCustomerId: observed.success ? observed.data.meter.customer?.id : legacy.data!.customer_id,
                timestamp: reading.timestamp,
                energyKwh: reading.energy,
                voltageAvg: reading.voltage_avg,
                currentAvg: reading.current_avg,
                powerFactorAvg: reading.power_factor_avg,
                providerCreditBalance: legacy.success ? legacy.data.credit_wallet_balance : undefined,
                state,
                type: observed.success ? (observed.data.meter.customer ? 'customer' : 'unknown') : legacy.data!.type,
            });
            readings.push({ ...canonical, providerPayload: reading });
        } catch {
            quarantine.push({ reason: 'invalid_provider_reading', providerPayload: candidate });
        }
    }
    return { readings, quarantine, nextCursor: page.pagination.cursor, hasMore: page.pagination.has_more };
}

/** Persist one provider page and its checkpoint through one database RPC. */
export async function persistTelemetryPage(
    installationId: string,
    mode: 'live' | 'historical',
    scopeKey: string,
    page: TelemetryPage,
    store: TelemetryStore = { rpc: (name, input) => adminClient.rpc(name, input) as never },
): Promise<{ readings: number; quarantine: number }> {
    const { data, error } = await store.rpc('apply_oem_telemetry_page', {
        p_installation_id: installationId,
        p_mode: mode,
        p_scope_key: scopeKey,
        p_readings: page.readings.map((reading) => ({
            external_site_id: reading.externalSiteId, external_meter_id: reading.externalMeterId,
            external_customer_id: reading.externalCustomerId ?? null, reading_at: reading.timestamp,
            energy_kwh: reading.energyKwh ?? null, voltage_avg: reading.voltageAvg ?? null,
            current_avg: reading.currentAvg ?? null, power_factor_avg: reading.powerFactorAvg ?? null,
            provider_credit_balance: reading.providerCreditBalance ?? null,
            meter_state: reading.state, reading_type: reading.type, provider_payload: reading.providerPayload,
        })),
        p_quarantine: page.quarantine.map((entry) => ({ reason: entry.reason, provider_payload: entry.providerPayload })),
        p_cursor: { cursor: page.nextCursor, has_more: page.hasMore, completed_at: new Date().toISOString() },
    });
    const result = z.object({ readings: z.number().int().nonnegative(), quarantine: z.number().int().nonnegative() }).safeParse(data);
    if (error || !result.success) throw new Error('OEM telemetry persistence failed');
    return result.data;
}
