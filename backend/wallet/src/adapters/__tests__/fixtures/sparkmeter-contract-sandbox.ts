type Scenario = 'empty' | 'synthetic-reading' | 'malformed-reading';

interface SandboxRequest {
    readonly method: string;
    readonly path: string;
    readonly headers: Record<string, string>;
    readonly body: unknown;
}

interface SandboxOptions {
    readonly scenario: Scenario;
}

/** Test-only Koios v2 simulator. It never opens a network connection. */
export function createSparkMeterContractSandbox(options: SandboxOptions) {
    const requests: SandboxRequest[] = [];
    const capabilities = ['koios-v2-read-contract'] as const;

    const fetch: typeof globalThis.fetch = async (input, init) => {
        const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url);
        const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
        if (url.origin !== 'https://www.sparkmeter.cloud'
            || !/^\/api\/v2\/organizations\/[0-9a-f-]+\/data\/(live|historical)$/.test(url.pathname)
            || method !== 'POST') {
            return new Response(JSON.stringify({ error: 'sandbox_route_not_supported' }), { status: 404 });
        }

        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        const apiKey = headers.get('X-API-KEY');
        const apiSecret = headers.get('X-API-SECRET');
        if (!apiKey?.startsWith('sandbox-') || !apiSecret?.startsWith('sandbox-')) {
            return new Response(JSON.stringify({ error: 'sandbox_credentials_required' }), { status: 401 });
        }

        let body: unknown;
        try {
            body = JSON.parse(String(init?.body ?? '')) as unknown;
        } catch {
            return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 });
        }
        requests.push({
            method,
            path: url.pathname,
            headers: { 'X-API-KEY': apiKey, 'X-API-SECRET': apiSecret },
            body,
        });

        const siteId = (body as { filters?: { sites?: string[] } })?.filters?.sites?.[0] ?? '';
        const reading = options.scenario === 'synthetic-reading'
            ? [{ site_id: siteId, meter_id: 'SANDBOX-METER-001', customer_id: 'SANDBOX-CUSTOMER-001',
                timestamp: '2026-10-01T12:00:00.000Z', energy: 12.5, voltage_avg: 230, current_avg: 1.2,
                power_factor_avg: 0.98, credit_wallet_balance: null, state: 'on', type: 'customer' }]
            : options.scenario === 'malformed-reading' ? [{ site_id: siteId, meter_id: 'SANDBOX-METER-001', state: 'unknown' }] : [];
        return new Response(JSON.stringify({ data: reading, pagination: { count: reading.length, has_more: false, cursor: null } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    };

    return { capabilities, fetch, requests };
}
