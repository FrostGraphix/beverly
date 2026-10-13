import { describe, expect, it } from 'vitest';
import type { Actor } from '../../plugins/auth.js';
import { buildBeverlySystemPrompt } from '../acobot-prompt.js';

const actor: Actor = {
    userId: '00000000-0000-4000-8000-000000000001',
    email: 'operator@example.test',
    type: 'staff',
    role: 'super-admin',
    actorId: '00000000-0000-4000-8000-000000000001',
    mfaVerified: true,
};

describe('buildBeverlySystemPrompt', () => {
    it('keeps uncertified SparkMeter capabilities unavailable', () => {
        const prompt = buildBeverlySystemPrompt(actor, 'admin');

        expect(prompt).toContain('SparkMeter (Koios REST API): Draft integration.');
        expect(prompt).toContain('No SparkMeter payment, vending, relay, or customer write is available.');
        expect(prompt).not.toContain('Supports STS vending, remote relay control');
        expect(prompt).not.toContain('customer dissociation');
    });
});
