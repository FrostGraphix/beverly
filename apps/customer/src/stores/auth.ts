import { defineStore } from 'pinia';
import { api } from '../lib/api';
import { clearCustomerToken, readCustomerToken, storeCustomerToken } from '../lib/auth-flow';

export interface CustomerProfile {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    profile_picture_url: string | null;
    kyc_tier: number;
    kyc_status: 'unverified' | 'pending' | 'verified' | 'rejected';
    status: 'active' | 'suspended' | 'closed';
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
        async hydrate() {
            if (this.hydrated) return;
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
        setSession(token: string, customer: CustomerProfile, remember = true) {
            this.accessToken = token;
            this.customer = customer;
            storeCustomerToken(token, remember);
        },
        async logout() {
            try { await api.post('/api/v1/customer/logout', {}); } catch { /* noop */ }
            this.accessToken = null;
            this.customer = null;
            clearCustomerToken();
        },
    },
});
