/**
 * Centralized error handler.
 * Normalizes errors to { error, message, details? } shape.
 * Hides internals in production.
 */
import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyError } from 'fastify';
import { ZodError } from 'zod';
import { isProd } from '../config/env.js';

const plugin: FastifyPluginAsync = async (fastify) => {
    fastify.setErrorHandler((err: FastifyError, req, reply) => {
        const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? req.id;

        // Zod validation
        if (err instanceof ZodError) {
            return reply.code(400).send({
                error: 'validation_failed',
                message: 'Request validation failed.',
                details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
                correlationId,
            });
        }

        // Fastify-tagged HTTP errors. Service errors may explicitly expose a
        // reviewed message while their private cause remains server-side.
        const expose = (err as FastifyError & { expose?: boolean }).expose === true;
        if (err.statusCode && (err.statusCode < 500 || expose)) {
            if (err.statusCode >= 500) {
                req.log.error({ err, stack: err.stack, url: req.url, method: req.method, correlationId }, 'service error');
            }
            return reply.code(err.statusCode).send({
                error: err.code ?? 'bad_request',
                message: err.message,
                correlationId,
            });
        }

        // 5xx — log full, return generic
        req.log.error(
            {
                err,
                stack: err.stack,
                url: req.url,
                method: req.method,
                correlationId,
            },
            'unhandled error',
        );

        return reply.code(500).send({
            error: 'internal_error',
            message: isProd ? 'An internal error occurred.' : err.message,
            correlationId,
        });
    });

    fastify.setNotFoundHandler((req, reply) => {
        reply.code(404).send({
            error: 'not_found',
            message: `Route ${req.method} ${req.url} not found.`,
        });
    });
};

export default fp(plugin, { name: 'error-handler' });
