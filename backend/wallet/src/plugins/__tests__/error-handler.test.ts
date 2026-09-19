import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import errorHandler from '../error-handler.js';

describe('public service errors', () => {
    it('preserves safe onboarding codes without exposing database details', async () => {
        const app = Fastify({ logger: false });
        await app.register(errorHandler);
        app.get('/vendor-create-failure', async () => {
            throw Object.assign(new Error('Vendor organization could not be created.'), {
                code: 'create_org_failed',
                statusCode: 503,
                expose: true,
                cause: new Error('vendor_organizations_status_check'),
            });
        });

        const response = await app.inject({ method: 'GET', url: '/vendor-create-failure' });
        await app.close();

        expect(response.statusCode).toBe(503);
        expect(response.json()).toMatchObject({
            error: 'create_org_failed',
            message: 'Vendor organization could not be created.',
        });
        expect(response.body).not.toContain('vendor_organizations_status_check');
    });
});
