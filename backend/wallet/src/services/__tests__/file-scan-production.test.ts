import { afterEach, describe, expect, it } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;
const originalScanCommand = process.env.PROFILE_PICTURE_SCAN_COMMAND;

afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalScanCommand === undefined) delete process.env.PROFILE_PICTURE_SCAN_COMMAND;
    else process.env.PROFILE_PICTURE_SCAN_COMMAND = originalScanCommand;
});

describe('production malware scanning', () => {
    it('fails closed without a scanner', async () => {
        process.env.NODE_ENV = 'production';
        delete process.env.PROFILE_PICTURE_SCAN_COMMAND;
        const { runMalwareScan } = await import('../file-scan.js');
        await expect(runMalwareScan(Buffer.from('%PDF-1.7'), 'document.pdf'))
            .resolves.toEqual(expect.objectContaining({ ok: false, mode: 'disabled', reason: 'unavailable' }));
    });
});
