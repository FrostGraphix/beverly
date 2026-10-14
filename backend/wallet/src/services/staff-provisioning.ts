import { z } from 'zod';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { adminClient } from '../db/supabase.js';
import { PERMISSION_CATALOG } from '../routes/admin-access-constants.js';
import { logAction } from './audit.js';
import { isCorporateStaffEmail } from './email-validation.js';
import { notifyRoleAssignment, notifyStaffInvitation, notifyStationAssignment, notifyStaffAccountChange, staffInvitationReadiness } from './admin-notifications.js';
import { ALL_STATIONS_SCOPE, normalizeStaffStationIds } from './staff-station-scope.js';

export const createStaffSchema = z.object({
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    fullName: z.string().trim().min(2).max(120),
    roleKey: z.string().trim().min(2).max(80),
    stationIds: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
    allStations: z.boolean().default(false),
}).refine((value) => value.allStations || value.stationIds.length > 0, {
    message: 'Choose at least one station or All stations.',
    path: ['stationIds'],
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateStaffSchema = z.object({
    roleKey: z.string().trim().min(2).max(80),
    stationIds: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
    allStations: z.boolean().default(false),
}).refine((value) => value.allStations || value.stationIds.length > 0, {
    message: 'Choose at least one station or All stations.',
    path: ['stationIds'],
});

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

    const bootstrapPassword = `${crypto.randomBytes(24).toString('base64url')}Aa1!`;
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email: input.email,
        password: bootstrapPassword,
        email_confirm: true,
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
        type: 'recovery', email: input.email, options: { redirectTo: new URL('setup-account', env.STAFF_PORTAL_URL).toString() },
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
        roleLabel: (assignedRole as any).label ?? (assignedRole as any).role_name ?? input.roleKey,
        setupUrl: actionLink,
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

    return { ok: true as const, userId, invitationDelivery };
}

export async function updateStaff(userId: string, rawInput: unknown, actor: ProvisioningActor, logger: ProvisioningLogger) {
    const input = updateStaffSchema.parse(rawInput);
    const stationIds = input.allStations ? [ALL_STATIONS_SCOPE] : normalizeStaffStationIds(input.stationIds);
    if (!input.allStations && !stationIds.length) throw new StaffProvisioningError('station_required', 'Choose at least one valid station.', 400);
    const { data: assignedRole, error: roleError } = await adminClient.from('roles').select('role_key, role_name, label').eq('role_key', input.roleKey).maybeSingle();
    if (roleError) throw new StaffProvisioningError('role_lookup_failed', 'The staff role could not be verified. Try again.', 503);
    if (!assignedRole) throw new StaffProvisioningError('role_not_found', 'Choose an existing role.', 400);
    const { data: before, error: readError } = await adminClient.from('users')
        .select('email, user_name, role_key, station_id, station_ids').or(`auth_user_id.eq.${userId},user_id.eq.${userId}`).maybeSingle();
    if (readError || !before) throw new StaffProvisioningError('staff_not_found', 'Staff account was not found.', 404);
    const primaryStationId = input.allStations ? null : stationIds[0];
    const { data: authUser, error: authReadError } = await adminClient.auth.admin.getUserById(userId);
    if (authReadError || !authUser.user) throw new StaffProvisioningError('staff_auth_not_found', 'The staff login could not be verified.', 404);

    const { error: profileError } = await adminClient.from('users').update({
        role_key: input.roleKey, station_id: primaryStationId, station_ids: stationIds, updated_at: new Date().toISOString(),
    }).or(`auth_user_id.eq.${userId},user_id.eq.${userId}`);
    if (profileError) throw new StaffProvisioningError('staff_update_failed', 'No changes were saved.', 503);

    const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: { ...(authUser.user.user_metadata ?? {}), role_key: input.roleKey, role: input.roleKey, station_id: primaryStationId, station_ids: stationIds, all_stations: input.allStations },
    });
    if (authError) {
        const rollback = await adminClient.from('users').update({
            role_key: (before as any).role_key, station_id: (before as any).station_id, station_ids: (before as any).station_ids,
        }).or(`auth_user_id.eq.${userId},user_id.eq.${userId}`);
        if (rollback.error) logger.error({ authError, rollback: rollback.error, userId }, 'Staff update rollback failed');
        throw new StaffProvisioningError(rollback.error ? 'staff_update_cleanup_required' : 'staff_auth_update_failed', rollback.error ? 'The update failed and requires administrator review.' : 'No changes were saved.', rollback.error ? 500 : 503);
    }

    await logAction({ actorUserId: actor.userId, actorType: 'staff', actorRole: actor.role,
        action: 'access.user.update', targetType: 'staff_user', targetId: userId,
        before, after: { roleKey: input.roleKey, stationIds, allStations: input.allStations },
    }).catch((error) => logger.error({ error, userId }, 'Staff was updated but its audit event could not be written'));
    if ((before as any).role_key !== input.roleKey) await notifyRoleAssignment(userId, (assignedRole as any).label ?? (assignedRole as any).role_name ?? input.roleKey);
    if (JSON.stringify((before as any).station_ids ?? []) !== JSON.stringify(stationIds)) {
        await notifyStationAssignment({ email: (before as any).email, name: (before as any).user_name, stationLabel: input.allStations ? 'All stations (including future stations)' : stationIds.join(', '), previousStationLabel: ((before as any).station_ids ?? []).includes(ALL_STATIONS_SCOPE) ? 'All stations' : ((before as any).station_ids ?? []).join(', ') || null });
        await notifyStaffAccountChange(userId, 'station_update', 'Your station access changed', input.allStations ? 'You can now access all stations.' : `Your assigned stations: ${stationIds.join(', ')}.`, `station.assignment.${userId}.${Date.now()}`).catch(() => undefined);
    }
    return { ok: true as const, userId, roleKey: input.roleKey, stationIds, allStations: input.allStations };
}

export async function sendStaffPasswordSetup(userId: string, actor: ProvisioningActor, logger: ProvisioningLogger) {
    const { data: staff, error: staffError } = await adminClient.from('users')
        .select('email, user_name, role_key, station_ids, password_reset_required, password_changed_at, password_session_id')
        .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`).maybeSingle();
    if (staffError || !staff?.email) throw new StaffProvisioningError('staff_not_found', 'Staff account was not found.', 404);
    const readiness = await staffInvitationReadiness();
    if (!readiness.ready) throw new StaffProvisioningError('staff_invitation_unavailable', 'Password setup emails are temporarily unavailable.', 503);
    const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'recovery', email: staff.email, options: { redirectTo: new URL('setup-account', env.STAFF_PORTAL_URL).toString() },
    });
    const setupUrl = link?.properties?.action_link;
    if (linkError || !setupUrl) throw new StaffProvisioningError('staff_setup_link_failed', 'The secure password setup link could not be created.', 502);
    const changedAt = new Date().toISOString();
    const { error: stateError } = await adminClient.from('users').update({
        password_reset_required: true, password_changed_at: changedAt, password_session_id: null, updated_at: changedAt,
    }).or(`auth_user_id.eq.${userId},user_id.eq.${userId}`);
    if (stateError) throw new StaffProvisioningError('password_reset_state_failed', 'Password reset state could not be saved.', 503);
    const { data: role } = await adminClient.from('roles').select('role_name, label').eq('role_key', staff.role_key).maybeSingle();
    const permissionRows = staff.role_key === 'super-admin'
        ? PERMISSION_CATALOG.map((item) => item.key)
        : ((await adminClient.from('permissions').select('route_hash').eq('role_key', staff.role_key)).data ?? []).map((item: any) => item.route_hash);
    const granted = new Set(permissionRows);
    const delivery = await notifyStaffInvitation({
        email: staff.email, fullName: staff.user_name || staff.email, setupUrl,
        roleLabel: (role as any)?.label ?? (role as any)?.role_name ?? staff.role_key,
        permissionLabels: PERMISSION_CATALOG.filter((item) => granted.has(item.key)).map((item) => item.label),
        stationScope: (staff.station_ids as string[] | null)?.includes(ALL_STATIONS_SCOPE) ? 'All current and future stations' : (staff.station_ids as string[] | null)?.join(', ') || 'Unassigned',
        idempotencyKey: `staff-password-setup-${userId}-${changedAt}`,
    });
    if (delivery.status !== 'sent') {
        await adminClient.from('users').update({
            password_reset_required: staff.password_reset_required,
            password_changed_at: staff.password_changed_at,
            password_session_id: staff.password_session_id,
        }).or(`auth_user_id.eq.${userId},user_id.eq.${userId}`);
        throw new StaffProvisioningError('staff_setup_delivery_failed', 'The password setup email was not delivered. No access changes were made.', 502);
    }
    const { error: signOutError } = await adminClient.auth.admin.signOut(userId, 'global');
    if (signOutError) logger.error({ signOutError, userId }, 'Staff session revocation failed after password setup email');
    await logAction({ actorUserId: actor.userId, actorType: 'staff', actorRole: actor.role,
        action: 'access.user.password_setup_sent', targetType: 'staff_user', targetId: userId,
    }).catch((error) => logger.error({ error, userId }, 'Staff password setup email was sent but its audit event could not be written'));
    return { ok: true as const, userId, invitationDelivery: delivery };
}
