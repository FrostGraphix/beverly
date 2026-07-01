/**
 * Cross-portal URL resolver — shared scheme across all Beverly wallet apps.
 *   Landing CTAs default to the hosted Vercel wallet portals.
 *   Env override (VITE_*_URL) always wins.
 */
const env = import.meta.env as Record<string, string | undefined>;

const HOSTED_PORTALS = {
    landing: 'https://acob-beverly.vercel.app/wallet/',
    customer: 'https://customer-acob-beverly.vercel.app/',
    vendor: 'https://vendor-acob-beverly.vercel.app/',
    admin: 'https://admin-acob-beverly.vercel.app/',
} as const;

function resolve(override: string | undefined, fallback: string): string {
    if (override && override.trim()) return override.replace(/\/?$/, '/');
    return fallback;
}

export const PORTAL_URLS = {
    landing: resolve(env.VITE_LANDING_URL, HOSTED_PORTALS.landing),
    customer: resolve(env.VITE_CUSTOMER_URL, HOSTED_PORTALS.customer),
    vendor: resolve(env.VITE_VENDOR_URL, HOSTED_PORTALS.vendor),
    admin: resolve(env.VITE_ADMIN_URL, HOSTED_PORTALS.admin),
};
