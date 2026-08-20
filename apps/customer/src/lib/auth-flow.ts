export const CUSTOMER_TOKEN_KEY = 'beverly.customer.access_token';
export const LEGACY_CUSTOMER_TOKEN_KEY = 'beverly.access_token';
export const CUSTOMER_REFRESH_TOKEN_KEY = 'beverly.refresh_token';
export const CUSTOMER_TOKEN_EXPIRES_AT_KEY = 'beverly.access_token_expires_at';
export const CUSTOMER_REMEMBER_KEY = 'beverly.customer.remembered_login';
export const CUSTOMER_USER_KEY = 'beverly.customer.profile';

export interface CustomerTokenOptions {
    refreshToken?: string | null;
    expiresAt?: number | string | null;
    expiresIn?: number | null;
}

export function safeAuthRedirect(raw: unknown, fallback = '/'): string {
    if (typeof raw !== 'string') return fallback;
    const value = raw.trim();
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
    return value;
}

export const ROUTING_DEACTIVATED_KEY = 'beverly.routing_deactivated_v1';

export function ensureRoutingDeactivatedCleanup() {
    try {
        if (typeof window === 'undefined') return;
        if (localStorage.getItem(ROUTING_DEACTIVATED_KEY)) return;
        localStorage.removeItem(LEGACY_CUSTOMER_TOKEN_KEY);
        sessionStorage.removeItem(LEGACY_CUSTOMER_TOKEN_KEY);
        localStorage.setItem(ROUTING_DEACTIVATED_KEY, '1');
    } catch { /* noop */ }
}

export function readCustomerToken(): string | null {
    ensureRoutingDeactivatedCleanup();
    try {
        return sessionStorage.getItem(CUSTOMER_TOKEN_KEY) ??
               localStorage.getItem(CUSTOMER_TOKEN_KEY) ??
               sessionStorage.getItem(LEGACY_CUSTOMER_TOKEN_KEY) ??
               localStorage.getItem(LEGACY_CUSTOMER_TOKEN_KEY);
    } catch {
        try {
            return localStorage.getItem(CUSTOMER_TOKEN_KEY) ?? localStorage.getItem(LEGACY_CUSTOMER_TOKEN_KEY);
        } catch { return null; }
    }
}

export function readCustomerProfile<T = unknown>(): T | null {
    try {
        const raw = sessionStorage.getItem(CUSTOMER_USER_KEY) ?? localStorage.getItem(CUSTOMER_USER_KEY);
        return raw ? JSON.parse(raw) as T : null;
    } catch {
        return null;
    }
}

export function readCustomerRefreshToken(): string | null {
    try {
        return sessionStorage.getItem(CUSTOMER_REFRESH_TOKEN_KEY) ?? localStorage.getItem(CUSTOMER_REFRESH_TOKEN_KEY);
    } catch {
        try { return localStorage.getItem(CUSTOMER_REFRESH_TOKEN_KEY); } catch { return null; }
    }
}

export function readCustomerTokenExpiresAt(): number | null {
    try {
        const raw = sessionStorage.getItem(CUSTOMER_TOKEN_EXPIRES_AT_KEY) ?? localStorage.getItem(CUSTOMER_TOKEN_EXPIRES_AT_KEY);
        const value = Number(raw ?? 0);
        return Number.isFinite(value) && value > 0 ? value : null;
    } catch {
        return null;
    }
}

function resolveExpiresAt(options: CustomerTokenOptions): number | null {
    if (typeof options.expiresAt === 'number') return options.expiresAt > 10_000_000_000 ? options.expiresAt : options.expiresAt * 1000;
    if (typeof options.expiresAt === 'string') {
        const value = Number(options.expiresAt);
        if (Number.isFinite(value) && value > 0) return value > 10_000_000_000 ? value : value * 1000;
    }
    if (typeof options.expiresIn === 'number' && options.expiresIn > 0) return Date.now() + options.expiresIn * 1000;
    return null;
}

export function storeCustomerToken(token: string, remember = true, options: CustomerTokenOptions = {}) {
    clearCustomerToken();
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(CUSTOMER_TOKEN_KEY, token);
    if (options.refreshToken) storage.setItem(CUSTOMER_REFRESH_TOKEN_KEY, options.refreshToken);
    const expiresAt = resolveExpiresAt(options);
    if (expiresAt) storage.setItem(CUSTOMER_TOKEN_EXPIRES_AT_KEY, String(expiresAt));
}

export function clearCustomerToken() {
    try { localStorage.removeItem(CUSTOMER_TOKEN_KEY); } catch { /* noop */ }
    try { sessionStorage.removeItem(CUSTOMER_TOKEN_KEY); } catch { /* noop */ }
    try { localStorage.removeItem(LEGACY_CUSTOMER_TOKEN_KEY); } catch { /* noop */ }
    try { sessionStorage.removeItem(LEGACY_CUSTOMER_TOKEN_KEY); } catch { /* noop */ }
    try { localStorage.removeItem(CUSTOMER_USER_KEY); } catch { /* noop */ }
    try { sessionStorage.removeItem(CUSTOMER_USER_KEY); } catch { /* noop */ }
    try { localStorage.removeItem(CUSTOMER_REFRESH_TOKEN_KEY); } catch { /* noop */ }
    try { sessionStorage.removeItem(CUSTOMER_REFRESH_TOKEN_KEY); } catch { /* noop */ }
    try { localStorage.removeItem(CUSTOMER_TOKEN_EXPIRES_AT_KEY); } catch { /* noop */ }
    try { sessionStorage.removeItem(CUSTOMER_TOKEN_EXPIRES_AT_KEY); } catch { /* noop */ }
}

export function readRememberedLogin(): string {
    try { return localStorage.getItem(CUSTOMER_REMEMBER_KEY) ?? ''; } catch { return ''; }
}

export function writeRememberedLogin(value: string, remember: boolean) {
    try {
        if (remember && value.trim()) localStorage.setItem(CUSTOMER_REMEMBER_KEY, value.trim());
        else localStorage.removeItem(CUSTOMER_REMEMBER_KEY);
    } catch { /* noop */ }
}

export function normaliseNigerianPhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('234')) return `+${digits}`;
    if (digits.startsWith('0')) return `+234${digits.slice(1)}`;
    return `+234${digits}`;
}

export function isValidNigerianPhone(raw: string): boolean {
    const digits = raw.replace(/\D/g, '');
    const local = digits.startsWith('234') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits;
    return local.length === 10;
}
