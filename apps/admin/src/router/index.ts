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
    { path: '/vendors/:id', name: 'vendor-detail', component: () => import('../views/VendorDetail.vue'), meta: { auth: true, permission: 'wallet.vendors.review' } },
    { path: '/funding', name: 'funding', component: () => import('../views/Funding.vue'), meta: { auth: true, permission: 'wallet.funding.view' } },
    { path: '/funding/history', name: 'funding-history', component: () => import('../views/FundingHistory.vue'), meta: { auth: true, permission: 'wallet.funding.view' } },
    { path: '/wallets', name: 'wallets', component: () => import('../views/Wallets.vue'), meta: { auth: true, permission: 'wallet.funding.view' } },
    { path: '/purchases', name: 'purchases', component: () => import('../views/Purchases.vue'), meta: { auth: true, permission: 'wallet.vending.monitor' } },
    { path: '/customers', name: 'customers', component: () => import('../views/Customers.vue'), meta: { auth: true, permission: 'wallet.customers.view' } },
    { path: '/customers/:id', name: 'customer-detail', component: () => import('../views/CustomerDetail.vue'), meta: { auth: true, permission: 'wallet.customers.view' } },
    { path: '/vending', name: 'vending', component: () => import('../views/Vending.vue'), meta: { auth: true, permission: 'wallet.vending.monitor' } },
    { path: '/consumption', name: 'consumption', component: () => import('../views/Consumption.vue'), meta: { auth: true, permission: 'wallet.consumption.view' } },
    { path: '/audit', name: 'audit', component: () => import('../views/Audit.vue'), meta: { auth: true, permission: 'wallet.audit.view' } },
    { path: '/meter-orders', name: 'meter-orders', component: () => import('../views/MeterOrders.vue'), meta: { auth: true, permission: 'wallet.vendors.review' } },
    { path: '/fraud', name: 'fraud', component: () => import('../views/Fraud.vue'), meta: { auth: true, permission: 'wallet.fraud.review' } },
    { path: '/disputes', name: 'disputes', component: () => import('../views/Disputes.vue'), meta: { auth: true, permission: 'wallet.disputes.manage' } },
    { path: '/refunds', name: 'refunds', component: () => import('../views/Refunds.vue'), meta: { auth: true, permission: 'wallet.refunds.manage' } },
    { path: '/settlement', name: 'settlement', component: () => import('../views/Settlement.vue'), meta: { auth: true, permission: 'wallet.settlement.view' } },
    { path: '/reconciliation', name: 'reconciliation', component: () => import('../views/Reconciliation.vue'), meta: { auth: true, permission: 'wallet.reconciliation.run' } },
    { path: '/feature-flags', name: 'feature-flags', component: () => import('../views/FeatureFlags.vue'), meta: { auth: true, permission: 'wallet.flags.manage' } },
    { path: '/roles', name: 'roles', component: () => import('../views/RolesPermissions.vue'), meta: { auth: true, permission: 'wallet.access.manage' } },
    { path: '/permissions', name: 'permissions', component: () => import('../views/Permissions.vue'), meta: { auth: true, permission: 'wallet.access.manage' } },
    { path: '/roles-permissions', redirect: '/roles' },
    { path: '/privacy', name: 'privacy', component: () => import('../views/Privacy.vue'), meta: { auth: true, permission: 'wallet.privacy.review' } },
    { path: '/profile', name: 'profile', component: () => import('../views/Profile.vue'), meta: { auth: true } },
    { path: '/security', name: 'security', component: () => import('../views/Security.vue'), meta: { auth: true } },
    { path: '/settings', name: 'settings', component: () => import('../views/Settings.vue'), meta: { auth: true } },
    { path: '/reports', name: 'reports', component: () => import('../views/Reports.vue'), meta: { auth: true, permission: 'wallet.dashboard.view' } },
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
    if (to.meta.guest && auth.isAuthenticated) return { name: 'dashboard' };
    if (to.meta.auth) {
        try {
            await auth.ensureFreshSession();
        } catch {
            auth.logout();
            return { name: 'login', query: { redirect: to.fullPath, reason: 'session_expired' } };
        }
    }
    const permission = typeof to.meta.permission === 'string' ? to.meta.permission : '';
    if (permission && !auth.hasPermission(permission)) return { name: 'not-found' };
    return true;
});
