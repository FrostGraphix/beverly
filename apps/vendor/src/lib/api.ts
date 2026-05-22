function normalizeBaseUrl(rawBase: unknown): string {
    const base = String(rawBase ?? '').trim().replace(/\/+$/, '');
    if (!base) return '';

    if (typeof window === 'undefined') return base;

    try {
        const apiUrl = new URL(base, window.location.origin);
        const pageUrl = new URL(window.location.origin);
        const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

        if (localHosts.has(apiUrl.hostname) && localHosts.has(pageUrl.hostname) && apiUrl.origin !== pageUrl.origin) {
            return '';
        }
    } catch {
        return base;
    }

    return base;
}

const BASE = normalizeBaseUrl(import.meta.env.VITE_API_BASE);
export const API_BASE = BASE;
const TOKEN_KEY = 'beverly.vendor.access_token';
let authRedirecting = false;

export class ApiError extends Error {
    constructor(public status: number, public code: string, message: string, public details?: unknown) {
        super(message);
        this.name = 'ApiError';
    }
}

function getToken(): string | null {
    try {
        return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);
    } catch {
        try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
    }
}

function parseJson(text: string): any {
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
}

function unwrapEnvelope<T>(json: any): T {
    if (json && typeof json === 'object' && ('data' in json || 'result' in json) && ('code' in json || 'msg' in json)) {
        return (json.data ?? json.result) as T;
    }
    return json as T;
}

function clearVendorSession(): void {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* noop */ }
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* noop */ }
}

function portalBasePath(): string {
    const configuredBase = String(import.meta.env.BASE_URL ?? '/');
    const normalized = configuredBase && configuredBase !== '/'
        ? `/${configuredBase.replace(/^\/+|\/+$/g, '')}/`
        : '/';

    if (typeof window === 'undefined' || normalized === '/') return normalized;
    return window.location.pathname.startsWith(normalized) ? normalized : '/';
}

function redirectToLogin(): void {
    if (typeof window === 'undefined' || authRedirecting) return;
    authRedirecting = true;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const loginPath = `${portalBasePath()}login`;
    const loginUrl = new URL(loginPath, window.location.origin);
    if (window.location.pathname !== loginPath) loginUrl.searchParams.set('redirect', current);
    loginUrl.searchParams.set('reason', 'session_expired');
    window.location.assign(loginUrl.toString());
}

function handleUnauthorized(): void {
    clearVendorSession();
    redirectToLogin();
}

async function request<T>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> ?? {}),
    };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (method !== 'GET' && method !== 'HEAD') {
        headers['Idempotency-Key'] = headers['Idempotency-Key'] ?? crypto.randomUUID();
    }
    const res = await fetch(`${BASE}${path}`, {
        ...init, method, headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        credentials: 'include',
    });
    const text = await res.text();
    const json = parseJson(text);
    if (!res.ok) {
        if (res.status === 401) handleUnauthorized();
        throw new ApiError(res.status, json?.error ?? 'http_error', json?.message ?? res.statusText, json?.details);
    }
    return unwrapEnvelope<T>(json);
}

export const api = {
    get:   <T>(path: string) => request<T>('GET', path),
    post:  <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    del:   <T>(path: string) => request<T>('DELETE', path),
};

export function redirectToPayment(url: string | null | undefined): never {
    let parsed: URL;
    try {
        parsed = new URL(String(url ?? ''));
    } catch {
        throw new ApiError(0, 'invalid_payment_redirect', 'Payment redirect URL is invalid.');
    }

    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' || (host !== 'checkout.paystack.com' && !host.endsWith('.paystack.com'))) {
        throw new ApiError(0, 'invalid_payment_redirect', 'Payment redirect URL is not trusted.');
    }

    window.location.assign(parsed.toString());
    throw new ApiError(0, 'payment_redirect_started', 'Redirecting to payment.');
}
