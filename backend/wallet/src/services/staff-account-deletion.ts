import { adminClient } from '../db/supabase.js';
import { logAction, type LogActionInput } from './audit.js';

type AuditWriter = (entry: LogActionInput) => Promise<boolean>;

export class StaffDeletionError extends Error {
    constructor(public readonly code: string, message: string) {
        super(message);
        this.name = 'StaffDeletionError';
    }
}

/** Deletes the auth identity; database cascades remove staff access records.
 * Audit rows deliberately have no foreign key to auth.users and remain intact. */
export async function deleteStaffAccount(opts: {
    targetUserId: string;
    actorUserId: string;
    actorRole?: string | null;
    auditContext?: Pick<LogActionInput, 'ip' | 'userAgent' | 'correlationId'>;
    client?: any;
    writeAudit?: AuditWriter;
}): Promise<{ userId: string; deleted: true }> {
    const client = opts.client ?? adminClient;
    const writeAudit = opts.writeAudit ?? logAction;
    if (opts.targetUserId === opts.actorUserId) {
        throw new StaffDeletionError('self_deletion_denied', 'You cannot delete your own account. Ask another Super Admin to remove it.');
    }
    const { data: profile, error: profileError } = await client.from('users')
        .select('auth_user_id, user_id, user_name, email, role_key, station_id, station_ids')
        .or(`auth_user_id.eq.${opts.targetUserId},user_id.eq.${opts.targetUserId}`)
        .maybeSingle();
    if (profileError || !profile) throw new StaffDeletionError('staff_not_found', 'Staff account was not found.');
    if (profile.auth_user_id && profile.auth_user_id !== opts.targetUserId) {
        throw new StaffDeletionError('staff_identity_mismatch', 'The staff profile does not belong to the requested authentication account.');
    }

    if (profile.role_key === 'super-admin') {
        const { data: superAdmins, error: superAdminError } = await client.from('users')
            .select('auth_user_id').eq('role_key', 'super-admin');
        const remainingIds = new Set((superAdmins ?? []).map((staff: any) => staff.auth_user_id).filter(Boolean));
        if (superAdminError || remainingIds.size <= 1) {
            throw new StaffDeletionError('last_super_admin_denied', 'Create another Super Admin before deleting this account.');
        }
    }

    const audit = (action: string, metadata?: Record<string, unknown>) => writeAudit({
        actorUserId: opts.actorUserId, actorType: 'staff', actorRole: opts.actorRole ?? 'super-admin',
        action, targetType: 'staff_user', targetId: opts.targetUserId, before: profile, metadata,
        ...opts.auditContext,
    });
    if (!await audit('access.user.deletion_requested')) {
        throw new StaffDeletionError('audit_unavailable', 'The deletion was not started because its audit record could not be stored.');
    }
    // Older staff rows could have a legacy user_id but no auth_user_id. Repair
    // that relationship before deletion so the database cascade removes the
    // profile instead of leaving an orphaned staff record.
    if (!profile.auth_user_id) {
        const { error: linkError } = await client.from('users')
            .update({ auth_user_id: opts.targetUserId })
            .eq('user_id', profile.user_id)
            .is('auth_user_id', null);
        if (linkError) {
            await audit('access.user.deletion_failed', { reason: linkError.message });
            throw new StaffDeletionError('staff_profile_link_failed', 'The staff profile could not be prepared for complete deletion.');
        }
    }
    // Pass false explicitly: Supabase's optional soft-delete mode must never be
    // used for this permanent staff-account removal flow.
    const { error: deletionError } = await client.auth.admin.deleteUser(opts.targetUserId, false);
    if (deletionError) {
        await audit('access.user.deletion_failed', { reason: deletionError.message });
        throw new StaffDeletionError('staff_delete_failed', deletionError.message);
    }
    await audit('access.user.deleted');
    return { userId: opts.targetUserId, deleted: true };
}
