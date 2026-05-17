import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useVendorAuthStore } from '../stores/auth';

const routes: RouteRecordRaw[] = [
    { path: '/login',           name: 'login',          component: () => import('../views/Login.vue'),         meta: { guest: true } },
    { path: '/password-change', name: 'password-change',component: () => import('../views/PasswordChange.vue'),meta: { auth: true, allowReset: true } },
    { path: '/',                name: 'dashboard',      component: () => import('../views/Dashboard.vue'),     meta: { auth: true } },
    { path: '/wallet',          name: 'wallet',         component: () => import('../views/Wallet.vue'),        meta: { auth: true } },
    { path: '/wallet/fund',     name: 'fund',           component: () => import('../views/Fund.vue'),          meta: { auth: true } },
    { path: '/vend',            name: 'vend',           component: () => import('../views/Vend.vue'),          meta: { auth: true } },
    { path: '/remote-send',     name: 'remote-send',    component: () => import('../views/RemoteSend.vue'),    meta: { auth: true } },
    { path: '/transactions',    name: 'transactions',   component: () => import('../views/Transactions.vue'),  meta: { auth: true } },
    { path: '/receipts',        name: 'receipts',       component: () => import('../views/Receipts.vue'),      meta: { auth: true } },
    { path: '/statement',       name: 'statement',      component: () => import('../views/Statement.vue'),     meta: { auth: true } },
    { path: '/profile',         name: 'profile',        component: () => import('../views/Profile.vue'),       meta: { auth: true } },
    { path: '/security',        name: 'security',       component: () => import('../views/Security.vue'),      meta: { auth: true } },
    { path: '/:pathMatch(.*)*', name: 'not-found',      component: () => import('../views/NotFound.vue') },
];

export const router = createRouter({
    history: createWebHistory(),
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
    return true;
});
