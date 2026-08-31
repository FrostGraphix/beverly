import { describe, expect, it } from 'vitest';
import { buildCorsOrigins, corsOrigins, isCorsOriginAllowed } from '../env.js';

describe('wallet portal CORS origins', () => {
    it('trusts configured portal origins', () => {
        expect(corsOrigins).toContain('http://localhost:5173');
        expect(corsOrigins).toContain('http://localhost:5174');
        expect(corsOrigins).toContain('http://localhost:5175');
        expect(isCorsOriginAllowed('http://localhost:5174')).toBe(true);

        const productionOrigins = buildCorsOrigins('', [
            'https://acob-beverly.vercel.app/wallet-vendor/',
        ]);
        expect(productionOrigins).toContain('https://acob-beverly.vercel.app');
    });

    it('rejects unrelated origins', () => {
        expect(isCorsOriginAllowed('https://attacker.example')).toBe(false);
    });
});
