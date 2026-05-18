import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useStaffAuthStore } from '../stores/auth';

const routes: RouteRecordRaw[] = [
    { path: '/login',           name: 'login',           component: () => import('../views/Login.vue'),        meta: { guest: true } },
    { path: '/',                name: 'dashboard',       component: () => import('../views/Dashboard.vue'),    meta: { auth: true } },
    { path: '/applications',    name: 'applications',    component: () => import('../views/Applications.vue'), meta: { auth: true } },
    { path: '/vendors',         name: 'vendors',         component: () => import('../views/Vendors.vue'),      meta: { auth: true } },
    { path: '/vendors/new',     name: 'vendor-new',      component: () => import('../views/VendorCreate.vue'), meta: { auth: true } },
    { path: '/funding',         name: 'funding',         component: () => import('../views/Funding.vue'),      meta: { auth: true } },
    { path: '/vending',         name: 'vending',         component: () => import('../views/Vending.vue'),      meta: { auth: true } },
    { path: '/audit',           name: 'audit',           component: () => import('../views/Audit.vue'),        meta: { auth: true } },
    { path: '/meter-orders',    name: 'meter-orders',    component: () => import('../views/MeterOrders.vue'),  meta: { auth: true } },
    { path: '/fraud',           name: 'fraud',           component: () => import('../views/Fraud.vue'),           meta: { auth: true } },
    { path: '/disputes',        name: 'disputes',        component: () => import('../views/Disputes.vue'),       meta: { auth: true } },
    { path: '/refunds',         name: 'refunds',         component: () => import('../views/Refunds.vue'),        meta: { auth: true } },
    { path: '/settlement',      name: 'settlement',      component: () => import('../views/Settlement.vue'),     meta: { auth: true } },
    { path: '/reconciliation',  name: 'reconciliation',  component: () => import('../views/Reconciliation.vue'), meta: { auth: true } },
    { path: '/feature-flags',   name: 'feature-flags',   component: () => import('../views/FeatureFlags.vue'),   meta: { auth: true } },
    { path: '/privacy',         name: 'privacy',         component: () => import('../views/Privacy.vue'),        meta: { auth: true } },
    { path: '/:pathMatch(.*)*', name: 'not-found',       component: () => import('../views/NotFound.vue') },
];

export const router = createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
    const auth = useStaffAuthStore();
    if (!auth.hydrated) await auth.hydrate();
    if (to.meta.auth && !auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } };
    if (to.meta.guest && auth.isAuthenticated) return { name: 'dashboard' };
    return true;
});
