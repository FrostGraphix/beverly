import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSignedUploadUrl = vi.fn();
const createSignedUrl = vi.fn();
const list = vi.fn();
const download = vi.fn();
const remove = vi.fn();
const insertSingle = vi.fn();
const maybeSingle = vi.fn();
const mutations: Array<{ table: string; operation: string; value?: unknown }> = [];

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
vi.mock('../file-scan.js', () => ({ runMalwareScan: vi.fn(async () => ({ ok: true, mode: 'disabled' })) }));

describe('KYC storage security', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mutations.length = 0;
        insertSingle.mockResolvedValue({ data: { id: 'document-1' }, error: null });
        createSignedUploadUrl.mockResolvedValue({ data: { signedUrl: 'https://upload.test/document-1' }, error: null });
        createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://preview.test/document-1' }, error: null });
        remove.mockResolvedValue({ data: [], error: null });
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

    it('limits document previews to five minutes', async () => {
        const { getKycReviewDocumentUrl } = await import('../kyc-reviews.js');
        maybeSingle.mockResolvedValue({ data: {
            storage_path: 'customer/customer-1/document-1.pdf', uploaded_at: '2026-09-09T12:00:00Z',
        }, error: null });
        await expect(getKycReviewDocumentUrl('document-1')).resolves.toBe('https://preview.test/document-1');
        expect(createSignedUrl).toHaveBeenCalledWith('customer/customer-1/document-1.pdf', 300);
    });
});
