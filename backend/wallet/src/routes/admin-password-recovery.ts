import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requestPasswordReset, verifyPasswordResetOtp, confirmPasswordReset, PasswordResetError } from '../services/password-reset.js';
import { logSecurityEvent } from '../services/audit.js';
import { env } from '../config/env.js';
import { adminClient } from '../db/supabase.js';

const STAFF_ROLES = new Set(['super-admin', 'developer', 'account', 'finance-checker', 'operations-manager', 'operations-officer']);

const routes: FastifyPluginAsync = async (fastify) => {
    fastify.post('/password-login', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req, reply) => {
        const { email, password } = z.object({
            email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
            password: z.string().min(1).max(200),
        }).parse(req.body);
        let response: Response;
        try {
            response = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY },
                body: JSON.stringify({ email, password }),
            });
        } catch {
            return reply.code(503).send({ error: 'auth_upstream_unreachable', message: 'Authentication service is temporarily unavailable.' });
        }
        const grant = await response.json().catch(() => ({})) as any;
        if (!response.ok || !grant.access_token || !grant.user?.id) {
            const unconfirmed = /confirm|verified/i.test(String(grant.error_description ?? grant.message ?? ''));
            return reply.code(401).send({
                error: unconfirmed ? 'email_not_confirmed' : 'invalid_credentials',
                message: unconfirmed ? 'Confirm your staff email before signing in.' : 'Invalid email or password.',
            });
        }
        const userId = String(grant.user.id);
        const { data: staff, error: staffError } = await adminClient.from('users')
            .select('auth_user_id, user_id, email, user_name, role_key, password_reset_required')
            .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`).maybeSingle();
        const role = String((staff as any)?.role_key ?? '');
        if (staffError || !staff || (!STAFF_ROLES.has(role) && !role.startsWith('custom-'))) {
            await adminClient.auth.admin.signOut(userId, 'global').catch(() => undefined);
            await logSecurityEvent('login_failure', { severity: 'high', ip: req.ip, userAgent: req.headers['user-agent'], metadata: { surface: 'staff', reason: staffError ? 'profile_lookup_failed' : 'not_staff' } }).catch(() => undefined);
            return reply.code(staffError ? 503 : 403).send({
                error: staffError ? 'staff_profile_unavailable' : 'staff_access_denied',
                message: staffError ? 'Staff account verification is temporarily unavailable.' : 'This account does not have staff access.',
            });
        }
        await logSecurityEvent('login_success', { actorUserId: userId, severity: 'info', ip: req.ip, userAgent: req.headers['user-agent'], metadata: { surface: 'staff' } }).catch(() => undefined);
        return {
            access_token: grant.access_token,
            refresh_token: grant.refresh_token ?? null,
            expires_at: grant.expires_at ?? null,
            expires_in: grant.expires_in ?? null,
            user: {
                id: userId,
                email: (staff as any).email ?? grant.user.email ?? email,
                full_name: (staff as any).user_name ?? grant.user.user_metadata?.full_name ?? null,
                role,
                password_reset_required: (staff as any).password_reset_required === true,
            },
        };
    });

    fastify.post('/reset-request', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (req, reply) => {
        const { email } = z.object({ email: z.string().trim().email().max(320) }).parse(req.body);
        try {
            await requestPasswordReset(email.toLowerCase(), 'staff');
            await logSecurityEvent('password_reset_requested', { ip: req.ip, userAgent: req.headers['user-agent'], metadata: { userType: 'staff' } });
            return { ok: true };
        } catch (error) {
            const code = error instanceof PasswordResetError ? error.code : 'password_reset_request_failed';
            await logSecurityEvent('password_reset_failed', { severity: 'high', ip: req.ip, userAgent: req.headers['user-agent'], metadata: { userType: 'staff', code } });
            return reply.code(503).send({ error: 'password_reset_unavailable', message: 'Password reset is temporarily unavailable. Please retry.' });
        }
    });

    fastify.post('/reset-verify', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req, reply) => {
        const { email, otp } = z.object({
            email: z.string().trim().email().max(320),
            otp: z.string().regex(/^\d{6}$/),
        }).parse(req.body);
        try {
            return await verifyPasswordResetOtp(email, otp, 'staff');
        } catch (error) {
            if (error instanceof PasswordResetError) return reply.code(error.status).send({ error: error.code, message: error.message });
            throw error;
        }
    });

    fastify.post('/reset-confirm', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req, reply) => {
        const { token, new_password } = z.object({
            token: z.string().regex(/^[a-f0-9]{64}$/i), new_password: z.string().min(12).max(128),
        }).parse(req.body);
        try {
            await confirmPasswordReset(token, new_password, 'staff');
            await logSecurityEvent('password_reset_completed', { ip: req.ip, userAgent: req.headers['user-agent'], metadata: { userType: 'staff' } });
            return { ok: true };
        } catch (error) {
            if (error instanceof PasswordResetError) return reply.code(error.status).send({ error: error.code, message: error.message });
            throw error;
        }
    });
};

export default routes;
