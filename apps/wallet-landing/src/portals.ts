/**
 * Cross-portal URL resolver — shared scheme across all Beverly wallet apps.
 *   DEV  → localhost dev ports (separate origins)
 *   PROD → path-based on one origin (/wallet/, /wallet-customer/, ...)
 *   Env override (VITE_*_URL) always wins.
 */
const env = import.meta.env as Record<string, string | undefined>;
const DEV = import.meta.env.DEV;

function resolve(override: string | undefined, devPort: number, prodPath: string): string {
    if (override && override.trim()) return override.replace(/\/?$/, '/');
    if (DEV) return `http://localhost:${devPort}/`;
    return prodPath;
}

export const PORTAL_URLS = {
    landing: resolve(env.VITE_LANDING_URL, 5176, '/wallet/'),
    customer: resolve(env.VITE_CUSTOMER_URL, 5173, '/wallet-customer/'),
    vendor: resolve(env.VITE_VENDOR_URL, 5174, '/wallet-vendor/'),
    admin: resolve(env.VITE_ADMIN_URL, 5175, '/wallet-admin/'),
};
