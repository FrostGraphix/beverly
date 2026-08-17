import { describe, it, expect } from 'vitest';
import { checkAcobotIntentPermission, getPermittedIntentsForActor } from '../acobot-rbac.js';
import type { Actor } from '../../plugins/auth.js';

describe('Beverly AI RBAC Intent Authorization', () => {
    const customerActor: Actor = {
        userId: 'user-cust-1',
        email: 'customer@example.com',
        type: 'customer',
        role: 'customer',
        actorId: 'cust-1',
        customerId: 'cust-1',
        mfaVerified: false,
    };

    const vendorActor: Actor = {
        userId: 'user-vend-1',
        email: 'vendor@example.com',
        type: 'vendor_user',
        role: 'vendor',
        actorId: 'vend-user-1',
        vendorOrganizationId: 'vend-org-1',
        mfaVerified: false,
    };

    const superAdminActor: Actor = {
        userId: 'user-admin-1',
        email: 'admin@acoblighting.com',
        type: 'staff',
        role: 'super-admin',
        actorId: 'user-admin-1',
        mfaVerified: true,
    };

    const accountOfficerActor: Actor = {
        userId: 'user-account-1',
        email: 'account@acoblighting.com',
        type: 'staff',
        role: 'account',
        actorId: 'user-account-1',
        mfaVerified: true,
    };

    it('denies customer access to admin liquidity and funding approval intents', async () => {
        const check1 = await checkAcobotIntentPermission(customerActor, 'adminLiquidity');
        expect(check1.allowed).toBe(false);

        const check2 = await checkAcobotIntentPermission(customerActor, 'adminApproveFunding');
        expect(check2.allowed).toBe(false);
    });

    it('denies customer access to vendor float balance intents', async () => {
        const check = await checkAcobotIntentPermission(customerActor, 'vendorFloatBalance');
        expect(check.allowed).toBe(false);
    });

    it('allows customer access to customer wallet balance and meter orders', async () => {
        const check1 = await checkAcobotIntentPermission(customerActor, 'customerWalletBalance');
        expect(check1.allowed).toBe(true);

        const check2 = await checkAcobotIntentPermission(customerActor, 'customerMeterOrders');
        expect(check2.allowed).toBe(true);
    });

    it('allows vendor access to vendor float balance and settlement history', async () => {
        const check1 = await checkAcobotIntentPermission(vendorActor, 'vendorFloatBalance');
        expect(check1.allowed).toBe(true);

        const check2 = await checkAcobotIntentPermission(vendorActor, 'vendorSettlementHistory');
        expect(check2.allowed).toBe(true);
    });

    it('denies vendor access to admin approve funding', async () => {
        const check = await checkAcobotIntentPermission(vendorActor, 'adminApproveFunding');
        expect(check.allowed).toBe(false);
    });

    it('allows super-admin access to all admin, vendor, and customer intents', async () => {
        const check1 = await checkAcobotIntentPermission(superAdminActor, 'adminLiquidity');
        expect(check1.allowed).toBe(true);

        const check2 = await checkAcobotIntentPermission(superAdminActor, 'adminApproveFunding');
        expect(check2.allowed).toBe(true);
    });

    it('denies account officer access to approve funding (requires wallet.funding.approve)', async () => {
        const check = await checkAcobotIntentPermission(accountOfficerActor, 'adminApproveFunding');
        expect(check.allowed).toBe(false);
    });

    it('evaluates complete intent matrix for customer actor', async () => {
        const matrix = await getPermittedIntentsForActor(customerActor);
        expect(matrix.length).toBeGreaterThan(10);
        const deniedIntents = matrix.filter((m) => !m.isAllowed);
        expect(deniedIntents.length).toBeGreaterThan(0);
    });
});
