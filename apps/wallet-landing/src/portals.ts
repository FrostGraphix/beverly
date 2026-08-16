/**
 * Cross-portal URL resolver — shared scheme across all Beverly wallet apps.
 *
 *   Dev:  each app runs on its own Vite port, so we link straight to localhost.
 *   Prod: all wallet apps build under one Vercel deployment with path-based
 *         routing (see root vercel.json rewrites + each app's vite `base`),
 *         so a same-origin relative path always reaches the right app —
 *         on the main deployment, any PR preview URL, or a future custom
 *         domain — with no per-environment config needed.
 *
 *   Env override (VITE_*_URL) always wins over both, for one-off cases.
 */
const env = import.meta.env as Record<string, string | undefined>;

const DEV_PORTALS = {
    landing: 'http://localhost:5176/',
    customer: 'http://localhost:5173/',
    vendor: 'http://localhost:5174/',
    admin: 'http://localhost:5175/',
} as const;

const PROD_PORTALS = {
    landing: '/wallet/',
    customer: '/wallet-customer/',
    vendor: '/wallet-vendor/',
    admin: '/wallet-admin/',
} as const;

const DEFAULT_PORTALS = import.meta.env.DEV ? DEV_PORTALS : PROD_PORTALS;

function resolve(override: string | undefined, fallback: string): string {
    if (override && override.trim()) return override.replace(/\/?$/, '/');
    return fallback;
}

export const PORTAL_URLS = {
    landing: resolve(env.VITE_LANDING_URL, DEFAULT_PORTALS.landing),
    customer: resolve(env.VITE_CUSTOMER_URL, DEFAULT_PORTALS.customer),
    vendor: resolve(env.VITE_VENDOR_URL, DEFAULT_PORTALS.vendor),
    admin: resolve(env.VITE_ADMIN_URL, DEFAULT_PORTALS.admin),
};
