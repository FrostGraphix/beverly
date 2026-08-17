import { defineStore } from 'pinia';
import { api, ApiError } from '../lib/api';
import { disableDeviceNotifications } from '../lib/push-notifications';

export interface VendorUserProfile {
    id: string;
    vendor_organization_id: string;
    role: 'vendor' | 'vendor_user';
    full_name: string | null;
    phone: string | null;
    email: string | null;
    profile_picture_url: string | null;
    mfa_enrolled: boolean;
    mfa_verified: boolean;
    password_reset_required: boolean;
    vend_credential_configured: boolean;
    vend_credential_type: 'pin' | null;
    organization_name: string;
    organization_status?: string | null;
    vendor_code?: string | null;
    site?: string | null;
    wallet_number?: string | null;
    wallet_status?: string | null;
    account_status?: string | null;
    contact_person?: string | null;
    primary_phone?: string | null;
    contact_email?: string | null;
    kyc_status?: string | null;
    cac_number?: string | null;
    tin?: string | null;
    kyc_approved_date?: string | null;
    kyc_expiry?: string | null;
}

interface State {
    hydrated: boolean;
    accessToken: string | null;
    user: VendorUserProfile | null;
}

const TOKEN_KEY = 'beverly.vendor.access_token';
const REFRESH_TOKEN_KEY = 'beverly.vendor.refresh_token';
const TOKEN_EXPIRES_AT_KEY = 'beverly.vendor.access_token_expires_at';
const USER_KEY = 'beverly.vendor.user';

export interface VendorTokenOptions {
    refreshToken?: string | null;
    expiresAt?: number | null;
    expiresIn?: number | null;
}

function readStoredToken(): string | null {
    try {
        return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);
    } catch {
        try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
    }
}

function readStoredUser(): VendorUserProfile | null {
    try {
        const raw = sessionStorage.getItem(USER_KEY) ?? localStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) as VendorUserProfile : null;
    } catch {
        return null;
    }
}

function resolveExpiresAt(options: VendorTokenOptions): number | null {
    if (typeof options.expiresAt === 'number' && options.expiresAt > 0) {
        return options.expiresAt > 10_000_000_000 ? options.expiresAt : options.expiresAt * 1000;
    }
    if (typeof options.expiresIn === 'number' && options.expiresIn > 0) return Date.now() + options.expiresIn * 1000;
    return null;
}

function storeSession(token: string, user: VendorUserProfile, remember = true, options: VendorTokenOptions = {}) {
    clearStoredToken();
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(TOKEN_KEY, token);
    storage.setItem(USER_KEY, JSON.stringify(user));
    if (options.refreshToken) storage.setItem(REFRESH_TOKEN_KEY, options.refreshToken);
    const expiresAt = resolveExpiresAt(options);
    if (expiresAt) storage.setItem(TOKEN_EXPIRES_AT_KEY, String(expiresAt));
}

function clearStoredToken() {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* noop */ }
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* noop */ }
    try { localStorage.removeItem(USER_KEY); } catch { /* noop */ }
    try { sessionStorage.removeItem(USER_KEY); } catch { /* noop */ }
    try { localStorage.removeItem(REFRESH_TOKEN_KEY); } catch { /* noop */ }
    try { sessionStorage.removeItem(REFRESH_TOKEN_KEY); } catch { /* noop */ }
    try { localStorage.removeItem(TOKEN_EXPIRES_AT_KEY); } catch { /* noop */ }
    try { sessionStorage.removeItem(TOKEN_EXPIRES_AT_KEY); } catch { /* noop */ }
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
                const cachedUser = readStoredUser();
                if (!token) return;
                this.accessToken = token;
                if (cachedUser) this.user = cachedUser;

                try {
                    const me = await api.get<VendorUserProfile>('/api/v1/vendor/me');
                    this.user = me;
                    const remember = localStorage.getItem(TOKEN_KEY) !== null;
                    const storage = remember ? localStorage : sessionStorage;
                    storage.setItem(USER_KEY, JSON.stringify(me));
                } catch (err: unknown) {
                    if (err instanceof ApiError && err.status === 401) {
                        this.accessToken = null;
                        this.user = null;
                        clearStoredToken();
                    }
                }
            } catch {
                this.accessToken = null;
                this.user = null;
                clearStoredToken();
            }
        },
        setSession(token: string, user: VendorUserProfile, remember = true, tokenOptions: VendorTokenOptions = {}) {
            this.accessToken = token;
            this.user = user;
            storeSession(token, user, remember, tokenOptions);
        },
        async refreshMe() {
            const me = await api.get<VendorUserProfile>('/api/v1/vendor/me');
            this.user = me;
            const remember = localStorage.getItem(TOKEN_KEY) !== null;
            const storage = remember ? localStorage : sessionStorage;
            storage.setItem(USER_KEY, JSON.stringify(me));
            return me;
        },
        async logout() {
            try { await disableDeviceNotifications(); } catch { /* noop */ }
            try { await api.post('/api/v1/vendor/logout', {}); } catch { /* noop */ }
            this.accessToken = null;
            this.user = null;
            clearStoredToken();
        },
    },
});
