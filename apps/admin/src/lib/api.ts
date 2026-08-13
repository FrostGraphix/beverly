function normalizeBaseUrl(rawBase: unknown): string {
    const base = String(rawBase ?? '').trim().replace(/\/+$/, '');
    if (!base) return '';

    if (typeof window === 'undefined') return base;

    try {
        const apiUrl = new URL(base, window.location.origin);
        const pageUrl = new URL(window.location.origin);
        const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
        const isLocalApi = localHosts.has(apiUrl.hostname);
        const isLocalPage = localHosts.has(pageUrl.hostname);

        if (isLocalApi && isLocalPage && apiUrl.origin !== pageUrl.origin) {
            return '';
        }
    } catch {
        return base;
    }

    return base;
}

const BASE = normalizeBaseUrl(import.meta.env.VITE_API_BASE);
export const API_BASE = BASE;
const STAFF_ACCESS_TOKEN_KEY = 'beverly.staff.access_token';
const STAFF_USER_KEY = 'beverly.staff.user';
const STAFF_PERMISSIONS_KEY = 'beverly.staff.permissions';
const REQUEST_TIMEOUT_MS = 20_000;
let authRedirecting = false;

export class ApiError extends Error {
    constructor(public status: number, public code: string, message: string, public details?: unknown) {
        super(message); this.name = 'ApiError';
    }
}

function getToken(): string | null {
    try { return localStorage.getItem(STAFF_ACCESS_TOKEN_KEY); } catch { return null; }
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

function clearStaffSession(): void {
    try {
        localStorage.removeItem(STAFF_ACCESS_TOKEN_KEY);
        localStorage.removeItem(STAFF_USER_KEY);
        localStorage.removeItem(STAFF_PERMISSIONS_KEY);
    } catch {
        // Storage can be unavailable in hardened browsers.
    }
}

function adminBasePath(): string {
    const base = String(import.meta.env.BASE_URL || '/').trim();
    if (!base || base === '/') return '/';
    const normalized = `/${base.replace(/^\/+|\/+$/g, '')}/`;
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith(normalized)) return '/';
    return normalized;
}

function routerPathFromLocation(): string {
    const base = adminBasePath();
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (base !== '/' && current.startsWith(base)) {
        return `/${current.slice(base.length)}` || '/';
    }
    return current;
}

function appUrl(path: string): URL {
    return new URL(`${adminBasePath()}${path.replace(/^\/+/, '')}`, window.location.origin);
}

function redirectToLogin(): void {
    if (typeof window === 'undefined' || authRedirecting) return;

    authRedirecting = true;
    const currentPath = routerPathFromLocation();
    const loginUrl = appUrl('/login');
    if (!window.location.pathname.endsWith('/login')) {
        loginUrl.searchParams.set('redirect', currentPath);
    }
    loginUrl.searchParams.set('reason', 'session_expired');
    window.location.assign(loginUrl.toString());
}

function handleUnauthorized(): void {
    clearStaffSession();
    redirectToLogin();
}

function shouldRedirectUnauthorized(path: string): boolean {
    return path !== '/api/v1/admin/me';
}

let mfaRedirecting = false;
function handleMfaRequired(): void {
    // Session is valid but the app-level MFA grant expired — keep the token and
    // route to the login screen's challenge step.
    if (typeof window === 'undefined' || mfaRedirecting) return;
    if (window.location.pathname.endsWith('/login')) return;
    mfaRedirecting = true;
    const currentPath = routerPathFromLocation();
    const url = appUrl('/login');
    url.searchParams.set('redirect', currentPath);
    url.searchParams.set('reason', 'mfa_required');
    window.location.assign(url.toString());
}

async function request<T>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const hasBody = body !== undefined;
    const headers: Record<string, string> = {
        ...(init.headers as Record<string, string> ?? {}),
    };
    if (hasBody) headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (method !== 'GET' && method !== 'HEAD') {
        headers['Idempotency-Key'] = headers['Idempotency-Key'] ?? crypto.randomUUID();
    }
    try {
        const res = await fetch(`${BASE}${path}`, {
            ...init, method, headers,
            body: hasBody ? JSON.stringify(body) : undefined,
            credentials: 'include',
            signal: init.signal ?? controller.signal,
        });
        const text = await res.text();
        const json = parseJson(text);
        if (!res.ok) {
            if (res.status === 401 && shouldRedirectUnauthorized(path)) handleUnauthorized();
            else if (res.status === 403 && json?.error === 'mfa_required') handleMfaRequired();
            throw new ApiError(res.status, json?.error ?? 'http_error', json?.message ?? res.statusText, json?.details);
        }
        return unwrapEnvelope<T>(json);
    } catch (error) {
        if (error instanceof ApiError) throw error;
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new ApiError(0, 'request_timeout', 'The server took too long to respond. Please try again.');
        }
        throw error;
    } finally {
        window.clearTimeout(timeout);
    }
}

export function naira(minor: number | null | undefined): string {
    if (minor === null || minor === undefined) return '—';
    return '₦' + (minor / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function shortDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const api = {
    get:   <T>(path: string) => request<T>('GET', path),
    post:  <T>(path: string, body?: unknown, init?: RequestInit) => request<T>('POST', path, body, init),
    put:   <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    del:   <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};
