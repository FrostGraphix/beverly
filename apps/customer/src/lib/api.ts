/**
 * Tiny fetch wrapper.
 *   • Attaches bearer token from auth store
 *   • Adds Idempotency-Key for mutations
 *   • Normalizes errors to { error, message, details?, status }
 */
import {
    clearCustomerToken,
    readCustomerRefreshToken,
    readCustomerTokenExpiresAt,
    storeCustomerToken,
} from './auth-flow';

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
const REQUEST_TIMEOUT_MS = 20_000;
const TOKEN_KEY = 'beverly.access_token';
const REFRESH_SKEW_MS = 60_000;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
let authRedirecting = false;
let refreshPromise: Promise<string | null> | null = null;

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

function newIdemKey(): string {
    return crypto.randomUUID();
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
    clearCustomerToken();
    redirectToLogin();
}

function shouldRedirectUnauthorized(path: string): boolean {
    return !path.startsWith('/api/v1/customer/auth/') && path !== '/api/v1/customer/me' && path !== '/api/v1/customer/logout';
}

function rememberTokenStorage(): boolean {
    try { return localStorage.getItem(TOKEN_KEY) !== null; } catch { return true; }
}

function tokenExpiresSoon(): boolean {
    const expiresAt = readCustomerTokenExpiresAt();
    return expiresAt !== null && expiresAt - Date.now() <= REFRESH_SKEW_MS;
}

async function refreshAccessToken(): Promise<string | null> {
    const refreshToken = readCustomerRefreshToken();
    if (!refreshToken || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    if (!refreshPromise) {
        refreshPromise = (async () => {
            const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
                body: JSON.stringify({ refresh_token: refreshToken }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || typeof json.access_token !== 'string') return null;
            storeCustomerToken(json.access_token, rememberTokenStorage(), {
                refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : refreshToken,
                expiresAt: typeof json.expires_at === 'number' ? json.expires_at : null,
                expiresIn: typeof json.expires_in === 'number' ? json.expires_in : null,
            });
            return json.access_token as string;
        })().finally(() => {
            refreshPromise = null;
        });
    }
    return refreshPromise;
}

async function requestToken(path: string): Promise<string | null> {
    if (!path.startsWith('/api/v1/customer/auth/') && tokenExpiresSoon()) {
        return await refreshAccessToken() ?? getToken();
    }
    return getToken();
}

async function request<T>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        let token = await requestToken(path);
        const idempotencyKey = method !== 'GET' && method !== 'HEAD'
            ? String((init.headers as Record<string, string> | undefined)?.['Idempotency-Key'] ?? newIdemKey())
            : null;
        const send = async () => {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                ...(init.headers as Record<string, string> ?? {}),
            };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            if (idempotencyKey) {
                headers['Idempotency-Key'] = idempotencyKey;
            }
            return fetch(`${BASE}${path}`, {
                ...init,
                method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                credentials: 'include',
                signal: init.signal ?? controller.signal,
            });
        };
        let res = await send();
        if (res.status === 401 && shouldRedirectUnauthorized(path)) {
            const refreshed = await refreshAccessToken();
            if (refreshed && refreshed !== token) {
                token = refreshed;
                res = await send();
            }
        }

        const text = await res.text();
        const json = parseJson(text);

        if (!res.ok) {
            if (res.status === 401 && shouldRedirectUnauthorized(path)) handleUnauthorized();
            throw new ApiError(
                res.status,
                json?.error ?? 'http_error',
                json?.message ?? res.statusText,
                json?.details,
            );
        }
        return unwrapEnvelope<T>(json);
    } catch (error) {
        if (error instanceof ApiError) throw error;
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new ApiError(
                0,
                'request_timeout',
                'The server took too long to respond. Please try again.',
            );
        }
        throw error;
    } finally {
        window.clearTimeout(timeout);
    }
}

export const api = {
    get:   <T>(path: string) => request<T>('GET', path),
    post:  <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    put:   <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    del:   <T>(path: string) => request<T>('DELETE', path),
};

export function redirectToPayment(url: string | null | undefined): void {
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
}
