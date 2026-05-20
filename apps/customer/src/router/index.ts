import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes: RouteRecordRaw[] = [
    { path: '/',           name: 'home',     component: () => import('../views/Home.vue'),      meta: { auth: true } },
    { path: '/signup',     name: 'signup',   component: () => import('../views/Signup.vue'),    meta: { guest: true } },
    { path: '/login',      name: 'login',    component: () => import('../views/Login.vue'),     meta: { guest: true } },
    { path: '/recover',    name: 'recover',  component: () => import('../views/Recover.vue'),   meta: { guest: true } },
    { path: '/verify',     name: 'verify',   component: () => import('../views/Verify.vue') },
    { path: '/kyc',        name: 'kyc',      component: () => import('../views/Kyc.vue'),       meta: { auth: true } },
    { path: '/onboard-meter', name: 'onboard-meter', component: () => import('../views/OnboardMeter.vue'), meta: { auth: true } },
    { path: '/buy-token',  name: 'buy-token', component: () => import('../views/BuyToken.vue'), meta: { auth: true, kyc: 1 } },
    { path: '/buy-meter',    name: 'buy-meter',    component: () => import('../views/BuyMeter.vue'),    meta: { auth: true, kyc: 1 } },
    { path: '/meter-orders', name: 'meter-orders', component: () => import('../views/MeterOrders.vue'), meta: { auth: true } },
    { path: '/wallet',     name: 'wallet',   component: () => import('../views/Wallet.vue'),    meta: { auth: true } },
    { path: '/wallet/fund', name: 'fund-wallet', component: () => import('../views/FundWallet.vue'), meta: { auth: true, kyc: 1 } },
    { path: '/wallet/funding', name: 'funding-history', component: () => import('../views/FundingHistory.vue'), meta: { auth: true } },
    { path: '/meters',     name: 'meters',   component: () => import('../views/Meters.vue'),    meta: { auth: true } },
    { path: '/transactions', name: 'transactions', component: () => import('../views/Transactions.vue'), meta: { auth: true } },
    { path: '/receipts',      name: 'receipts',       component: () => import('../views/Receipts.vue'),       meta: { auth: true } },
    { path: '/receipts/:id',  name: 'receipt-detail', component: () => import('../views/ReceiptDetail.vue'),  meta: { auth: true } },
    { path: '/notifications', name: 'notifications',  component: () => import('../views/Notifications.vue'),  meta: { auth: true } },
    { path: '/profile',    name: 'profile',  component: () => import('../views/Profile.vue'),   meta: { auth: true } },
    { path: '/security',   name: 'security', component: () => import('../views/Security.vue'),  meta: { auth: true } },
    { path: '/disputes',   name: 'disputes', component: () => import('../views/Disputes.vue'),  meta: { auth: true } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFound.vue') },
];

export const router = createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
    const auth = useAuthStore();
    if (!auth.hydrated) await auth.hydrate();

    if (to.meta.auth && !auth.isAuthenticated) {
        return { name: 'login', query: { redirect: to.fullPath } };
    }
    if (to.meta.guest && auth.isAuthenticated) {
        return { name: 'home' };
    }
    const requiredKyc = Number(to.meta.kyc ?? 0);
    if (requiredKyc > 0 && (auth.customer?.kyc_tier ?? 0) < requiredKyc) {
        return { name: 'kyc', query: { reason: `tier_${requiredKyc}` } };
    }
    return true;
});
