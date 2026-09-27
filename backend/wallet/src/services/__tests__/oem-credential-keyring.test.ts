import { describe, expect, it } from 'vitest';
import { decryptInstallationBundle, encryptInstallationBundle, rotateInstallationBundle } from '../oem-credential-keyring.js';
import { encryptSecret } from '../oem-registry.js';

const installationId = 'ed0eefb2-f017-43ad-a52e-82169684803b';
const environment = { OEM_INSTALLATION_ENCRYPTION_KEYS: JSON.stringify({ 2: Buffer.alloc(32, 17).toString('base64') }) };

describe('installation credential keyring', () => {
    it('rotates a legacy envelope without changing its credentials', () => {
        const plaintext = JSON.stringify({ apiKey: 'test-key', apiSecret: 'test-secret' });
        const rotated = rotateInstallationBundle(encryptSecret(plaintext), installationId, 1, 2, environment);
        expect(decryptInstallationBundle(rotated, installationId, 2, environment)).toBe(plaintext);
        expect(() => rotateInstallationBundle(rotated, installationId, 2, 1, environment)).toThrow();
    });
    it.each(['different-installation', 'wrong-key', 'wrong-version', 'tampered'])('rejects %s ciphertext', (scenario) => {
        const encrypted = encryptInstallationBundle('test-payload', installationId, 2, environment);
        const changed = Buffer.from(encrypted, 'base64');
        changed[changed.length - 1] ^= 1;
        const keys = { OEM_INSTALLATION_ENCRYPTION_KEYS: JSON.stringify({
            2: Buffer.alloc(32, scenario === 'wrong-key' ? 18 : 17).toString('base64'),
            3: Buffer.alloc(32, 17).toString('base64'),
        }) };
        expect(() => decryptInstallationBundle(scenario === 'tampered' ? changed.toString('base64') : encrypted,
            scenario === 'different-installation' ? 'other-installation' : installationId,
            scenario === 'wrong-version' ? 3 : 2, keys)).toThrow('Credential bundle authentication failed');
    });
    it.each(['{}', '[]', 'invalid-json', '{"2":"weak-key"}'])('rejects unusable keyrings', (keys) => {
        expect(() => encryptInstallationBundle('test-payload', installationId, 2,
            { OEM_INSTALLATION_ENCRYPTION_KEYS: keys })).toThrow();
    });
    it('encrypts installation credentials with the selected environment key', () => {
        const plaintext = JSON.stringify({ apiKey: 'test-key', apiSecret: 'test-secret' });
        const encrypted = encryptInstallationBundle(plaintext, installationId, 2, environment);
        expect(encrypted).not.toContain('test-secret');
        expect(decryptInstallationBundle(encrypted, installationId, 2, environment)).toBe(plaintext);
    });
});
