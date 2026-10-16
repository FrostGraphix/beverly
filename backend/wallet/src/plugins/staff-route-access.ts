const PASSWORD_SETUP_ROUTES = new Set(['/me', '/password-change', '/account-setup', '/logout']);

export function isPasswordSetupRoute(routeUrl: string): boolean {
    const pathname = routeUrl.split('?')[0] ?? '';
    const adminRoute = pathname.replace(/^\/api\/v1\/admin(?=\/|$)/, '') || '/';
    return PASSWORD_SETUP_ROUTES.has(adminRoute);
}
