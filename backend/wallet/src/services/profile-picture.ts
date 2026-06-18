import { z } from 'zod';

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
