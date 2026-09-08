/**
 * Vendor onboarding — staff-initiated.  Vendors cannot self-onboard.
 *
 *   createVendorOrganization → creates org, vendor_user, auth.users, wallet,
 *                              issues temporary password, returns it ONCE.
 *   approveApplication       → converts a public vendor_application to a real org.
 *   freezeVendor / unfreeze  → wallet status + audit.
 */
import { adminClient } from '../db/supabase.js';
import { getOrCreateWallet, setOwnerWalletStatus, WalletStateError } from './wallets.js';
import { logAction, logSecurityEvent } from './audit.js';
import { sendEmail } from '../adapters/resend.js';
import { vendorOnboardingEmail } from '../emails/templates.js';
import { isFlagEnabled } from './feature-flags.js';
import { env } from '../config/env.js';
import crypto from 'node:crypto';

export class OnboardingError extends Error {
    constructor(message: string, public code: string) { super(message); this.name = 'OnboardingError'; }
}

function genTempPassword(): string {
    // 14 chars, mixed case + number + symbol
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnpqrstuvwxyz';
    const digit = '23456789';
    const sym   = '!@#$%&*?';
    const all   = upper + lower + digit + sym;
    let p = '';
    p += upper[crypto.randomInt(upper.length)];
    p += lower[crypto.randomInt(lower.length)];
    p += digit[crypto.randomInt(digit.length)];
    p += sym[crypto.randomInt(sym.length)];
    while (p.length < 14) p += all[crypto.randomInt(all.length)];
    return p.split('').sort(() => crypto.randomInt(2) - 0.5).join('');
}

export interface CreateVendorInput {
    legalName: string;
    tradingName?: string;
    cacNumber?: string;
    tin?: string;
    businessType?: string;
    contactEmail: string;
    contactPhone: string;
    operatingAddress?: string;
    stationId?: string;
    operatingStations?: string[];
    primaryUserEmail: string;
    primaryUserFullName: string;
    primaryUserPhone?: string;
    dailyLimitMinor?: number;
    createdByStaffId: string;
    sourceApplicationId?: string;
    provisioningKey?: string;
}

export interface CreateVendorResult {
    organizationId: string;
    primaryVendorUserId: string;
    authUserId: string;
    walletId: string;
    temporaryPassword: string | null;
    invitationDelivery: { status: 'sent' | 'failed'; messageId?: string; reason?: string };
}

export async function createVendorOrganization(input: CreateVendorInput): Promise<CreateVendorResult> {
    const requestedStations = [...new Set([
        input.stationId,
        ...(input.operatingStations ?? []),
    ].map((station) => String(station ?? '').trim().toUpperCase()).filter(Boolean))];
    if (requestedStations.length !== 1) {
        throw new OnboardingError('Choose exactly one operating station for this vendor.', 'single_station_required');
    }
    const primaryStation = requestedStations[0];

    // The HTTP idempotency record and the domain record deliberately share a
    // key. If the process dies after domain provisioning but before the HTTP
    // replay record is completed, retry from the durable domain state instead
    // of creating a second organization.
    if (input.provisioningKey) {
        const { data: existing, error: existingError } = await adminClient
            .from('vendor_organizations')
            .select('id, provisioning_status')
            .eq('provisioning_key', input.provisioningKey)
            .maybeSingle();
        if (existingError) throw new OnboardingError(existingError.message, 'provisioning_recovery_failed');
        if (existing && (existing as any).provisioning_status === 'active') {
            const { data: existingUser, error: userError } = await adminClient
                .from('vendor_users')
                .select('id, auth_user_id, invitation_status, invitation_message_id, invitation_error')
                .eq('vendor_organization_id', (existing as any).id)
                .limit(1)
                .maybeSingle();
            const { data: existingWallet, error: walletError } = await adminClient
                .from('wallets')
                .select('id')
                .eq('owner_type', 'vendor')
                .eq('owner_id', (existing as any).id)
                .maybeSingle();
            if (userError || walletError || !existingUser || !existingWallet) {
                throw new OnboardingError('Existing vendor provisioning is incomplete and requires recovery.', 'provisioning_recovery_failed');
            }
            return {
                organizationId: (existing as any).id,
                primaryVendorUserId: (existingUser as any).id,
                authUserId: (existingUser as any).auth_user_id,
                walletId: (existingWallet as any).id,
                temporaryPassword: null,
                invitationDelivery: (existingUser as any).invitation_status === 'sent'
                    ? { status: 'sent', messageId: (existingUser as any).invitation_message_id ?? undefined }
                    : { status: 'failed', reason: (existingUser as any).invitation_error ?? 'Invitation delivery is not confirmed.' },
            };
        }
        if (existing) {
            // A previous worker stopped mid-flight. Remove every discoverable
            // child before retrying the same durable key.
            const { data: staleUsers } = await adminClient
                .from('vendor_users')
                .select('id, auth_user_id')
                .eq('vendor_organization_id', (existing as any).id);
            await adminClient.from('wallets').delete().eq('owner_type', 'vendor').eq('owner_id', (existing as any).id);
            for (const staleUser of (staleUsers ?? []) as any[]) {
                if (staleUser.auth_user_id) await adminClient.auth.admin.deleteUser(staleUser.auth_user_id).catch(() => undefined);
            }
            await adminClient.from('vendor_users').delete().eq('vendor_organization_id', (existing as any).id);
            const { error: staleDeleteError } = await adminClient.from('vendor_organizations').delete().eq('id', (existing as any).id);
            if (staleDeleteError) throw new OnboardingError(staleDeleteError.message, 'provisioning_recovery_failed');
        }
    }
    const tempPwd = genTempPassword();
    let organizationId: string | null = null;
    let authUserId: string | null = null;
    let vendorUserId: string | null = null;
    let walletId: string | null = null;

    const compensate = async () => {
        try { if (walletId) await adminClient.from('wallets').delete().eq('id', walletId); } catch { /* continue compensation */ }
        try { if (vendorUserId) await adminClient.from('vendor_users').delete().eq('id', vendorUserId); } catch { /* continue compensation */ }
        try { if (authUserId) await adminClient.auth.admin.deleteUser(authUserId); } catch { /* continue compensation */ }
        try { if (organizationId) await adminClient.from('vendor_organizations').delete().eq('id', organizationId); } catch { /* continue compensation */ }
    };

    try {
        const { data: org, error: orgErr } = await adminClient.from('vendor_organizations').insert({
            legal_name: input.legalName,
            trading_name: input.tradingName ?? null,
            cac_number: input.cacNumber ?? null,
            tin: input.tin ?? null,
            business_type: input.businessType ?? null,
            contact_email: input.contactEmail,
            contact_phone: input.contactPhone,
            operating_address: input.operatingAddress ?? null,
            station_id: primaryStation,
            operating_stations: [primaryStation],
            station_ids_json: [primaryStation],
            daily_limit_minor: input.dailyLimitMinor ?? 1000000000,
            approved_by: input.createdByStaffId,
            status: 'pending',
            provisioning_status: 'pending',
            provisioning_key: input.provisioningKey ?? null,
        }).select('*').single();
        if (orgErr || !org) throw new OnboardingError(orgErr?.message ?? 'Organization was not created.', 'create_org_failed');
        organizationId = (org as { id: string }).id;

        // Signup-link generation creates the unconfirmed Auth user and its
        // verification link together. Supabase documents this as the supported
        // custom-email path; generating an invite after createUser would target
        // an already-existing user and can fail as "already registered".
        const { data: authUserData, error: authErr } = await adminClient.auth.admin.generateLink({
            type: 'signup',
            email: input.primaryUserEmail,
            password: tempPwd,
            options: {
                data: { role: 'vendor', full_name: input.primaryUserFullName, station_id: primaryStation },
                redirectTo: env.VENDOR_PORTAL_URL,
            },
        });
        if (authErr || !authUserData.user) {
            throw new OnboardingError(`auth signup link failed: ${authErr?.message ?? 'unknown'}`, 'auth_create_failed');
        }
        authUserId = authUserData.user.id;
        const verificationUrl = authUserData.properties?.action_link;
        if (!verificationUrl) {
            throw new OnboardingError('Vendor email verification link could not be created.', 'verification_link_failed');
        }

        const { data: vu, error: vuErr } = await adminClient.from('vendor_users').insert({
            auth_user_id: authUserId,
            vendor_organization_id: organizationId,
            role: 'vendor',
            full_name: input.primaryUserFullName,
            email: input.primaryUserEmail,
            phone: input.primaryUserPhone ?? null,
            password_reset_required: true,
            mfa_enrolled: false,
            status: 'invited',
            email_verified_at: null,
            invitation_status: 'pending',
        }).select('*').single();
        if (vuErr || !vu) throw new OnboardingError(vuErr?.message ?? 'Vendor user was not created.', 'create_vendor_user_failed');
        vendorUserId = (vu as { id: string }).id;

        const wallet = await getOrCreateWallet('vendor', organizationId, {
            dailyCapMinor: input.dailyLimitMinor ?? 1000000000,
        });
        walletId = wallet.id;

        await logAction({
            actorUserId: input.createdByStaffId,
            actorType: 'staff',
            action: 'vendor.organization.create',
            targetType: 'vendor_organization',
            targetId: organizationId,
            after: { legalName: input.legalName, primaryUserEmail: input.primaryUserEmail, walletId, stationId: primaryStation },
        });
        await logSecurityEvent('temp_password_issued', {
            actorUserId: authUserId,
            severity: 'info',
            metadata: { issued_by: input.createdByStaffId, vendor_organization_id: organizationId },
        });

        const { error: activateError } = await adminClient.from('vendor_organizations').update({
            provisioning_status: 'active',
        }).eq('id', organizationId);
        if (activateError) throw new OnboardingError(activateError.message, 'provisioning_status_update_failed');

        // This is the final compensatable database write. No later operation
        // may fail after the source application has been marked converted.
        if (input.sourceApplicationId) {
            const { error: applicationError } = await adminClient.from('vendor_applications').update({
                status: 'converted',
                converted_org_id: organizationId,
                reviewed_by: input.createdByStaffId,
                reviewed_at: new Date().toISOString(),
            }).eq('id', input.sourceApplicationId);
            if (applicationError) throw new OnboardingError(applicationError.message, 'source_application_update_failed');
        }

        // External delivery is intentionally last. A provider failure does not
        // roll back a valid account; it becomes an explicit, resendable admin
        // state. All database writes that can require compensation are already
        // complete before an email can leave the system.
        let invitationDelivery: CreateVendorResult['invitationDelivery'];
        try {
            const flagOn = await isFlagEnabled('notifications.email.vendor_onboarding');
            if (!flagOn) throw new Error('Vendor onboarding email is disabled.');
            const content = vendorOnboardingEmail({
                contactName: input.primaryUserFullName,
                legalName: input.legalName,
                loginEmail: input.primaryUserEmail,
                temporaryPassword: tempPwd,
                loginUrl: env.VENDOR_PORTAL_URL,
                verificationUrl,
            });
            const delivery = await sendEmail({ to: input.primaryUserEmail, subject: content.subject, html: content.html, text: content.text, tag: 'vendor-onboarding' });
            invitationDelivery = { status: 'sent', messageId: delivery.messageId };
            const { error: deliveryError } = await adminClient.from('vendor_users').update({
                invitation_status: 'sent',
                invitation_message_id: delivery.messageId,
                invitation_sent_at: new Date().toISOString(),
                invitation_error: null,
            }).eq('id', vendorUserId);
            if (deliveryError) throw new OnboardingError(deliveryError.message, 'invitation_status_update_failed');
        } catch (error) {
            const reason = error instanceof Error ? error.message : 'Invitation delivery failed.';
            invitationDelivery = { status: 'failed', reason };
            await adminClient.from('vendor_users').update({ invitation_status: 'failed', invitation_error: reason }).eq('id', vendorUserId);
        }

        return {
            organizationId,
            primaryVendorUserId: vendorUserId,
            authUserId,
            walletId,
            temporaryPassword: tempPwd,
            invitationDelivery,
        };
    } catch (error) {
        await compensate();
        if (error instanceof OnboardingError) throw error;
        throw new OnboardingError(error instanceof Error ? error.message : 'Vendor provisioning failed.', 'vendor_provisioning_failed');
    }
}

export async function resendVendorInvitation(vendorOrganizationId: string): Promise<{
    temporaryPassword: string;
    invitationDelivery: { status: 'sent'; messageId: string };
}> {
    const { data: organization, error: organizationError } = await adminClient
        .from('vendor_organizations')
        .select('id, legal_name, status')
        .eq('id', vendorOrganizationId)
        .maybeSingle();
    if (organizationError || !organization) throw new OnboardingError('Vendor organization was not found.', 'vendor_not_found');

    const { data: user, error: userError } = await adminClient
        .from('vendor_users')
        .select('id, auth_user_id, email, full_name, password_reset_required')
        .eq('vendor_organization_id', vendorOrganizationId)
        .limit(1)
        .maybeSingle();
    if (userError || !user || !(user as any).email) throw new OnboardingError('Vendor invitation recipient was not found.', 'invitation_recipient_missing');
    if ((user as any).password_reset_required !== true) throw new OnboardingError('This vendor has already completed first-time access.', 'invitation_already_accepted');

    const temporaryPassword = genTempPassword();
    const { error: passwordError } = await adminClient.auth.admin.updateUserById((user as any).auth_user_id, { password: temporaryPassword });
    if (passwordError) throw new OnboardingError(passwordError.message, 'invitation_password_rotation_failed');
    const { error: revokeError } = await adminClient.auth.admin.signOut((user as any).auth_user_id, 'global');
    if (revokeError) throw new OnboardingError(revokeError.message, 'invitation_session_revocation_failed');

    const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'magiclink',
        email: (user as any).email,
        options: { redirectTo: env.VENDOR_PORTAL_URL },
    });
    const verificationUrl = link?.properties?.action_link;
    if (linkError || !verificationUrl) throw new OnboardingError('Vendor verification link could not be regenerated.', 'verification_link_failed');

    try {
        const content = vendorOnboardingEmail({
            contactName: (user as any).full_name,
            legalName: (organization as any).legal_name,
            loginEmail: (user as any).email,
            temporaryPassword,
            loginUrl: env.VENDOR_PORTAL_URL,
            verificationUrl,
        });
        const delivery = await sendEmail({ to: (user as any).email, subject: content.subject, html: content.html, text: content.text, tag: 'vendor-onboarding-resend' });
        const { error: statusError } = await adminClient.from('vendor_users').update({
            invitation_status: 'sent',
            invitation_message_id: delivery.messageId,
            invitation_sent_at: new Date().toISOString(),
            invitation_error: null,
        }).eq('id', (user as any).id);
        if (statusError) throw statusError;
        return { temporaryPassword, invitationDelivery: { status: 'sent', messageId: delivery.messageId } };
    } catch (error) {
        const reason = error instanceof Error ? error.message : 'Invitation delivery failed.';
        await adminClient.from('vendor_users').update({ invitation_status: 'failed', invitation_error: reason }).eq('id', (user as any).id);
        throw new OnboardingError(reason, 'invitation_delivery_failed');
    }
}

export async function setVendorStatus(
    vendorOrganizationId: string,
    newStatus: 'approved' | 'suspended' | 'frozen' | 'closed',
    staffId: string,
    reason?: string,
): Promise<void> {
    const { data: before } = await adminClient
        .from('vendor_organizations')
        .select('status')
        .eq('id', vendorOrganizationId)
        .single();
    if ((before as any)?.status === 'closed' && newStatus !== 'closed') {
        throw new OnboardingError('Closed vendors cannot be reactivated. Create a replacement vendor profile instead.', 'vendor_closed_final');
    }

    // Mirror account controls to the wallet so vend/funding paths cannot bypass
    // an organization-level suspension.
    const walletStatus =
        newStatus === 'approved' ? 'active'
        : newStatus === 'closed' ? 'closed'
        : 'frozen';
    try {
        await setOwnerWalletStatus('vendor', vendorOrganizationId, walletStatus);
    } catch (error) {
        if (error instanceof WalletStateError) {
            throw new OnboardingError(error.message, error.code);
        }
        throw error;
    }

    const { error } = await adminClient
        .from('vendor_organizations')
        .update({ status: newStatus, notes: reason ?? null })
        .eq('id', vendorOrganizationId);
    if (error) throw new OnboardingError(error.message, 'status_update_failed');

    await logAction({
        actorUserId: staffId,
        actorType: 'staff',
        action: `vendor.organization.${newStatus}`,
        targetType: 'vendor_organization',
        targetId: vendorOrganizationId,
        before: { status: before?.status },
        after: { status: newStatus, walletStatus, reason: reason ?? null },
    });
}

export async function submitPublicApplication(opts: {
    legalName: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    businessType?: string;
    operatingStations?: string[];
    notes?: string;
    sourceIp?: string;
    userAgent?: string;
}): Promise<{ id: string }> {
    const { data, error } = await adminClient.from('vendor_applications').insert({
        legal_name: opts.legalName,
        contact_name: opts.contactName,
        contact_email: opts.contactEmail,
        contact_phone: opts.contactPhone,
        business_type: opts.businessType ?? null,
        operating_stations: opts.operatingStations ?? null,
        notes: opts.notes ?? null,
        source_ip: opts.sourceIp ?? null,
        user_agent: opts.userAgent ?? null,
    }).select('id').single();
    if (error) throw new OnboardingError(error.message, 'application_failed');
    return data as { id: string };
}
