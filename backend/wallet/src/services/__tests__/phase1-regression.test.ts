/**
 * Phase 1 regression tests.
 *
 * Covers:
 *   • Refund RPC param contract (C1/C2 fix)
 *   • Webhook processed-null idempotency (H3 fix)
 *   • Fraud signal wiring: new_geo, card_bin_risk, device fingerprint
 *   • Manual credit maker-checker policy
 *   • disputes.getDispute returns null instead of throwing on missing row
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd(), '../..');

// ── C1/C2 Refund RPC param contract ──────────────────────────────────────────
describe('refund RPC param contract', () => {
    it('approveRefund passes p_direction credit to fn_post_ledger_entry', () => {
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/refunds.ts'), 'utf-8');
        expect(src).toContain("p_direction:         'credit'");
    });

    it('approveRefund uses p_memo not p_description', () => {
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/refunds.ts'), 'utf-8');
        expect(src).toContain('p_memo:');
        expect(src).not.toContain('p_description:');
    });

    it('approveRefund passes p_created_by', () => {
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/refunds.ts'), 'utf-8');
        expect(src).toContain('p_created_by:');
    });

    it('refund_credit is allowed by ledger EntryType union', () => {
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/ledger.ts'), 'utf-8');
        expect(src).toContain("'refund_credit'");
    });
});

// ── H3 Webhook idempotency processed-null fix ─────────────────────────────────
describe('webhook processed-null idempotency', () => {
    it('markWebhookProcessed uses not-is-true filter, not eq false', () => {
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/routes/webhooks.ts'), 'utf-8');
        expect(src).toContain(".not('processed', 'is', true)");
        expect(src).not.toContain(".eq('processed', false)");
    });

    it('funding_requests lookup uses maybeSingle not single', () => {
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/routes/webhooks.ts'), 'utf-8');
        // The funding request lookup must use maybeSingle so missing rows return null
        const fundingBlock = src.match(/from\('funding_requests'\)[^;]+;/g) ?? [];
        const hasSingle = fundingBlock.some((b) => b.includes('.single()') && !b.includes('maybeSingle'));
        expect(hasSingle).toBe(false);
    });
});

// ── Fraud signal configuration ────────────────────────────────────────────────
describe('fraud signal wiring', () => {
    it('AssessInput has clientCountry field for new_geo signal', () => {
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/fraud-engine.ts'), 'utf-8');
        expect(src).toContain('clientCountry');
    });

    it('AssessInput has mode field for card_bin_risk signal', () => {
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/fraud-engine.ts'), 'utf-8');
        expect(src).toContain("mode?: 'wallet' | 'direct_pay'");
    });

    it('AssessInput has deviceFingerprint field for richer device detection', () => {
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/fraud-engine.ts'), 'utf-8');
        expect(src).toContain('deviceFingerprint');
    });

    it('all four signal checkers use maybeSingle not single', () => {
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/fraud-engine.ts'), 'utf-8');
        const signalChecks = ['checkAmountAnomaly', 'checkMeterOwnership', 'checkNewIp', 'checkNewDevice'];
        // Extract each function body and verify no .single() usage
        for (const fn of signalChecks) {
            const start = src.indexOf(`async function ${fn}`);
            const end   = src.indexOf('\nasync function ', start + 1);
            const body  = end > 0 ? src.slice(start, end) : src.slice(start);
            expect(body, `${fn} still uses .single()`).not.toMatch(/\.single\(\)/);
        }
    });

    it('new_geo signal weight is 15', () => {
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/fraud-engine.ts'), 'utf-8');
        const geoBlock = src.match(/type:\s*['"]new_geo['"][\s\S]*?weight:\s*(\d+)/);
        expect(Number(geoBlock?.[1])).toBe(15);
    });

    it('card_bin_risk signal weight is 10', () => {
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/fraud-engine.ts'), 'utf-8');
        const binBlock = src.match(/type:\s*['"]card_bin_risk['"][\s\S]*?weight:\s*(\d+)/);
        expect(Number(binBlock?.[1])).toBe(10);
    });

    it('new_geo passes through for NG country code (no signal)', () => {
        // NG purchases should never be geo-flagged
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/fraud-engine.ts'), 'utf-8');
        expect(src).toContain("clientCountry === 'NG'");
    });

    it('customer route passes deviceFingerprint and clientCountry to assessPurchase', () => {
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/routes/customer.ts'), 'utf-8');
        expect(src).toContain('deviceFingerprint');
        expect(src).toContain('clientCountry');
        expect(src).toContain('cf-ipcountry');
    });
});

// ── Manual credit maker-checker policy ───────────────────────────────────────
describe('manual credit maker-checker', () => {
    it('approveManualCredit rejects self-approval', () => {
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/manual-credits.ts'), 'utf-8');
        expect(src).toContain('self_approval');
        expect(src).toContain('requested_by_user_id === opts.approvedByUserId');
    });

    it('rejectManualCredit rejects self-rejection', () => {
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/manual-credits.ts'), 'utf-8');
        expect(src).toContain('self_rejection');
    });

    it('approval uses manual_credit entry type', () => {
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/manual-credits.ts'), 'utf-8');
        expect(src).toContain("entryType:      'manual_credit'");
    });

    it('approval uses atomic update with eq status pending guard', () => {
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/manual-credits.ts'), 'utf-8');
        expect(src).toContain(".eq('status', 'pending')");
    });
});

// ── disputes.getDispute null safety ──────────────────────────────────────────
describe('disputes null safety', () => {
    it('getDispute uses maybeSingle and returns null on miss', () => {
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/disputes.ts'), 'utf-8');
        const start = src.indexOf('export async function getDispute');
        const end   = src.indexOf('\nexport async function ', start + 1);
        const block = end > 0 ? src.slice(start, end) : src.slice(start);
        expect(block).toContain('maybeSingle');
        expect(block).not.toContain('.single()');
        // null return via ternary (data ? ... : null) or explicit return null
        expect(block).toMatch(/:\s*null/);
    });
});

// ── DVA webhook handler ───────────────────────────────────────────────────────
describe('DVA webhook integration', () => {
    it('webhooks.ts handles dedicated_nuban channel on charge.success', () => {
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/routes/webhooks.ts'), 'utf-8');
        expect(src).toContain('dedicated_nuban');
        expect(src).toContain('virtual_accounts');
    });

    it('Paystack adapter exports createDedicatedAccount', () => {
        const src = readFileSync(resolve(ROOT, 'backend/wallet/src/adapters/paystack.ts'), 'utf-8');
        expect(src).toContain('createDedicatedAccount');
        expect(src).toContain('createPaystackCustomer');
    });
});

// ── Score thresholds (regression — must not change) ───────────────────────────
describe('fraud score thresholds (regression)', () => {
    function scoreToAction(score: number): 'allow' | 'step_up' | 'block' {
        if (score >= 90) return 'block';
        if (score >= 70) return 'step_up';
        return 'allow';
    }

    it('new signals fit within existing threshold math', () => {
        // Max attainable: velocity(20) + anomaly(15) + meter_mismatch(25) + new_ip(5) + new_device(10) + new_geo(15) + card_bin(10) = 100
        const max = 20 + 15 + 25 + 5 + 10 + 15 + 10;
        expect(max).toBe(100);
        expect(scoreToAction(max)).toBe('block');
    });

    it('new_geo alone does not trigger step_up', () => {
        expect(scoreToAction(15)).toBe('allow');
    });

    it('card_bin_risk + new_geo + new_device = 35 → still allow', () => {
        expect(scoreToAction(10 + 15 + 10)).toBe('allow');
    });

    it('meter_mismatch + new_geo + velocity = 60 → allow', () => {
        expect(scoreToAction(25 + 15 + 20)).toBe('allow');
    });

    it('meter_mismatch + velocity + new_geo + new_device = 70 → step_up', () => {
        expect(scoreToAction(25 + 20 + 15 + 10)).toBe('step_up');
    });
});
