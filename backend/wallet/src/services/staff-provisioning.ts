import { z } from 'zod';
import { vendorPasswordError } from '@beverly/tokens/password-policy';
import { env } from '../config/env.js';
import { adminClient } from '../db/supabase.js';
import { PERMISSION_CATALOG } from '../routes/admin-access-constants.js';
import { logAction } from './audit.js';
import { isCorporateStaffEmail } from './email-validation.js';
import { notifyStaffInvitation, staffInvitationReadiness } from './admin-notifications.js';
import { ALL_STATIONS_SCOPE, normalizeStaffStationIds } from './staff-station-scope.js';
import { generateTemporaryPassword } from './temporary-password.js';

export const createStaffSchema = z.object({
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    fullName: z.string().trim().min(2).max(120),
    roleKey: z.string().trim().min(2).max(80),
    stationIds: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
    allStations: z.boolean().default(false),
    temporaryPassword: z.string().min(12).max(128).optional(),
}).refine((value) => value.allStations || value.stationIds.length > 0, {
    message: 'Choose at least one station or All stations.',
    path: ['stationIds'],
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export class StaffProvisioningError extends Error {
    constructor(public code: string, message: string, public statusCode: number) {
        super(message);
        this.name = 'StaffProvisioningError';
    }
}

type ProvisioningActor = { userId: string; role?: string };
type ProvisioningLogger = { error: (details: unknown, message: string) => void };

async function removeIncompleteStaff(userId: string) {
    const profileCleanup = await adminClient.from('users').delete().eq('user_id', userId);
    const authCleanup = await adminClient.auth.admin.deleteUser(userId);
    return { profileCleanup, authCleanup, failed: Boolean(profileCleanup.error || authCleanup.error) };
}

export async function provisionStaff(rawInput: unknown, actor: ProvisioningActor, logger: ProvisioningLogger) {
    const input = createStaffSchema.parse(rawInput);
    if (input.temporaryPassword) {
        const policyError = vendorPasswordError(input.temporaryPassword);
        if (policyError) throw new StaffProvisioningError('weak_temporary_password', policyError, 422);
    }
    if (!isCorporateStaffEmail(input.email)) {
        throw new StaffProvisioningError('invalid_staff_email_domain', 'Staff accounts must use an @acoblighting.com or @org.acoblighting.com email address.', 400);
    }

    const stationIds = input.allStations ? [ALL_STATIONS_SCOPE] : normalizeStaffStationIds(input.stationIds);
    if (!input.allStations && !stationIds.length) {
        throw new StaffProvisioningError('station_required', 'Choose at least one valid station.', 400);
    }
    const primaryStationId = input.allStations ? null : stationIds[0];
    const { data: assignedRole, error: roleError } = await adminClient.from('roles').select('role_key, role_name, label').eq('role_key', input.roleKey).maybeSingle();
    if (roleError) throw new StaffProvisioningError('role_lookup_failed', 'The staff role could not be verified. Try again.', 503);
    if (!assignedRole) throw new StaffProvisioningError('role_not_found', 'Choose an existing role.', 400);

    const emailReadiness = await staffInvitationReadiness();
    if (!emailReadiness.ready) {
        throw new StaffProvisioningError(
            'staff_invitation_unavailable',
            emailReadiness.reason === 'not_configured'
                ? 'Staff invitations are unavailable because email delivery is not configured.'
                : 'Staff invitations are temporarily disabled. Enable staff invitation emails before creating an account.',
            503,
        );
    }

    const password = input.temporaryPassword ?? generateTemporaryPassword();
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email: input.email,
        password,
        email_confirm: false,
        user_metadata: { role_key: input.roleKey, role: input.roleKey, full_name: input.fullName, station_id: primaryStationId, station_ids: stationIds, all_stations: input.allStations },
    });
    if (authError || !authData.user) {
        throw new StaffProvisioningError('user_create_failed', authError?.message ?? 'Could not create staff user.', 400);
    }

    const userId = authData.user.id;
    const { error: profileError } = await adminClient.from('users').upsert({
        auth_user_id: userId,
        user_id: userId,
        user_name: input.fullName,
        email: input.email,
        role_key: input.roleKey,
        station_id: primaryStationId,
        station_ids: stationIds,
        password_reset_required: true,
        password_changed_at: null,
        password_session_id: null,
    }, { onConflict: 'user_id' });
    if (profileError) {
        const cleanup = await removeIncompleteStaff(userId);
        if (cleanup.failed) logger.error({ profileError, cleanup, userId }, 'Staff profile creation and rollback failed');
        throw new StaffProvisioningError(cleanup.failed ? 'staff_creation_cleanup_required' : 'staff_profile_failed', cleanup.failed ? 'Staff creation failed and the incomplete account needs administrator review.' : profileError.message, cleanup.failed ? 500 : 400);
    }

    const { data: verificationLink, error: verificationLinkError } = await adminClient.auth.admin.generateLink({
        type: 'magiclink', email: input.email, options: { redirectTo: env.STAFF_PORTAL_URL },
    });
    const actionLink = verificationLink?.properties?.action_link;
    if (verificationLinkError || !actionLink) {
        const cleanup = await removeIncompleteStaff(userId);
        if (cleanup.failed) logger.error({ verificationLinkError, cleanup, userId }, 'Staff verification-link creation and rollback failed');
        throw new StaffProvisioningError(cleanup.failed ? 'staff_creation_cleanup_required' : 'staff_verification_link_failed', cleanup.failed ? 'Staff creation failed and the incomplete account needs administrator review.' : 'The email verification link could not be created, so the staff account was not created.', cleanup.failed ? 500 : 502);
    }

    const permissionRows = input.roleKey === 'super-admin'
        ? PERMISSION_CATALOG.map((item) => item.key)
        : ((await adminClient.from('permissions').select('route_hash').eq('role_key', input.roleKey)).data ?? []).map((item: any) => item.route_hash);
    const granted = new Set(permissionRows);
    const invitationDelivery = await notifyStaffInvitation({
        email: input.email,
        fullName: input.fullName,
        temporaryPassword: password,
        roleLabel: (assignedRole as any).label ?? (assignedRole as any).role_name ?? input.roleKey,
        verificationUrl: actionLink,
        permissionLabels: PERMISSION_CATALOG.filter((item) => granted.has(item.key)).map((item) => item.label),
        stationScope: input.allStations ? 'All current and future stations' : stationIds.join(', '),
        idempotencyKey: `staff-invite-${userId}`,
    });
    if (invitationDelivery.status !== 'sent') {
        const cleanup = await removeIncompleteStaff(userId);
        await logAction({ actorUserId: actor.userId, actorType: 'staff', actorRole: actor.role,
            action: 'access.user.create_failed', targetType: 'staff_user', targetId: userId,
            after: { email: input.email, invitationEmailFailureReason: invitationDelivery.reason ?? 'provider_error', accountRolledBack: !cleanup.failed },
        }).catch(() => undefined);
        if (cleanup.failed) logger.error({ cleanup, userId }, 'Staff invite delivery and rollback failed');
        throw new StaffProvisioningError(cleanup.failed ? 'staff_invitation_cleanup_required' : 'staff_invitation_delivery_failed', cleanup.failed ? 'Invitation delivery failed and the incomplete account needs administrator review.' : 'The invitation email was not delivered, so the staff account was not created. Try again.', cleanup.failed ? 500 : 502);
    }

    await logAction({ actorUserId: actor.userId, actorType: 'staff', actorRole: actor.role,
        action: 'access.user.create', targetType: 'staff_user', targetId: userId,
        after: { email: input.email, roleKey: input.roleKey, stationIds, allStations: input.allStations, invitationEmailStatus: invitationDelivery.status, invitationEmailMessageId: invitationDelivery.messageId ?? null },
    }).catch((error) => logger.error({ error, userId }, 'Staff was created but its audit event could not be written'));

    return { ok: true as const, userId, temporaryPassword: password, invitationDelivery };
}

export async function deleteStaff(userId: string, actor: ProvisioningActor, logger: ProvisioningLogger) {
    if (userId === actor.userId) throw new StaffProvisioningError('self_deletion_denied', 'You cannot delete your own account.', 400);
    const { data: profile, error: readError } = await adminClient.from('users')
        .select('id, auth_user_id, user_id, user_name, email, role_key, station_id, station_ids')
        .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`).maybeSingle();
    if (readError) throw new StaffProvisioningError('staff_lookup_failed', 'The staff account could not be verified.', 503);

    if (profile) {
        const { error: profileError } = await adminClient.from('users').delete()
            .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`);
        if (profileError) throw new StaffProvisioningError('staff_profile_delete_failed', 'The staff profile could not be deleted. No authentication changes were made.', 503);
    }

    const { error: signOutError } = await adminClient.auth.admin.signOut(userId, 'global');
    if (signOutError) logger.error({ signOutError, userId }, 'Staff session revocation failed during permanent deletion');
    const { error: authError } = await adminClient.auth.admin.deleteUser(userId, true);
    if (authError && !/not found/i.test(authError.message ?? '')) {
        logger.error({ authError, userId }, 'Staff auth deletion failed after profile removal');
        throw new StaffProvisioningError('staff_auth_delete_failed', 'Staff access was disabled, but authentication cleanup requires administrator review.', 503);
    }

    await logAction({ actorUserId: actor.userId, actorType: 'staff', actorRole: actor.role,
        action: 'access.user.deleted', targetType: 'staff_user', targetId: userId, before: profile ?? { auth_user_id: userId },
    }).catch((error) => logger.error({ error, userId }, 'Staff was deleted but its audit event could not be written'));
    return { ok: true as const, userId };
}
