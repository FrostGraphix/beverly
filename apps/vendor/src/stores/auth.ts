import { defineStore } from 'pinia';
import { api } from '../lib/api';

export interface VendorUserProfile {
    id: string;
    vendor_organization_id: string;
    role: 'vendor_user' | 'vendor_manager';
    full_name: string | null;
    phone: string | null;
    email: string | null;
    mfa_enrolled: boolean;
    password_reset_required: boolean;
    organization_name: string;
}

interface State {
    hydrated: boolean;
    accessToken: string | null;
    user: VendorUserProfile | null;
}

export const useVendorAuthStore = defineStore('vendor-auth', {
    state: (): State => ({ hydrated: false, accessToken: null, user: null }),
    getters: {
        isAuthenticated: (s) => !!s.accessToken && !!s.user,
        requiresPasswordChange: (s) => s.user?.password_reset_required === true,
        requiresMfaSetup: (s) => s.user && !s.user.mfa_enrolled,
    },
    actions: {
        async hydrate() {
            if (this.hydrated) return;
            this.hydrated = true;
            try {
                const token = localStorage.getItem('beverly.vendor.access_token');
                if (!token) return;
                this.accessToken = token;
                const me = await api.get<VendorUserProfile>('/api/v1/vendor/me');
                this.user = me;
            } catch {
                this.accessToken = null;
                this.user = null;
                localStorage.removeItem('beverly.vendor.access_token');
            }
        },
        setSession(token: string, user: VendorUserProfile) {
            this.accessToken = token;
            this.user = user;
            localStorage.setItem('beverly.vendor.access_token', token);
        },
        async logout() {
            try { await api.post('/api/v1/vendor/logout', {}); } catch { /* noop */ }
            this.accessToken = null;
            this.user = null;
            localStorage.removeItem('beverly.vendor.access_token');
        },
    },
});
