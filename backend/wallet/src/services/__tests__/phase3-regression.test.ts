/**
 * Current regression coverage for compliance and durable wallet operations.
 *
 * The original Phase 3 suite asserted an old, in-process cron/UI design. The
 * wallet now runs durable workers and keeps the compliance services as the
 * operational contract, so these tests deliberately cover that architecture.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd(), '../..');
const source = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

describe('compliance services', () => {
    const ctr = source('backend/wallet/src/services/compliance-ctr.ts');
    const aml = source('backend/wallet/src/services/aml-screening.ts');
    const kyc = source('backend/wallet/src/services/kyc-documents.ts');

    it('retains the CTR generation and reporting contract', () => {
        expect(ctr).toContain('CTR_THRESHOLD_MINOR = 500_000_000');
        expect(ctr).toContain('export async function maybeGenerateCtr');
        expect(ctr).toContain('export async function fileCtr');
        expect(ctr).toContain('export async function buildCbnReport');
    });

    it('retains AML screening and sanctions management', () => {
        expect(aml).toContain('export async function screenEntity');
        expect(aml).toContain('export async function reviewScreening');
        expect(aml).toContain('export async function addSanctionsEntry');
        expect(aml).toContain('trigramSimilarity');
    });

    it('retains signed KYC document handling', () => {
        expect(kyc).toContain('wallet-kyc-documents');
        expect(kyc).toContain('export async function generateUploadUrl');
        expect(kyc).toContain('export async function reviewDocument');
        expect(kyc).toContain('10 * 1024 * 1024');
    });
});

describe('compliance storage', () => {
    it('keeps the required database migrations', () => {
        const compliance = source('supabase/migrations/20260529150000_compliance_ctr_aml.sql');
        const documents = source('supabase/migrations/20260529160000_kyc_documents.sql');
        const disputes = source('supabase/migrations/20260529165000_disputes_sla.sql');

        expect(compliance).toContain('currency_transaction_reports');
        expect(compliance).toContain('aml_screening_results');
        expect(documents).toContain('kyc_documents');
        expect(disputes).toContain('sla_deadline');
        expect(disputes).toContain('escalated_at');
    });
});

describe('durable operations', () => {
    const scheduler = source('backend/wallet/src/jobs/scheduler.ts');
    const queue = source('backend/wallet/src/queue/index.ts');

    it('reconciles payment transactions through the durable scheduler entrypoint', () => {
        expect(scheduler).toContain('export async function sweepPendingPayments');
        expect(scheduler).toContain('fulfillSuccessfulPaystackTransaction');
        expect(scheduler).toContain('markUnsuccessfulPaystackTransaction');
        expect(scheduler).toContain('In-process scheduling is retired');
    });

    it('defines the queues used by workers and closes them cleanly', () => {
        expect(queue).toContain("new Queue('notifications'");
        expect(queue).toContain("new Queue('payments'");
        expect(queue).toContain("new Queue('holds'");
        expect(queue).toContain('export async function closeQueues');
    });

    it('keeps the load-test utility available', () => {
        const path = resolve(ROOT, 'tools/load-test.cjs');
        expect(existsSync(path)).toBe(true);
        const loadTest = readFileSync(path, 'utf8');
        expect(loadTest).toContain('/api/v1/health');
        expect(loadTest).toContain('p99 < 1000');
    });
});
