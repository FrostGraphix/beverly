export const CANONICAL_VENDOR_PORTAL_URL = 'https://beverly.acoblighting.com/wallet-vendor/';

export function resolveVendorPortalUrl(configuredUrl: string, runtime: string): string {
    if (runtime === 'production') return CANONICAL_VENDOR_PORTAL_URL;
    return new URL(configuredUrl).toString();
}
