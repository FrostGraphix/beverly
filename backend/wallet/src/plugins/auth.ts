/**
 * JWT auth plugin.
 *
 * Verifies Supabase-issued JWTs, resolves actor identity (staff / vendor_user / customer),
 * and attaches it to request.actor.
 *
 * All routes that need authentication add { preHandler: fastify.requireAuth() } or
 * the role-specific helpers (requireStaff, requireVendor, requireCustomer).
 */
import fp from 'fastify-plugin';
import jwtPlugin from '@fastify/jwt';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import { env } from '../config/env.js';
import { adminClient } from '../db/supabase.js';

export type ActorType = 'staff' | 'vendor_user' | 'customer';

export interface Actor {
    userId: string;          // auth.users.id
    email: string | null;
    type: ActorType;
    role: string;            // 'super-admin' | 'account' | 'vendor_user' | 'vendor_manager' | 'customer'
    actorId: string;         // public.customers.id / public.vendor_users.id / staff_users.id
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

interface SupabaseJwtClaims {
    sub: string;
    email?: string;
    role?: string;
    aud?: string;
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
    aal?: 'aal1' | 'aal2';
}

const plugin: FastifyPluginAsync = async (fastify) => {
    await fastify.register(jwtPlugin, {
        secret: env.SUPABASE_JWT_SECRET,
        verify: { algorithms: ['HS256'] },
    });

    async function resolveActor(claims: SupabaseJwtClaims): Promise<Actor | null> {
        const userId = claims.sub;
        const email = claims.email ?? null;
        const mfaVerified = claims.aal === 'aal2';

        // staff lookup: by auth.users.id in any staff source.
        // For phase 1 staff lives under existing CRM, so we check user_metadata.role
        // and a server-side staff_users mapping if present.
        const rawRole = (claims.user_metadata?.['role'] as string | undefined)
            ?? (claims.app_metadata?.['role'] as string | undefined);

        // Vendor user?
        const { data: vu } = await adminClient
            .from('vendor_users')
            .select('id, vendor_organization_id, role, status, password_reset_required')
            .eq('auth_user_id', userId)
            .maybeSingle();
        if (vu && vu.status === 'active') {
            return {
                userId,
                email,
                type: 'vendor_user',
                role: vu.role,
                actorId: vu.id,
                vendorOrganizationId: vu.vendor_organization_id,
                mfaVerified,
                passwordResetRequired: vu.password_reset_required,
            };
        }

        // Customer?
        const { data: cu } = await adminClient
            .from('customers')
            .select('id, kyc_tier, status')
            .eq('auth_user_id', userId)
            .maybeSingle();
        if (cu && cu.status === 'active') {
            return {
                userId,
                email,
                type: 'customer',
                role: 'customer',
                actorId: cu.id,
                customerId: cu.id,
                mfaVerified,
                kycTier: cu.kyc_tier,
            };
        }

        // Staff fallback — use JWT role claim
        if (rawRole && ['super-admin', 'account', 'finance-checker', 'operations-manager'].includes(rawRole)) {
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

    fastify.decorate('requireAuth', () => async (req: FastifyRequest, reply: FastifyReply) => {
        try {
            await req.jwtVerify();
            const actor = await resolveActor(req.user as SupabaseJwtClaims);
            if (!actor) {
                return reply.code(401).send({ error: 'unknown_actor', message: 'No matching actor for this token.' });
            }
            req.actor = actor;
        } catch {
            return reply.code(401).send({ error: 'unauthorized', message: 'Invalid or expired token.' });
        }
        return undefined;
    });

    fastify.decorate('requireStaff', () => async (req: FastifyRequest, reply: FastifyReply) => {
        await (fastify.requireAuth() as preHandlerHookHandler).call(fastify, req, reply, () => undefined);
        if (reply.sent) return undefined;
        if (req.actor?.type !== 'staff') {
            return reply.code(403).send({ error: 'forbidden', message: 'Staff role required.' });
        }
        return undefined;
    });

    fastify.decorate('requireVendor', () => async (req: FastifyRequest, reply: FastifyReply) => {
        await (fastify.requireAuth() as preHandlerHookHandler).call(fastify, req, reply, () => undefined);
        if (reply.sent) return undefined;
        if (req.actor?.type !== 'vendor_user') {
            return reply.code(403).send({ error: 'forbidden', message: 'Vendor user required.' });
        }
        if (req.actor.passwordResetRequired) {
            return reply.code(403).send({
                error: 'password_reset_required',
                message: 'Password change required before continuing.',
            });
        }
        return undefined;
    });

    fastify.decorate('requireCustomer', () => async (req: FastifyRequest, reply: FastifyReply) => {
        await (fastify.requireAuth() as preHandlerHookHandler).call(fastify, req, reply, () => undefined);
        if (reply.sent) return undefined;
        if (req.actor?.type !== 'customer') {
            return reply.code(403).send({ error: 'forbidden', message: 'Customer required.' });
        }
        return undefined;
    });

    fastify.decorate('requireKycTier', (min: number) => async (req: FastifyRequest, reply: FastifyReply) => {
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
    });
};

export default fp(plugin, { name: 'auth' });
