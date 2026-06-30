import { defineStore } from 'pinia';
import { api } from '../lib/api';
import { clearCustomerToken, readCustomerToken, storeCustomerToken, type CustomerTokenOptions } from '../lib/auth-flow';

export interface CustomerProfile {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    profile_picture_url: string | null;
    kyc_tier: number;
    kyc_status: 'unverified' | 'pending' | 'verified' | 'rejected';
    kyc_data?: Record<string, unknown> | null;
    status: 'active' | 'suspended' | 'closed';
    customer_code?: string | null;
    site?: string | null;
    wallet_number?: string | null;
    wallet_status?: string | null;
    account_status?: string | null;
    contact_person?: string | null;
    primary_phone?: string | null;
    kyc_approved_date?: string | null;
    kyc_expiry?: string | null;
}

interface State {
    hydrated: boolean;
    accessToken: string | null;
    customer: CustomerProfile | null;
}

export const useAuthStore = defineStore('auth', {
    state: (): State => ({ hydrated: false, accessToken: null, customer: null }),
    getters: {
        isAuthenticated: (s) => !!s.accessToken && !!s.customer,
        kycTier: (s) => s.customer?.kyc_tier ?? 0,
    },
    actions: {
        async hydrate(force = false) {
            if (this.hydrated && !force) return;
            this.hydrated = true;
            try {
                const token = readCustomerToken();
                if (!token) return;
                this.accessToken = token;
                const me = await api.get<CustomerProfile>('/api/v1/customer/me');
                this.customer = me;
            } catch {
                this.accessToken = null;
                this.customer = null;
                clearCustomerToken();
            }
        },
        async refreshProfile() {
            if (!this.accessToken) return null;
            const me = await api.get<CustomerProfile>('/api/v1/customer/me');
            this.customer = me;
            return me;
        },
        setSession(token: string, customer: CustomerProfile, remember = true, tokenOptions: CustomerTokenOptions = {}) {
            this.accessToken = token;
            this.customer = customer;
            storeCustomerToken(token, remember, tokenOptions);
        },
        async logout() {
            try { await api.post('/api/v1/customer/logout', {}); } catch { /* noop */ }
            this.accessToken = null;
            this.customer = null;
            clearCustomerToken();
        },
    },
});
