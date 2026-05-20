/**
 * Customer authentication service.
 *
 * Phone-OTP flow:
 *   1. requestOtp(phone, purpose) — generate 6-digit code, store hashed in DB, send via Twilio.
 *   2. verifyOtp(challengeId, otp) — check hash, expire challenge, create/find customer, issue JWT.
 *
 * The JWT is signed with SUPABASE_JWT_SECRET (HS256) and is directly accepted by
 * the auth plugin's requireCustomer() guard.
 *
 * Table required: customer_otp_challenges
 *   id uuid PK default gen_random_uuid()
 *   phone text not null
 *   otp_hash text not null
 *   purpose text not null  -- 'signup' | 'login'
 *   metadata jsonb not null default '{}'
 *   attempts int not null default 0
 *   expires_at timestamptz not null
 *   created_at timestamptz not null default now()
 */
import crypto from 'node:crypto';
import { adminClient } from '../db/supabase.js';
import { checkVerification, sendSms, sendVerification } from '../adapters/twilio.js';
import { sendEmail } from '../adapters/postmark.js';
import { getOrCreateWallet } from './wallets.js';
import { logAction } from './audit.js';
import { env } from '../config/env.js';
import {
    assertCustomerOtpTrafficAllowed,
    normalizeSmsPhone,
    SmsGuardrailError,
} from './sms-guardrails.js';

export type OtpPurpose = 'signup' | 'login' | 'recovery';

export interface CustomerProfile {
    id: string;
    auth_user_id?: string;
    user_id?: string;
    phone: string;
    email: string | null;
    full_name: string | null;
    kyc_tier: number;
    kyc_status: 'unverified' | 'pending' | 'verified' | 'rejected';
    status: 'active' | 'suspended' | 'closed';
    created_at: string;
}

export class AuthError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'AuthError';
    }
}

export interface EmailSignupInput {
    email: string;
    password: string;
    full_name: string;
    phone?: string;
}

export interface EmailLoginInput {
    email: string;
    password: string;
}

interface StoredOtpChallenge {
    id: string;
    phone: string;
    otp_hash: string;
    purpose: OtpPurpose;
    metadata: Record<string, unknown>;
    attempts: number;
    expires_at: string;
    consumed_at?: string | null;
    last_sent_at: string;
    send_count: number;
    delivery_provider?: string | null;
    delivery_reference?: string | null;
    created_at: string;
}

const fallbackOtpChallenges = new Map<string, StoredOtpChallenge>();
let customersAuthUserIdColumnAvailable: boolean | null = null;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RATE_LIMIT_WINDOW_MS = env.SMS_OTP_RATE_LIMIT_WINDOW_SECONDS * 1000;
const OTP_RATE_LIMIT_MAX = env.SMS_OTP_RATE_LIMIT_MAX;
const OTP_MAX_ATTEMPTS = 5;
export const CUSTOMER_OTP_TTL_SECONDS = OTP_TTL_MS / 1000;
export const CUSTOMER_OTP_RETRY_AFTER_SECONDS = env.SMS_OTP_RESEND_COOLDOWN_SECONDS;

function isOtpStorageMissing(message: string): boolean {
    const normalized = message.toLowerCase();
    return normalized.includes('customer_otp_challenges')
        && (normalized.includes('schema cache') || normalized.includes('does not exist'));
}

function otpChallengeCreateError(message: string): AuthError {
    if (isOtpStorageMissing(message)) {
        return new AuthError(
            'Customer OTP storage is not ready. Run the latest Supabase migrations and try again.',
            'otp_storage_missing',
        );
    }
    return new AuthError(message, 'challenge_create_failed');
}

function pruneFallbackOtpChallenges(): void {
    const now = Date.now();
    for (const [id, challenge] of fallbackOtpChallenges.entries()) {
        if (challenge.consumed_at || new Date(challenge.expires_at).getTime() < now) fallbackOtpChallenges.delete(id);
    }
}

function fallbackOtpRequestCount(phone: string, sinceIso: string): number {
    pruneFallbackOtpChallenges();
    const since = new Date(sinceIso).getTime();
    return Array.from(fallbackOtpChallenges.values())
        .filter((challenge) => challenge.phone === phone && new Date(challenge.created_at).getTime() >= since)
        .length;
}

function storeFallbackOtpChallenge(input: Omit<StoredOtpChallenge, 'id' | 'attempts' | 'created_at' | 'last_sent_at' | 'send_count'>): StoredOtpChallenge {
    pruneFallbackOtpChallenges();
    const challenge: StoredOtpChallenge = {
        ...input,
        id: crypto.randomUUID(),
        attempts: 0,
        last_sent_at: new Date().toISOString(),
        send_count: 1,
        created_at: new Date().toISOString(),
    };
    fallbackOtpChallenges.set(challenge.id, challenge);
    return challenge;
}

function generateOtp(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp + 'beverly-otp-salt').digest('hex');
}

function normalizeOptionalEmail(email: string | undefined): string | null {
    const normalized = email?.trim().toLowerCase();
    return normalized || null;
}

function normalizeRequiredEmail(email: string): string {
    const normalized = normalizeOptionalEmail(email);
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        throw new AuthError('Enter a valid email address.', 'invalid_email');
    }
    return normalized;
}

function normalizePassword(password: string): string {
    if (!password || password.length < 8) {
        throw new AuthError('Password must be at least 8 characters.', 'weak_password');
    }
    return password;
}

function isMissingColumn(message: string, column: string): boolean {
    const normalized = message.toLowerCase();
    return normalized.includes(column.toLowerCase())
        && (normalized.includes('schema cache') || normalized.includes('does not exist'));
}

async function hasCustomersAuthUserIdColumn(): Promise<boolean> {
    if (customersAuthUserIdColumnAvailable !== null) return customersAuthUserIdColumnAvailable;
    const { error } = await adminClient
        .from('customers')
        .select('auth_user_id')
        .limit(1);
    customersAuthUserIdColumnAvailable = !error || !isMissingColumn(error.message, 'auth_user_id');
    return customersAuthUserIdColumnAvailable;
}

function customerAuthUserId(customer: CustomerProfile): string {
    const authUserId = customer.auth_user_id ?? customer.user_id;
    if (!authUserId) {
        throw new AuthError('Customer account is missing an auth user link.', 'customer_auth_link_missing');
    }
    return authUserId;
}

function usesTwilioVerify(): boolean {
    return Boolean(env.TWILIO_VERIFY_SERVICE_SID);
}

function normalizePhone(phone: string): string {
    return normalizeSmsPhone(phone);
}

async function ensurePurposeAllowed(
    phone: string,
    purpose: OtpPurpose,
    metadata: Record<string, unknown>,
): Promise<void> {
    const { data: existing, error } = await adminClient
        .from('customers')
        .select('id, status, email')
        .eq('phone', phone)
        .maybeSingle();
    if (error) throw new AuthError(error.message, 'customer_lookup_failed');

    if (purpose === 'signup') {
        if (existing) throw new AuthError('An account already exists for this phone number.', 'phone_in_use');
        const email = normalizeOptionalEmail(metadata.email as string | undefined);
        if (email) {
            const { data: existingEmail, error: existingEmailErr } = await adminClient
                .from('customers')
                .select('id')
                .eq('email', email)
                .maybeSingle();
            if (existingEmailErr) throw new AuthError(existingEmailErr.message, 'email_lookup_failed');
            if (existingEmail) {
                throw new AuthError('A customer account with this email already exists.', 'email_in_use');
            }
        }
        return;
    }

    if (!existing) throw new AuthError('No account found for this phone number.', 'customer_not_found');
    if ((existing as any).status !== 'active') throw new AuthError('Account is not active.', 'account_inactive');
}

function b64url(data: string | Buffer): string {
    const b = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function issueJwt(userId: string): string {
    const now = Math.floor(Date.now() / 1000);
    const header  = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({
        sub: userId,
        role: 'authenticated',
        aud: 'authenticated',
        iat: now,
        exp: now + 60 * 60 * 24 * 30, // 30 days
    }));
    const sigInput = `${header}.${payload}`;
    const jwtSecret = env.SUPABASE_JWT_SECRET;
    if (!jwtSecret) throw new Error('SUPABASE_JWT_SECRET is required for customer JWT issuance');
    const sig = crypto.createHmac('sha256', jwtSecret).update(sigInput).digest();
    return `${sigInput}.${b64url(sig)}`;
}

export async function requestOtp(
    phone: string,
    purpose: OtpPurpose,
    metadata: Record<string, unknown> = {},
): Promise<{ challengeId: string; expiresAt: string; retryAfterSeconds: number }> {
    let normalised = normalizePhone(phone);
    try {
        const decision = await assertCustomerOtpTrafficAllowed({
            kind: 'customer_otp',
            phone: normalised,
            actorType: 'customer',
            metadata: { purpose },
        });
        normalised = decision.phone;
        metadata = { ...metadata, sms_country_code: decision.countryCode, sms_high_risk_geo: decision.highRisk };
    } catch (error) {
        if (error instanceof SmsGuardrailError) {
            throw new AuthError(error.message, error.code);
        }
        throw error;
    }
    await ensurePurposeAllowed(normalised, purpose, metadata);

    // Rate limit: max 3 challenges per phone in 10 minutes.
    const since = new Date(Date.now() - OTP_RATE_LIMIT_WINDOW_MS).toISOString();
    const rateLimitResult = await adminClient
        .from('customer_otp_challenges')
        .select('id', { count: 'exact', head: true })
        .eq('phone', normalised)
        .gte('created_at', since);
    if (rateLimitResult.error && !isOtpStorageMissing(rateLimitResult.error.message)) {
        throw new AuthError(rateLimitResult.error.message, 'challenge_lookup_failed');
    }
    const count = rateLimitResult.error && isOtpStorageMissing(rateLimitResult.error.message)
        ? fallbackOtpRequestCount(normalised, since)
        : rateLimitResult.count;
    if ((count ?? 0) >= OTP_RATE_LIMIT_MAX) {
        throw new AuthError('Too many OTP requests. Try again later.', 'rate_limit');
    }

    const otp = usesTwilioVerify() ? null : generateOtp();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
    const insertResult = await adminClient
        .from('customer_otp_challenges')
        .insert({
            phone: normalised,
            otp_hash: otp ? hashOtp(otp) : 'twilio-verify',
            purpose,
            metadata,
            attempts: 0,
            expires_at: expiresAt,
            last_sent_at: new Date().toISOString(),
            send_count: 1,
            delivery_provider: usesTwilioVerify() ? 'twilio-verify' : 'twilio-sms',
        })
        .select('id')
        .single();
    const fallbackChallenge = insertResult.error && isOtpStorageMissing(insertResult.error.message)
        ? storeFallbackOtpChallenge({
            phone: normalised,
            otp_hash: otp ? hashOtp(otp) : 'twilio-verify',
            purpose,
            metadata,
            expires_at: expiresAt,
            delivery_provider: usesTwilioVerify() ? 'twilio-verify' : 'twilio-sms',
        })
        : null;
    if (insertResult.error && !fallbackChallenge) throw otpChallengeCreateError(insertResult.error.message);
    const challengeId = fallbackChallenge?.id ?? (insertResult.data as { id: string }).id;

    try {
        if (usesTwilioVerify()) {
            const verification = await sendVerification(normalised, 'sms');
            const deliveryPatch = {
                metadata: {
                    ...metadata,
                    twilio_verify_sid: verification.sid,
                    twilio_verify_status: verification.status,
                },
                delivery_provider: 'twilio-verify',
                delivery_reference: verification.sid,
                last_sent_at: new Date().toISOString(),
            };
            if (fallbackChallenge) {
                Object.assign(fallbackChallenge, deliveryPatch);
                fallbackOtpChallenges.set(fallbackChallenge.id, fallbackChallenge);
            } else {
                await adminClient
                    .from('customer_otp_challenges')
                    .update(deliveryPatch)
                    .eq('id', challengeId);
            }
        } else if (otp) {
            const sms = await sendSms({
                to: normalised,
                body: `Your Beverly code: ${otp}. Valid for 5 minutes. Do not share this code.`,
                idempotencyKey: `customer-otp.${challengeId}`,
            });
            const deliveryPatch = {
                delivery_provider: 'twilio-sms',
                delivery_reference: sms.sid,
                last_sent_at: new Date().toISOString(),
            };
            if (fallbackChallenge) Object.assign(fallbackChallenge, deliveryPatch);
            else await adminClient.from('customer_otp_challenges').update(deliveryPatch).eq('id', challengeId);
        }
    } catch (e: any) {
        if (fallbackChallenge) fallbackOtpChallenges.delete(fallbackChallenge.id);
        else await adminClient.from('customer_otp_challenges').delete().eq('id', challengeId);
        throw new AuthError(e?.message ?? 'Could not send OTP.', 'otp_send_failed');
    }

    return { challengeId, expiresAt, retryAfterSeconds: CUSTOMER_OTP_RETRY_AFTER_SECONDS };
}

async function emailPasswordToken(email: string, password: string): Promise<{ accessToken: string; userId: string }> {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
            apikey: env.SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => ({})) as {
        access_token?: unknown;
        user?: { id?: unknown };
    };
    if (!res.ok || !body.access_token || !body.user?.id) {
        throw new AuthError('Invalid email or password.', 'invalid_credentials');
    }
    if (typeof body.access_token !== 'string' || typeof body.user.id !== 'string') {
        throw new AuthError('Invalid email or password.', 'invalid_credentials');
    }
    return { accessToken: body.access_token, userId: body.user.id };
}

async function createCustomerRow(input: {
    authUserId: string;
    email: string | null;
    phone: string | null;
    fullName: string | null;
    authProvider: 'phone_otp' | 'email_password';
    emailVerifiedAt?: string | null;
}): Promise<CustomerProfile> {
    const authLink = await hasCustomersAuthUserIdColumn()
        ? { auth_user_id: input.authUserId, user_id: input.authUserId }
        : { user_id: input.authUserId };

    const { data: customer, error } = await adminClient
        .from('customers')
        .insert({
            ...authLink,
            phone: input.phone,
            email: input.email,
            name: input.fullName ?? input.email ?? input.phone ?? 'Customer',
            full_name: input.fullName,
            kyc_tier: 0,
            kyc_status: 'unverified',
            status: 'active',
            auth_provider: input.authProvider,
            email_verified_at: input.emailVerifiedAt ?? null,
        })
        .select('*')
        .single();
    if (error) throw new AuthError(error.message, 'customer_create_failed');
    return customer as CustomerProfile;
}

export async function signupWithEmail(
    input: EmailSignupInput,
): Promise<{ access_token: string; customer: CustomerProfile; isNew: boolean }> {
    const email = normalizeRequiredEmail(input.email);
    const password = normalizePassword(input.password);
    const fullName = input.full_name?.trim();
    if (!fullName || fullName.length < 2) throw new AuthError('Full name is required.', 'full_name_required');
    const phone = input.phone ? normalizePhone(input.phone) : null;

    const { data: existingEmail, error: existingEmailErr } = await adminClient
        .from('customers')
        .select('id')
        .eq('email', email)
        .maybeSingle();
    if (existingEmailErr) throw new AuthError(existingEmailErr.message, 'email_lookup_failed');
    if (existingEmail) throw new AuthError('A customer account with this email already exists.', 'email_in_use');

    if (phone) {
        const { data: existingPhone, error: existingPhoneErr } = await adminClient
            .from('customers')
            .select('id')
            .eq('phone', phone)
            .maybeSingle();
        if (existingPhoneErr) throw new AuthError(existingPhoneErr.message, 'phone_lookup_failed');
        if (existingPhone) throw new AuthError('A customer account with this phone already exists.', 'phone_in_use');
    }

    const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: 'customer', full_name: fullName, phone },
    });
    if (authErr || !authData.user) {
        throw new AuthError(authErr?.message ?? 'User creation failed.', 'user_create_failed');
    }

    try {
        const customer = await createCustomerRow({
            authUserId: authData.user.id,
            email,
            phone,
            fullName,
            authProvider: 'email_password',
            emailVerifiedAt: new Date().toISOString(),
        });

        await getOrCreateWallet('customer', customer.id, {
            dailyCapMinor: 10_000_000,
            monthlyCapMinor: 50_000_000,
        });

        try {
            await sendEmail({
                to: email,
                subject: 'Welcome to Beverly',
                text: `Hi ${fullName},\n\nYour Beverly account is active.\n\nThe Beverly Team`,
                tag: 'customer-welcome',
            });
        } catch { /* non-fatal */ }

        await logAction({
            actorUserId: authData.user.id,
            actorType: 'customer',
            action: 'customer.email_signup',
            targetType: 'customer',
            targetId: customer.id,
            after: { email, phone },
        });

        const session = await emailPasswordToken(email, password);

        return {
            access_token: session.accessToken,
            customer,
            isNew: true,
        };
    } catch (error) {
        await adminClient.auth.admin.deleteUser(authData.user.id);
        throw error;
    }
}

export async function loginWithEmail(
    input: EmailLoginInput,
): Promise<{ access_token: string; customer: CustomerProfile; isNew: boolean }> {
    const email = normalizeRequiredEmail(input.email);
    const password = normalizePassword(input.password);
    const session = await emailPasswordToken(email, password);

    const { data: customer, error } = await adminClient
        .from('customers')
        .select('*')
        .eq('auth_user_id', session.userId)
        .maybeSingle();
    if (error) throw new AuthError(error.message, 'customer_lookup_failed');
    if (!customer) throw new AuthError('Customer profile not found.', 'customer_not_found');
    if ((customer as CustomerProfile).status !== 'active') {
        throw new AuthError('Account is not active.', 'account_inactive');
    }

    await logAction({
        actorUserId: session.userId,
        actorType: 'customer',
        action: 'customer.email_login',
        targetType: 'customer',
        targetId: (customer as CustomerProfile).id,
        after: { email },
    });

    return {
        access_token: session.accessToken,
        customer: customer as CustomerProfile,
        isNew: false,
    };
}

async function consumeChallenge(challengeId: string, fallbackRow?: StoredOtpChallenge | null): Promise<void> {
    if (fallbackRow) fallbackOtpChallenges.delete(challengeId);
    else await adminClient
        .from('customer_otp_challenges')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', challengeId);
}

async function recordFailedAttempt(
    challengeId: string,
    ch: StoredOtpChallenge,
    fallbackRow?: StoredOtpChallenge | null,
): Promise<number> {
    const attempts = ch.attempts + 1;
    if (fallbackRow) {
        fallbackRow.attempts = attempts;
        fallbackOtpChallenges.set(challengeId, fallbackRow);
    } else {
        await adminClient
            .from('customer_otp_challenges')
            .update({ attempts })
            .eq('id', challengeId);
    }
    return attempts;
}

export async function verifyOtp(
    challengeId: string,
    otp: string,
): Promise<{ access_token: string; customer: CustomerProfile; isNew: boolean }> {
    const { data: row, error } = await adminClient
        .from('customer_otp_challenges')
        .select('*')
        .eq('id', challengeId)
        .is('consumed_at', null)
        .maybeSingle();
    if (error && !isOtpStorageMissing(error.message)) {
        throw new AuthError(error.message, 'challenge_lookup_failed');
    }
    const fallbackRow = error && isOtpStorageMissing(error.message) ? fallbackOtpChallenges.get(challengeId) : null;
    if (!row && !fallbackRow) throw new AuthError('Challenge not found or already used.', 'challenge_not_found');

    const ch = (row ?? fallbackRow) as StoredOtpChallenge;

    if (ch.consumed_at) throw new AuthError('Challenge not found or already used.', 'challenge_not_found');

    if (new Date(ch.expires_at).getTime() <= Date.now()) {
        await consumeChallenge(challengeId, fallbackRow);
        throw new AuthError('OTP has expired. Request a new one.', 'otp_expired');
    }

    if (ch.attempts >= OTP_MAX_ATTEMPTS) {
        throw new AuthError('Too many failed attempts. Request a new OTP.', 'max_attempts');
    }

    let valid = false;
    if (ch.otp_hash === 'twilio-verify' || (ch.metadata as any)?.twilio_verify_sid) {
        const check = await checkVerification(ch.phone, otp);
        valid = check.status === 'approved' && check.valid;
    } else {
        valid = ch.otp_hash === hashOtp(otp);
    }
    if (!valid) {
        const attempts = await recordFailedAttempt(challengeId, ch, fallbackRow);
        if (attempts >= OTP_MAX_ATTEMPTS) {
            await consumeChallenge(challengeId, fallbackRow);
            throw new AuthError('Too many failed attempts. Request a new OTP.', 'max_attempts');
        }
        throw new AuthError('Invalid OTP.', 'invalid_otp');
    }

    // Consume challenge immediately
    await consumeChallenge(challengeId, fallbackRow);

    if (ch.purpose === 'signup') {
        return signUpCustomer(ch.phone, ch.metadata as { email?: string; full_name?: string });
    }
    return signInCustomer(ch.phone, ch.purpose === 'recovery' ? 'recovery' : 'login');
}

async function signUpCustomer(
    phone: string,
    meta: { email?: string; full_name?: string },
): Promise<{ access_token: string; customer: CustomerProfile; isNew: boolean }> {
    const email = normalizeOptionalEmail(meta.email);

    // Idempotent — if phone already registered, log them in
    const { data: existing } = await adminClient
        .from('customers')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();
    if (existing) {
        const result = await signInCustomer(phone);
        return { ...result, isNew: false };
    }

    if (email) {
        const { data: existingEmail, error: existingEmailErr } = await adminClient
            .from('customers')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        if (existingEmailErr) throw new AuthError(existingEmailErr.message, 'email_lookup_failed');
        if (existingEmail) {
            throw new AuthError('A customer account with this email already exists.', 'email_in_use');
        }
    }

    const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
        phone,
        phone_confirm: true,
        user_metadata: { role: 'customer', email, full_name: meta.full_name ?? null },
    });
    if (authErr || !authData.user) {
        throw new AuthError(authErr?.message ?? 'User creation failed.', 'user_create_failed');
    }

    const authLink = await hasCustomersAuthUserIdColumn()
        ? { auth_user_id: authData.user.id, user_id: authData.user.id }
        : { user_id: authData.user.id };

    const { data: customer, error: custErr } = await adminClient
        .from('customers')
        .insert({
            ...authLink,
            phone,
            email,
            full_name: meta.full_name ?? null,
            kyc_tier: 0,
            kyc_status: 'unverified',
            status: 'active',
        })
        .select('*')
        .single();
    if (custErr) {
        await adminClient.auth.admin.deleteUser(authData.user.id);
        throw new AuthError(custErr.message, 'customer_create_failed');
    }

    // Provision wallet (₦100k daily cap, ₦500k monthly cap for Tier 0)
    await getOrCreateWallet('customer', (customer as CustomerProfile).id, {
        dailyCapMinor: 10_000_000,
        monthlyCapMinor: 50_000_000,
    });

    if (email) {
        try {
            await sendEmail({
                to: email,
                subject: 'Welcome to Beverly',
                text: `Hi ${meta.full_name ?? 'there'},\n\nYour Beverly account is active. Download the app to buy electricity tokens instantly.\n\n— The Beverly Team`,
                tag: 'customer-welcome',
            });
        } catch { /* non-fatal */ }
    }

    await logAction({
        actorUserId: customerAuthUserId(customer as CustomerProfile),
        actorType: 'customer',
        action: 'customer.signup',
        targetType: 'customer',
        targetId: (customer as CustomerProfile).id,
        after: { phone, kyc_tier: 0 },
    });

    return {
        access_token: issueJwt(customerAuthUserId(customer as CustomerProfile)),
        customer: customer as CustomerProfile,
        isNew: true,
    };
}

async function signInCustomer(
    phone: string,
    purpose: 'login' | 'recovery' = 'login',
): Promise<{ access_token: string; customer: CustomerProfile; isNew: boolean }> {
    const { data: customer } = await adminClient
        .from('customers')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();
    if (!customer) throw new AuthError('No account found for this phone.', 'customer_not_found');
    if ((customer as CustomerProfile).status !== 'active') {
        throw new AuthError('Account is not active.', 'account_inactive');
    }

    await logAction({
        actorUserId: customerAuthUserId(customer as CustomerProfile),
        actorType: 'customer',
        action: purpose === 'recovery' ? 'customer.recovery' : 'customer.login',
        targetType: 'customer',
        targetId: (customer as CustomerProfile).id,
        after: { phone },
    });

    return {
        access_token: issueJwt(customerAuthUserId(customer as CustomerProfile)),
        customer: customer as CustomerProfile,
        isNew: false,
    };
}
