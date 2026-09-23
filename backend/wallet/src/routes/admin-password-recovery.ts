import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requestPasswordReset, verifyPasswordResetOtp, confirmPasswordReset, PasswordResetError } from '../services/password-reset.js';
import { logSecurityEvent } from '../services/audit.js';

const routes: FastifyPluginAsync = async (fastify) => {
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
