/**
 * Vendor onboarding — staff-initiated.  Vendors cannot self-onboard.
 *
 *   createVendorOrganization → creates org, vendor_user, auth.users, wallet,
 *                              issues temporary password, returns it ONCE.
 *   approveApplication       → converts a public vendor_application to a real org.
 *   freezeVendor / unfreeze  → wallet status + audit.
 */
import { adminClient } from '../db/supabase.js';
import { getOrCreateWallet } from './wallets.js';
import { logAction } from './audit.js';
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
    operatingStations?: string[];
    primaryUserEmail: string;
    primaryUserFullName: string;
    primaryUserPhone?: string;
    dailyLimitMinor?: number;
    createdByStaffId: string;
    sourceApplicationId?: string;
}

export interface CreateVendorResult {
    organizationId: string;
    primaryVendorUserId: string;
    authUserId: string;
    walletId: string;
    temporaryPassword: string;
}

export async function createVendorOrganization(input: CreateVendorInput): Promise<CreateVendorResult> {
    // 1) create vendor_organizations
    const { data: org, error: orgErr } = await adminClient.from('vendor_organizations').insert({
        legal_name: input.legalName,
        trading_name: input.tradingName ?? null,
        cac_number: input.cacNumber ?? null,
        tin: input.tin ?? null,
        business_type: input.businessType ?? null,
        contact_email: input.contactEmail,
        contact_phone: input.contactPhone,
        operating_address: input.operatingAddress ?? null,
        operating_stations: input.operatingStations ?? [],
        daily_limit_minor: input.dailyLimitMinor ?? 1000000000,
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: input.createdByStaffId,
    }).select('*').single();
    if (orgErr) throw new OnboardingError(orgErr.message, 'create_org_failed');
    const organization = org as { id: string };

    // 2) create auth user via Supabase Admin API
    const tempPwd = genTempPassword();
    const { data: authUserData, error: authErr } = await adminClient.auth.admin.createUser({
        email: input.primaryUserEmail,
        password: tempPwd,
        email_confirm: true,
        user_metadata: { role: 'vendor_user', full_name: input.primaryUserFullName },
    });
    if (authErr || !authUserData.user) {
        throw new OnboardingError(`auth create failed: ${authErr?.message ?? 'unknown'}`, 'auth_create_failed');
    }
    const authUserId = authUserData.user.id;

    // 3) link vendor_user
    const { data: vu, error: vuErr } = await adminClient.from('vendor_users').insert({
        auth_user_id: authUserId,
        vendor_organization_id: organization.id,
        role: 'vendor_manager',
        full_name: input.primaryUserFullName,
        email: input.primaryUserEmail,
        phone: input.primaryUserPhone ?? null,
        password_reset_required: true,
        mfa_enrolled: false,
        status: 'active',
    }).select('*').single();
    if (vuErr) throw new OnboardingError(vuErr.message, 'create_vendor_user_failed');

    // 4) provision wallet
    const wallet = await getOrCreateWallet('vendor', organization.id, {
        dailyCapMinor: input.dailyLimitMinor ?? 1000000000,
    });

    // 5) link source application if present
    if (input.sourceApplicationId) {
        await adminClient.from('vendor_applications').update({
            status: 'converted',
            converted_org_id: organization.id,
            reviewed_by: input.createdByStaffId,
            reviewed_at: new Date().toISOString(),
        }).eq('id', input.sourceApplicationId);
    }

    await logAction({
        actorUserId: input.createdByStaffId,
        actorType: 'staff',
        action: 'vendor.organization.create',
        targetType: 'vendor_organization',
        targetId: organization.id,
        after: {
            legalName: input.legalName,
            primaryUserEmail: input.primaryUserEmail,
            walletId: wallet.id,
        },
    });

    return {
        organizationId: organization.id,
        primaryVendorUserId: (vu as { id: string }).id,
        authUserId,
        walletId: wallet.id,
        temporaryPassword: tempPwd,
    };
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

    const { error } = await adminClient
        .from('vendor_organizations')
        .update({ status: newStatus, notes: reason ?? null })
        .eq('id', vendorOrganizationId);
    if (error) throw new OnboardingError(error.message, 'status_update_failed');

    // mirror wallet state
    if (newStatus === 'frozen' || newStatus === 'closed') {
        await adminClient.from('wallets').update({ status: 'frozen' })
            .eq('owner_type', 'vendor').eq('owner_id', vendorOrganizationId);
    } else if (newStatus === 'approved') {
        await adminClient.from('wallets').update({ status: 'active' })
            .eq('owner_type', 'vendor').eq('owner_id', vendorOrganizationId);
    }

    await logAction({
        actorUserId: staffId,
        actorType: 'staff',
        action: `vendor.organization.${newStatus}`,
        targetType: 'vendor_organization',
        targetId: vendorOrganizationId,
        before: { status: before?.status },
        after: { status: newStatus, reason: reason ?? null },
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
