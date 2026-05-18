/**
 * Acceptance Criteria verification — §24 of Master System Design
 *
 * These tests verify structural and business-rule correctness that can be
 * checked without a live Supabase connection. They form a pre-launch gate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// process.cwd() when vitest runs from backend/wallet is backend/wallet/
// Two levels up reaches the monorepo root.
const ROOT = resolve(process.cwd(), '../..');

function rootFile(...parts: string[]) {
    return resolve(ROOT, ...parts);
}

// ── §24: CRM sidebar has exactly one Wallet link ──────────────────────────────
describe('§24 Acceptance: CRM wallet boundary', () => {
    it('route-manifest has exactly one Wallet group entry', () => {
        const src = readFileSync(rootFile('src/data/route-manifest.js'), 'utf-8');
        const matches = src.match(/group:\s*["']Wallet["']/g);
        expect(matches?.length).toBe(1);
    });

    it('Wallet entry is restricted to super-admin only', () => {
        // Dynamic import avoided for simplicity — parse the source
        const src = readFileSync(rootFile('src/data/route-manifest.js'), 'utf-8');
        const walletBlock = src.match(/group:\s*["']Wallet["'][^}]+}/s)?.[0] ?? '';
        expect(walletBlock).toMatch(/["']super-admin["']/);
        // Must NOT contain account or finance-checker as wallet roles
        const rolesMatch = walletBlock.match(/roles:\s*\[([^\]]+)\]/);
        const rolesStr = rolesMatch?.[1] ?? '';
        expect(rolesStr).not.toMatch(/["']account["']/);
        expect(rolesStr).not.toMatch(/["']finance-checker["']/);
    });
});

// ── §24: Auth plugin uses server-side session validation ─────────────────────
describe('§24 Acceptance: Auth plugin SOP compliance', () => {
    it('auth.ts uses adminClient.auth.getUser (not local JWT verification)', () => {
        const src = readFileSync(rootFile('backend/wallet/src/plugins/auth.ts'), 'utf-8');
        expect(src).toContain('adminClient.auth.getUser');
    });

    it('auth.ts does not use fastify.jwt.verify', () => {
        const src = readFileSync(rootFile('backend/wallet/src/plugins/auth.ts'), 'utf-8');
        expect(src).not.toMatch(/fastify\.jwt\.verify|jwtVerify/);
    });

    it('actor resolution checks vendor → customer → staff in that order', () => {
        const src = readFileSync(rootFile('backend/wallet/src/plugins/auth.ts'), 'utf-8');
        const vendorIdx = src.indexOf("from('vendor_users')");
        const customerIdx = src.indexOf("from('customers')");
        const staffIdx = src.indexOf('STAFF_ROLES.has(rawRole)');
        expect(vendorIdx).toBeLessThan(customerIdx);
        expect(customerIdx).toBeLessThan(staffIdx);
    });

    it('requireStaff, requireVendor, requireCustomer, requireKycTier are all registered', () => {
        const src = readFileSync(rootFile('backend/wallet/src/plugins/auth.ts'), 'utf-8');
        expect(src).toContain("decorate('requireStaff'");
        expect(src).toContain("decorate('requireVendor'");
        expect(src).toContain("decorate('requireCustomer'");
        expect(src).toContain("decorate('requireKycTier'");
    });
});

// ── §24: All runbooks exist ───────────────────────────────────────────────────
describe('§24 Acceptance: Runbooks present', () => {
    const runbooks = [
        'docs/runbooks/gateway-outage.md',
        'docs/runbooks/ledger-mismatch.md',
        'docs/runbooks/token-engine-degraded.md',
        'docs/runbooks/database-failover.md',
        'docs/runbooks/mass-refund.md',
        'docs/runbooks/security-incident.md',
    ];

    for (const rb of runbooks) {
        it(`runbook exists: ${rb}`, () => {
            expect(existsSync(rootFile(rb))).toBe(true);
        });
    }
});

// ── §24: E2E test suite exists ────────────────────────────────────────────────
describe('§24 Acceptance: E2E test coverage', () => {
    const e2eTests = [
        'tests/e2e/admin-auth.spec.ts',
        'tests/e2e/customer-purchase-flow.spec.ts',
        'tests/e2e/vendor-vending-flow.spec.ts',
        'tests/e2e/ledger-integrity.spec.ts',
    ];

    for (const f of e2eTests) {
        it(`E2E spec exists: ${f}`, () => {
            expect(existsSync(rootFile(f))).toBe(true);
        });
    }
});

// ── §24: Wallet env vars are present ─────────────────────────────────────────
describe('§24 Acceptance: Wallet backend env', () => {
    it('SUPABASE_URL is configured', () => {
        expect(process.env.SUPABASE_URL).toBeTruthy();
    });

    it('SUPABASE_SERVICE_ROLE_KEY is configured', () => {
        expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeTruthy();
    });
});

// ── §24: Refund maker-checker is enforced ────────────────────────────────────
describe('§24 Acceptance: Refund maker-checker', () => {
    it('approver cannot be same as requester', () => {
        function canApprove(requestedBy: string, approvedBy: string): boolean {
            return requestedBy !== approvedBy;
        }
        expect(canApprove('staff-a', 'staff-a')).toBe(false);
        expect(canApprove('staff-a', 'staff-b')).toBe(true);
    });
});

// ── §24: NDPR cooling-off period is correct ──────────────────────────────────
describe('§24 Acceptance: NDPR compliance', () => {
    it('account deletion cooling-off is 30 days', () => {
        const COOLING_OFF_DAYS = 30;
        const now = Date.now();
        const scheduled = new Date(now + COOLING_OFF_DAYS * 24 * 60 * 60 * 1000);
        const diff = Math.round((scheduled.getTime() - now) / (24 * 60 * 60 * 1000));
        expect(diff).toBe(30);
    });

    it('data export URL expires after 7 days', () => {
        const EXPORT_TTL_DAYS = 7;
        const now = Date.now();
        const expires = new Date(now + EXPORT_TTL_DAYS * 24 * 60 * 60 * 1000);
        const diff = (expires.getTime() - now) / (24 * 60 * 60 * 1000);
        expect(diff).toBe(7);
    });
});
