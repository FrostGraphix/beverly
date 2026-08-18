import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useStaffAuthStore } from '../stores/auth';

function portalHistoryBase(configuredBase: string): string {
    const base = configuredBase && configuredBase !== '/' ? `/${configuredBase.replace(/^\/+|\/+$/g, '')}/` : '/';
    if (typeof window === 'undefined' || base === '/') return base;
    return window.location.pathname.startsWith(base) ? base : '/';
}

const routes: RouteRecordRaw[] = [
    { path: '/login', name: 'login', component: () => import('../views/Login.vue'), meta: { guest: true } },
    { path: '/', name: 'dashboard', component: () => import('../views/Dashboard.vue'), meta: { auth: true, permission: 'wallet.dashboard.view' } },
    { path: '/applications', name: 'applications', component: () => import('../views/Applications.vue'), meta: { auth: true, permission: 'wallet.vendors.review' } },
    { path: '/vendors', name: 'vendors', component: () => import('../views/Vendors.vue'), meta: { auth: true, permission: 'wallet.vendors.review' } },
    { path: '/vendors/new', name: 'vendor-new', component: () => import('../views/VendorCreate.vue'), meta: { auth: true, permission: 'wallet.vendors.manage' } },
    { path: '/vendors/analytics', name: 'vendor-analytics', component: () => import('../views/VendorAnalytics.vue'), meta: { auth: true, permission: 'wallet.vendors.review' } },
    { path: '/vendors/:id', name: 'vendor-detail', component: () => import('../views/VendorDetail.vue'), meta: { auth: true, permission: 'wallet.vendors.review' } },
    { path: '/funding', name: 'funding', component: () => import('../views/Funding.vue'), meta: { auth: true, permission: 'wallet.funding.view' } },
    { path: '/funding/history', name: 'funding-history', component: () => import('../views/FundingHistory.vue'), meta: { auth: true, permission: 'wallet.funding.view' } },
    { path: '/wallets', name: 'wallets', component: () => import('../views/Wallets.vue'), meta: { auth: true, permission: 'wallet.funding.view' } },
    { path: '/vendor-transfers', name: 'vendor-transfers', component: () => import('../views/VendorTransfers.vue'), meta: { auth: true, permission: 'wallet.vendor_transfers.manage' } },
    { path: '/purchases', name: 'purchases', component: () => import('../views/Purchases.vue'), meta: { auth: true, permission: 'wallet.vending.monitor' } },
    { path: '/customers', name: 'customers', component: () => import('../views/Customers.vue'), meta: { auth: true, permission: 'wallet.customers.view' } },
    { path: '/customers/:id', name: 'customer-detail', component: () => import('../views/CustomerDetail.vue'), meta: { auth: true, permission: 'wallet.customers.view' } },
    { path: '/meter-approvals', name: 'meter-approvals', component: () => import('../views/MeterApprovals.vue'), meta: { auth: true, permission: 'wallet.meters.approve' } },
    { path: '/vending', name: 'vending', component: () => import('../views/Vending.vue'), meta: { auth: true, permission: 'wallet.vending.monitor' } },
    { path: '/consumption', name: 'consumption', component: () => import('../views/Consumption.vue'), meta: { auth: true, permission: 'wallet.consumption.view' } },
    { path: '/audit', name: 'audit', component: () => import('../views/Audit.vue'), meta: { auth: true, permission: 'wallet.audit.view' } },
    { path: '/meter-orders', name: 'meter-orders', component: () => import('../views/MeterOrders.vue'), meta: { auth: true, permission: 'wallet.vendors.review' } },
    { path: '/meter-orders/new', name: 'meter-order-new', component: () => import('../views/MeterOrderCreate.vue'), meta: { auth: true, permission: 'wallet.vendors.manage' } },
    { path: '/fraud', name: 'fraud', component: () => import('../views/Fraud.vue'), meta: { auth: true, permission: 'wallet.fraud.review' } },
    { path: '/disputes', name: 'disputes', component: () => import('../views/Disputes.vue'), meta: { auth: true, permission: 'wallet.disputes.manage' } },
    { path: '/support', name: 'support', component: () => import('../views/Support.vue'), meta: { auth: true, permission: 'wallet.support.manage' } },
    { path: '/announcements', name: 'announcements', component: () => import('../views/Announcements.vue'), meta: { auth: true, permission: 'wallet.announcements.manage' } },
    { path: '/refunds', name: 'refunds', component: () => import('../views/Refunds.vue'), meta: { auth: true, permission: 'wallet.refunds.manage' } },
    { path: '/beverly-ai', name: 'beverly-ai', component: () => import('../views/AcobotConsoleView.vue'), meta: { auth: true, permission: 'wallet.dashboard.view' } },
    { path: '/settlement', name: 'settlement', component: () => import('../views/Settlement.vue'), meta: { auth: true, permission: 'wallet.settlement.view' } },
    { path: '/reconciliation', name: 'reconciliation', component: () => import('../views/Reconciliation.vue'), meta: { auth: true, permission: 'wallet.reconciliation.run' } },
    { path: '/feature-flags', name: 'feature-flags', component: () => import('../views/FeatureFlags.vue'), meta: { auth: true, permission: 'wallet.flags.manage' } },
    { path: '/roles', name: 'roles', component: () => import('../views/RolesPermissions.vue'), meta: { auth: true, permission: 'wallet.access.manage' } },
    { path: '/permissions', name: 'permissions', component: () => import('../views/Permissions.vue'), meta: { auth: true, permission: 'wallet.access.manage' } },
    { path: '/roles-permissions', redirect: '/roles' },
    { path: '/privacy', name: 'privacy', component: () => import('../views/Privacy.vue'), meta: { auth: true, permission: 'wallet.privacy.review' } },
    { path: '/profile', name: 'profile', component: () => import('../views/Profile.vue'), meta: { auth: true } },
    { path: '/security', name: 'security', component: () => import('../views/Security.vue'), meta: { auth: true } },
    { path: '/notifications', name: 'notifications', component: () => import('../views/Notifications.vue'), meta: { auth: true } },
    { path: '/settings', name: 'settings', component: () => import('../views/Settings.vue'), meta: { auth: true } },
    { path: '/reports', name: 'reports', component: () => import('../views/Reports.vue'), meta: { auth: true, permission: 'wallet.dashboard.view' } },
    // Developer Console
    { path: '/dev', redirect: '/dev/api-keys' },
    { path: '/dev/oem', name: 'dev-oem', component: () => import('../views/DevOemConsole.vue'), meta: { auth: true, permission: 'dev.console' } },
    { path: '/dev/api-keys', name: 'dev-api-keys', component: () => import('../views/DevApiKeys.vue'), meta: { auth: true, permission: 'dev.console' } },
    { path: '/dev/webhooks', name: 'dev-webhooks', component: () => import('../views/DevWebhooks.vue'), meta: { auth: true, permission: 'dev.console' } },
    { path: '/dev/api-log', name: 'dev-api-log', component: () => import('../views/DevApiLog.vue'), meta: { auth: true, permission: 'dev.console' } },
    { path: '/dev/sandbox', name: 'dev-sandbox', component: () => import('../views/DevSandbox.vue'), meta: { auth: true, permission: 'dev.console' } },
    { path: '/dev/service-health', name: 'dev-service-health', component: () => import('../views/DevServiceHealth.vue'), meta: { auth: true, permission: 'dev.console' } },
    { path: '/dev/queue-monitor', name: 'dev-queue-monitor', component: () => import('../views/DevQueueMonitor.vue'), meta: { auth: true, permission: 'dev.console' } },
    { path: '/dev/error-explorer', name: 'dev-error-explorer', component: () => import('../views/DevErrorExplorer.vue'), meta: { auth: true, permission: 'dev.console' } },
    { path: '/dev/toolkit', name: 'dev-toolkit', component: () => import('../views/DevToolkit.vue'), meta: { auth: true, permission: 'dev.console' } },
    { path: '/dev/sys-config', name: 'dev-sys-config', component: () => import('../views/DevSysConfig.vue'), meta: { auth: true, permission: 'dev.console' } },
    { path: '/dev/schema', name: 'dev-schema', component: () => import('../views/DevSchemaExplorer.vue'), meta: { auth: true, permission: 'dev.console' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFound.vue') },
];

export const router = createRouter({
    history: createWebHistory(portalHistoryBase(import.meta.env.BASE_URL)),
    routes,
    scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
    const auth = useStaffAuthStore();
    if (!auth.hydrated) await auth.hydrate();
    if (to.meta.auth && !auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } };
    // An authenticated staff session may still need its app-level MFA grant.
    // Keep the login route reachable for the challenge screen.
    if (to.meta.guest && auth.isAuthenticated && to.query.reason !== 'mfa_required') return { name: 'dashboard' };
    if (to.meta.auth) {
        // Hydration already validates the first route. Later refreshes happen
        // behind navigation, while every API request remains server-authorized.
        void auth.ensureFreshSession().catch(() => {
            if (!auth.isAuthenticated) {
                void router.replace({ name: 'login', query: { redirect: to.fullPath, reason: 'session_expired' } });
            }
        });
    }
    const permission = typeof to.meta.permission === 'string' ? to.meta.permission : '';
    if (permission && !auth.hasPermission(permission)) return { name: 'not-found' };
    return true;
});
