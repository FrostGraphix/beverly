/**
 * Resend email adapter.
 * sendEmail() for single sends, sendBatch() for fan-out (announcements), chunked at 100/call
 * per Resend's batch API limit.
 */
import { Resend } from 'resend';
import { env } from '../config/env.js';

let client: Resend | null = null;

function getClient(): Resend {
    if (!env.RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY not configured');
    }
    if (!client) client = new Resend(env.RESEND_API_KEY);
    return client;
}

export interface SendEmailOpts {
    to: string;
    subject: string;
    html: string;
    text?: string;
    tag?: string;
    replyTo?: string;
}

export interface EmailResult {
    messageId: string;
}

function sanitizeTag(tag: string): string {
    return tag.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
}

export async function sendEmail(opts: SendEmailOpts): Promise<EmailResult> {
    const c = getClient();
    const { data, error } = await c.emails.send({
        from: env.RESEND_FROM,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        replyTo: opts.replyTo,
        tags: opts.tag ? [{ name: 'category', value: sanitizeTag(opts.tag) }] : undefined,
    });
    if (error) throw new Error(error.message);
    return { messageId: data?.id ?? '' };
}

export async function sendBatch(messages: SendEmailOpts[]): Promise<EmailResult[]> {
    if (!messages.length) return [];
    const c = getClient();
    const results: EmailResult[] = [];
    for (let i = 0; i < messages.length; i += 100) {
        const chunk = messages.slice(i, i + 100);
        const { data, error } = await c.batch.send(chunk.map((m) => ({
            from: env.RESEND_FROM,
            to: m.to,
            subject: m.subject,
            html: m.html,
            text: m.text,
            tags: m.tag ? [{ name: 'category', value: sanitizeTag(m.tag) }] : undefined,
        })));
        if (error) throw new Error(error.message);
        results.push(...((data as any)?.data ?? []).map((d: any) => ({ messageId: d.id ?? '' })));
    }
    return results;
}
