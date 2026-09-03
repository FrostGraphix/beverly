/**
 * Feature-flag-gated transactional emails fired from admin.ts route handlers
 * (staff invitation, role/station assignment, admin announcements). Extracted
 * so admin.ts doesn't re-grow past the module-boundaries line cap for adding
 * one more notification type — each call site here collapses to one line.
 */
import { env } from '../config/env.js';
import { adminClient } from '../db/supabase.js';
import { isFlagEnabled } from './feature-flags.js';
import { isResendConfigured, sendEmail, sendBatch } from '../adapters/resend.js';
import {
    staffInvitationEmail, roleAssignmentEmail, stationAssignmentEmail, adminAnnouncementEmail,
} from '../emails/templates.js';

async function findStaffUser(userId: string): Promise<{ email?: string; user_name?: string } | null> {
    const { data } = await adminClient.from('users')
        .select('email, user_name')
        .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`)
        .maybeSingle();
    return data as { email?: string; user_name?: string } | null;
}

async function flagEnabled(key: string): Promise<boolean> {
    try {
        return await isFlagEnabled(key);
    } catch {
        return false;
    }
}

export async function staffInvitationReadiness(): Promise<{
    ready: boolean;
    reason?: 'disabled' | 'not_configured';
}> {
    if (!(await flagEnabled('notifications.email.staff_invitation'))) return { ready: false, reason: 'disabled' };
    if (!isResendConfigured()) return { ready: false, reason: 'not_configured' };
    return { ready: true };
}

export async function notifyStaffInvitation(opts: {
    email: string;
    fullName: string;
    temporaryPassword: string;
    roleLabel: string;
}): Promise<{ status: 'sent' | 'not_sent'; messageId?: string; reason?: 'disabled' | 'not_configured' | 'provider_error' }> {
    try {
        const readiness = await staffInvitationReadiness();
        if (!readiness.ready) return { status: 'not_sent', reason: readiness.reason };
        const content = staffInvitationEmail({
            fullName: opts.fullName,
            loginEmail: opts.email,
            temporaryPassword: opts.temporaryPassword,
            roleLabel: opts.roleLabel,
            loginUrl: env.STAFF_PORTAL_URL,
        });
        const result = await sendEmail({ to: opts.email, subject: content.subject, html: content.html, text: content.text, tag: 'staff-invitation' });
        return { status: 'sent', messageId: result.messageId };
    } catch {
        return { status: 'not_sent', reason: 'provider_error' };
    }
}

export async function notifyRoleAssignment(userId: string, roleLabel: string): Promise<void> {
    try {
        const staff = await findStaffUser(userId);
        if (!staff?.email) return;
        if (!(await flagEnabled('notifications.email.role_assignment'))) return;
        const content = roleAssignmentEmail({ fullName: staff.user_name || 'there', roleLabel });
        await sendEmail({ to: staff.email, subject: content.subject, html: content.html, text: content.text, tag: 'role-assignment' });
    } catch { /* non-fatal */ }
}

export async function notifyStationAssignment(opts: {
    email: string | null | undefined;
    name: string;
    stationLabel: string;
    previousStationLabel?: string | null;
}): Promise<void> {
    try {
        if (!opts.email) return;
        if (!(await flagEnabled('notifications.email.station_assignment'))) return;
        const content = stationAssignmentEmail({
            name: opts.name || 'there',
            stationLabel: opts.stationLabel,
            previousStationLabel: opts.previousStationLabel ?? null,
        });
        await sendEmail({ to: opts.email, subject: content.subject, html: content.html, text: content.text, tag: 'station-assignment' });
    } catch { /* non-fatal */ }
}

export async function notifyAdminAnnouncement(
    recipients: Array<{ email?: string | null; name: string }>,
    body: { title: string; body: string },
    idempotencyKey: string,
): Promise<{ sent: number; recipients: number; messages: Array<{ email: string; messageId: string }> }> {
    if (!(await flagEnabled('notifications.email.admin_announcement'))) {
        throw new Error('Announcement email delivery is disabled.');
    }
    if (!isResendConfigured()) {
        throw new Error('Resend email delivery is not configured.');
    }
    const uniqueRecipients = new Map<string, { email: string; name: string }>();
    for (const recipient of recipients) {
        const email = recipient.email?.trim().toLowerCase();
        if (email && !uniqueRecipients.has(email)) uniqueRecipients.set(email, { email, name: recipient.name });
    }
    const messages = Array.from(uniqueRecipients.values()).map((recipient) => {
        const content = adminAnnouncementEmail({ name: recipient.name, title: body.title, body: body.body });
        return { to: recipient.email, subject: content.subject, html: content.html, text: content.text, tag: 'admin-announcement' };
    });
    if (!messages.length) throw new Error('No reachable email recipients were found.');
    const results = await sendBatch(messages, idempotencyKey);
    return {
        sent: results.length,
        recipients: messages.length,
        messages: results.map((result, index) => ({ email: messages[index].to, messageId: result.messageId })),
    };
}
