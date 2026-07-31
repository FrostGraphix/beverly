import { describe, it, expect } from 'vitest';
import { fetchAllRows, SUPABASE_PAGE_SIZE } from '../paged-query.js';

interface Row { id: number }

/** Fake PostgREST builder that serves `total` rows in pages of `pageSize`. */
function makeSource(total: number, pageSize: number) {
    const calls: Array<[number, number]> = [];
    const build = () => ({
        range(from: number, to: number) {
            calls.push([from, to]);
            const rows: Row[] = [];
            for (let i = from; i <= Math.min(to, total - 1); i++) rows.push({ id: i });
            // A real server also caps the slice at pageSize.
            return Promise.resolve({ data: rows.slice(0, pageSize), error: null });
        },
    });
    return { build, calls };
}

describe('fetchAllRows', () => {
    it('returns every row across multiple pages', async () => {
        const { build } = makeSource(2137, 1000);
        const rows = await fetchAllRows<Row>(build, 1000);
        expect(rows).toHaveLength(2137);
        expect(rows[0].id).toBe(0);
        expect(rows[2136].id).toBe(2136);
    });

    it('regression: an unbounded single read would truncate at the page cap', async () => {
        const { build } = makeSource(2137, 1000);
        const firstPageOnly = await build().range(0, 999);
        expect(firstPageOnly.data).toHaveLength(1000);

        const paged = await fetchAllRows<Row>(build, 1000);
        expect(paged.length).toBeGreaterThan(firstPageOnly.data!.length);
    });

    it('stops after one request when the first page is short', async () => {
        const { build, calls } = makeSource(12, 1000);
        const rows = await fetchAllRows<Row>(build, 1000);
        expect(rows).toHaveLength(12);
        expect(calls).toHaveLength(1);
    });

    it('requests contiguous, non-overlapping ranges', async () => {
        const { build, calls } = makeSource(250, 100);
        await fetchAllRows<Row>(build, 100);
        expect(calls).toEqual([[0, 99], [100, 199], [200, 299]]);
    });

    it('makes a second request when the total is an exact multiple of the page size', async () => {
        const { build, calls } = makeSource(2000, 1000);
        const rows = await fetchAllRows<Row>(build, 1000);
        expect(rows).toHaveLength(2000);
        expect(calls).toHaveLength(3); // 0-999, 1000-1999, then the empty probe
    });

    it('returns an empty array when there are no rows', async () => {
        const { build } = makeSource(0, 1000);
        expect(await fetchAllRows<Row>(build, 1000)).toEqual([]);
    });

    it('treats a null data payload as an empty page', async () => {
        const rows = await fetchAllRows<Row>(() => ({
            range: () => Promise.resolve({ data: null, error: null }),
        }));
        expect(rows).toEqual([]);
    });

    it('throws on a query error instead of returning a partial total', async () => {
        await expect(fetchAllRows<Row>(() => ({
            range: () => Promise.resolve({ data: null, error: { message: 'permission denied' } }),
        }))).rejects.toThrow('permission denied');
    });

    it('defaults to the documented page size', () => {
        expect(SUPABASE_PAGE_SIZE).toBe(1000);
    });
});
