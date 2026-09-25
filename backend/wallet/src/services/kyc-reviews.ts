import { adminClient } from '../db/supabase.js';
import { notifyKycUpdate, sendNotification } from './notifications.js';
import { notifyVendor } from './vendor-notifications.js';
import { notifyOperationalStaff } from './operational-notifications.js';
import { runMalwareScan } from './file-scan.js';

const KYC_BUCKET = 'wallet-kyc-documents';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const IDENTITY_TYPES = new Set(['national_id', 'voters_card', 'passport', 'drivers_license']);
const ADDRESS_TYPES = new Set(['utility_bill', 'bank_statement']);

export type KycSubjectType = 'customer' | 'vendor';
export type KycDecision = 'approved' | 'rejected';
export type KycDocumentType = 'national_id' | 'voters_card' | 'passport' | 'drivers_license' | 'utility_bill' | 'bank_statement' | 'selfie' | 'signature';

export class KycReviewError extends Error {
    constructor(message: string, public code: string, public status = 422) {
        super(message);
        this.name = 'KycReviewError';
    }
}

function extForMime(mimeType: string): string {
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/webp') return 'webp';
    return 'jpg';
}

function ownerColumn(subjectType: KycSubjectType): 'customer_id' | 'vendor_organization_id' {
    return subjectType === 'customer' ? 'customer_id' : 'vendor_organization_id';
}

export function hasExpectedFileSignature(bytes: Buffer, mimeType: string): boolean {
    if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (mimeType === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (mimeType === 'image/webp') return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
    if (mimeType === 'application/pdf') return bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-';
    return false;
}

export async function createKycUpload(input: {
    subjectType: KycSubjectType;
    subjectId: string;
    documentType: KycDocumentType;
    requestedTier: 1 | 2;
    mimeType: string;
    sizeBytes: number;
    expiresAt?: string | null;
}) {
    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
        throw new KycReviewError('Use JPEG, PNG, WebP, or PDF.', 'invalid_document_type');
    }
    if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > MAX_FILE_BYTES) {
        throw new KycReviewError('Document must be under 10 MB.', 'invalid_document_size');
    }
    const storagePath = `${input.subjectType}/${input.subjectId}/${crypto.randomUUID()}.${extForMime(input.mimeType)}`;
    const { data: document, error: insertError } = await adminClient.from('kyc_documents').insert({
        customer_id: input.subjectType === 'customer' ? input.subjectId : null,
        vendor_organization_id: input.subjectType === 'vendor' ? input.subjectId : null,
        doc_type: input.documentType,
        kyc_tier: input.requestedTier,
        storage_path: storagePath,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        doc_expires_at: input.expiresAt ?? null,
        status: 'pending',
    }).select('id').single();
    if (insertError || !document) throw new KycReviewError('Document record failed.', 'document_create_failed', 500);

    const { data: signed, error: signError } = await adminClient.storage.from(KYC_BUCKET).createSignedUploadUrl(storagePath);
    if (signError || !signed?.signedUrl) {
        await adminClient.from('kyc_documents').delete().eq('id', (document as any).id);
        throw new KycReviewError('Secure upload failed.', 'document_upload_unavailable', 503);
    }
    return { documentId: (document as any).id, uploadUrl: signed.signedUrl, path: storagePath };
}

export async function activateKycUpload(input: {
    subjectType: KycSubjectType;
    subjectId: string;
    documentId: string;
}) {
    const column = ownerColumn(input.subjectType);
    const { data: document } = await adminClient.from('kyc_documents')
        .select('id, storage_path, size_bytes, mime_type, uploaded_at')
        .eq('id', input.documentId).eq(column, input.subjectId).maybeSingle();
    if (!document) throw new KycReviewError('Document not found.', 'document_not_found', 404);
    const path = String((document as any).storage_path);
    const fileName = path.split('/').pop() ?? '';
    const folder = path.slice(0, Math.max(0, path.length - fileName.length - 1));
    const { data: objects, error } = await adminClient.storage.from(KYC_BUCKET).list(folder, { search: fileName, limit: 2 });
    const uploaded = (objects ?? []).find((item: any) => item.name === fileName);
    if (error || !uploaded) throw new KycReviewError('Upload is incomplete.', 'document_upload_incomplete', 409);
    const { data: downloaded, error: downloadError } = await adminClient.storage.from(KYC_BUCKET).download(path);
    if (downloadError || !downloaded) throw new KycReviewError('Upload verification failed.', 'document_download_failed', 503);
    const fileBytes = Buffer.from(await downloaded.arrayBuffer());
    const uploadedSize = fileBytes.byteLength;
    if (uploadedSize !== Number((document as any).size_bytes)) {
        await adminClient.storage.from(KYC_BUCKET).remove([path]);
        await adminClient.from('kyc_documents').delete().eq('id', input.documentId);
        throw new KycReviewError('Uploaded size changed.', 'document_size_mismatch', 409);
    }
    if (!hasExpectedFileSignature(fileBytes, String((document as any).mime_type))) {
        await adminClient.storage.from(KYC_BUCKET).remove([path]);
        await adminClient.from('kyc_documents').delete().eq('id', input.documentId);
        throw new KycReviewError('File content does not match its type.', 'document_content_mismatch', 422);
    }
    const scan = await runMalwareScan(fileBytes, fileName);
    if (!scan.ok) {
        await adminClient.storage.from(KYC_BUCKET).remove([path]);
        await adminClient.from('kyc_documents').delete().eq('id', input.documentId);
        if (scan.reason === 'unavailable') {
            throw new KycReviewError(
                'Beverly could not check this document. The upload was removed. Try again later.',
                'document_scanner_unavailable',
                503,
            );
        }
        throw new KycReviewError('This document could not be accepted by security checks.', 'document_scan_failed', 422);
    }
    const uploadedAt = new Date().toISOString();
    const { error: updateError } = await adminClient.from('kyc_documents')
        .update({ uploaded_at: uploadedAt }).eq('id', input.documentId).eq(column, input.subjectId);
    if (updateError) throw new KycReviewError('Upload activation failed.', 'document_activation_failed', 500);
    return { id: input.documentId, uploadedAt };
}

export async function submitKycReview(input: {
    subjectType: KycSubjectType;
    subjectId: string;
    requestedTier: 1 | 2;
    submittedBy: string;
    submission: Record<string, unknown>;
    documentIds?: string[];
}) {
    const documentIds = [...new Set(input.documentIds ?? [])];
    {
        const minimumDocuments = input.requestedTier === 2 ? 3 : 2;
        if (documentIds.length < minimumDocuments) {
            throw new KycReviewError(
                input.requestedTier === 2 ? 'Identity, selfie, and address evidence are required.' : 'Identity and selfie documents are required.',
                'documents_required',
            );
        }
        const column = ownerColumn(input.subjectType);
        const { data: documents, error } = await adminClient.from('kyc_documents')
            .select('id, doc_type, uploaded_at, review_request_id')
            .in('id', documentIds).eq(column, input.subjectId).eq('kyc_tier', input.requestedTier);
        if (error || (documents ?? []).length !== documentIds.length) {
            throw new KycReviewError('Some documents are invalid.', 'invalid_documents');
        }
        if ((documents ?? []).some((doc: any) => !doc.uploaded_at)) {
            throw new KycReviewError('Complete each upload first.', 'documents_not_ready');
        }
        const types = new Set((documents ?? []).map((doc: any) => doc.doc_type));
        if (![...types].some((type) => IDENTITY_TYPES.has(String(type))) || !types.has('selfie')) {
            throw new KycReviewError('Identity and selfie documents are required.', 'documents_required');
        }
        if (input.requestedTier === 2 && ![...types].some((type) => ADDRESS_TYPES.has(String(type)))) {
            throw new KycReviewError('Address evidence is required for Tier 2.', 'address_document_required');
        }
    }

    const rpcName = input.requestedTier === 2 ? 'submit_kyc_enhanced_review' : 'submit_kyc_evidence_review';
    const { data, error } = await adminClient.rpc(rpcName, {
        p_subject_type: input.subjectType,
        p_subject_id: input.subjectId,
        p_requested_tier: input.requestedTier,
        p_submitted_by: input.submittedBy,
        p_submission: { ...input.submission, document_ids: documentIds },
    });
    if (error || !data) {
        const code = String(error?.message ?? '').includes('sequential') ? 'tier_not_sequential' : 'review_submit_failed';
        throw new KycReviewError(error?.message ?? 'Review submission failed.', code, code === 'tier_not_sequential' ? 409 : 500);
    }
    const review = Array.isArray(data) ? data[0] : data;
    try {
        const stationIds = input.subjectType === 'vendor'
            ? await adminClient.from('vendor_organizations').select('operating_stations').eq('id', input.subjectId).maybeSingle()
                .then(({ data: vendor }) => (vendor?.operating_stations ?? []) as string[])
            : await adminClient.from('customer_meters').select('station_id').eq('customer_id', input.subjectId)
                .then(({ data: meters }) => (meters ?? []).map((meter: any) => meter.station_id).filter(Boolean));
        await notifyOperationalStaff({
            permission: 'wallet.kyc.view', type: 'kyc_review', title: 'KYC review submitted',
            body: `${input.subjectType === 'vendor' ? 'Vendor' : 'Customer'} KYC Tier ${input.requestedTier} needs review.`,
            path: '/kyc-reviews', dedupeKey: `kyc.review.submitted.${review.id}`,
            stationIds, metadata: { reviewRequestId: review.id, subjectType: input.subjectType, subjectId: input.subjectId },
        });
    } catch { /* notification delivery must not reverse the accepted review */ }
    return review;
}

export async function listKycReviews(input: {
    status?: string;
    subjectType?: KycSubjectType;
    limit?: number;
    cursor?: string;
    customerIds?: string[];
    vendorIds?: string[];
}) {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const hasOwnerScope = input.customerIds !== undefined || input.vendorIds !== undefined;
    const customerIds = [...new Set(input.customerIds ?? [])];
    const vendorIds = [...new Set(input.vendorIds ?? [])];
    if (hasOwnerScope && !customerIds.length && !vendorIds.length) {
        return { reviews: [], nextCursor: null };
    }
    let query = adminClient.from('kyc_review_requests').select('*')
        .order('submitted_at', { ascending: true }).limit(limit + 1);
    if (hasOwnerScope) {
        const filters = [
            customerIds.length ? `customer_id.in.(${customerIds.join(',')})` : '',
            vendorIds.length ? `vendor_organization_id.in.(${vendorIds.join(',')})` : '',
        ].filter(Boolean).join(',');
        query = query.or(filters);
    }
    if (input.status) query = query.eq('status', input.status);
    if (input.subjectType) query = query.eq('subject_type', input.subjectType);
    if (input.cursor) query = query.gt('submitted_at', input.cursor);
    const { data, error } = await query;
    if (error) throw new KycReviewError(error.message, 'review_list_failed', 500);
    const rows = data ?? [];
    const pageCustomerIds = [...new Set(rows.map((r: any) => r.customer_id).filter(Boolean))];
    const pageVendorIds = [...new Set(rows.map((r: any) => r.vendor_organization_id).filter(Boolean))];
    const [customers, vendors, documents, meters] = await Promise.all([
        pageCustomerIds.length ? adminClient.from('customers').select('id, full_name, email, phone, kyc_tier, kyc_status').in('id', pageCustomerIds) : Promise.resolve({ data: [] as any[] }),
        pageVendorIds.length ? adminClient.from('vendor_organizations').select('id, legal_name, trading_name, contact_email, contact_phone, cac_number, tin, operating_stations, kyc_tier, kyc_status').in('id', pageVendorIds) : Promise.resolve({ data: [] as any[] }),
        rows.length ? adminClient.from('kyc_documents').select('id, review_request_id, doc_type, mime_type, size_bytes, status, created_at').in('review_request_id', rows.map((r: any) => r.id)) : Promise.resolve({ data: [] as any[] }),
        pageCustomerIds.length ? adminClient.from('customer_meters').select('customer_id, station_id').in('customer_id', pageCustomerIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const stationsByCustomer = new Map<string, string[]>();
    for (const meter of meters.data ?? []) {
        const station = String((meter as any).station_id ?? '').toUpperCase();
        if (!station) continue;
        const current = stationsByCustomer.get((meter as any).customer_id) ?? [];
        if (!current.includes(station)) current.push(station);
        stationsByCustomer.set((meter as any).customer_id, current);
    }
    const customerMap = new Map((customers.data ?? []).map((r: any) => [r.id, { ...r, station_ids: stationsByCustomer.get(r.id) ?? [] }]));
    const vendorMap = new Map((vendors.data ?? []).map((r: any) => [r.id, r]));
    const docsByRequest = new Map<string, any[]>();
    for (const document of documents.data ?? []) {
        const current = docsByRequest.get((document as any).review_request_id) ?? [];
        current.push(document);
        docsByRequest.set((document as any).review_request_id, current);
    }
    return {
        reviews: rows.slice(0, limit).map((row: any) => ({
            ...row,
            subject: row.subject_type === 'customer' ? customerMap.get(row.customer_id) : vendorMap.get(row.vendor_organization_id),
            documents: docsByRequest.get(row.id) ?? [],
        })),
        nextCursor: rows.length > limit ? rows[limit - 1]?.submitted_at ?? null : null,
    };
}

export async function getKycReviewDocumentUrl(documentId: string): Promise<string> {
    const { data: document } = await adminClient.from('kyc_documents')
        .select('storage_path, uploaded_at').eq('id', documentId).maybeSingle();
    if (!document || !(document as any).uploaded_at) throw new KycReviewError('Document not found.', 'document_not_found', 404);
    const { data, error } = await adminClient.storage.from(KYC_BUCKET).createSignedUrl((document as any).storage_path, 300);
    if (error || !data?.signedUrl) throw new KycReviewError('Document preview failed.', 'document_preview_failed', 503);
    return data.signedUrl;
}

export async function decideKycReview(input: {
    requestId: string;
    reviewerId: string;
    decision: KycDecision;
    note: string;
}) {
    const { data, error } = await adminClient.rpc('review_kyc_tier_request', {
        p_request_id: input.requestId,
        p_reviewer_id: input.reviewerId,
        p_decision: input.decision,
        p_note: input.note.trim(),
    });
    if (error || !data) {
        const message = error?.message ?? 'Review failed.';
        const status = message.includes('already_decided') || message.includes('changed_since') ? 409 : 500;
        throw new KycReviewError(message, status === 409 ? 'review_conflict' : 'review_failed', status);
    }
    const review = Array.isArray(data) ? data[0] : data;
    if ((review as any).subject_type === 'customer') {
        if (input.decision === 'approved') {
            await notifyKycUpdate((review as any).customer_id, { tier: Number((review as any).requested_tier) }).catch(() => undefined);
        } else {
            await sendNotification((review as any).customer_id, {
                type: 'kyc_update', title: 'KYC needs changes',
                body: `Your KYC review needs changes. ${input.note.trim()}`,
                metadata: { reviewRequestId: input.requestId, status: 'rejected', path: '/kyc' },
            }).catch(() => undefined);
        }
    } else {
        try {
            await notifyVendor({
                vendorOrganizationId: (review as any).vendor_organization_id,
                type: 'kyc_update',
                title: input.decision === 'approved' ? 'KYC tier approved' : 'KYC needs changes',
                body: input.decision === 'approved'
                    ? `Your business is now verified at Tier ${(review as any).requested_tier}.`
                    : `Your KYC review needs changes. ${input.note.trim()}`,
                path: '/kyc',
                dedupeKey: `kyc.review.${input.requestId}.${input.decision}`,
                metadata: { reviewRequestId: input.requestId, status: input.decision },
            });
        } catch { /* ignore notification failure */ }
    }
    return review;
}

export async function currentKycState(subjectType: KycSubjectType, subjectId: string) {
    const table = subjectType === 'customer' ? 'customers' : 'vendor_organizations';
    const { data: subject } = await adminClient.from(table).select('kyc_tier, kyc_status, kyc_data').eq('id', subjectId).maybeSingle();
    if (!subject) throw new KycReviewError('KYC account not found.', 'subject_not_found', 404);
    const column = ownerColumn(subjectType);
    const [{ data: review }, { data: documents }] = await Promise.all([
        adminClient.from('kyc_review_requests').select('*').eq(column, subjectId).order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
        adminClient.from('kyc_documents').select('id, doc_type, kyc_tier, mime_type, size_bytes, status, uploaded_at, rejection_note, created_at').eq(column, subjectId).order('created_at', { ascending: false }),
    ]);
    return { ...subject, review: review ?? null, documents: documents ?? [] };
}
