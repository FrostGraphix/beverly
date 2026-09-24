import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import adminDevRoutes from '../admin-dev.js';

describe('GET /dev/oem', () => {
    it('keeps SparkMeter unavailable until certification completes', async () => {
        const app = Fastify();
        await app.register(adminDevRoutes);

        const response = await app.inject({ method: 'GET', url: '/dev/oem' });
        await app.close();

        expect(response.statusCode).toBe(200);
        expect(response.json().oems).toContainEqual(expect.objectContaining({
            slug: 'sparkmeter',
            status: 'draft',
            vendingStrategy: 'unsupported',
            capabilities: expect.objectContaining({
                vending: false,
                relay_control: false,
                customer_dissociation: false,
            }),
        }));
        expect(response.body).not.toContain('c4c3e809-5487-43cf-be64-2826dbbb4f6d');
        expect(response.body).not.toContain('Acobminigrid@gmail.com');
    });
});
