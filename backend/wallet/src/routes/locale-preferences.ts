import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { adminClient } from '../db/supabase.js';

const LocaleSchema = z.object({
    locale: z.enum(['en', 'yo', 'ha', 'ig']),
});

const localePreferenceRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get('/locale', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const { data, error } = await adminClient
            .from('user_locale_preferences')
            .select('locale, updated_at')
            .eq('user_id', req.actor!.userId)
            .maybeSingle();

        if (error) {
            req.log.error({ err: error, userId: req.actor!.userId }, 'locale preference read failed');
            return reply.code(503).send({ error: 'locale_preference_unavailable' });
        }

        return { locale: data?.locale ?? 'en', persisted: Boolean(data), updated_at: data?.updated_at ?? null };
    });

    fastify.put('/locale', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const parsed = LocaleSchema.safeParse(req.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: 'invalid_locale', supported: LocaleSchema.shape.locale.options });
        }

        const updatedAt = new Date().toISOString();
        const { data, error } = await adminClient
            .from('user_locale_preferences')
            .upsert({ user_id: req.actor!.userId, locale: parsed.data.locale, updated_at: updatedAt }, { onConflict: 'user_id' })
            .select('locale, updated_at')
            .single();

        if (error) {
            req.log.error({ err: error, userId: req.actor!.userId }, 'locale preference update failed');
            return reply.code(503).send({ error: 'locale_preference_unavailable' });
        }

        return data;
    });
};

export default localePreferenceRoutes;
