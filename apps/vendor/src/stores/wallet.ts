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
    activity?: {
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
    meter_order?: {
        id: string; ordered_by_name: string; ordered_by_email?: string | null; vendor_name: string;
        customer_id: string; customer_name: string; customer_phone?: string | null; customer_email?: string | null;
        meter_type: string; property_category: string; property_address: string; service_area: string;
        contact_phone: string; status: string; sponsor_mode: string; created_at: string;
        rejection_reason?: string | null; rejection_refund_destination?: string | null; rejected_at?: string | null;
    };
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
