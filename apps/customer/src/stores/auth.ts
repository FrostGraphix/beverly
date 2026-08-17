import { defineStore } from 'pinia';
import { api, ApiError } from '../lib/api';
import { clearCustomerToken, readCustomerProfile, readCustomerToken, storeCustomerToken, CUSTOMER_TOKEN_KEY, CUSTOMER_USER_KEY, type CustomerTokenOptions } from '../lib/auth-flow';

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
    email_verified_at?: string | null;
    customer_code?: string | null;
    site?: string | null;
    wallet_number?: string | null;
    wallet_status?: string | null;
    account_status?: string | null;
    contact_person?: string | null;
    primary_phone?: string | null;
    kyc_approved_date?: string | null;
    kyc_expiry?: string | null;
    vend_pin_configured?: boolean;
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
                const cached = readCustomerProfile<CustomerProfile>();
                if (!token) return;
                this.accessToken = token;
                if (cached) this.customer = cached;

                try {
                    const me = await api.get<CustomerProfile>('/api/v1/customer/me');
                    this.customer = me;
                    const remember = localStorage.getItem(CUSTOMER_TOKEN_KEY) !== null;
                    const storage = remember ? localStorage : sessionStorage;
                    storage.setItem(CUSTOMER_USER_KEY, JSON.stringify(me));
                } catch (err: unknown) {
                    if (err instanceof ApiError && err.status === 401) {
                        this.accessToken = null;
                        this.customer = null;
                        clearCustomerToken();
                    }
                }
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
            const remember = localStorage.getItem(CUSTOMER_TOKEN_KEY) !== null;
            const storage = remember ? localStorage : sessionStorage;
            storage.setItem(CUSTOMER_USER_KEY, JSON.stringify(me));
            return me;
        },
        setSession(token: string, customer: CustomerProfile, remember = true, tokenOptions: CustomerTokenOptions = {}) {
            this.accessToken = token;
            this.customer = customer;
            storeCustomerToken(token, remember, tokenOptions);
            const storage = remember ? localStorage : sessionStorage;
            storage.setItem(CUSTOMER_USER_KEY, JSON.stringify(customer));
        },
        async logout() {
            try { await api.post('/api/v1/customer/logout', {}); } catch { /* noop */ }
            this.accessToken = null;
            this.customer = null;
            clearCustomerToken();
        },
    },
});
