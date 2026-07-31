import type { DefineComponent } from 'vue';

declare const WalletPagination: DefineComponent<{
    /** Total number of rows across all pages. */
    total: number;
    /** Current 1-based page. Use with v-model:page. */
    page: number;
    /** Rows per page. Defaults to 10. */
    pageSize?: number;
    /** Noun for the row type, e.g. "meters". Used in the summary and a11y label. */
    itemLabel?: string;
}>;

export default WalletPagination;
