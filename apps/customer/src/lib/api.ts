/**
 * Tiny fetch wrapper.
 *   • Attaches bearer token from auth store
 *   • Adds Idempotency-Key for mutations
 *   • Normalizes errors to { error, message, details?, status }
 */
const BASE = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
    constructor(public status: number, public code: string, message: string, public details?: unknown) {
        super(message);
        this.name = 'ApiError';
    }
}

function getToken(): string | null {
    try { return localStorage.getItem('beverly.access_token'); } catch { return null; }
}

function newIdemKey(): string {
    return crypto.randomUUID();
}

async function request<T>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> ?? {}),
    };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (method !== 'GET' && method !== 'HEAD') {
        headers['Idempotency-Key'] = headers['Idempotency-Key'] ?? newIdemKey();
    }

    const res = await fetch(`${BASE}${path}`, {
        ...init,
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        credentials: 'include',
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : null;

    if (!res.ok) {
        throw new ApiError(
            res.status,
            json?.error ?? 'http_error',
            json?.message ?? res.statusText,
            json?.details,
        );
    }
    return json as T;
}

export const api = {
    get:   <T>(path: string) => request<T>('GET', path),
    post:  <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    del:   <T>(path: string) => request<T>('DELETE', path),
};
