import { z } from 'zod';
import { adminClient } from '../db/supabase.js';
import { runMalwareScan } from './file-scan.js';

export const DISPUTE_EVIDENCE_BUCKET = 'wallet-dispute-evidence';
export const DISPUTE_EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
const SIGNED_URL_TTL_SECONDS = 3600;
const MAX_EVIDENCE_PER_DISPUTE = 5;

export class DisputeEvidenceError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'DisputeEvidenceError';
    }
}

const uploadSchema = z.object({
    file_name: z.string().trim().min(3).max(160),
    content_type: z.string().trim().min(1).max(64),
    size_bytes: z.number().int().positive().max(DISPUTE_EVIDENCE_MAX_BYTES),
});

function fileExt(name: string) {
    const idx = name.lastIndexOf('.');
    return idx < 0 ? '' : name.slice(idx).toLowerCase();
}

export function assertDisputeEvidenceSop(input: unknown) {
    const parsed = uploadSchema.parse(input);
    if (!ALLOWED_CONTENT_TYPES.has(parsed.content_type)) {
        throw new DisputeEvidenceError('Only JPEG, PNG, WEBP, or PDF files are accepted.', 'invalid_content_type');
    }
    if (!ALLOWED_EXTENSIONS.has(fileExt(parsed.file_name))) {
        throw new DisputeEvidenceError('Unsupported file extension.', 'invalid_file_extension');
    }
    return parsed;
}

export function toDisputeEvidencePath(customerId: string, disputeId: string, fileName: string) {
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
    return `customer/${customerId}/${disputeId}/${Date.now()}-${safe}`;
}

export async function activateDisputeEvidence(customerId: string, disputeId: string, path: string): Promise<string[]> {
    const expectedPrefix = `customer/${customerId}/${disputeId}/`;
    if (!path.startsWith(expectedPrefix)) throw new DisputeEvidenceError('Invalid evidence path.', 'invalid_path');

    const { data: dispute } = await adminClient
        .from('disputes')
        .select('evidence_paths')
        .eq('id', disputeId)
        .eq('customer_id', customerId)
        .maybeSingle();
    if (!dispute) throw new DisputeEvidenceError('Dispute not found.', 'not_found');

    const existing: string[] = Array.isArray((dispute as any).evidence_paths) ? (dispute as any).evidence_paths : [];
    if (existing.includes(path)) return existing;
    if (existing.length >= MAX_EVIDENCE_PER_DISPUTE) {
        throw new DisputeEvidenceError(`A dispute can have at most ${MAX_EVIDENCE_PER_DISPUTE} attachments.`, 'evidence_limit_reached');
    }

    const { data: file, error } = await adminClient.storage.from(DISPUTE_EVIDENCE_BUCKET).download(path);
    if (error || !file) throw new DisputeEvidenceError('Uploaded file was not found.', 'file_not_found');
    if (file.size > DISPUTE_EVIDENCE_MAX_BYTES) throw new DisputeEvidenceError('File is too large.', 'file_too_large');
    if (!ALLOWED_CONTENT_TYPES.has(file.type)) throw new DisputeEvidenceError('Invalid content type.', 'invalid_content_type');

    const scan = await runMalwareScan(Buffer.from(await file.arrayBuffer()), path);
    if (!scan.ok) throw new DisputeEvidenceError('File failed malware scan.', 'malware_scan_failed');

    const updated = [...existing, path];
    await adminClient.from('disputes').update({ evidence_paths: updated, updated_at: new Date().toISOString() }).eq('id', disputeId);
    return updated;
}

export async function signDisputeEvidencePaths(paths: string[]): Promise<Array<{ path: string; url: string | null }>> {
    if (!paths.length) return [];
    const results = await Promise.all(paths.map(async (path) => {
        const { data } = await adminClient.storage.from(DISPUTE_EVIDENCE_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
        return { path, url: data?.signedUrl ?? null };
    }));
    return results;
}
