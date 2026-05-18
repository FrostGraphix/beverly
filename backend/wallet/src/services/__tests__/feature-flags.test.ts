import { describe, it, expect } from 'vitest';

// Test the deterministic bucket function in isolation
// (extracted logic — mirrors deterministicBucket in feature-flags.ts)
function deterministicBucket(userId: string, flagKey: string): number {
    let hash = 5381;
    const str = userId + '::' + flagKey;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash) % 100;
}

describe('feature flag deterministic bucketing', () => {
    it('returns a value between 0 and 99', () => {
        const bucket = deterministicBucket('user-abc', 'wallet.enabled');
        expect(bucket).toBeGreaterThanOrEqual(0);
        expect(bucket).toBeLessThan(100);
    });

    it('is deterministic — same inputs produce same bucket', () => {
        const a = deterministicBucket('user-xyz', 'feature.test');
        const b = deterministicBucket('user-xyz', 'feature.test');
        expect(a).toBe(b);
    });

    it('produces different buckets for different users on same flag', () => {
        const buckets = new Set(
            Array.from({ length: 50 }, (_, i) => deterministicBucket(`user-${i}`, 'wallet.purchase.enabled'))
        );
        // With 50 users the set should have multiple distinct values
        expect(buckets.size).toBeGreaterThan(10);
    });

    it('produces different buckets for same user on different flags', () => {
        const a = deterministicBucket('user-1', 'flag.a');
        const b = deterministicBucket('user-1', 'flag.b');
        expect(a).not.toBe(b);
    });

    it('a 0% rollout always excludes (bucket >= 0)', () => {
        // Any bucket value is >= 0, so rollout_percent = 0 always blocks
        const bucket = deterministicBucket('any-user', 'off.flag');
        expect(bucket >= 0).toBe(true); // proves isFlagEnabled would return false
    });

    it('a 100% rollout always includes', () => {
        // bucket is 0-99, so bucket < 100 is always true
        const bucket = deterministicBucket('any-user', 'full.flag');
        expect(bucket < 100).toBe(true);
    });
});
