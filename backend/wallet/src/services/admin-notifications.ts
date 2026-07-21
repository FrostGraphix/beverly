/**
 * Feature-flag-gated transactional emails fired from admin.ts route handlers
 * (staff invitation, role/station assignment, admin announcements). Extracted
 * so admin.ts doesn't re-grow past the module-boundaries line cap for adding
 * one more notification type — each call site here collapses to one line.
 */
import { env } from '../config/env.js';
import { adminClient } from '../db/supabase.js';
import { isFlagEnabled } from './feature-flags.js';
import { sendEmail, sendBatch } from '../adapters/resend.js';
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

export async function notifyStaffInvitation(opts: {
    email: string;
    fullName: string;
    temporaryPassword: string;
    roleLabel: string;
}): Promise<void> {
    try {
        if (!(await flagEnabled('notifications.email.staff_invitation'))) return;
        const content = staffInvitationEmail({
            fullName: opts.fullName,
            loginEmail: opts.email,
            temporaryPassword: opts.temporaryPassword,
            roleLabel: opts.roleLabel,
            loginUrl: env.STAFF_PORTAL_URL,
        });
        await sendEmail({ to: opts.email, subject: content.subject, html: content.html, text: content.text, tag: 'staff-invitation' });
    } catch { /* non-fatal */ }
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
    onError: (error: unknown) => void,
): Promise<void> {
    try {
        if (!(await flagEnabled('notifications.email.admin_announcement'))) return;
        const emailable = recipients.filter((r) => r.email);
        const messages = emailable.map((r) => {
            const content = adminAnnouncementEmail({ name: r.name, title: body.title, body: body.body });
            return { to: r.email as string, subject: content.subject, html: content.html, text: content.text, tag: 'admin-announcement' };
        });
        if (messages.length) await sendBatch(messages);
    } catch (emailError) {
        onError(emailError);
    }
}
