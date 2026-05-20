/**
 * Staff MFA routes — /api/v1/admin/mfa/*
 *
 * Registered as a sibling of the admin plugin so it does NOT inherit admin's
 * global `requireStaff()` MFA enforcement (which would deadlock the very flow
 * that verifies MFA). Each route uses `requireAuth()` + a staff-type check.
 */
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { logAction } from '../services/audit.js';
import {
    StaffMfaError,
    beginStaffMfaEnrollment,
    beginStaffMfaReplacement,
    disableStaffMfa,
    regenerateStaffRecoveryCodes,
    staffMfaStatus,
    verifyStaffMfaChallenge,
    verifyStaffMfaEnrollment,
    type StaffMfaActor,
} from '../services/staff-mfa.js';

function bearerToken(req: FastifyRequest): string {
    const auth = req.headers.authorization ?? '';
    return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

function staffActorOrReply(req: FastifyRequest, reply: FastifyReply): StaffMfaActor | null {
    if (req.actor?.type !== 'staff') {
        reply.code(403).send({ error: 'forbidden', message: 'Staff session required.' });
        return null;
    }
    return { userId: req.actor.userId, email: req.actor.email };
}

function mfaMeta(req: FastifyRequest) {
    return { ip: req.ip, userAgent: req.headers['user-agent'] as string | undefined };
}

function sendMfaError(reply: FastifyReply, error: unknown) {
    if (error instanceof StaffMfaError) {
        const status = ['invalid_otp', 'mfa_setup_not_started'].includes(error.code) ? 400 : 409;
        return reply.code(status).send({ error: error.code, message: error.message });
    }
    throw error;
}

const codeSchema = z.object({ code: z.string().min(6).max(24) });

const route: FastifyPluginAsync = async (fastify) => {
    fastify.get('/status', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = staffActorOrReply(req, reply);
        if (!actor) return undefined;
        return staffMfaStatus(actor.userId, bearerToken(req));
    });

    fastify.post('/setup/start', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = staffActorOrReply(req, reply);
        if (!actor) return undefined;
        try {
            return await beginStaffMfaEnrollment(actor);
        } catch (error) {
            return sendMfaError(reply, error);
        }
    });

    fastify.post('/setup/verify', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = staffActorOrReply(req, reply);
        if (!actor) return undefined;
        const { code } = codeSchema.parse(req.body);
        try {
            const result = await verifyStaffMfaEnrollment(actor, bearerToken(req), code, mfaMeta(req));
            await logAction({
                actorUserId: actor.userId, actorType: 'staff', actorRole: req.actor!.role,
                action: 'staff.mfa.enabled', targetType: 'staff_user', targetId: actor.userId,
            });
            return result;
        } catch (error) {
            return sendMfaError(reply, error);
        }
    });

    fastify.post('/setup/reset', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = staffActorOrReply(req, reply);
        if (!actor) return undefined;
        const { code } = codeSchema.parse(req.body);
        try {
            return await beginStaffMfaReplacement(actor, code, mfaMeta(req));
        } catch (error) {
            return sendMfaError(reply, error);
        }
    });

    fastify.post('/challenge/verify', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = staffActorOrReply(req, reply);
        if (!actor) return undefined;
        const { code } = codeSchema.parse(req.body);
        try {
            return await verifyStaffMfaChallenge(actor, bearerToken(req), code, mfaMeta(req));
        } catch (error) {
            return sendMfaError(reply, error);
        }
    });

    fastify.post('/recovery/regenerate', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = staffActorOrReply(req, reply);
        if (!actor) return undefined;
        const { code } = codeSchema.parse(req.body);
        try {
            const result = await regenerateStaffRecoveryCodes(actor, code, mfaMeta(req));
            await logAction({
                actorUserId: actor.userId, actorType: 'staff', actorRole: req.actor!.role,
                action: 'staff.mfa.recovery_regenerated', targetType: 'staff_user', targetId: actor.userId,
            });
            return result;
        } catch (error) {
            return sendMfaError(reply, error);
        }
    });

    fastify.post('/disable', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = staffActorOrReply(req, reply);
        if (!actor) return undefined;
        const { code } = codeSchema.parse(req.body);
        try {
            const result = await disableStaffMfa(actor, code, mfaMeta(req));
            await logAction({
                actorUserId: actor.userId, actorType: 'staff', actorRole: req.actor!.role,
                action: 'staff.mfa.disabled', targetType: 'staff_user', targetId: actor.userId,
            });
            return result;
        } catch (error) {
            return sendMfaError(reply, error);
        }
    });
};

export default route;
