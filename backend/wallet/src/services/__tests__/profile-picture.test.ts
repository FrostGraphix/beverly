import { describe, it, expect } from 'vitest';
import { assertProfilePictureSop, toProfilePicturePath } from '../profile-picture.js';

describe('profile picture SOP', () => {
    it('accepts valid payload', () => {
        const out = assertProfilePictureSop({
            file_name: 'photo.jpg',
            content_type: 'image/jpeg',
            size_bytes: 120000,
        });
        expect(out.file_name).toBe('photo.jpg');
    });

    it('rejects invalid type', () => {
        expect(() => assertProfilePictureSop({
            file_name: 'photo.gif',
            content_type: 'image/gif',
            size_bytes: 1200,
        })).toThrow();
    });

    it('builds scoped paths', () => {
        const p = toProfilePicturePath('customer', 'abc', 'my file.png');
        expect(p.startsWith('customer/abc/')).toBe(true);
        expect(p.endsWith('.png')).toBe(true);
    });

    it('supports staff-scoped paths', () => {
        const p = toProfilePicturePath('staff', 'user-1', 'head shot.webp');
        expect(p.startsWith('staff/user-1/')).toBe(true);
        expect(p.endsWith('.webp')).toBe(true);
    });
});
