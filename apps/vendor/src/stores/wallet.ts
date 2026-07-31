import { defineStore } from 'pinia';
import { api } from '../lib/api';

export interface WalletSummary {
    wallet_id: string;
    currency: string;
    status: 'active' | 'frozen' | 'closed';
    balance_minor: number;
    holds_minor: number;
    available_minor: number;
    daily_cap_minor: number | null;
    activity: {
        today_vended_minor: number;
        today_vended_count: number;
        today_funded_minor: number;
        total_funded_minor: number;
        total_reversed_minor: number;
    };
}

export interface LedgerEntry {
    id: string;
    direction: 'credit' | 'debit';
    amount_minor: number;
    balance_after_minor: number;
    entry_type: string;
    reference_type: string | null;
    reference_id: string | null;
    memo: string | null;
    created_at: string;
}

interface State {
    summary: WalletSummary | null;
    ledger: LedgerEntry[];
    loading: boolean;
    error: string | null;
}

export const useWalletStore = defineStore('vendor-wallet', {
    state: (): State => ({ summary: null, ledger: [], loading: false, error: null }),
    actions: {
        async fetchSummary() {
            this.error = null;
            try {
                this.summary = await api.get<WalletSummary>('/api/v1/vendor/wallet');
            } catch (e: any) {
                this.error = e?.message ?? 'failed to load wallet';
            }
        },
        async fetchLedger(limit = 50) {
            this.loading = true;
            this.error = null;
            try {
                const r = await api.get<{ entries: LedgerEntry[] }>(`/api/v1/vendor/wallet/ledger?limit=${limit}`);
                this.ledger = r.entries;
            } catch (e: any) {
                this.error = e?.message ?? 'failed to load ledger';
            } finally {
                this.loading = false;
            }
        },
    },
});
