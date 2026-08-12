export type FundingPortal = 'customer' | 'vendor';

const FUNDING_PATH: Record<FundingPortal, string> = {
    customer: 'wallet/fund',
    vendor: 'wallet/fund',
};

/**
 * Build a trusted Paystack return URL from server-owned configuration.
 * Existing path prefixes remain intact for path-based Vercel deployments.
 */
export function buildFundingCallbackUrl(portal: FundingPortal, portalBaseUrl: string): string {
    const url = new URL(portalBaseUrl);
    const basePath = url.pathname.replace(/\/+$/, '');
    url.pathname = `${basePath}/${FUNDING_PATH[portal]}`.replace(/\/{2,}/g, '/');
    url.search = '';
    url.hash = '';
    url.searchParams.set('payment', 'return');
    return url.toString();
}

export function resolveFundingCallbackUrl(
    portal: FundingPortal,
    explicitUrl: string | undefined,
    portalBaseUrl: string,
): string {
    return explicitUrl ? new URL(explicitUrl).toString() : buildFundingCallbackUrl(portal, portalBaseUrl);
}

export function buildMeterOrderCallbackUrl(customerPortalBaseUrl: string): string {
    const url = new URL(customerPortalBaseUrl);
    const basePath = url.pathname.replace(/\/+$/, '');
    url.pathname = `${basePath}/meter-orders`.replace(/\/{2,}/g, '/');
    url.search = '';
    url.hash = '';
    return url.toString();
}

export function resolveMeterOrderCallbackUrl(
    explicitUrl: string | undefined,
    customerPortalBaseUrl: string,
): string {
    return explicitUrl
        ? new URL(explicitUrl).toString()
        : buildMeterOrderCallbackUrl(customerPortalBaseUrl);
}
