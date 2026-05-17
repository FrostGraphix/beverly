const BASE = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
    constructor(public status: number, public code: string, message: string, public details?: unknown) {
        super(message); this.name = 'ApiError';
    }
}

function getToken(): string | null {
    try { return localStorage.getItem('beverly.staff.access_token'); } catch { return null; }
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
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) {
        throw new ApiError(res.status, json?.error ?? 'http_error', json?.message ?? res.statusText, json?.details);
    }
    return json as T;
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
    post:  <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    del:   <T>(path: string) => request<T>('DELETE', path),
};
