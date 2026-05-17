/**
 * Postmark email adapter.
 * One function: sendEmail({ to, subject, text/html, templateAlias?, templateModel? }).
 */
import { ServerClient } from 'postmark';
import { env } from '../config/env.js';

let client: ServerClient | null = null;

function getClient() {
    if (!env.POSTMARK_SERVER_TOKEN) {
        throw new Error('POSTMARK_SERVER_TOKEN not configured');
    }
    if (!client) client = new ServerClient(env.POSTMARK_SERVER_TOKEN);
    return client;
}

export interface SendEmailOpts {
    to: string;
    subject?: string;
    text?: string;
    html?: string;
    templateAlias?: string;
    templateModel?: Record<string, unknown>;
    tag?: string;
    messageStream?: string;
}

export interface EmailResult {
    messageId: string;
    submittedAt: string;
}

export async function sendEmail(opts: SendEmailOpts): Promise<EmailResult> {
    const c = getClient();
    const stream = opts.messageStream ?? 'outbound';

    if (opts.templateAlias) {
        const r = await c.sendEmailWithTemplate({
            From: env.POSTMARK_FROM,
            To: opts.to,
            TemplateAlias: opts.templateAlias,
            TemplateModel: opts.templateModel ?? {},
            Tag: opts.tag,
            MessageStream: stream,
        });
        return { messageId: r.MessageID, submittedAt: r.SubmittedAt };
    }

    if (!opts.subject || (!opts.text && !opts.html)) {
        throw new Error('subject and text/html required when not using template');
    }

    const r = await c.sendEmail({
        From: env.POSTMARK_FROM,
        To: opts.to,
        Subject: opts.subject,
        TextBody: opts.text,
        HtmlBody: opts.html,
        Tag: opts.tag,
        MessageStream: stream,
    });
    return { messageId: r.MessageID, submittedAt: r.SubmittedAt };
}
