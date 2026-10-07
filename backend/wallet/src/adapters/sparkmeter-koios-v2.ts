import { z } from 'zod';
import { validateOemEndpoint } from '../services/oem-endpoint-security.js';
import { normalizeSparkMeterTelemetryPage, type TelemetryPage } from '../services/oem-telemetry.js';

interface SparkMeterTelemetryRequest {
    readonly baseUrl: string;
    readonly approvedHostnames: readonly string[];
    readonly organizationId: string;
    readonly apiKey: string;
    readonly apiSecret: string;
    readonly sites: readonly string[];
    readonly mode: 'live' | 'historical';
    readonly age?: string;
    readonly dateFrom?: string;
    readonly dateTo?: string;
    readonly cursor?: string;
    readonly fetchFn?: typeof fetch;
    readonly validateEndpoint?: typeof validateOemEndpoint;
    readonly wait?: (milliseconds: number) => Promise<void>;
}

const requestSchema = z.object({
    organizationId: z.string().min(1), apiKey: z.string().min(1), apiSecret: z.string().min(1),
    sites: z.array(z.string().uuid()).min(1).max(200), mode: z.enum(['live', 'historical']),
    age: z.string().regex(/^([1-9]|[1-5][0-9]|60)m$|^1h$/).optional(),
    dateFrom: z.string().date().optional(), dateTo: z.string().date().optional(), cursor: z.string().min(1).optional(),
});

const sleep = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Fetch one documented Koios v2 telemetry page. Financial endpoints are excluded. */
export async function fetchSparkMeterTelemetryPage(input: SparkMeterTelemetryRequest): Promise<TelemetryPage> {
    const parsed = requestSchema.parse(input);
    if (parsed.mode === 'historical' && (!parsed.dateFrom || !parsed.dateTo)) {
        throw new Error('Historical telemetry dates are required');
    }
    const validate = input.validateEndpoint ?? validateOemEndpoint;
    const origin = await validate(input.baseUrl, input.approvedHostnames);
    const url = new URL(`/api/v2/organizations/${encodeURIComponent(parsed.organizationId)}/data/${parsed.mode}`, origin);
    const body: Record<string, unknown> = { per_page: 200, filters: { sites: parsed.sites } };
    const filters = body.filters as Record<string, unknown>;
    if (parsed.mode === 'live') filters.age = parsed.age ?? '15m';
    else filters.date_range = { from: parsed.dateFrom, to: parsed.dateTo };
    if (parsed.cursor) body.cursor = parsed.cursor;

    const fetchFn = input.fetchFn ?? fetch;
    const wait = input.wait ?? sleep;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetchFn(url.toString(), {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-API-KEY': parsed.apiKey, 'X-API-SECRET': parsed.apiSecret },
            body: JSON.stringify(body),
        });
        if (response.ok) return normalizeSparkMeterTelemetryPage(await response.json());
        if (attempt === 2 || (response.status !== 429 && response.status < 500)) {
            throw new Error(`SparkMeter telemetry request failed: HTTP ${response.status}`);
        }
        const retryHeader = response.headers.get('Retry-After');
        const retryAfter = retryHeader === null ? NaN : Number(retryHeader);
        await wait(Number.isFinite(retryAfter) ? Math.min(5_000, Math.max(0, retryAfter * 1_000)) : 250 * (2 ** attempt));
    }
    throw new Error('SparkMeter telemetry retry budget exhausted');
}
