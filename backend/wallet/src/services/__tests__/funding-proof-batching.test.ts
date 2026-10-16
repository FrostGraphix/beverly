import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ from: vi.fn(), sign: vi.fn() }));
vi.mock('../../db/supabase.js', () => ({ adminClient: { storage: { from: storage.from } } }));
import { attachProofUrls, type FundingRequest } from '../funding.js';

const row = (path: string | null): FundingRequest => ({ proof_file_path: path } as FundingRequest);
beforeEach(() => {
    vi.resetAllMocks();
    storage.from.mockReturnValue({ createSignedUrls: storage.sign });
    storage.sign.mockResolvedValue({ data: null, error: null });
});

describe('funding proof signing', () => {
    it('makes no storage calls without proofs', async () => {
        expect(await attachProofUrls([])).toEqual([]);
        expect(await attachProofUrls([row(null)])).toEqual([{ proof_file_path: null, proof_view_url: null }]);
        expect(storage.from).not.toHaveBeenCalled();
    });

    it('signs unique paths once and maps unordered results without mutating records', async () => {
        storage.sign.mockResolvedValue({ data: [
            { path: 'b', signedUrl: 'url-b', error: null },
            { path: 'a', signedUrl: 'url-a', error: null },
        ] });
        const input = [row('a'), row('b'), row('a'), row(null)];
        const output = await attachProofUrls(input);
        expect(storage.from).toHaveBeenCalledWith('uploads');
        expect(storage.sign).toHaveBeenCalledTimes(1);
        expect(storage.sign).toHaveBeenCalledWith(['a', 'b'], 1800);
        expect(output.map((item) => item.proof_view_url)).toEqual(['url-a', 'url-b', 'url-a', null]);
        expect(input.every((item) => item.proof_view_url === undefined)).toBe(true);
    });

    it('preserves successful links while leaving failed and missing objects unavailable', async () => {
        storage.sign.mockResolvedValue({ data: [
            { path: 'a', signedUrl: 'url-a', error: null },
            { path: 'b', signedUrl: 'invalid', error: 'not found' },
        ] });
        expect((await attachProofUrls([row('a'), row('b'), row('c')]))
            .map((item) => item.proof_view_url)).toEqual(['url-a', null, null]);
    });

    it('bounds requests and preserves rows when a batch fails', async () => {
        storage.sign.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
        const output = await attachProofUrls(Array.from({ length: 201 }, (_, i) => row(String(i))));
        expect(storage.sign.mock.calls.map(([paths]) => paths.length)).toEqual([100, 100, 1]);
        expect(output).toHaveLength(201);
        expect(output.every((item) => item.proof_view_url === null)).toBe(true);
    });

    it('does not share signed URLs across requests', async () => {
        await attachProofUrls([row('a')]);
        await attachProofUrls([row('b')]);
        expect(storage.sign.mock.calls.map(([paths]) => paths)).toEqual([['a'], ['b']]);
    });
});
