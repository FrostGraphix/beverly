/**
 * Resend email adapter.
 * sendEmail() for single sends, sendBatch() for fan-out (announcements), chunked at 100/call
 * per Resend's batch API limit.
 */
import { Resend } from 'resend';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

let client: Resend | null = null;
let brandLogo: Buffer | null = null;
const here = path.dirname(fileURLToPath(import.meta.url));
const BRAND_LOGO_PATH = path.resolve(here, '..', 'emails', 'assets', 'beverly-logo.png');

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

function inlineBrandAttachments(html: string) {
    if (!html.includes('cid:beverly-logo')) return undefined;
    if (!brandLogo) brandLogo = fs.readFileSync(BRAND_LOGO_PATH);
    return [{
        filename: 'beverly-logo.png',
        content: brandLogo,
        contentType: 'image/png',
        inlineContentId: 'beverly-logo',
    }];
}

export interface EmailResult {
    messageId: string;
}

export class EmailBatchError extends Error {
    constructor(message: string, public readonly sentCount: number, public readonly failedCount: number) {
        super(message);
        this.name = 'EmailBatchError';
    }
}

export function isResendConfigured(): boolean {
    return Boolean(env.RESEND_API_KEY?.trim() && env.RESEND_FROM?.trim());
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
        attachments: inlineBrandAttachments(opts.html),
        tags: opts.tag ? [{ name: 'category', value: sanitizeTag(opts.tag) }] : undefined,
    });
    if (error) throw new Error(error.message);
    return { messageId: data?.id ?? '' };
}

export async function sendBatch(messages: SendEmailOpts[], idempotencyKey?: string): Promise<EmailResult[]> {
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
            replyTo: m.replyTo,
            attachments: inlineBrandAttachments(m.html),
            tags: m.tag ? [{ name: 'category', value: sanitizeTag(m.tag) }] : undefined,
        })), idempotencyKey ? { idempotencyKey: `${idempotencyKey}:${i / 100}` } : undefined);
        if (error) throw new EmailBatchError(error.message, results.length, messages.length - results.length);
        const sentRows = (data as any)?.data;
        results.push(...(Array.isArray(sentRows)
            ? sentRows.map((d: any) => ({ messageId: d.id ?? '' }))
            : chunk.map(() => ({ messageId: '' }))));
    }
    return results;
}
