import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('funding approval atomicity', () => {
    it('uses one database transaction for approval and credit', () => {
        const source = readFileSync(new URL('../funding.ts', import.meta.url), 'utf8');

        expect(source).toContain("adminClient.rpc('fn_approve_funding_request'");
        expect(source).not.toMatch(/const entry = await postEntry\([\s\S]*?Atomic transition/);
    });
});
