/**
 * Staff (admin) app-level TOTP 2FA.
 *
 * Mirrors the vendor MFA model but keys everything on auth.users.id since staff
 * identity is the Supabase auth user (no separate staff_users row is required).
 * Secrets are AES-256-GCM encrypted; recovery codes are stored hashed; verified
 * sessions are bound to the access-token hash and expire after 12h.
 */
import { adminClient } from '../db/supabase.js';
import { logSecurityEvent } from './audit.js';
import {
    decryptSecret, encryptSecret, generateRecoveryCodes, generateSecret,
    hashValue, normalizeRecoveryCode, otpauthUri, verifyTotp,
    TOTP_DIGITS, TOTP_STEP_SECONDS,
} from './totp.js';

const SALT = 'beverly-staff-mfa';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ISSUER = 'Beverly Wallet Admin';

export class StaffMfaError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'StaffMfaError';
    }
}

export interface StaffMfaActor {
    userId: string;
    email: string | null;
}

export interface StaffMfaRequestMeta {
    ip?: string | null;
    userAgent?: string | null;
}

function sessionHash(accessToken: string): string {
    return hashValue(accessToken, SALT);
}

function recoveryHash(code: string): string {
    return hashValue(normalizeRecoveryCode(code), SALT);
}

async function activeFactor(userId: string) {
    const { data } = await adminClient
        .from('staff_mfa_factors')
        .select('*')
        .eq('auth_user_id', userId)
        .eq('status', 'active')
        .maybeSingle();
    return data as any | null;
}

async function pendingFactor(userId: string) {
    const { data } = await adminClient
        .from('staff_mfa_factors')
        .select('*')
        .eq('auth_user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    return data as any | null;
}

export async function staffMfaSessionVerified(userId: string, accessToken: string): Promise<boolean> {
    const { data } = await adminClient
        .from('staff_mfa_sessions')
        .select('id')
        .eq('auth_user_id', userId)
        .eq('token_hash', sessionHash(accessToken))
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
    return Boolean(data);
}

export async function staffMfaEnrolled(userId: string): Promise<boolean> {
    return Boolean(await activeFactor(userId));
}

export async function staffMfaStatus(userId: string, accessToken?: string) {
    const factor = await activeFactor(userId);
    const recovery = factor
        ? await adminClient
            .from('staff_mfa_recovery_codes')
            .select('id', { count: 'exact', head: true })
            .eq('auth_user_id', userId)
            .is('used_at', null)
        : { count: 0 };
    return {
        enrolled: Boolean(factor),
        verified: accessToken ? await staffMfaSessionVerified(userId, accessToken) : false,
        method: factor ? 'authenticator_app' : null,
        recovery_codes_remaining: recovery.count ?? 0,
        last_verified_at: factor?.last_verified_at ?? null,
        enrolled_at: factor?.verified_at ?? null,
    };
}

async function createPendingEnrollment(actor: StaffMfaActor) {
    await adminClient
        .from('staff_mfa_factors')
        .update({ status: 'replaced' })
        .eq('auth_user_id', actor.userId)
        .eq('status', 'pending');

    const secret = generateSecret();
    const { data, error } = await adminClient
        .from('staff_mfa_factors')
        .insert({
            auth_user_id: actor.userId,
            factor_type: 'totp',
            status: 'pending',
            secret_ciphertext: encryptSecret(secret),
        })
        .select('id')
        .single();
    if (error || !data) throw new StaffMfaError('Could not start 2FA setup.', 'mfa_setup_failed');

    return {
        factor_id: (data as any).id,
        secret,
        otpauth_uri: otpauthUri(secret, { issuer: ISSUER, label: actor.email || actor.userId }),
        issuer: ISSUER,
        account_label: actor.email || actor.userId,
        digits: TOTP_DIGITS,
        period_seconds: TOTP_STEP_SECONDS,
    };
}

async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
    const { data } = await adminClient
        .from('staff_mfa_recovery_codes')
        .select('id, code_hash')
        .eq('auth_user_id', userId)
        .is('used_at', null);
    const target = recoveryHash(code);
    const match = (data || []).find((row: any) => row.code_hash === target);
    if (!match) return false;
    await adminClient
        .from('staff_mfa_recovery_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('id', (match as any).id);
    return true;
}

async function verifyActiveMfaCode(actor: StaffMfaActor, code: string, reason: string, meta: StaffMfaRequestMeta = {}) {
    const factor = await activeFactor(actor.userId);
    if (!factor) throw new StaffMfaError('Two-factor authentication is not enabled.', 'mfa_not_enabled');
    const secret = decryptSecret(factor.secret_ciphertext);
    const isTotp = verifyTotp(secret, code);
    const isRecovery = isTotp ? false : await consumeRecoveryCode(actor.userId, code);
    if (!isTotp && !isRecovery) {
        await logSecurityEvent('mfa_failure', {
            actorUserId: actor.userId,
            severity: 'high',
            ip: meta.ip,
            userAgent: meta.userAgent,
            metadata: { reason, surface: 'staff' },
        });
        throw new StaffMfaError('Enter a valid security code.', 'invalid_otp');
    }
    return { factor, recoveryCodeUsed: isRecovery };
}

async function createVerifiedSession(actor: StaffMfaActor, accessToken: string): Promise<string> {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await adminClient.from('staff_mfa_sessions').upsert({
        auth_user_id: actor.userId,
        token_hash: sessionHash(accessToken),
        expires_at: expiresAt,
        verified_at: new Date().toISOString(),
    }, { onConflict: 'token_hash' });
    return expiresAt;
}

async function issueRecoveryCodes(actor: StaffMfaActor): Promise<string[]> {
    await adminClient.from('staff_mfa_recovery_codes').delete().eq('auth_user_id', actor.userId);
    const recoveryCodes = generateRecoveryCodes();
    await adminClient.from('staff_mfa_recovery_codes').insert(recoveryCodes.map((recoveryCode) => ({
        auth_user_id: actor.userId,
        code_hash: recoveryHash(recoveryCode),
    })));
    return recoveryCodes;
}

export async function beginStaffMfaEnrollment(actor: StaffMfaActor) {
    const existing = await activeFactor(actor.userId);
    if (existing) throw new StaffMfaError('Two-factor authentication is already enabled.', 'mfa_already_enabled');
    return createPendingEnrollment(actor);
}

export async function beginStaffMfaReplacement(actor: StaffMfaActor, code: string, meta: StaffMfaRequestMeta = {}) {
    await verifyActiveMfaCode(actor, code, 'invalid_replacement_code', meta);
    return createPendingEnrollment(actor);
}

export async function verifyStaffMfaEnrollment(actor: StaffMfaActor, accessToken: string, code: string, meta: StaffMfaRequestMeta = {}) {
    const factor = await pendingFactor(actor.userId);
    if (!factor) throw new StaffMfaError('Start 2FA setup before verifying.', 'mfa_setup_not_started');
    const secret = decryptSecret(factor.secret_ciphertext);
    if (!verifyTotp(secret, code)) {
        await logSecurityEvent('mfa_failure', {
            actorUserId: actor.userId,
            severity: 'medium',
            ip: meta.ip,
            userAgent: meta.userAgent,
            metadata: { reason: 'invalid_enrollment_code', surface: 'staff' },
        });
        throw new StaffMfaError('That authenticator code is not correct.', 'invalid_otp');
    }

    await adminClient.from('staff_mfa_factors')
        .update({ status: 'replaced' })
        .eq('auth_user_id', actor.userId)
        .eq('status', 'active');
    await adminClient.from('staff_mfa_factors').update({
        status: 'active',
        verified_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
    }).eq('id', factor.id);

    const recoveryCodes = await issueRecoveryCodes(actor);
    const session_expires_at = await createVerifiedSession(actor, accessToken);

    await logSecurityEvent('mfa_enabled', {
        actorUserId: actor.userId,
        severity: 'info',
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { method: 'authenticator_app', surface: 'staff' },
    });

    return { ok: true as const, recovery_codes: recoveryCodes, session_expires_at };
}

export async function verifyStaffMfaChallenge(actor: StaffMfaActor, accessToken: string, code: string, meta: StaffMfaRequestMeta = {}) {
    const { factor, recoveryCodeUsed } = await verifyActiveMfaCode(actor, code, 'invalid_login_code', meta);
    await adminClient.from('staff_mfa_factors')
        .update({ last_verified_at: new Date().toISOString() })
        .eq('id', factor.id);
    const session_expires_at = await createVerifiedSession(actor, accessToken);
    return { ok: true as const, recovery_code_used: recoveryCodeUsed, session_expires_at };
}

export async function regenerateStaffRecoveryCodes(actor: StaffMfaActor, code: string, meta: StaffMfaRequestMeta = {}) {
    await verifyActiveMfaCode(actor, code, 'invalid_recovery_regen_code', meta);
    const recovery_codes = await issueRecoveryCodes(actor);
    return { ok: true as const, recovery_codes };
}

export async function disableStaffMfa(actor: StaffMfaActor, code: string, meta: StaffMfaRequestMeta = {}) {
    await verifyActiveMfaCode(actor, code, 'invalid_disable_code', meta);
    await adminClient.from('staff_mfa_factors')
        .update({ status: 'disabled', disabled_at: new Date().toISOString() })
        .eq('auth_user_id', actor.userId)
        .eq('status', 'active');
    await adminClient.from('staff_mfa_recovery_codes').delete().eq('auth_user_id', actor.userId);
    await adminClient.from('staff_mfa_sessions').delete().eq('auth_user_id', actor.userId);

    await logSecurityEvent('mfa_disabled', {
        actorUserId: actor.userId,
        severity: 'high',
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { method: 'authenticator_app', surface: 'staff' },
    });
    return { ok: true as const };
}
