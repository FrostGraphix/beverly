/**
 * Exhaustive PostgREST reads.
 *
 * PostgREST caps rows per response (db_max_rows). Any handler that *sums* a
 * column must page explicitly: an unbounded select truncates silently, so the
 * total comes back wrong with no error to notice — the failure mode is a
 * plausible-looking money figure, which is the worst kind.
 */
export const SUPABASE_PAGE_SIZE = 1000;

export interface PagedResult<T> {
    data: T[] | null;
    error: { message?: string } | null;
}

export interface RangeQuery<T> {
    range(from: number, to: number): PromiseLike<PagedResult<T>>;
}

export async function fetchAllRows<T>(
    build: () => RangeQuery<T>,
    pageSize: number = SUPABASE_PAGE_SIZE,
): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await build().range(offset, offset + pageSize - 1);
        if (error) throw new Error(error.message ?? 'paged query failed');
        const page = data ?? [];
        rows.push(...page);
        if (page.length < pageSize) return rows;
    }
}
