/**
 * Feature flag service — Phase 7
 *
 * Flags control rollout of wallet features by toggle, percent, or region.
 * Results are cached in-process for 60 seconds to avoid per-request DB reads.
 */
import { adminClient } from '../db/supabase.js';

interface FeatureFlag {
    key: string;
    description: string;
    enabled: boolean;
    rollout_percent: number;
    regions: string[];
    created_at: string;
    updated_at: string;
}

let cache: Map<string, FeatureFlag> = new Map();
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60_000;

async function loadFlags(): Promise<void> {
    const { data } = await adminClient.from('feature_flags').select('*');
    cache = new Map((data ?? []).map((f: FeatureFlag) => [f.key, f]));
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
}

async function getFlag(key: string): Promise<FeatureFlag | undefined> {
    if (Date.now() > cacheExpiresAt) await loadFlags();
    return cache.get(key);
}

export async function isFlagEnabled(key: string, opts?: { region?: string; userId?: string }): Promise<boolean> {
    const flag = await getFlag(key);
    if (!flag || !flag.enabled) return false;

    // Region check
    if (flag.regions.length > 0 && opts?.region) {
        if (!flag.regions.includes(opts.region)) return false;
    }

    // Rollout percent (deterministic by userId hash, or random if no userId)
    if (flag.rollout_percent < 100) {
        if (flag.rollout_percent === 0) return false;
        const bucket = opts?.userId
            ? deterministicBucket(opts.userId, key)
            : Math.random() * 100;
        if (bucket >= flag.rollout_percent) return false;
    }

    return true;
}

function deterministicBucket(userId: string, flagKey: string): number {
    let hash = 5381;
    const str = userId + '::' + flagKey;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
        hash = hash & hash; // 32-bit
    }
    return Math.abs(hash) % 100;
}

export async function listFlags(): Promise<FeatureFlag[]> {
    if (Date.now() > cacheExpiresAt) await loadFlags();
    return [...cache.values()];
}

export async function setFlag(key: string, patch: {
    enabled?: boolean;
    rollout_percent?: number;
    regions?: string[];
    description?: string;
}): Promise<void> {
    await adminClient
        .from('feature_flags')
        .upsert({ key, ...patch, updated_at: new Date().toISOString() });
    cacheExpiresAt = 0; // invalidate cache
}

export async function createFlag(flag: {
    key: string;
    description: string;
    enabled?: boolean;
    rollout_percent?: number;
    regions?: string[];
}): Promise<void> {
    const { error } = await adminClient.from('feature_flags').insert({
        key:             flag.key,
        description:     flag.description,
        enabled:         flag.enabled ?? false,
        rollout_percent: flag.rollout_percent ?? 0,
        regions:         flag.regions ?? [],
    });
    if (error) throw new Error(error.message);
    cacheExpiresAt = 0;
}

export function invalidateFlagCache(): void {
    cacheExpiresAt = 0;
}
