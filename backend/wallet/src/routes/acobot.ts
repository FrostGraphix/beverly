/**
 * Beverly AI Routes (`backend/wallet/src/routes/acobot.ts`)
 *
 * Fastify plugin handling chat completions, intent resolution, audio transcription,
 * and security audit logs for Beverly AI across CRM Admin and Wallet portals.
 */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { adminClient } from '../db/supabase.js';
import { buildAcobotContext } from '../services/acobot-context.js';
import { buildBeverlySystemPrompt } from '../services/acobot-prompt.js';
import { getPermittedIntentsForActor } from '../services/acobot-rbac.js';
import { roleHasPermission } from '../services/rbac.js';

const ChatBodySchema = z.object({
    prompt: z.string().min(1).max(2000),
    portal: z.enum(['admin', 'crm', 'customer', 'vendor']).default('admin'),
    stream: z.boolean().default(false),
});

const acobotRoutes: FastifyPluginAsync = async (fastify) => {
    // Require authentication on all Beverly AI routes
    fastify.addHook('preHandler', fastify.requireAuth());

    /**
     * POST /api/v1/acobot/chat
     * Main chat completion endpoint
     */
    fastify.post('/chat', async (req: FastifyRequest, reply: FastifyReply) => {
        const actor = req.actor;
        if (!actor) {
            return reply.code(401).send({ error: 'unauthorized', message: 'Authentication required' });
        }

        const parseResult = ChatBodySchema.safeParse(req.body);
        if (!parseResult.success) {
            return reply.code(400).send({ error: 'invalid_body', details: parseResult.error.format() });
        }

        const { prompt, portal } = parseResult.data;

        // 1. Build permission-safe context block
        const contextBuild = await buildAcobotContext(actor, portal, prompt);

        // 2. Generate System Prompt with Identity & RBAC boundaries
        const systemPrompt = buildBeverlySystemPrompt(actor, portal);

        // 3. Multi-Provider LLM generation logic (NVIDIA NGC, Groq, OpenAI)
        const nvidiaApiKey = process.env.NVIDIA_API_KEY || process.env.NGC_API_KEY;
        const groqApiKey = process.env.GROQ_API_KEY;
        const openAiApiKey = process.env.OPENAI_API_KEY;

        let botResponse = '';
        let modelUsed = 'offline-context-engine';
        let promptTokens = 0;
        let completionTokens = 0;

        // NIM inference keys from build.nvidia.com always start with "nvapi-".
        // Legacy NGC registry keys (for docker login) do not — skip those for the NIM API.
        const nvidiaKeyIsUsable = nvidiaApiKey && nvidiaApiKey.startsWith('nvapi-');

        try {
            if (nvidiaKeyIsUsable) {
                const nvidiaRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${nvidiaApiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: 'meta/llama-3.3-70b-instruct',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'system', content: `[SESSION CONTEXT]\n${contextBuild.contextText}` },
                            { role: 'user', content: prompt },
                        ],
                        temperature: 0.2,
                        max_tokens: 1024,
                    }),
                });

                if (nvidiaRes.ok) {
                    const data = await nvidiaRes.json() as any;
                    botResponse = data.choices?.[0]?.message?.content ?? '';
                    modelUsed = 'meta/llama-3.3-70b-instruct';
                    promptTokens = data.usage?.prompt_tokens ?? 0;
                    completionTokens = data.usage?.completion_tokens ?? 0;
                } else {
                    const errBody = await nvidiaRes.text().catch(() => '');
                    req.log.warn({ status: nvidiaRes.status, body: errBody }, '[ACOBOT] NVIDIA NIM API call failed');
                }
            } else if (nvidiaApiKey) {
                req.log.info('[ACOBOT] NVIDIA key detected as NGC legacy — skipping NIM API, trying Groq');
            }

            if (!botResponse && groqApiKey) {
                const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${groqApiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: 'llama-3.3-70b-versatile',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'system', content: `[SESSION CONTEXT]\n${contextBuild.contextText}` },
                            { role: 'user', content: prompt },
                        ],
                        temperature: 0.3,
                        max_tokens: 1024,
                    }),
                });

                if (groqRes.ok) {
                    const data = await groqRes.json() as any;
                    botResponse = data.choices?.[0]?.message?.content ?? '';
                    modelUsed = 'llama-3.3-70b-versatile';
                    promptTokens = data.usage?.prompt_tokens ?? 0;
                    completionTokens = data.usage?.completion_tokens ?? 0;
                } else {
                    const errBody = await groqRes.text().catch(() => '');
                    req.log.warn({ status: groqRes.status, body: errBody }, '[ACOBOT] Groq API call failed');
                }
            }

            if (!botResponse && openAiApiKey) {
                const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${openAiApiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'system', content: `[SESSION CONTEXT]\n${contextBuild.contextText}` },
                            { role: 'user', content: prompt },
                        ],
                        temperature: 0.3,
                    }),
                });

                if (openAiRes.ok) {
                    const data = await openAiRes.json() as any;
                    botResponse = data.choices?.[0]?.message?.content ?? '';
                    modelUsed = 'gpt-4o-mini';
                    promptTokens = data.usage?.prompt_tokens ?? 0;
                    completionTokens = data.usage?.completion_tokens ?? 0;
                } else {
                    const errBody = await openAiRes.text().catch(() => '');
                    req.log.warn({ status: openAiRes.status, body: errBody }, '[ACOBOT] OpenAI API call failed');
                }
            }

            // Context-aware offline fallback
            if (!botResponse) {
                if (contextBuild.permissionStatus === 'denied') {
                    botResponse = `You don't have permission (role: **${actor.role}**) to access that information.`;
                } else if (contextBuild.detectedIntents.length > 0 && contextBuild.contextText.trim()) {
                    // Summarise the resolved data from context rather than dumping raw text
                    botResponse =
                        `Here's what I found based on your query:\n\n` +
                        contextBuild.contextText
                            .split('\n\n')
                            .filter((section) => !section.startsWith('[USER IDENTITY]'))
                            .map((section) =>
                                section
                                    .replace(/^\[DATA: ([^\]]+)\]\n/, '**$1**\n')
                                    .replace(/^\[PERMISSION DENIED: ([^\]]+)\]\n/, '⛔ **Access Denied — $1**\n')
                                    .replace(/^\[DATA FETCH NOTICE: ([^\]]+)\]\n/, '⚠️ **Notice — $1**\n')
                            )
                            .join('\n\n') ||
                        `No specific data matched your query. Try rephrasing or ask about a specific metric (e.g. "pending meter approvals", "wallet balance").`;
                } else {
                    botResponse =
                        `Hi! I'm Beverly AI. I can help you with wallet operations, customer management, vendor data, and system metrics.\n\n` +
                        `Try asking:\n` +
                        (actor.type === 'staff'
                            ? `- "What is the current funding queue?"\n- "Show pending meter approvals"\n- "Daily settlement summary"`
                            : actor.type === 'vendor_user'
                            ? `- "What is my float balance?"\n- "Show my settlement history"`
                            : `- "What is my wallet balance?"\n- "Show my last meter order"`);
                }
            }
        } catch (err: any) {
            req.log.error(err, '[ACOBOT-ROUTE] Chat completion failed');
            botResponse = `Something went wrong while processing your request. Please try again.`;
        }

        // 4. Audit Log in Supabase acobot_logs
        try {
            await adminClient.from('acobot_logs').insert({
                auth_user_id: actor.userId,
                actor_type: actor.type,
                user_role: actor.role,
                portal,
                user_prompt: prompt,
                detected_intents: contextBuild.detectedIntents,
                permission_status: contextBuild.permissionStatus,
                denied_intents: contextBuild.deniedIntents,
                bot_response: botResponse,
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                model_name: modelUsed,
            });
        } catch (logErr) {
            req.log.warn(logErr, '[ACOBOT-ROUTE] Audit log insertion failed');
        }

        return reply.send({
            response: botResponse,
            permissionStatus: contextBuild.permissionStatus,
            detectedIntents: contextBuild.detectedIntents,
            deniedIntents: contextBuild.deniedIntents,
            model: modelUsed,
        });
    });

    /**
     * GET /api/v1/acobot/intents
     * Returns permitted intent matrix for authenticated actor
     */
    fastify.get('/intents', async (req: FastifyRequest, reply: FastifyReply) => {
        const actor = req.actor;
        if (!actor) {
            return reply.code(401).send({ error: 'unauthorized' });
        }
        const matrix = await getPermittedIntentsForActor(actor);
        return reply.send({ intents: matrix });
    });

    /**
     * POST /api/v1/acobot/transcribe
     * Transcribes audio commands using Whisper STT
     */
    fastify.post('/transcribe', async (req: FastifyRequest, reply: FastifyReply) => {
        const groqApiKey = process.env.GROQ_API_KEY;
        if (!groqApiKey) {
            return reply.code(501).send({ error: 'not_implemented', message: 'Groq Whisper STT API key not configured' });
        }

        const data = await (req as any).file();
        if (!data) {
            return reply.code(400).send({ error: 'missing_file', message: 'Audio file upload required' });
        }

        if (data.file.truncated) {
            return reply.code(413).send({ error: 'file_too_large', message: 'Audio uploads cannot exceed 5 MB' });
        }

        const acceptedMimeTypes = new Set([
            'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm',
        ]);
        if (!acceptedMimeTypes.has(data.mimetype)) {
            return reply.code(415).send({ error: 'unsupported_media_type', message: 'Upload a supported audio file' });
        }

        const buffer = await data.toBuffer();
        const formData = new FormData();
        formData.append('file', new Blob([buffer], { type: data.mimetype }), data.filename);
        formData.append('model', 'whisper-large-v3');

        const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
            },
            body: formData,
        });

        if (!whisperRes.ok) {
            return reply.code(500).send({ error: 'transcription_failed' });
        }

        const result = await whisperRes.json() as any;
        return reply.send({ text: result.text ?? '' });
    });

    /**
     * GET /api/v1/acobot/logs
     * Returns security audit logs for staff (guarded by wallet.audit.view)
     */
    fastify.get('/logs', async (req: FastifyRequest, reply: FastifyReply) => {
        const actor = req.actor;
        if (!actor || actor.type !== 'staff') {
            return reply.code(403).send({ error: 'forbidden', message: 'Staff permission required' });
        }
        if (!(await roleHasPermission(actor.role, 'wallet.audit.view'))) {
            return reply.code(403).send({ error: 'permission_denied', message: 'Missing permission: wallet.audit.view' });
        }

        const { data, error } = await adminClient
            .from('acobot_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            return reply.code(500).send({ error: 'db_error', message: error.message });
        }

        return reply.send({ logs: data ?? [] });
    });
};

export default acobotRoutes;
