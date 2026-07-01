import { z } from 'zod';
import { adminClient } from '../db/supabase.js';
import { runMalwareScan } from './file-scan.js';

export const PROFILE_PICTURE_BUCKET = 'wallet-profile-pictures';
export const PROFILE_PICTURE_MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const uploadSchema = z.object({
    file_name: z.string().trim().min(3).max(160),
    content_type: z.string().trim().min(1).max(64),
    size_bytes: z.number().int().positive().max(PROFILE_PICTURE_MAX_BYTES),
});

function fileExt(name: string) {
    const idx = name.lastIndexOf('.');
    return idx < 0 ? '' : name.slice(idx).toLowerCase();
}

export function assertProfilePictureSop(input: unknown) {
    const parsed = uploadSchema.parse(input);
    if (!ALLOWED_CONTENT_TYPES.has(parsed.content_type)) {
        throw new Error('invalid_content_type');
    }
    if (!ALLOWED_EXTENSIONS.has(fileExt(parsed.file_name))) {
        throw new Error('invalid_file_extension');
    }
    return parsed;
}

export function toProfilePicturePath(scope: 'vendor' | 'customer' | 'staff', id: string, fileName: string) {
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
    return `${scope}/${id}/${Date.now()}-${safe}`;
}

export async function activateProfilePicture(scope: 'vendor' | 'customer' | 'staff', ownerId: string, path: string) {
    if (!path.startsWith(`${scope}/${ownerId}/`)) throw new Error('invalid_profile_picture_path');
    const { data, error } = await adminClient.storage.from(PROFILE_PICTURE_BUCKET).download(path);
    if (error || !data) throw new Error('profile_picture_not_found');
    if (data.size > PROFILE_PICTURE_MAX_BYTES) throw new Error('profile_picture_too_large');
    if (!ALLOWED_CONTENT_TYPES.has(data.type)) throw new Error('invalid_content_type');
    const scan = await runMalwareScan(Buffer.from(await data.arrayBuffer()), path);
    if (!scan.ok) throw new Error('malware_scan_failed');
    const { data: publicUrl } = adminClient.storage.from(PROFILE_PICTURE_BUCKET).getPublicUrl(path);
    return publicUrl.publicUrl;
}
