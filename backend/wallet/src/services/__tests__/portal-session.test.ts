import { describe, expect, it } from 'vitest';
import type { Actor, ActorType } from '../../plugins/auth.js';
import { portalSessionIdentity } from '../portal-session.js';

function token(claims: Record<string, unknown>, suffix = 'signature') {
    return `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${suffix}`;
}

function actor(type: ActorType): Actor {
    return {
        userId: '11111111-1111-4111-8111-111111111111',
        email: 'user@example.com',
        type,
        role: type,
        actorId: '11111111-1111-4111-8111-111111111111',
        mfaVerified: false,
    };
}

describe('portal session policies', () => {
    it.each([
        ['staff', 1_800, 28_800],
        ['vendor_user', 1_800, 43_200],
        ['customer', 3_600, 2_592_000],
    ] as const)('enforces %s limits', (type, idleSeconds, absoluteSeconds) => {
        const identity = portalSessionIdentity(actor(type), token({ iat: 1_700_000_000, session_id: 'stable-session' }));
        expect(identity.policy).toEqual({ idleSeconds, absoluteSeconds });
    });

    it('keeps identity across refreshes', () => {
        const first = portalSessionIdentity(actor('vendor_user'), token({ iat: 1_700_000_000, session_id: 'stable-session' }, 'one'));
        const refreshed = portalSessionIdentity(actor('vendor_user'), token({ iat: 1_700_003_000, session_id: 'stable-session' }, 'two'));
        expect(refreshed.sessionKey).toBe(first.sessionKey);
    });

    it('rejects tokens without session identity', () => {
        expect(() => portalSessionIdentity(actor('customer'), token({ iat: 1_700_000_000 })))
            .toThrow('Session identifier is invalid.');
    });
});
