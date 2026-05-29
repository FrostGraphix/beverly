/**
 * AML / Sanctions screening — Phase 3
 *
 * Name-based fuzzy matching against the sanctions_list_entries table.
 * Uses PostgreSQL pg_trgm similarity for ranking.
 *
 * Score 0-100:
 *   < 40  → clear
 *   40-69 → flagged (manual review)
 *   ≥ 70  → blocked (automatic)
 */
import { adminClient } from '../db/supabase.js';

export class AmlError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'AmlError';
    }
}

export type AmlStatus = 'clear' | 'flagged' | 'blocked' | 'whitelisted' | 'under_review';
export type AmlEntityType = 'customer' | 'vendor_organization' | 'vendor_user';

export interface ScreeningResult {
    id: string;
    status: AmlStatus;
    matchScore: number;
    matchedEntries: Array<{ id: string; name: string; source: string; score: number }>;
}

/** Normalize a name for matching — lower, strip punctuation, collapse spaces */
function normalizeName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Compute string similarity 0-1 using character trigrams (Dice coefficient).
 * Mirrors PostgreSQL's similarity() function — used client-side as a fallback.
 */
function trigramSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const pad = (s: string) => ` ${s} `;
    const trigrams = (s: string): Set<string> => {
        const p = pad(s);
        const t = new Set<string>();
        for (let i = 0; i < p.length - 2; i++) t.add(p.slice(i, i + 3));
        return t;
    };
    const ta = trigrams(a);
    const tb = trigrams(b);
    let common = 0;
    for (const t of ta) { if (tb.has(t)) common++; }
    return (2 * common) / (ta.size + tb.size);
}

async function fetchSanctionsCandidates(entityName: string): Promise<any[]> {
    const norm = normalizeName(entityName);
    // Use pg_trgm similarity search for candidates with score > 0.3
    const { data, error } = await adminClient.rpc('search_sanctions_by_name', {
        p_name: norm,
        p_threshold: 0.30,
        p_limit: 20,
    });
    if (error) {
        // Fallback: basic ilike search if RPC not available
        const { data: fallback } = await adminClient
            .from('sanctions_list_entries')
            .select('id, full_name, aliases, source')
            .eq('active', true)
            .ilike('full_name', `%${norm.split(' ')[0]}%`)
            .limit(20);
        return fallback ?? [];
    }
    return data ?? [];
}

function scoreCandidate(entityName: string, candidate: any): number {
    const norm = normalizeName(entityName);
    const names = [candidate.full_name, ...(candidate.aliases ?? [])].map(normalizeName);
    let best = 0;
    for (const n of names) {
        const s = trigramSimilarity(norm, n);
        if (s > best) best = s;
    }
    return Math.round(best * 100);
}

export async function screenEntity(input: {
    entityType: AmlEntityType;
    entityId: string;
    entityName: string;
    triggerEvent?: string;
    bvnPartial?: string;
    ninPartial?: string;
}): Promise<ScreeningResult> {
    const candidates = await fetchSanctionsCandidates(input.entityName);

    const scored = candidates
        .map((c: any) => ({
            id:     c.id,
            name:   c.full_name,
            source: c.source,
            score:  scoreCandidate(input.entityName, c),
        }))
        .filter((c) => c.score >= 40)
        .sort((a, b) => b.score - a.score);

    const matchScore = scored.length > 0 ? scored[0].score : 0;
    const status: AmlStatus =
        matchScore >= 70 ? 'blocked'
        : matchScore >= 40 ? 'flagged'
        : 'clear';

    const { data, error } = await adminClient
        .from('aml_screening_results')
        .insert({
            entity_type:     input.entityType,
            entity_id:       input.entityId,
            entity_name:     input.entityName,
            match_score:     matchScore,
            matched_entries: scored.slice(0, 5),
            status,
            trigger_event:   input.triggerEvent ?? null,
        })
        .select('id')
        .single();

    if (error || !data) {
        throw new AmlError('Could not save screening result', 'db_error');
    }

    return {
        id: (data as any).id,
        status,
        matchScore,
        matchedEntries: scored.slice(0, 5),
    };
}

export async function listScreenings(opts: {
    entityType?: string;
    status?: string;
    since?: string;
    limit?: number;
} = {}) {
    let q = adminClient
        .from('aml_screening_results')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(opts.limit ?? 100);

    if (opts.entityType) q = q.eq('entity_type', opts.entityType);
    if (opts.status)     q = q.eq('status', opts.status);
    if (opts.since)      q = q.gte('created_at', opts.since);

    const { data } = await q;
    return data ?? [];
}

export async function reviewScreening(
    screeningId: string,
    reviewedByUserId: string,
    newStatus: 'whitelisted' | 'blocked' | 'clear',
    note?: string,
): Promise<void> {
    const { error } = await adminClient
        .from('aml_screening_results')
        .update({
            status:              newStatus,
            reviewed_by_user_id: reviewedByUserId,
            reviewed_at:         new Date().toISOString(),
            review_note:         note ?? null,
        })
        .eq('id', screeningId);

    if (error) throw new AmlError('Review update failed', 'db_error');
}

export async function addSanctionsEntry(input: {
    fullName: string;
    aliases?: string[];
    bvnPartial?: string;
    ninPartial?: string;
    nationality?: string;
    source: string;
    listDate?: string;
    addedByUserId?: string;
}): Promise<string> {
    const { data, error } = await adminClient
        .from('sanctions_list_entries')
        .insert({
            full_name:        normalizeName(input.fullName),
            aliases:          (input.aliases ?? []).map(normalizeName),
            bvn_partial:      input.bvnPartial ?? null,
            nin_partial:      input.ninPartial ?? null,
            nationality:      input.nationality ?? null,
            source:           input.source,
            list_date:        input.listDate ?? null,
            added_by_user_id: input.addedByUserId ?? null,
        })
        .select('id')
        .single();

    if (error || !data) throw new AmlError('Could not add sanctions entry', 'db_error');
    return (data as any).id;
}

export async function listSanctionsEntries(opts: { active?: boolean; limit?: number } = {}) {
    let q = adminClient
        .from('sanctions_list_entries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(opts.limit ?? 200);

    if (opts.active !== undefined) q = q.eq('active', opts.active);

    const { data } = await q;
    return data ?? [];
}
