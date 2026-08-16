/**
 * KYC document storage — Phase 3
 *
 * Handles presigned upload URL generation and document metadata lifecycle.
 * Files live in the private `wallet-kyc-documents` Supabase storage bucket.
 * All downloads go through signed URLs (60-min expiry).
 */
import { adminClient } from '../db/supabase.js';

const KYC_BUCKET = 'wallet-kyc-documents';
const SIGNED_URL_TTL = 3600; // seconds

export class KycDocumentError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'KycDocumentError';
    }
}

export type KycDocType =
    | 'national_id'
    | 'voters_card'
    | 'passport'
    | 'drivers_license'
    | 'utility_bill'
    | 'bank_statement'
    | 'selfie'
    | 'signature';

export type KycDocStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface KycDocMeta {
    id: string;
    customerId: string;
    docType: KycDocType;
    kycTier: number;
    storagePath: string;
    mimeType: string;
    sizeBytes: number;
    status: KycDocStatus;
    reviewedBy: string | null;
    reviewedAt: string | null;
    rejectionNote: string | null;
    docExpiresAt: string | null;
    createdAt: string;
}

/**
 * Generate a presigned upload URL.
 * The caller must PUT the file to the returned URL within 5 minutes.
 */
export async function generateUploadUrl(input: {
    customerId: string;
    docType: KycDocType;
    kycTier: 1 | 2;
    mimeType: string;
    sizeBytes: number;
    docExpiresAt?: string;
}): Promise<{ uploadUrl: string; storagePath: string; docId: string }> {
    if (input.sizeBytes > 10 * 1024 * 1024) {
        throw new KycDocumentError('File exceeds 10 MB limit', 'file_too_large');
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(input.mimeType)) {
        throw new KycDocumentError(`MIME type ${input.mimeType} is not allowed`, 'invalid_mime_type');
    }

    const ext = input.mimeType === 'application/pdf' ? 'pdf'
        : input.mimeType === 'image/png' ? 'png'
        : input.mimeType === 'image/webp' ? 'webp'
        : 'jpg';

    const storagePath = `${input.customerId}/${input.docType}-${Date.now()}.${ext}`;

    // Insert pending metadata row first
    const { data: docRow, error: insertError } = await adminClient
        .from('kyc_documents')
        .insert({
            customer_id:   input.customerId,
            doc_type:      input.docType,
            kyc_tier:      input.kycTier,
            storage_path:  storagePath,
            mime_type:     input.mimeType,
            size_bytes:    input.sizeBytes,
            doc_expires_at: input.docExpiresAt ?? null,
        })
        .select('id')
        .single();

    if (insertError || !docRow) {
        throw new KycDocumentError('Could not create document record', 'db_error');
    }

    const { data: signedData, error: signError } = await adminClient.storage
        .from(KYC_BUCKET)
        .createSignedUploadUrl(storagePath);

    if (signError || !signedData) {
        // Clean up orphan metadata row
        await adminClient.from('kyc_documents').delete().eq('id', (docRow as any).id);
        throw new KycDocumentError('Could not generate upload URL', 'storage_error');
    }

    return {
        uploadUrl:   (signedData as any).signedUrl,
        storagePath,
        docId:       (docRow as any).id,
    };
}

/**
 * Generate a signed download URL for a specific document.
 * Only for authorized staff or the owning customer.
 */
export async function getDownloadUrl(docId: string): Promise<string> {
    const { data: doc } = await adminClient
        .from('kyc_documents')
        .select('storage_path, status')
        .eq('id', docId)
        .maybeSingle();

    if (!doc) throw new KycDocumentError('Document not found', 'not_found');

    const { data, error } = await adminClient.storage
        .from(KYC_BUCKET)
        .createSignedUrl((doc as any).storage_path, SIGNED_URL_TTL);

    if (error || !data) throw new KycDocumentError('Could not generate download URL', 'storage_error');
    return (data as any).signedUrl;
}

export async function listDocuments(customerId: string): Promise<KycDocMeta[]> {
    const { data } = await adminClient
        .from('kyc_documents')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

    return (data ?? []).map(mapDoc);
}

export async function reviewDocument(input: {
    docId: string;
    reviewedByUserId: string;
    approve: boolean;
    rejectionNote?: string;
}): Promise<void> {
    const patch: Record<string, unknown> = {
        status:      input.approve ? 'approved' : 'rejected',
        reviewed_by: input.reviewedByUserId,
        reviewed_at: new Date().toISOString(),
    };
    if (!input.approve && input.rejectionNote) {
        patch.rejection_note = input.rejectionNote;
    }

    const { error } = await adminClient
        .from('kyc_documents')
        .update(patch)
        .eq('id', input.docId);

    if (error) throw new KycDocumentError('Review update failed', 'db_error');
}

export async function listPendingDocuments(opts: { limit?: number } = {}): Promise<KycDocMeta[]> {
    const { data } = await adminClient
        .from('kyc_documents')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(opts.limit ?? 100);

    return (data ?? []).map(mapDoc);
}

function mapDoc(r: any): KycDocMeta {
    return {
        id:            r.id,
        customerId:    r.customer_id,
        docType:       r.doc_type,
        kycTier:       r.kyc_tier,
        storagePath:   r.storage_path,
        mimeType:      r.mime_type,
        sizeBytes:     r.size_bytes,
        status:        r.status,
        reviewedBy:    r.reviewed_by ?? null,
        reviewedAt:    r.reviewed_at ?? null,
        rejectionNote: r.rejection_note ?? null,
        docExpiresAt:  r.doc_expires_at ?? null,
        createdAt:     r.created_at,
    };
}
