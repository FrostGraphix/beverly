/**
 * Auth plugin — SOP Phase 7 revision.
 *
 * Verifies Supabase session tokens via adminClient.auth.getUser() (no JWT secret
 * required on the server — Supabase validates the token server-side). Resolves
 * actor identity (staff / vendor_user / customer) and attaches to request.actor.
 *
 * Role hierarchy:
 *   staff       — user_metadata.role ∈ {super-admin, account, finance-checker, operations-manager}
 *   vendor_user — row in vendor_users with status='active'
 *   customer    — row in customers with status='active'
 *
 * Guards:
 *   requireAuth()      — any authenticated actor
 *   requireStaff()     — staff only
 *   requireVendor()    — vendor_user only (blocks if password_reset_required)
 *   requireCustomer()  — customer only
 *   requireKycTier(n)  — customer with kyc_tier >= n
 */
import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import { adminClient } from '../db/supabase.js';

export type ActorType = 'staff' | 'vendor_user' | 'customer';

export interface Actor {
    userId: string;          // auth.users.id (UUID)
    email: string | null;
    type: ActorType;
    role: string;            // 'super-admin' | 'account' | 'finance-checker' | 'operations-manager' | 'vendor_user' | 'vendor_manager' | 'customer'
    actorId: string;         // public.customers.id | public.vendor_users.id | userId for staff
    vendorOrganizationId?: string;
    customerId?: string;
    mfaVerified: boolean;
    kycTier?: number;
    passwordResetRequired?: boolean;
}

declare module 'fastify' {
    interface FastifyRequest {
        actor?: Actor;
    }
    interface FastifyInstance {
        requireAuth: () => preHandlerHookHandler;
        requireStaff: () => preHandlerHookHandler;
        requireVendor: () => preHandlerHookHandler;
        requireCustomer: () => preHandlerHookHandler;
        requireKycTier: (min: number) => preHandlerHookHandler;
    }
}

const STAFF_ROLES = new Set([
    'super-admin',
    'account',
    'finance-checker',
    'operations-manager',
]);

function extractBearer(req: FastifyRequest): string | null {
    const auth = req.headers.authorization ?? '';
    if (!auth.startsWith('Bearer ')) return null;
    return auth.slice(7).trim() || null;
}

async function resolveActor(token: string): Promise<Actor | null> {
    // Validate session via Supabase (server-side, no local JWT secret needed)
    const { data: { user }, error } = await adminClient.auth.getUser(token);
    if (error || !user) return null;

    const userId = user.id;
    const email  = user.email ?? null;
    // aal2 = MFA verified (Supabase AMR)
    const mfaVerified = Array.isArray(user.factors) && user.factors.some((f: any) => f.status === 'verified');

    const rawRole = (user.user_metadata?.['role'] as string | undefined)
        ?? (user.app_metadata?.['role'] as string | undefined);

    // 1. Vendor user lookup
    const { data: vu } = await adminClient
        .from('vendor_users')
        .select('id, vendor_organization_id, role, status, password_reset_required')
        .eq('auth_user_id', userId)
        .maybeSingle();

    if (vu && (vu as any).status === 'active') {
        return {
            userId,
            email,
            type: 'vendor_user',
            role: (vu as any).role,
            actorId: (vu as any).id,
            vendorOrganizationId: (vu as any).vendor_organization_id,
            mfaVerified,
            passwordResetRequired: (vu as any).password_reset_required,
        };
    }

    // 2. Customer lookup
    const { data: cu } = await adminClient
        .from('customers')
        .select('id, kyc_tier, status')
        .eq('auth_user_id', userId)
        .maybeSingle();

    if (cu && (cu as any).status === 'active') {
        return {
            userId,
            email,
            type: 'customer',
            role: 'customer',
            actorId: (cu as any).id,
            customerId: (cu as any).id,
            mfaVerified,
            kycTier: (cu as any).kyc_tier,
        };
    }

    // 3. Staff fallback — trust user_metadata.role claim
    if (rawRole && STAFF_ROLES.has(rawRole)) {
        return {
            userId,
            email,
            type: 'staff',
            role: rawRole,
            actorId: userId,
            mfaVerified,
        };
    }

    return null;
}

const plugin: FastifyPluginAsync = async (fastify) => {
    fastify.decorate('requireAuth', (): preHandlerHookHandler => {
        return async (req: FastifyRequest, reply: FastifyReply) => {
            const token = extractBearer(req);
            if (!token) {
                return reply.code(401).send({ error: 'unauthorized', message: 'Bearer token required.' });
            }
            const actor = await resolveActor(token);
            if (!actor) {
                return reply.code(401).send({ error: 'unauthorized', message: 'Invalid or expired session.' });
            }
            req.actor = actor;
            return undefined;
        };
    });

    fastify.decorate('requireStaff', (): preHandlerHookHandler => {
        return async (req: FastifyRequest, reply: FastifyReply) => {
            await (fastify.requireAuth() as preHandlerHookHandler).call(fastify, req, reply, () => undefined);
            if (reply.sent) return undefined;
            if (req.actor?.type !== 'staff') {
                return reply.code(403).send({ error: 'forbidden', message: 'Staff role required.' });
            }
            return undefined;
        };
    });

    fastify.decorate('requireVendor', (): preHandlerHookHandler => {
        return async (req: FastifyRequest, reply: FastifyReply) => {
            await (fastify.requireAuth() as preHandlerHookHandler).call(fastify, req, reply, () => undefined);
            if (reply.sent) return undefined;
            if (req.actor?.type !== 'vendor_user') {
                return reply.code(403).send({ error: 'forbidden', message: 'Vendor user required.' });
            }
            if (req.actor.passwordResetRequired) {
                return reply.code(403).send({
                    error: 'password_reset_required',
                    message: 'Change your password before continuing.',
                });
            }
            return undefined;
        };
    });

    fastify.decorate('requireCustomer', (): preHandlerHookHandler => {
        return async (req: FastifyRequest, reply: FastifyReply) => {
            await (fastify.requireAuth() as preHandlerHookHandler).call(fastify, req, reply, () => undefined);
            if (reply.sent) return undefined;
            if (req.actor?.type !== 'customer') {
                return reply.code(403).send({ error: 'forbidden', message: 'Customer session required.' });
            }
            return undefined;
        };
    });

    fastify.decorate('requireKycTier', (min: number): preHandlerHookHandler => {
        return async (req: FastifyRequest, reply: FastifyReply) => {
            await (fastify.requireCustomer() as preHandlerHookHandler).call(fastify, req, reply, () => undefined);
            if (reply.sent) return undefined;
            if ((req.actor?.kycTier ?? 0) < min) {
                return reply.code(403).send({
                    error: 'kyc_tier_required',
                    message: `KYC tier ${min} required.`,
                    currentTier: req.actor?.kycTier ?? 0,
                });
            }
            return undefined;
        };
    });
};

export default fp(plugin, { name: 'auth' });
