import { env } from '../config/env.js';
import { adminClient } from '../db/supabase.js';
import { logSecurityEvent, type ActorType } from './audit.js';

export type SmsTrafficKind = 'customer_otp' | 'step_up_otp' | 'token_delivery' | 'token_resend' | 'notification';

export class SmsGuardrailError extends Error {
    constructor(message: string, public code: string, public retryAfterSeconds?: number) {
        super(message);
        this.name = 'SmsGuardrailError';
    }
}

export interface SmsGuardrailContext {
    kind: SmsTrafficKind;
    phone: string;
    actorUserId?: string | null;
    actorType?: ActorType;
    ip?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown>;
}

function splitCodes(value: string | undefined): string[] {
    return String(value ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => entry.startsWith('+') ? entry : `+${entry.replace(/\D/g, '')}`);
}

export function normalizeSmsPhone(phone: string): string {
    const raw = String(phone ?? '').trim();
    const digits = raw.replace(/\D/g, '');
    if (!digits) throw new SmsGuardrailError('Phone number is required.', 'sms_phone_required');
    if (raw.startsWith('+')) return `+${digits}`;
    if (digits.startsWith('234')) return `+${digits}`;
    if (digits.startsWith('0')) return `+234${digits.slice(1)}`;
    return `+234${digits}`;
}

export function smsCountryCode(phone: string): string {
    const normalized = normalizeSmsPhone(phone);
    const knownCodes = Array.from(new Set([
        ...splitCodes(env.SMS_ALLOWED_COUNTRY_CODES),
        ...splitCodes(env.SMS_BLOCKED_COUNTRY_CODES),
        ...splitCodes(env.SMS_HIGH_RISK_COUNTRY_CODES),
        '+234',
    ])).sort((a, b) => b.length - a.length);
    return knownCodes.find((code) => normalized.startsWith(code)) ?? `+${normalized.slice(1, 4)}`;
}

async function auditSmsDecision(
    event: 'sms_allowed' | 'sms_blocked' | 'rate_limit_hit',
    context: SmsGuardrailContext,
    details: Record<string, unknown>,
): Promise<void> {
    await logSecurityEvent(event === 'rate_limit_hit' ? 'rate_limit_hit' : event, {
        actorUserId: context.actorUserId ?? null,
        severity: event === 'sms_allowed' ? 'info' : 'high',
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: {
            surface: 'sms',
            kind: context.kind,
            phone_suffix: normalizeSmsPhone(context.phone).slice(-4),
            actor_type: context.actorType ?? 'system',
            ...context.metadata,
            ...details,
        },
    });
}

export async function assertSmsCountryAllowed(context: SmsGuardrailContext): Promise<{
    phone: string;
    countryCode: string;
    highRisk: boolean;
}> {
    const phone = normalizeSmsPhone(context.phone);
    const countryCode = smsCountryCode(phone);
    const allowed = splitCodes(env.SMS_ALLOWED_COUNTRY_CODES);
    const blocked = splitCodes(env.SMS_BLOCKED_COUNTRY_CODES);
    const highRiskCodes = splitCodes(env.SMS_HIGH_RISK_COUNTRY_CODES);

    if (blocked.includes(countryCode)) {
        await auditSmsDecision('sms_blocked', { ...context, phone }, { reason: 'country_blocked', countryCode });
        throw new SmsGuardrailError('SMS is not available for this destination.', 'sms_country_blocked');
    }
    if (allowed.length > 0 && !allowed.includes(countryCode)) {
        await auditSmsDecision('sms_blocked', { ...context, phone }, { reason: 'country_not_allowed', countryCode });
        throw new SmsGuardrailError('SMS is only available for approved destinations.', 'sms_country_not_allowed');
    }

    const highRisk = highRiskCodes.includes(countryCode);
    await auditSmsDecision('sms_allowed', { ...context, phone }, { countryCode, highRisk });
    return { phone, countryCode, highRisk };
}

export async function assertCustomerOtpTrafficAllowed(context: SmsGuardrailContext): Promise<{
    phone: string;
    countryCode: string;
    highRisk: boolean;
}> {
    const decision = await assertSmsCountryAllowed(context);
    const since = new Date(Date.now() - env.SMS_OTP_RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
    const { count, error } = await adminClient
        .from('customer_otp_challenges')
        .select('id', { count: 'exact', head: true })
        .eq('phone', decision.phone)
        .gte('created_at', since);
    if (!error && (count ?? 0) >= env.SMS_OTP_RATE_LIMIT_MAX) {
        await auditSmsDecision('rate_limit_hit', { ...context, phone: decision.phone }, {
            reason: 'otp_window_exceeded',
            countryCode: decision.countryCode,
            highRisk: decision.highRisk,
            max: env.SMS_OTP_RATE_LIMIT_MAX,
            windowSeconds: env.SMS_OTP_RATE_LIMIT_WINDOW_SECONDS,
        });
        throw new SmsGuardrailError(
            'Too many OTP requests. Try again later.',
            'sms_otp_rate_limited',
            env.SMS_OTP_RATE_LIMIT_WINDOW_SECONDS,
        );
    }
    const latest = await adminClient
        .from('customer_otp_challenges')
        .select('last_sent_at')
        .eq('phone', decision.phone)
        .order('last_sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    const lastSentAt = (latest.data as any)?.last_sent_at;
    if (lastSentAt) {
        const elapsedSeconds = Math.floor((Date.now() - new Date(lastSentAt).getTime()) / 1000);
        if (elapsedSeconds < env.SMS_OTP_RESEND_COOLDOWN_SECONDS) {
            const retryAfter = env.SMS_OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds;
            await auditSmsDecision('rate_limit_hit', { ...context, phone: decision.phone }, {
                reason: 'otp_resend_cooldown',
                countryCode: decision.countryCode,
                retryAfter,
            });
            throw new SmsGuardrailError('Wait before requesting another code.', 'sms_otp_resend_limited', retryAfter);
        }
    }
    return decision;
}

export async function assertTokenSmsResendAllowed(context: SmsGuardrailContext & { receiptId?: string | null }): Promise<{
    phone: string;
    countryCode: string;
    highRisk: boolean;
}> {
    const decision = await assertSmsCountryAllowed(context);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await adminClient
        .from('wallet_audit_log')
        .select('created_at')
        .eq('action', 'customer.purchase.token_sms_sent')
        .eq('target_id', context.receiptId ?? 'n/a')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(env.SMS_TOKEN_RESEND_DAILY_MAX);
    const rows = data ?? [];
    if (rows.length >= env.SMS_TOKEN_RESEND_DAILY_MAX) {
        await auditSmsDecision('rate_limit_hit', context, { reason: 'token_sms_daily_limit' });
        throw new SmsGuardrailError('Token SMS resend limit reached.', 'sms_token_resend_limited', 24 * 60 * 60);
    }
    const latest = rows[0] as any;
    if (latest?.created_at) {
        const elapsedSeconds = Math.floor((Date.now() - new Date(latest.created_at).getTime()) / 1000);
        if (elapsedSeconds < env.SMS_TOKEN_RESEND_COOLDOWN_SECONDS) {
            const retryAfter = env.SMS_TOKEN_RESEND_COOLDOWN_SECONDS - elapsedSeconds;
            await auditSmsDecision('rate_limit_hit', context, { reason: 'token_sms_resend_cooldown', retryAfter });
            throw new SmsGuardrailError('Wait before resending this token.', 'sms_token_resend_cooldown', retryAfter);
        }
    }
    return decision;
}
