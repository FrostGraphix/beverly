import { describe, expect, it } from 'vitest';
import { fetchSparkMeterTelemetryPage } from '../sparkmeter-koios-v2.js';
import { createSparkMeterContractSandbox } from './fixtures/sparkmeter-contract-sandbox.js';

const organizationId = '64bfd8cd-d361-4368-98c9-c0ea3730559d';
const siteId = '11111111-1111-4111-8111-111111111111';

describe('SparkMeter local contract sandbox', () => {
    it('runs the documented Koios v2 read contract without network access', async () => {
        const sandbox = createSparkMeterContractSandbox({ scenario: 'synthetic-reading' });
        const result = await fetchSparkMeterTelemetryPage({
            baseUrl: 'https://www.sparkmeter.cloud', approvedHostnames: ['www.sparkmeter.cloud'],
            organizationId, apiKey: 'sandbox-key', apiSecret: 'sandbox-secret', sites: [siteId],
            mode: 'live', age: '15m', fetchFn: sandbox.fetch, validateEndpoint: async () => 'https://www.sparkmeter.cloud/',
        });

        expect(result.readings).toMatchObject([{
            externalSiteId: siteId, externalMeterId: 'SANDBOX-METER-001', energyKwh: 12.5,
            energyInterpretation: 'provider_total_unknown_semantics', state: 'on', type: 'customer',
        }]);
        expect(sandbox.requests).toHaveLength(1);
        expect(sandbox.requests[0]).toMatchObject({
            method: 'POST', path: `/api/v2/organizations/${organizationId}/data/live`,
            body: { per_page: 200, filters: { sites: [siteId], age: '15m' } },
        });
        expect(sandbox.requests[0]?.headers).toMatchObject({ 'X-API-KEY': 'sandbox-key', 'X-API-SECRET': 'sandbox-secret' });
    });

    it('keeps malformed telemetry quarantined in the local simulation', async () => {
        const sandbox = createSparkMeterContractSandbox({ scenario: 'malformed-reading' });
        const result = await fetchSparkMeterTelemetryPage({
            baseUrl: 'https://www.sparkmeter.cloud', approvedHostnames: ['www.sparkmeter.cloud'],
            organizationId, apiKey: 'sandbox-key', apiSecret: 'sandbox-secret', sites: [siteId],
            mode: 'live', fetchFn: sandbox.fetch, validateEndpoint: async () => 'https://www.sparkmeter.cloud/',
        });

        expect(result.readings).toHaveLength(0);
        expect(result.quarantine).toHaveLength(1);
    });

    it('does not define provider write or retry guarantees', () => {
        const sandbox = createSparkMeterContractSandbox({ scenario: 'empty' });
        expect(sandbox.capabilities).toEqual(['koios-v2-read-contract']);
        expect(sandbox.fetch).toBeTypeOf('function');
    });

    it('rejects financial write routes without recording or forwarding them', async () => {
        const sandbox = createSparkMeterContractSandbox({ scenario: 'empty' });
        const response = await sandbox.fetch('https://www.sparkmeter.cloud/api/v1/customers/123/payments', {
            method: 'POST',
            headers: { 'X-API-KEY': 'sandbox-key', 'X-API-SECRET': 'sandbox-secret' },
            body: JSON.stringify({ external_id: 'synthetic-command' }),
        });

        expect(response.status).toBe(404);
        expect(sandbox.requests).toHaveLength(0);
    });
});
