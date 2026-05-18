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

export type OtpPurpose = 'signup' | 'login';

export interface CustomerProfile {
    id: string;
    auth_user_id: string;
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

function generateOtp(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp + 'beverly-otp-salt').digest('hex');
}

function usesTwilioVerify(): boolean {
    return Boolean(env.TWILIO_VERIFY_SERVICE_SID);
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
): Promise<{ challengeId: string }> {
    const normalised = phone.startsWith('+') ? phone : `+234${phone.replace(/^0/, '')}`;

    // Rate limit: max 3 challenges per phone in 10 minutes
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await adminClient
        .from('customer_otp_challenges')
        .select('id', { count: 'exact', head: true })
        .eq('phone', normalised)
        .gte('created_at', since);
    if ((count ?? 0) >= 3) {
        throw new AuthError('Too many OTP requests. Try again in 10 minutes.', 'rate_limit');
    }

    // For login: confirm customer exists
    if (purpose === 'login') {
        const { data: cu } = await adminClient
            .from('customers')
            .select('id, status')
            .eq('phone', normalised)
            .maybeSingle();
        if (!cu) throw new AuthError('No account found for this phone number.', 'customer_not_found');
        if (cu.status !== 'active') throw new AuthError('Account is not active.', 'account_inactive');
    }

    const otp = usesTwilioVerify() ? null : generateOtp();
    const { data, error } = await adminClient
        .from('customer_otp_challenges')
        .insert({
            phone: normalised,
            otp_hash: otp ? hashOtp(otp) : 'twilio-verify',
            purpose,
            metadata,
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        })
        .select('id')
        .single();
    if (error) throw new AuthError(error.message, 'challenge_create_failed');

    try {
        if (usesTwilioVerify()) {
            const verification = await sendVerification(normalised, 'sms');
            await adminClient
                .from('customer_otp_challenges')
                .update({
                    metadata: {
                        ...metadata,
                        twilio_verify_sid: verification.sid,
                        twilio_verify_status: verification.status,
                    },
                })
                .eq('id', (data as { id: string }).id);
        } else if (otp) {
            await sendSms({
                to: normalised,
                body: `Your Beverly code: ${otp}. Valid for 5 minutes. Do not share this code.`,
            });
        }
    } catch (e: any) {
        await adminClient.from('customer_otp_challenges').delete().eq('id', (data as { id: string }).id);
        throw new AuthError(e?.message ?? 'Could not send OTP.', 'otp_send_failed');
    }

    return { challengeId: (data as { id: string }).id };
}

export async function verifyOtp(
    challengeId: string,
    otp: string,
): Promise<{ access_token: string; customer: CustomerProfile; isNew: boolean }> {
    const { data: row } = await adminClient
        .from('customer_otp_challenges')
        .select('*')
        .eq('id', challengeId)
        .maybeSingle();
    if (!row) throw new AuthError('Challenge not found or already used.', 'challenge_not_found');

    const ch = row as {
        id: string; phone: string; otp_hash: string; purpose: OtpPurpose;
        metadata: Record<string, unknown>; attempts: number; expires_at: string;
    };

    if (new Date(ch.expires_at) < new Date()) {
        await adminClient.from('customer_otp_challenges').delete().eq('id', challengeId);
        throw new AuthError('OTP has expired. Request a new one.', 'otp_expired');
    }

    if (ch.attempts >= 5) {
        throw new AuthError('Too many failed attempts. Request a new OTP.', 'max_attempts');
    }

    await adminClient
        .from('customer_otp_challenges')
        .update({ attempts: ch.attempts + 1 })
        .eq('id', challengeId);

    if (ch.otp_hash === 'twilio-verify' || (ch.metadata as any)?.twilio_verify_sid) {
        const check = await checkVerification(ch.phone, otp);
        if (check.status !== 'approved' || !check.valid) {
            throw new AuthError('Invalid OTP.', 'invalid_otp');
        }
    } else if (ch.otp_hash !== hashOtp(otp)) {
        throw new AuthError('Invalid OTP.', 'invalid_otp');
    }

    // Consume challenge immediately
    await adminClient.from('customer_otp_challenges').delete().eq('id', challengeId);

    if (ch.purpose === 'signup') {
        return signUpCustomer(ch.phone, ch.metadata as { email?: string; full_name?: string });
    }
    return signInCustomer(ch.phone);
}

async function signUpCustomer(
    phone: string,
    meta: { email?: string; full_name?: string },
): Promise<{ access_token: string; customer: CustomerProfile; isNew: boolean }> {
    // Idempotent — if phone already registered, log them in
    const { data: existing } = await adminClient
        .from('customers')
        .select('*, auth_user_id')
        .eq('phone', phone)
        .maybeSingle();
    if (existing) {
        const result = await signInCustomer(phone);
        return { ...result, isNew: false };
    }

    const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
        phone,
        email: meta.email,
        phone_confirm: true,
        email_confirm: !!meta.email,
        user_metadata: { role: 'customer' },
    });
    if (authErr || !authData.user) {
        throw new AuthError(authErr?.message ?? 'User creation failed.', 'user_create_failed');
    }

    const { data: customer, error: custErr } = await adminClient
        .from('customers')
        .insert({
            auth_user_id: authData.user.id,
            phone,
            email: meta.email ?? null,
            full_name: meta.full_name ?? null,
            kyc_tier: 0,
            kyc_status: 'unverified',
            status: 'active',
        })
        .select('*')
        .single();
    if (custErr) throw new AuthError(custErr.message, 'customer_create_failed');

    // Provision wallet (₦100k daily cap, ₦500k monthly cap for Tier 0)
    await getOrCreateWallet('customer', (customer as CustomerProfile).id, {
        dailyCapMinor: 10_000_000,
        monthlyCapMinor: 50_000_000,
    });

    if (meta.email) {
        try {
            await sendEmail({
                to: meta.email,
                subject: 'Welcome to Beverly',
                text: `Hi ${meta.full_name ?? 'there'},\n\nYour Beverly account is active. Download the app to buy electricity tokens instantly.\n\n— The Beverly Team`,
                tag: 'customer-welcome',
            });
        } catch { /* non-fatal */ }
    }

    await logAction({
        actorUserId: authData.user.id,
        actorType: 'customer',
        action: 'customer.signup',
        targetType: 'customer',
        targetId: (customer as CustomerProfile).id,
        after: { phone, kyc_tier: 0 },
    });

    return {
        access_token: issueJwt(authData.user.id),
        customer: customer as CustomerProfile,
        isNew: true,
    };
}

async function signInCustomer(phone: string): Promise<{ access_token: string; customer: CustomerProfile; isNew: boolean }> {
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
        actorUserId: (customer as CustomerProfile & { auth_user_id: string }).auth_user_id,
        actorType: 'customer',
        action: 'customer.login',
        targetType: 'customer',
        targetId: (customer as CustomerProfile).id,
        after: { phone },
    });

    return {
        access_token: issueJwt((customer as CustomerProfile & { auth_user_id: string }).auth_user_id),
        customer: customer as CustomerProfile,
        isNew: false,
    };
}
