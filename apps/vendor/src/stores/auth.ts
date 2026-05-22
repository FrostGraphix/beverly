import { defineStore } from 'pinia';
import { api } from '../lib/api';

export interface VendorUserProfile {
    id: string;
    vendor_organization_id: string;
    role: 'vendor_user' | 'vendor_manager';
    full_name: string | null;
    phone: string | null;
    email: string | null;
    profile_picture_url: string | null;
    mfa_enrolled: boolean;
    mfa_verified: boolean;
    password_reset_required: boolean;
    vend_credential_configured: boolean;
    vend_credential_type: 'pin' | 'password' | null;
    organization_name: string;
}

interface State {
    hydrated: boolean;
    accessToken: string | null;
    user: VendorUserProfile | null;
}

const TOKEN_KEY = 'beverly.vendor.access_token';

function readStoredToken(): string | null {
    try {
        return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);
    } catch {
        try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
    }
}

function storeToken(token: string, remember = true) {
    clearStoredToken();
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(TOKEN_KEY, token);
}

function clearStoredToken() {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* noop */ }
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* noop */ }
}

export const useVendorAuthStore = defineStore('vendor-auth', {
    state: (): State => ({ hydrated: false, accessToken: null, user: null }),
    getters: {
        isAuthenticated: (s) => !!s.accessToken && !!s.user,
        requiresPasswordChange: (s) => s.user?.password_reset_required === true,
        requiresMfaSetup: (s) => s.user && !s.user.mfa_enrolled,
        requiresMfaVerification: (s) => s.user?.mfa_enrolled === true && s.user?.mfa_verified !== true,
    },
    actions: {
        async hydrate() {
            if (this.hydrated) return;
            this.hydrated = true;
            try {
                const token = readStoredToken();
                if (!token) return;
                this.accessToken = token;
                const me = await api.get<VendorUserProfile>('/api/v1/vendor/me');
                this.user = me;
            } catch {
                this.accessToken = null;
                this.user = null;
                clearStoredToken();
            }
        },
        setSession(token: string, user: VendorUserProfile, remember = true) {
            this.accessToken = token;
            this.user = user;
            storeToken(token, remember);
        },
        async refreshMe() {
            const me = await api.get<VendorUserProfile>('/api/v1/vendor/me');
            this.user = me;
            return me;
        },
        async logout() {
            try { await api.post('/api/v1/vendor/logout', {}); } catch { /* noop */ }
            this.accessToken = null;
            this.user = null;
            clearStoredToken();
        },
    },
});
