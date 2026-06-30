import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useVendorAuthStore } from '../stores/auth';

function portalHistoryBase(configuredBase: string): string {
    const base = configuredBase && configuredBase !== '/' ? `/${configuredBase.replace(/^\/+|\/+$/g, '')}/` : '/';
    if (typeof window === 'undefined' || base === '/') return base;
    return window.location.pathname.startsWith(base) ? base : '/';
}

const routes: RouteRecordRaw[] = [
    { path: '/login',           name: 'login',          component: () => import('../views/Login.vue'),         meta: { guest: true } },
    { path: '/password-change', name: 'password-change',component: () => import('../views/PasswordChange.vue'),meta: { auth: true, allowReset: true } },
    { path: '/vend-access',     name: 'vend-access',    component: () => import('../views/VendAccess.vue'),    meta: { auth: true } },
    { path: '/',                name: 'dashboard',      component: () => import('../views/Dashboard.vue'),     meta: { auth: true } },
    { path: '/wallet',          name: 'wallet',         component: () => import('../views/Wallet.vue'),        meta: { auth: true } },
    { path: '/wallet/fund',     name: 'fund',           component: () => import('../views/Fund.vue'),          meta: { auth: true } },
    { path: '/wallet/funding',  name: 'funding-history',component: () => import('../views/FundingHistory.vue'),meta: { auth: true } },
    { path: '/vend',            name: 'vend',           component: () => import('../views/Vend.vue'),          meta: { auth: true } },
    { path: '/meter-orders',    name: 'meter-orders',   component: () => import('../views/MeterOrders.vue'),   meta: { auth: true } },
    { path: '/meter-orders/new',name: 'meter-order-new',component: () => import('../views/MeterOrderCreate.vue'),meta: { auth: true } },
    { path: '/remote-send',     name: 'remote-send',    component: () => import('../views/RemoteSend.vue'),    meta: { auth: true } },
    { path: '/transactions',    name: 'transactions',   component: () => import('../views/Transactions.vue'),  meta: { auth: true } },
    { path: '/receipts',        name: 'receipts',       component: () => import('../views/Receipts.vue'),      meta: { auth: true } },
    { path: '/statement',       name: 'statement',      component: () => import('../views/Statement.vue'),     meta: { auth: true } },
    { path: '/notifications',   name: 'notifications',  component: () => import('../views/Notifications.vue'), meta: { auth: true } },
    { path: '/profile',         name: 'profile',        component: () => import('../views/Profile.vue'),       meta: { auth: true } },
    { path: '/security',        name: 'security',       component: () => import('../views/Security.vue'),      meta: { auth: true } },
    { path: '/disputes',        name: 'disputes',       component: () => import('../views/Disputes.vue'),     meta: { auth: true } },
    { path: '/help',            name: 'help',           component: () => import('../views/Help.vue'),          meta: { auth: true } },
    { path: '/:pathMatch(.*)*', name: 'not-found',      component: () => import('../views/NotFound.vue') },
];

export const router = createRouter({
    history: createWebHistory(portalHistoryBase(import.meta.env.BASE_URL)),
    routes,
    scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
    const auth = useVendorAuthStore();
    if (!auth.hydrated) await auth.hydrate();

    if (to.meta.auth && !auth.isAuthenticated) {
        return { name: 'login', query: { redirect: to.fullPath } };
    }
    if (to.meta.guest && auth.isAuthenticated) {
        return { name: 'dashboard' };
    }
    // Force password change before anything else
    if (auth.isAuthenticated && auth.user?.password_reset_required && to.name !== 'password-change' && !to.meta.allowReset) {
        return { name: 'password-change' };
    }
    if (auth.isAuthenticated && auth.requiresMfaVerification && to.name !== 'security') {
        return { name: 'security', query: { mode: 'verify', redirect: to.fullPath } };
    }
    if (
        auth.isAuthenticated &&
        ['vend', 'remote-send'].includes(String(to.name)) &&
        !auth.user?.vend_credential_configured
    ) {
        return { name: 'vend-access', query: { redirect: to.fullPath } };
    }
    return true;
});
