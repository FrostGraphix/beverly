import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
let documents: any[] = [];
let queryCalls: Array<{ table: string; method: string; value?: unknown }> = [];

class Query {
    constructor(private table: string) {}
    select() { return this; }
    in() { return this; }
    eq() { return this; }
    or(value: string) { queryCalls.push({ table: this.table, method: 'or', value }); return this; }
    order() { return this; }
    limit() { return this; }
    gt() { return this; }
    then(resolve: (value: any) => any) {
        return Promise.resolve({ data: this.table === 'kyc_documents' ? documents : [], error: null }).then(resolve);
    }
}

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        from: (table: string) => new Query(table),
        rpc,
        storage: { from: () => ({}) },
    },
}));
vi.mock('../notifications.js', () => ({ notifyKycUpdate: vi.fn(), sendNotification: vi.fn() }));
vi.mock('../file-scan.js', () => ({ runMalwareScan: vi.fn(async () => ({ ok: true, mode: 'disabled' })) }));

describe('KYC review evidence rules', () => {
    beforeEach(() => {
        documents = [];
        queryCalls = [];
        rpc.mockReset();
        rpc.mockResolvedValue({ data: { id: 'review-1', status: 'pending' }, error: null });
    });

    it('recognizes only matching file signatures', async () => {
        const { hasExpectedFileSignature } = await import('../kyc-reviews.js');
        expect(hasExpectedFileSignature(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg')).toBe(true);
        expect(hasExpectedFileSignature(Buffer.from('%PDF-1.7'), 'application/pdf')).toBe(true);
        expect(hasExpectedFileSignature(Buffer.from('not a pdf'), 'application/pdf')).toBe(false);
        expect(hasExpectedFileSignature(Buffer.from('%PDF-1.7'), 'image/jpeg')).toBe(false);
    });

    it('rejects every tier elevation without identity and selfie', async () => {
        const { submitKycReview } = await import('../kyc-reviews.js');
        documents = [
            { id: 'doc-1', doc_type: 'national_id', uploaded_at: '2026-09-09T00:00:00Z', review_request_id: null },
            { id: 'doc-2', doc_type: 'passport', uploaded_at: '2026-09-09T00:00:00Z', review_request_id: null },
        ];
        await expect(submitKycReview({
            subjectType: 'customer', subjectId: 'customer-1', requestedTier: 1,
            submittedBy: 'user-1', submission: {}, documentIds: ['doc-1', 'doc-2'],
        })).rejects.toMatchObject({ code: 'documents_required' });
        expect(rpc).not.toHaveBeenCalled();
    });

    it('rejects Tier 2 without address evidence', async () => {
        const { submitKycReview } = await import('../kyc-reviews.js');
        documents = [
            { id: 'doc-1', doc_type: 'national_id', uploaded_at: '2026-09-09T00:00:00Z', review_request_id: null },
            { id: 'doc-2', doc_type: 'selfie', uploaded_at: '2026-09-09T00:00:00Z', review_request_id: null },
            { id: 'doc-3', doc_type: 'passport', uploaded_at: '2026-09-09T00:00:00Z', review_request_id: null },
        ];
        await expect(submitKycReview({
            subjectType: 'customer', subjectId: 'customer-1', requestedTier: 2,
            submittedBy: 'user-1', submission: {}, documentIds: ['doc-1', 'doc-2', 'doc-3'],
        })).rejects.toMatchObject({ code: 'address_document_required' });
        expect(rpc).not.toHaveBeenCalled();
    });

    it('submits ready identity and selfie atomically', async () => {
        const { submitKycReview } = await import('../kyc-reviews.js');
        documents = [
            { id: 'doc-1', doc_type: 'national_id', uploaded_at: '2026-09-09T00:00:00Z', review_request_id: null },
            { id: 'doc-2', doc_type: 'selfie', uploaded_at: '2026-09-09T00:00:00Z', review_request_id: null },
            { id: 'doc-3', doc_type: 'utility_bill', uploaded_at: '2026-09-09T00:00:00Z', review_request_id: null },
        ];
        await expect(submitKycReview({
            subjectType: 'vendor', subjectId: 'vendor-1', requestedTier: 2,
            submittedBy: 'user-1', submission: { method: 'manual_document_review' }, documentIds: ['doc-1', 'doc-2', 'doc-3'],
        })).resolves.toMatchObject({ id: 'review-1', status: 'pending' });
        expect(rpc).toHaveBeenCalledWith('submit_kyc_enhanced_review', expect.objectContaining({
            p_subject_type: 'vendor',
            p_requested_tier: 2,
            p_submission: expect.objectContaining({ document_ids: ['doc-1', 'doc-2', 'doc-3'] }),
        }));
    });

    it('sends unscanned evidence to manual review without granting KYC approval', async () => {
        const { submitKycReview } = await import('../kyc-reviews.js');
        documents = [
            { id: 'doc-1', doc_type: 'national_id', uploaded_at: '2026-09-25T00:00:00Z', security_scan_status: 'unscanned' },
            { id: 'doc-2', doc_type: 'selfie', uploaded_at: '2026-09-25T00:00:00Z', security_scan_status: 'unscanned' },
        ];

        await expect(submitKycReview({
            subjectType: 'customer', subjectId: 'customer-1', requestedTier: 1,
            submittedBy: 'user-1', submission: { method: 'manual_document_review' }, documentIds: ['doc-1', 'doc-2'],
        })).resolves.toMatchObject({ id: 'review-1', status: 'pending' });
        expect(rpc).toHaveBeenCalledOnce();
        expect(rpc).toHaveBeenCalledWith('submit_kyc_evidence_review', expect.objectContaining({
            p_subject_type: 'customer', p_requested_tier: 1,
        }));
        expect(rpc).not.toHaveBeenCalledWith('review_kyc_tier_request', expect.anything());
    });

    it('scopes review pagination before rows are selected', async () => {
        const { listKycReviews } = await import('../kyc-reviews.js');
        await listKycReviews({
            status: 'pending', customerIds: ['customer-1'], vendorIds: ['vendor-1'], limit: 50,
        });
        expect(queryCalls).toContainEqual({
            table: 'kyc_review_requests', method: 'or',
            value: 'customer_id.in.(customer-1),vendor_organization_id.in.(vendor-1)',
        });
    });
});

describe('KYC database guardrails', () => {
    const migration = readFileSync(resolve(process.cwd(), '../..', 'supabase/migrations/20260909120000_kyc_tier_review_pipeline.sql'), 'utf8');
    const tierZeroPolicy = readFileSync(resolve(process.cwd(), '../..', 'supabase/migrations/20260909130000_kyc_tier_zero_policy.sql'), 'utf8');
    const tierTwoEvidence = readFileSync(resolve(process.cwd(), '../..', 'supabase/migrations/20260909132000_kyc_tier_two_evidence.sql'), 'utf8');

    it('enforces sequential atomic review decisions', () => {
        expect(migration).toContain('kyc_review_sequential_tier_check');
        expect(migration).toContain('for update');
        expect(migration).toContain('kyc_tier_changed_since_submission');
        expect(migration).toContain('wallet_audit_log');
    });

    it('restricts RPC execution and validates evidence types', () => {
        expect(migration).toContain('revoke all on function public.submit_kyc_tier_review');
        expect(migration).toContain('grant execute on function public.review_kyc_tier_request');
        expect(migration).toContain("doc_type in ('national_id', 'voters_card', 'passport', 'drivers_license')");
        expect(migration).toContain("doc_type = 'selfie'");
    });

    it('keeps Tier 0 basic information approval-free', () => {
        expect(tierZeroPolicy).toContain('save_customer_kyc_basic_info');
        expect(tierZeroPolicy).toContain("'kyc.tier0.basic_info_saved'");
        expect(tierZeroPolicy).toContain('submit_kyc_evidence_review');
        expect(tierZeroPolicy).toContain('kyc_basic_info_required');
        expect(tierZeroPolicy).toContain('kyc_identity_and_selfie_required');
    });

    it('requires address evidence for Tier 2', () => {
        expect(tierTwoEvidence).toContain('submit_kyc_enhanced_review');
        expect(tierTwoEvidence).toContain("d.doc_type in ('utility_bill', 'bank_statement')");
        expect(tierTwoEvidence).toContain('kyc_address_document_required');
    });
});

describe('KYC least-privilege defaults', () => {
    it('keeps sensitive review authority with operations', async () => {
        const { DEFAULT_ROLE_PERMISSIONS } = await import('../rbac.js');
        expect(DEFAULT_ROLE_PERMISSIONS['operations-manager']).toEqual(expect.arrayContaining(['wallet.kyc.view', 'wallet.kyc.review']));
        expect(DEFAULT_ROLE_PERMISSIONS['finance-checker']).not.toContain('wallet.kyc.review');
        expect(DEFAULT_ROLE_PERMISSIONS.account).not.toContain('wallet.kyc.view');
    });
});
