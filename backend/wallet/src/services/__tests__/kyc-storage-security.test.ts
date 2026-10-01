import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSignedUploadUrl = vi.fn();
const createSignedUrl = vi.fn();
const list = vi.fn();
const download = vi.fn();
const remove = vi.fn();
const insertSingle = vi.fn();
const maybeSingle = vi.fn();
const mutations: Array<{ table: string; operation: string; value?: unknown }> = [];
const { runMalwareScan } = vi.hoisted(() => ({ runMalwareScan: vi.fn() }));

class Query {
    private operation = 'select';
    private value: unknown;
    constructor(private table: string) {}
    select() { return this; }
    eq() { return this; }
    insert(value: unknown) { this.operation = 'insert'; this.value = value; return this; }
    update(value: unknown) { this.operation = 'update'; this.value = value; return this; }
    delete() { this.operation = 'delete'; return this; }
    single() { return insertSingle(); }
    maybeSingle() { return maybeSingle(); }
    then(resolve: (value: unknown) => unknown) {
        mutations.push({ table: this.table, operation: this.operation, value: this.value });
        return Promise.resolve({ data: null, error: null }).then(resolve);
    }
}

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        from: (table: string) => new Query(table),
        storage: {
            from: () => ({ createSignedUploadUrl, createSignedUrl, list, download, remove }),
        },
    },
}));
vi.mock('../notifications.js', () => ({ notifyKycUpdate: vi.fn(), sendNotification: vi.fn() }));
vi.mock('../file-scan.js', () => ({ runMalwareScan }));

describe('KYC storage security', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mutations.length = 0;
        insertSingle.mockResolvedValue({ data: { id: 'document-1' }, error: null });
        createSignedUploadUrl.mockResolvedValue({ data: { signedUrl: 'https://upload.test/document-1' }, error: null });
        createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://preview.test/document-1' }, error: null });
        remove.mockResolvedValue({ data: [], error: null });
        list.mockResolvedValue({ data: [{ name: 'document-1.pdf' }], error: null });
        download.mockResolvedValue({ data: new Blob(['%PDF-1.7']), error: null });
        runMalwareScan.mockResolvedValue({ ok: true, mode: 'command' });
    });

    it('issues private upload URLs after metadata creation', async () => {
        const { createKycUpload } = await import('../kyc-reviews.js');
        const created = await createKycUpload({
            subjectType: 'customer', subjectId: 'customer-1', documentType: 'passport',
            requestedTier: 1, mimeType: 'application/pdf', sizeBytes: 8,
        });
        expect(created).toMatchObject({ documentId: 'document-1', uploadUrl: 'https://upload.test/document-1' });
        expect(createSignedUploadUrl).toHaveBeenCalledOnce();
    });

    it('removes metadata when upload signing fails', async () => {
        const { createKycUpload } = await import('../kyc-reviews.js');
        createSignedUploadUrl.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
        await expect(createKycUpload({
            subjectType: 'customer', subjectId: 'customer-1', documentType: 'passport',
            requestedTier: 1, mimeType: 'application/pdf', sizeBytes: 8,
        })).rejects.toMatchObject({ code: 'document_upload_unavailable' });
        expect(mutations).toEqual(expect.arrayContaining([{ table: 'kyc_documents', operation: 'delete', value: undefined }]));
    });

    it('removes changed uploads during activation', async () => {
        const { activateKycUpload } = await import('../kyc-reviews.js');
        maybeSingle.mockResolvedValue({ data: {
            id: 'document-1', storage_path: 'customer/customer-1/document-1.pdf',
            size_bytes: 8, mime_type: 'application/pdf', uploaded_at: null,
        }, error: null });
        list.mockResolvedValue({ data: [{ name: 'document-1.pdf' }], error: null });
        download.mockResolvedValue({ data: new Blob(['%PDF-1.7-extra']), error: null });
        await expect(activateKycUpload({
            subjectType: 'customer', subjectId: 'customer-1', documentId: 'document-1',
        })).rejects.toMatchObject({ code: 'document_size_mismatch' });
        expect(remove).toHaveBeenCalledWith(['customer/customer-1/document-1.pdf']);
        expect(mutations).toEqual(expect.arrayContaining([{ table: 'kyc_documents', operation: 'delete', value: undefined }]));
    });

    it('accepts documents for manual review when scanning is unavailable', async () => {
        const { activateKycUpload } = await import('../kyc-reviews.js');
        maybeSingle.mockResolvedValue({ data: {
            id: 'document-1', storage_path: 'customer/customer-1/document-1.pdf',
            size_bytes: 8, mime_type: 'application/pdf', uploaded_at: null,
        }, error: null });
        runMalwareScan.mockResolvedValue({
            ok: false, mode: 'disabled', reason: 'unavailable', scanReason: 'scanner_not_configured',
        });

        await expect(activateKycUpload({
            subjectType: 'customer', subjectId: 'customer-1', documentId: 'document-1',
        })).resolves.toMatchObject({ scanStatus: 'unscanned', scanReason: 'scanner_not_configured' });
        expect(remove).not.toHaveBeenCalled();
        expect(mutations).toEqual(expect.arrayContaining([
            expect.objectContaining({
                table: 'kyc_documents', operation: 'update',
                value: expect.objectContaining({ security_scan_status: 'unscanned', security_scan_reason: 'scanner_not_configured' }),
            }),
        ]));
    });

    it('records clean scans without approving KYC', async () => {
        const { activateKycUpload } = await import('../kyc-reviews.js');
        maybeSingle.mockResolvedValue({ data: {
            id: 'document-1', storage_path: 'customer/customer-1/document-1.pdf',
            size_bytes: 8, mime_type: 'application/pdf', uploaded_at: null,
        }, error: null });

        await expect(activateKycUpload({
            subjectType: 'customer', subjectId: 'customer-1', documentId: 'document-1',
        })).resolves.toMatchObject({ scanStatus: 'clean', scanReason: null });
        expect(mutations).toEqual(expect.arrayContaining([
            expect.objectContaining({
                table: 'kyc_documents', operation: 'update',
                value: expect.objectContaining({ security_scan_status: 'clean', security_scan_reason: null }),
            }),
        ]));
    });

    it('marks intentionally disabled local scanning as unscanned', async () => {
        const { activateKycUpload } = await import('../kyc-reviews.js');
        maybeSingle.mockResolvedValue({ data: {
            id: 'document-1', storage_path: 'vendor/vendor-1/document-1.pdf',
            size_bytes: 8, mime_type: 'application/pdf', uploaded_at: null,
        }, error: null });
        runMalwareScan.mockResolvedValue({ ok: true, mode: 'disabled' });

        await expect(activateKycUpload({
            subjectType: 'vendor', subjectId: 'vendor-1', documentId: 'document-1',
        })).resolves.toMatchObject({ scanStatus: 'unscanned', scanReason: 'scanner_disabled' });
    });

    it('blocks infected files without making an identity decision', async () => {
        const { activateKycUpload } = await import('../kyc-reviews.js');
        maybeSingle.mockResolvedValue({ data: {
            id: 'document-1', storage_path: 'vendor/vendor-1/document-1.pdf',
            size_bytes: 8, mime_type: 'application/pdf', uploaded_at: null,
        }, error: null });
        runMalwareScan.mockResolvedValue({
            ok: false, mode: 'command', reason: 'infected', scanReason: 'malware_detected',
        });

        await expect(activateKycUpload({
            subjectType: 'vendor', subjectId: 'vendor-1', documentId: 'document-1',
        })).rejects.toMatchObject({ code: 'document_malware_detected', status: 422 });
        expect(remove).toHaveBeenCalledWith(['vendor/vendor-1/document-1.pdf']);
        expect(mutations).toEqual(expect.arrayContaining([
            { table: 'kyc_documents', operation: 'delete', value: undefined },
        ]));
    });

    it('limits document previews to five minutes', async () => {
        const { getKycReviewDocumentUrl } = await import('../kyc-reviews.js');
        maybeSingle.mockResolvedValue({ data: {
            storage_path: 'customer/customer-1/document-1.pdf', uploaded_at: '2026-09-09T12:00:00Z',
        }, error: null });
        await expect(getKycReviewDocumentUrl('document-1')).resolves.toBe('https://preview.test/document-1');
        expect(createSignedUrl).toHaveBeenCalledWith('customer/customer-1/document-1.pdf', 300);
    });
});
