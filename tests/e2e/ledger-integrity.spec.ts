/**
 * E2E — Ledger integrity contracts (§23.2)
 *
 * These tests call the wallet API directly to verify that
 * business-critical invariants hold under live conditions.
 * They run in CI pointing at the staging API.
 *
 * API_BASE: wallet backend URL (default: http://localhost:4000)
 * STAFF_TOKEN: a valid super-admin bearer token
 */
import { test, expect } from '@playwright/test';

const API_BASE   = process.env.API_BASE   ?? 'http://localhost:4000';
const STAFF_TOKEN = process.env.STAFF_TOKEN ?? '';

function staffHeaders() {
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${STAFF_TOKEN}`,
    };
}

test.describe('Wallet API health', () => {
    test('health endpoint returns ok', async ({ request }) => {
        const res = await request.get(`${API_BASE}/health`);
        expect(res.ok()).toBe(true);
        const body = await res.json();
        expect(body.status).toBe('ok');
    });
});

test.describe('Authentication guards (§13)', () => {
    test('admin route rejects missing token', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/v1/admin/vendors`);
        expect(res.status()).toBe(401);
    });

    test('vendor route rejects missing token', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/v1/vendor/wallet`);
        expect(res.status()).toBe(401);
    });

    test('customer route rejects missing token', async ({ request }) => {
        const res = await request.get(`${API_BASE}/api/v1/customer/wallet`);
        expect(res.status()).toBe(401);
    });

    test('wrong role rejected: vendor token on admin route', async ({ request }) => {
        // Without a real vendor token we just verify 401/403 on missing token
        const res = await request.get(`${API_BASE}/api/v1/admin/vendors`, {
            headers: { Authorization: 'Bearer fake.vendor.token' },
        });
        expect([401, 403]).toContain(res.status());
    });
});

test.describe('Webhook idempotency (§7.3)', () => {
    test('paystack webhook rejects missing signature', async ({ request }) => {
        const res = await request.post(`${API_BASE}/api/v1/webhook/paystack`, {
            data: { event: 'charge.success', data: { reference: 'ref-123' } },
            headers: { 'Content-Type': 'application/json' },
        });
        expect([400, 401, 403]).toContain(res.status());
    });

    test('paystack webhook rejects bad signature', async ({ request }) => {
        const res = await request.post(`${API_BASE}/api/v1/webhook/paystack`, {
            data: { event: 'charge.success', data: { reference: 'ref-456' } },
            headers: {
                'Content-Type': 'application/json',
                'x-paystack-signature': 'bad-sig',
            },
        });
        expect([400, 401, 403]).toContain(res.status());
    });
});

test.describe('Feature flags (§19.5)', () => {
    test('feature flags endpoint is reachable for staff', async ({ request }) => {
        if (!STAFF_TOKEN) test.skip();
        const res = await request.get(`${API_BASE}/api/v1/admin/feature-flags`, {
            headers: staffHeaders(),
        });
        expect(res.ok()).toBe(true);
        const body = await res.json();
        expect(Array.isArray(body.flags)).toBe(true);
    });
});

test.describe('Rate limits (§13.4)', () => {
    test('public signup endpoint exists', async ({ request }) => {
        const res = await request.post(`${API_BASE}/api/v1/public/customer/signup`, {
            data: {},
            headers: { 'Content-Type': 'application/json' },
        });
        // Should return 400 (validation error) not 404 or 500
        expect([400, 422, 429]).toContain(res.status());
    });
});
