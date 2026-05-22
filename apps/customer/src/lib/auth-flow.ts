export const CUSTOMER_TOKEN_KEY = 'beverly.access_token';
export const CUSTOMER_REMEMBER_KEY = 'beverly.customer.remembered_login';

export function safeAuthRedirect(raw: unknown, fallback = '/'): string {
    if (typeof raw !== 'string') return fallback;
    const value = raw.trim();
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
    return value;
}

export function readCustomerToken(): string | null {
    try {
        return sessionStorage.getItem(CUSTOMER_TOKEN_KEY) ?? localStorage.getItem(CUSTOMER_TOKEN_KEY);
    } catch {
        try { return localStorage.getItem(CUSTOMER_TOKEN_KEY); } catch { return null; }
    }
}

export function storeCustomerToken(token: string, remember = true) {
    clearCustomerToken();
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(CUSTOMER_TOKEN_KEY, token);
}

export function clearCustomerToken() {
    try { localStorage.removeItem(CUSTOMER_TOKEN_KEY); } catch { /* noop */ }
    try { sessionStorage.removeItem(CUSTOMER_TOKEN_KEY); } catch { /* noop */ }
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
