/**
 * Admin audit and security-log routes — /api/v1/admin/*
 *
 * Split out of admin.ts to keep that file within its module-boundary budget.
 * Registered without a prefix inside the admin plugin, so these inherit the
 * admin auth, permission, and station-scope preHandler chain unchanged.
 */
import type { FastifyPluginAsync } from 'fastify';
import { adminClient } from '../db/supabase.js';
import { csvEscape } from './admin-csv.js';

const route: FastifyPluginAsync = async (fastify) => {
    // ── audit log viewer ──
    async function resolveRegisteredActorNames(actorIds: string[]): Promise<Map<string, string>> {
        const ids = [...new Set(actorIds.map((value) => String(value || '').trim()).filter(Boolean))];
        if (!ids.length) return new Map();
        const [byAuth, byUser] = await Promise.all([
            adminClient
                .from('users')
                .select('auth_user_id, user_name, email')
                .in('auth_user_id', ids),
            adminClient
                .from('users')
                .select('user_id, user_name, email')
                .in('user_id', ids),
        ]);
        const out = new Map<string, string>();
        for (const row of (byAuth.data ?? []) as any[]) {
            const id = String(row.auth_user_id ?? '').trim();
            const name = String(row.user_name ?? row.email ?? '').trim();
            if (id && name) out.set(id, name);
        }
        for (const row of (byUser.data ?? []) as any[]) {
            const id = String(row.user_id ?? '').trim();
            const name = String(row.user_name ?? row.email ?? '').trim();
            if (id && name) out.set(id, name);
        }
        return out;
    }

    function enrichAuditActors(rows: any[], actorNames: Map<string, string>): any[] {
        return rows.map((row) => {
            const actorId = String(row.actor_user_id ?? '').trim();
            const registrationName = actorNames.get(actorId);
            if (!registrationName) return row;
            const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
            return {
                ...row,
                actor_name: registrationName,
                metadata: {
                    ...metadata,
                    actor_name: registrationName,
                    registration_name: registrationName,
                },
            };
        });
    }

    fastify.get('/audit', async (req, reply) => {
        const { actor, actorType, action, targetType, target, since, until, limit, cursor } =
            req.query as Record<string, string | undefined>;
        let query = adminClient
            .from('wallet_audit_log')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(Math.min(Number(limit ?? 100), 500));
        if (actor)      query = query.eq('actor_user_id', actor);
        if (actorType)  query = query.eq('actor_type', actorType);
        if (action)     query = query.ilike('action', `${action}%`);
        if (targetType) query = query.eq('target_type', targetType);
        if (target)     query = query.eq('target_id', target);
        if (since)      query = query.gte('created_at', since);
        if (until)      query = query.lte('created_at', until);
        if (cursor)     query = query.lt('created_at', cursor);
        const { data, error } = await query;
        if (error) {
            return reply.code(502).send({
                error: 'audit_log_unavailable',
                message: 'Audit log failed to load.',
                details: error.message,
            });
        }
        const rows = data ?? [];
        const actorNames = await resolveRegisteredActorNames(rows.map((entry: any) => String(entry.actor_user_id ?? '')).filter(Boolean));
        const entries = enrichAuditActors(rows as any[], actorNames);
        const nextCursor = entries.length === Math.min(Number(limit ?? 100), 500)
            ? entries[entries.length - 1].created_at
            : null;
        return { entries, nextCursor };
    });

    // ── single audit row (for detail drawer) ──
    fastify.get('/audit/:id', async (req, reply) => {
        const { id } = req.params as { id: string };
        const { data, error } = await adminClient.from('wallet_audit_log').select('*').eq('id', id).maybeSingle();
        if (error || !data) return reply.code(404).send({ error: 'not_found', message: 'Audit entry not found.' });
        const actorNames = await resolveRegisteredActorNames([String((data as any).actor_user_id ?? '')].filter(Boolean));
        const [entry] = enrichAuditActors([data as any], actorNames);
        return entry;
    });

    // ── CSV export (capped at 10k rows for safety) ──
    fastify.get('/audit/export.csv', async (req, reply) => {
        const { actor, actorType, action, targetType, target, since, until } =
            req.query as Record<string, string | undefined>;
        let query = adminClient.from('wallet_audit_log').select('*')
            .order('created_at', { ascending: false }).limit(10_000);
        if (actor)      query = query.eq('actor_user_id', actor);
        if (actorType)  query = query.eq('actor_type', actorType);
        if (action)     query = query.ilike('action', `${action}%`);
        if (targetType) query = query.eq('target_type', targetType);
        if (target)     query = query.eq('target_id', target);
        if (since)      query = query.gte('created_at', since);
        if (until)      query = query.lte('created_at', until);
        const { data, error } = await query;
        if (error) {
            return reply.code(502).send({
                error: 'audit_export_unavailable',
                message: 'Audit export failed.',
                details: error.message,
            });
        }
        const rowsRaw = data ?? [];
        const actorNames = await resolveRegisteredActorNames(rowsRaw.map((entry: any) => String(entry.actor_user_id ?? '')).filter(Boolean));
        const rows = enrichAuditActors(rowsRaw as any[], actorNames);
        const header = ['created_at', 'actor_type', 'actor_user_id', 'actor_role', 'action',
                        'target_type', 'target_id', 'ip', 'correlation_id'];
        const csv = [
            header.join(','),
            ...rows.map((r: any) => header.map((h) => csvEscape(r[h])).join(',')),
        ].join('\n');
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`);
        return csv;
    });

    // ── security events viewer ──
    fastify.get('/security-events', async (req, reply) => {
        const { eventType, severity, actor, since, until, limit } =
            req.query as Record<string, string | undefined>;
        let query = adminClient
            .from('wallet_security_events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(Math.min(Number(limit ?? 100), 500));
        if (eventType) query = query.eq('event_type', eventType);
        if (severity)  query = query.eq('severity', severity);
        if (actor)     query = query.eq('actor_user_id', actor);
        if (since)     query = query.gte('created_at', since);
        if (until)     query = query.lte('created_at', until);
        const { data, error } = await query;
        if (error) {
            return reply.code(502).send({
                error: 'security_events_unavailable',
                message: 'Security events failed to load.',
                details: error.message,
            });
        }
        return { events: data ?? [] };
    });

    // ── audit summary: counts by action over the last N days ──
    fastify.get('/audit/summary', async (req, reply) => {
        const days = Math.min(Math.max(Number((req.query as { days?: string }).days ?? 7), 1), 90);
        const since = new Date(Date.now() - days * 86400_000).toISOString();
        const { data, error } = await adminClient
            .from('wallet_audit_log')
            .select('action, actor_type')
            .gte('created_at', since)
            .limit(10_000);
        if (error) {
            return reply.code(502).send({
                error: 'audit_summary_unavailable',
                message: 'Audit summary failed to load.',
                details: error.message,
            });
        }
        const byAction: Record<string, number> = {};
        const byActorType: Record<string, number> = {};
        for (const row of data ?? []) {
            const a = (row as any).action;
            const t = (row as any).actor_type;
            byAction[a]     = (byAction[a]     ?? 0) + 1;
            byActorType[t]  = (byActorType[t]  ?? 0) + 1;
        }
        return { days, total: (data ?? []).length, byAction, byActorType };
    });
};

export default route;
