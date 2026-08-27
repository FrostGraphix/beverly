/**
 * Canonical HTTP policy for every non-read wallet endpoint.
 *
 * Routes must be declared here before production traffic can mutate state.
 * This keeps write, cache, money, and developer-tooling decisions reviewable.
 */
export type MutationMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RoutePolicy {
    method: MutationMethod;
    path: string;
    mutation: true;
    money?: boolean;
    cacheable: false;
    developerOnly?: boolean;
}

const mutation = (method: MutationMethod, path: string, options: Omit<RoutePolicy, 'method' | 'path' | 'mutation' | 'cacheable'> = {}): RoutePolicy => ({
    method,
    path,
    mutation: true,
    cacheable: false,
    ...options,
});

const post = (path: string, options?: Omit<RoutePolicy, 'method' | 'path' | 'mutation' | 'cacheable'>) => mutation('POST', path, options);
const put = (path: string, options?: Omit<RoutePolicy, 'method' | 'path' | 'mutation' | 'cacheable'>) => mutation('PUT', path, options);
const patch = (path: string, options?: Omit<RoutePolicy, 'method' | 'path' | 'mutation' | 'cacheable'>) => mutation('PATCH', path, options);
const del = (path: string, options?: Omit<RoutePolicy, 'method' | 'path' | 'mutation' | 'cacheable'>) => mutation('DELETE', path, options);

export const mutationRoutePolicies: readonly RoutePolicy[] = [
    put('/api/v1/preferences/locale'),
    post('/api/v1/webhook/paystack', { money: true }),
    post('/api/v1/public/faqs/:id/view'), post('/api/v1/public/faqs/:id/vote'), post('/api/v1/public/vendor-application'),
    ...['signup', 'email/signup', 'email/login', 'phone/signup', 'phone/login', 'login', 'recover', 'verify', 'email/recover', 'email/reset-password', 'email/verify/send', 'email/verify/confirm'].map((path) => post(`/api/v1/customer/auth/${path}`)),
    patch('/api/v1/customer/me'), post('/api/v1/customer/vend-pin'), post('/api/v1/customer/profile-picture/upload-url'), post('/api/v1/customer/profile-picture/scan'), post('/api/v1/customer/profile-picture/activate'), del('/api/v1/customer/profile-picture'), post('/api/v1/customer/logout'),
    post('/api/v1/customer/kyc/tier1'), post('/api/v1/customer/kyc/tier2/nin'), post('/api/v1/customer/meters'), del('/api/v1/customer/meters/:id'),
    post('/api/v1/customer/wallet/fund', { money: true }), post('/api/v1/customer/payments/:reference/verify', { money: true }), post('/api/v1/customer/purchase/preview'), post('/api/v1/customer/purchase', { money: true }), post('/api/v1/customer/purchase/step-up-verify'), post('/api/v1/customer/purchase/:purchaseOrderId/remote-send'),
    post('/api/v1/customer/meter-orders', { money: true }), post('/api/v1/customer/meter-orders/:id/verify-payment', { money: true }),
    post('/api/v1/customer/disputes'), post('/api/v1/customer/disputes/:id/messages'), post('/api/v1/customer/support/tickets'), post('/api/v1/customer/support/tickets/:id/messages'), post('/api/v1/customer/support/chat/session'), post('/api/v1/customer/support/chat/:id/messages'), post('/api/v1/customer/support/chat/:id/end'), post('/api/v1/customer/support/chat/:id/escalate'),
    post('/api/v1/customer/receipts/:id/resend-sms'), post('/api/v1/customer/privacy/data-export'), post('/api/v1/customer/privacy/delete-account'), del('/api/v1/customer/privacy/delete-account'), post('/api/v1/customer/notifications/read-all'), patch('/api/v1/customer/notifications/:id/read'), put('/api/v1/customer/notifications/preferences'), post('/api/v1/customer/pwa-installed'),
    ...['setup/start', 'setup/verify', 'setup/reset', 'challenge/verify', 'recovery/regenerate', 'disable'].map((path) => post(`/api/v1/admin/mfa/${path}`)),
    post('/api/v1/vendor/auth/reset-request'), post('/api/v1/vendor/auth/reset-confirm'),
    patch('/api/v1/vendor/me'), post('/api/v1/vendor/profile-picture/upload-url'), post('/api/v1/vendor/profile-picture/scan'), post('/api/v1/vendor/profile-picture/activate'), del('/api/v1/vendor/profile-picture'), post('/api/v1/vendor/notifications/read-all'), patch('/api/v1/vendor/notifications/:id/read'), post('/api/v1/vendor/pwa-installed'),
    post('/api/v1/vendor/vend-credential'), ...['setup/start', 'setup/verify', 'setup/reset', 'challenge/verify', 'recovery/regenerate', 'disable'].map((path) => post(`/api/v1/vendor/mfa/${path}`)), post('/api/v1/vendor/password-change'),
    post('/api/v1/vendor/meter-orders', { money: true }), post('/api/v1/vendor/funding/paystack', { money: true }), post('/api/v1/vendor/payments/:reference/verify', { money: true }), post('/api/v1/vendor/funding/bank-transfer', { money: true }), post('/api/v1/vendor/vend/preview'), post('/api/v1/vendor/vend/live-plan'), post('/api/v1/vendor/vend', { money: true }), post('/api/v1/vendor/vend/:purchaseOrderId/remote-send'), post('/api/v1/vendor/logout'),
    post('/api/v1/vendor/disputes'), post('/api/v1/vendor/disputes/:id/messages'), post('/api/v1/vendor/support/tickets'), post('/api/v1/vendor/support/tickets/:id/messages'), post('/api/v1/vendor/support/chat/session'), post('/api/v1/vendor/support/chat/:id/messages'), post('/api/v1/vendor/support/chat/:id/end'), post('/api/v1/vendor/support/chat/:id/escalate'),
    patch('/api/v1/admin/me'), post('/api/v1/admin/logout'), post('/api/v1/admin/profile-picture/upload-url'), post('/api/v1/admin/profile-picture/scan'), post('/api/v1/admin/profile-picture/activate'), del('/api/v1/admin/profile-picture'),
    put('/api/v1/admin/access/roles/:roleKey/permissions'), post('/api/v1/admin/access/roles'), patch('/api/v1/admin/access/roles/:roleKey'), del('/api/v1/admin/access/roles/:roleKey'), post('/api/v1/admin/access/users'), patch('/api/v1/admin/access/users/:userId/role'), patch('/api/v1/admin/access/users/:userId/station'), patch('/api/v1/admin/access/users/:userId/suspension'), post('/api/v1/admin/access/users/:userId/reset-password'), post('/api/v1/admin/access/users/:userId/revoke-sessions'),
    post('/api/v1/admin/stations/refresh'), del('/api/v1/admin/vendor-applications/:id'), post('/api/v1/admin/vendors'), patch('/api/v1/admin/vendors/:id'), del('/api/v1/admin/vendors/:id'), patch('/api/v1/admin/vendors/:id/status'), patch('/api/v1/admin/vendors/:id/station'), patch('/api/v1/admin/vendors/:id/profile-picture'),
    post('/api/v1/admin/funding/reconcile-approved', { money: true }), post('/api/v1/admin/funding/:id/approve', { money: true }), post('/api/v1/admin/funding/:id/reject', { money: true }), patch('/api/v1/admin/wallets/:id/status', { money: true }), patch('/api/v1/admin/wallets/:id/limits', { money: true }),
    post('/api/v1/admin/vendor-transfers/preview'), post('/api/v1/admin/vendor-transfers', { money: true }),
    del('/api/v1/admin/customers/:id'), patch('/api/v1/admin/customers/:id/status'), patch('/api/v1/admin/customers/:id/profile-picture'), post('/api/v1/admin/customer-meters/:id/approve'), post('/api/v1/admin/customer-meters/:id/reject'), post('/api/v1/admin/customer-meters/:id/unlink'), post('/api/v1/admin/purchases/:id/resend-sms'), post('/api/v1/admin/purchases/:id/resend-remote'), post('/api/v1/admin/purchases/:id/release-hold', { money: true }), post('/api/v1/admin/purchases/:id/retry-vend', { money: true }), post('/api/v1/admin/meter-orders', { money: true }), post('/api/v1/admin/meter-orders/:id/reject', { money: true }), patch('/api/v1/admin/meter-orders/:id', { money: true }), put('/api/v1/admin/meter-pricing'), patch('/api/v1/admin/fraud/:id/resolve'), patch('/api/v1/admin/disputes/:id'),
    post('/api/v1/admin/support/faq-categories'), put('/api/v1/admin/support/faq-categories/:id'), del('/api/v1/admin/support/faq-categories/:id'), post('/api/v1/admin/support/faqs'), put('/api/v1/admin/support/faqs/:id'), del('/api/v1/admin/support/faqs/:id'), patch('/api/v1/admin/support/tickets/:id'), post('/api/v1/admin/support/tickets/:id/messages'), post('/api/v1/admin/support/chat/:id/messages'), post('/api/v1/admin/support/chat/:id/assign'), post('/api/v1/admin/support/chat/:id/end'),
    post('/api/v1/admin/announcements'), post('/api/v1/admin/refunds', { money: true }), post('/api/v1/admin/refunds/:id/approve', { money: true }), post('/api/v1/admin/refunds/:id/reject', { money: true }), post('/api/v1/admin/reconciliation/run', { money: true }), post('/api/v1/admin/feature-flags'), patch('/api/v1/admin/feature-flags/:key'), post('/api/v1/admin/consumption/refresh'), patch('/api/v1/admin/privacy/deletions/:id'),
    post('/api/v1/admin/dev/*', { developerOnly: true }), put('/api/v1/admin/dev/*', { developerOnly: true }), patch('/api/v1/admin/dev/*', { developerOnly: true }), del('/api/v1/admin/dev/*', { developerOnly: true }),
    // Beverly AI — chat completions, audio transcription (no money writes)
    post('/api/v1/acobot/chat'), post('/api/v1/acobot/transcribe'),
];

function matchesTemplate(pathname: string, template: string): boolean {
    const expression = template
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/:([A-Za-z][A-Za-z0-9_]*)/g, '[^/]+')
        .replace(/\\\*/g, '.*');
    return new RegExp(`^${expression}$`).test(pathname);
}

export function resolveMutationRoutePolicy(method: string, url: string): RoutePolicy | null {
    const normalizedMethod = method.toUpperCase() as MutationMethod;
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) return null;
    const pathname = url.split('?')[0] ?? url;
    return mutationRoutePolicies.find((policy) => policy.method === normalizedMethod && matchesTemplate(pathname, policy.path)) ?? null;
}
