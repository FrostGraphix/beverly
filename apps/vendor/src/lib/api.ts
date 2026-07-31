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
const REFRESH_TOKEN_KEY = 'beverly.vendor.refresh_token';
const TOKEN_EXPIRES_AT_KEY = 'beverly.vendor.access_token_expires_at';
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
    try { localStorage.removeItem(REFRESH_TOKEN_KEY); } catch { /* noop */ }
    try { sessionStorage.removeItem(REFRESH_TOKEN_KEY); } catch { /* noop */ }
    try { localStorage.removeItem(TOKEN_EXPIRES_AT_KEY); } catch { /* noop */ }
    try { sessionStorage.removeItem(TOKEN_EXPIRES_AT_KEY); } catch { /* noop */ }
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

function shouldRedirectUnauthorized(path: string): boolean {
    return path !== '/api/v1/vendor/me' && path !== '/api/v1/vendor/logout';
}

function shouldRefreshUnauthorized(path: string): boolean {
    return path !== '/api/v1/vendor/logout';
}

function rememberTokenStorage(): boolean {
    try { return localStorage.getItem(TOKEN_KEY) !== null; } catch { return true; }
}

function readVendorRefreshToken(): string | null {
    try { return sessionStorage.getItem(REFRESH_TOKEN_KEY) ?? localStorage.getItem(REFRESH_TOKEN_KEY); }
    catch { try { return localStorage.getItem(REFRESH_TOKEN_KEY); } catch { return null; } }
}

function readTokenExpiresAt(): number | null {
    try {
        const raw = sessionStorage.getItem(TOKEN_EXPIRES_AT_KEY) ?? localStorage.getItem(TOKEN_EXPIRES_AT_KEY);
        const value = Number(raw ?? 0);
        return Number.isFinite(value) && value > 0 ? value : null;
    } catch {
        return null;
    }
}

function tokenExpiresSoon(): boolean {
    const expiresAt = readTokenExpiresAt();
    return expiresAt !== null && expiresAt - Date.now() <= REFRESH_SKEW_MS;
}

function storeRefreshedToken(accessToken: string, refreshToken: string, expiresAt: number | null, expiresIn: number | null): void {
    const storage = rememberTokenStorage() ? localStorage : sessionStorage;
    storage.setItem(TOKEN_KEY, accessToken);
    storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    const nextExpiresAt = expiresAt ? expiresAt * 1000 : expiresIn ? Date.now() + expiresIn * 1000 : null;
    if (nextExpiresAt) storage.setItem(TOKEN_EXPIRES_AT_KEY, String(nextExpiresAt));
}

async function refreshAccessToken(): Promise<string | null> {
    const refreshToken = readVendorRefreshToken();
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
            storeRefreshedToken(
                json.access_token,
                typeof json.refresh_token === 'string' ? json.refresh_token : refreshToken,
                typeof json.expires_at === 'number' ? json.expires_at : null,
                typeof json.expires_in === 'number' ? json.expires_in : null,
            );
            return json.access_token as string;
        })().finally(() => {
            refreshPromise = null;
        });
    }
    return refreshPromise;
}

async function requestToken(): Promise<string | null> {
    if (tokenExpiresSoon()) return await refreshAccessToken() ?? getToken();
    return getToken();
}

async function request<T>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
    let token = await requestToken();
    const hasBody = body !== undefined;
    const idempotencyKey = method !== 'GET' && method !== 'HEAD'
        ? String((init.headers as Record<string, string> | undefined)?.['Idempotency-Key'] ?? crypto.randomUUID())
        : null;
    const send = async () => {
        const headers: Record<string, string> = {
            ...(init.headers as Record<string, string> ?? {}),
        };
        if (hasBody) headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (idempotencyKey) {
            headers['Idempotency-Key'] = idempotencyKey;
        }
        return fetch(`${BASE}${path}`, {
            ...init, method, headers,
            body: hasBody ? JSON.stringify(body) : undefined,
            credentials: 'include',
        });
    };
    let res = await send();
    if (res.status === 401 && shouldRefreshUnauthorized(path)) {
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
        throw new ApiError(res.status, json?.error ?? 'http_error', json?.message ?? res.statusText, json?.details);
    }
    return unwrapEnvelope<T>(json);
}

export const api = {
    get:   <T>(path: string) => request<T>('GET', path),
    post:  <T>(path: string, body?: unknown, init?: RequestInit) => request<T>('POST', path, body, init),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    del:   <T>(path: string) => request<T>('DELETE', path),
};

/**
 * Idempotency key tied to one user intent rather than one fetch.
 *
 * `request` mints a fresh UUID per call, which means a double-click on a money
 * button reads as two distinct intents server-side and opens two checkouts.
 * Callers that represent a single intent should hold a key across retries and
 * only roll it when the intent genuinely changes.
 */
export function idempotencyHeaders(key: string): RequestInit {
    return { headers: { 'Idempotency-Key': key } };
}

export function newIdempotencyKey(): string {
    return crypto.randomUUID();
}

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
