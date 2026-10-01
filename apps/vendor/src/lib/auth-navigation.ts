const AUTHENTICATION_PATHS = new Set([
    '/login',
    '/forgot-password',
    '/reset-password',
    '/password-change',
]);

export function safeVendorRedirect(raw: unknown, fallback = '/'): string {
    if (typeof raw !== 'string') return fallback;
    const value = raw.trim();
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
    let decoded: string;
    try {
        decoded = decodeURIComponent(value);
    } catch {
        return fallback;
    }
    if (decoded.includes('\\') || /[\u0000-\u001f\u007f]/.test(decoded)) return fallback;
    const url = new URL(value, 'https://vendor.invalid');
    const portalRelativePath = url.pathname.replace(/^\/(?:wallet-vendor|vendor)(?=\/|$)/i, '') || '/';
    const pathname = portalRelativePath.replace(/\/+$/, '') || '/';
    if (AUTHENTICATION_PATHS.has(pathname.toLowerCase())) return fallback;
    return `${portalRelativePath}${url.search}${url.hash}`;
}
