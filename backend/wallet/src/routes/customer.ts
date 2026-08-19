/**
 * Customer routes  /api/v1/customer/*
 *
 * Public (no auth):
 *   POST /auth/signup   — send OTP for new account
 *   POST /auth/login    — send OTP for existing account
 *   POST /auth/verify   — verify OTP, get access_token
 *   POST /auth/email/recover        — send password reset code (email/password accounts)
 *   POST /auth/email/reset-password — confirm code + set new password
 *
 * Authenticated (requireCustomer):
 *   GET    /me
 *   PATCH  /me
 *   POST   /logout
 *   POST   /auth/email/verify/send    — (re)send email verification code
 *   POST   /auth/email/verify/confirm — confirm email verification code
 *
 *   POST   /kyc/tier1
 *   POST   /kyc/tier2/nin
 *
 *   GET    /meters
 *   POST   /meters
 *   DELETE /meters/:id
 *
 *   GET    /wallet
 *   GET    /wallet/ledger
 *   POST   /wallet/fund
 *
 *   POST   /purchase/preview
 *   POST   /purchase               — runs fraud check; may return step_up_required
 *   POST   /purchase/step-up-verify — verify OTP then complete purchase
 *   GET    /transactions
 *   GET    /receipts
 *   GET    /receipts/:id
 *
 *   POST   /meter-orders
 *   GET    /meter-orders
 *   GET    /meter-orders/:id
 *   POST   /meter-orders/:id/verify-payment
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { resolveFundingCallbackUrl, resolveMeterOrderCallbackUrl } from '../config/funding-callbacks.js';
import { adminClient } from '../db/supabase.js';
import {
    requestOtp, verifyOtp, signupWithEmail, loginWithEmail, signupWithPhone, loginWithPhone, AuthError,
} from '../services/customer-auth.js';
import {
    submitKycTier1, submitKycTier2Nin, KycError,
} from '../services/customer-kyc.js';
import {
    customerPurchase, previewCustomerPurchase, initiateCustomerFunding, dispatchGeneratedCustomerToken,
    linkMeter, unlinkMeter, listCustomerMeters, listCustomerMeterLinkHistory, listCustomerPurchases, sendTokenSmsToCustomer,
    CustomerPurchaseError,
} from '../services/customer-purchase.js';
import { findWalletByOwner } from '../services/wallets.js';
import { getReceiptByOrder } from '../services/vending.js';
import { logAction } from '../services/audit.js';
import { assessPurchase, linkAssessmentToPurchase, refreshCustomerBaseline } from '../services/fraud-engine.js';
import { issueStepUpChallenge, verifyStepUpChallenge, StepUpError } from '../services/step-up-auth.js';
import { raiseDispute, listDisputes, getDispute, addMessage } from '../services/disputes.js';
import {
    createTicket, listTickets, getTicket, addTicketMessage,
    getOrCreateChatSession, sendChatMessage, getChatMessages, getChatSession, endChatSession, escalateChatToTicket,
} from '../services/support.js';
import { requestDataExport, getDataExportStatus, buildDataExport, requestAccountDeletion, cancelDeletionRequest } from '../services/data-privacy.js';
import { activateProfilePicture, assertProfilePictureSop, PROFILE_PICTURE_BUCKET, toProfilePicturePath } from '../services/profile-picture.js';
import {
    activateDisputeEvidence, assertDisputeEvidenceSop, DISPUTE_EVIDENCE_BUCKET,
    signDisputeEvidencePaths, toDisputeEvidencePath, DisputeEvidenceError,
} from '../services/dispute-evidence.js';
import { runMalwareScan } from '../services/file-scan.js';
import { createCustomerPortalMeterOrder, getMeterPrices } from '../services/meter-orders.js';
import {
    abandonWalletIdempotency,
    assertClientIdempotencyKey,
    claimWalletIdempotency,
    completeWalletIdempotency,
    hashIdempotency,
} from '../services/idempotency.js';
import { revokePortalSession } from '../services/portal-session.js';
import { verifyOwnedPaystackPayment } from '../services/payment-webhooks.js';
import { verifiedPrincipalAmount, verifyTransaction } from '../adapters/paystack.js';
import {
    sendEmailVerification, confirmEmailVerification,
    sendPasswordRecoveryEmail, confirmPasswordReset,
    EmailOtpError,
} from '../services/customer-email-otp.js';
import {
    customerVendPinStatus,
    setCustomerVendPin,
    verifyCustomerVendPin,
    CustomerVendPinError,
} from '../services/customer-vend-pin.js';

function customerAuthStatus(code: string): number {
    return code === 'rate_limit' || code === 'rate_limit_exceeded' ? 429
        : code === 'sms_otp_rate_limited' || code === 'sms_otp_resend_limited' ? 429
        : code === 'sms_country_blocked' || code === 'sms_country_not_allowed' ? 403
        : code === 'otp_storage_missing' || code === 'otp_send_failed' ? 503
        : code === 'customer_not_found' ? 404
        : code === 'email_in_use' || code === 'phone_in_use' ? 409
        : code === 'invalid_credentials' ? 401
        : code === 'invalid_otp' || code === 'otp_expired' || code === 'max_attempts' ? 401
        : 400;
}

const publicAuthIpAttempts = new Map<string, { count: number; resetAt: number }>();
const PUBLIC_AUTH_RATE_LIMIT_MAX = 20;
const PUBLIC_AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function assertPublicAuthIpRateLimited(ip: string): void {
    if (env.NODE_ENV === 'test') return;
    const now = Date.now();
    const entry = publicAuthIpAttempts.get(ip);
    if (!entry || entry.resetAt < now) {
        publicAuthIpAttempts.set(ip, { count: 1, resetAt: now + PUBLIC_AUTH_RATE_LIMIT_WINDOW_MS });
        return;
    }
    if (entry.count >= PUBLIC_AUTH_RATE_LIMIT_MAX) {
        throw new AuthError('Too many auth requests from this IP. Please wait a few minutes.', 'rate_limit_exceeded');
    }
    entry.count += 1;
}

function emailOtpStatus(code: string): number {
    return code === 'otp_rate_limited' ? 429
        : code === 'otp_storage_missing' ? 503
        : code === 'customer_not_found' ? 404
        : code === 'otp_not_found' || code === 'otp_expired' || code === 'otp_locked' || code === 'otp_incorrect' ? 401
        : 400;
}

function customerAuthPayload(result: { challengeId: string; expiresAt: string; retryAfterSeconds: number }) {
    return {
        challenge_id: result.challengeId,
        expires_at: result.expiresAt,
        retry_after_seconds: result.retryAfterSeconds,
    };
}

const NOTIFICATION_PREF_DEFAULTS = {
    sms: { token_purchased: false, wallet_funded: true, login_otp: true, low_balance: false, meter_order_update: false, admin_announcement: false },
    email: { token_purchased: false, wallet_funded: true, promotions: false, kyc_update: true, dispute_update: true, payment_failed: true, admin_announcement: false },
    in_app: { token_purchased: true, wallet_funded: true, kyc_update: true, dispute_update: true, low_balance: true, payment_failed: true, meter_order_update: true, admin_announcement: true },
};

function mergeNotificationPrefs(existing: any, incoming: any = {}) {
    return {
        sms: { ...NOTIFICATION_PREF_DEFAULTS.sms, ...(existing?.sms ?? {}), ...(incoming.sms ?? {}) },
        email: { ...NOTIFICATION_PREF_DEFAULTS.email, ...(existing?.email ?? {}), ...(incoming.email ?? {}) },
        in_app: { ...NOTIFICATION_PREF_DEFAULTS.in_app, ...(existing?.in_app ?? {}), ...(incoming.in_app ?? {}) },
    };
}

function isMissingNotificationsStorage(error: any) {
    const text = `${error?.code ?? ''} ${error?.message ?? ''}`;
    return /notifications|notification_preferences/i.test(text) && /exist|schema cache|column|relation/i.test(text);
}

function profileCode(prefix: string, id: string | null | undefined): string | null {
    if (!id) return null;
    return `${prefix}-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

function walletNumber(prefix: string, id: string | null | undefined): string | null {
    const code = profileCode(prefix, id);
    return code ? code.replace(`${prefix}-`, `WLT-${prefix}-`) : null;
}

function verifiedAt(kycData: any): string | null {
    return kycData?.tier2?.verified_at ?? kycData?.tier1?.verified_at ?? null;
}

async function shapeCustomerProfile(row: any) {
    const customerId = row?.id ?? null;
    const wallet = customerId ? await findWalletByOwner('customer', customerId).catch(() => null) : null;
    const pinStatus = customerId ? await customerVendPinStatus(customerId).catch(() => ({ configured: false })) : { configured: false };
    return {
        ...row,
        customer_code: profileCode('CUS', customerId),
        wallet_number: walletNumber('CUS', customerId),
        wallet_status: wallet?.status ?? null,
        account_status: row?.status ?? null,
        contact_person: row?.full_name ?? null,
        primary_phone: row?.phone ?? null,
        site: row?.kyc_data?.tier1?.state ?? null,
        kyc_approved_date: verifiedAt(row?.kyc_data),
        kyc_expiry: null,
        vend_pin_configured: pinStatus.configured,
    };
}

function shapeReceipt(row: any, purchase?: any) {
    const payload = row?.payload ?? {};
    return {
        ...row,
        ...payload,
        token: payload.token ?? purchase?.token ?? row?.token ?? null,
        meter_id: payload.meterId ?? payload.meter_id ?? purchase?.meter_id ?? null,
        meter_type: payload.meterType ?? payload.meter_type ?? purchase?.meter_type ?? null,
        amount_minor: payload.amountMinor ?? payload.amount_minor ?? purchase?.amount_minor ?? null,
        gross_amount_minor: payload.grossAmountMinor ?? payload.gross_amount_minor ?? purchase?.amount_minor ?? null,
        energy_amount_minor: payload.energyAmountMinor ?? payload.energy_amount_minor ?? purchase?.energy_amount_minor ?? null,
        vat_amount_minor: payload.vatAmountMinor ?? payload.vat_amount_minor ?? purchase?.vat_amount_minor ?? null,
        vat_rate_basis_points: payload.vatRateBasisPoints ?? payload.vat_rate_basis_points ?? purchase?.vat_rate_basis_points ?? null,
        units_kwh: payload.units ?? payload.units_kwh ?? purchase?.units_kwh ?? null,
        tariff_id: payload.tariffId ?? payload.tariff_id ?? purchase?.tariff_id ?? null,
        station_id: payload.stationId ?? payload.station_id ?? purchase?.station_id ?? null,
        reference: row?.purchase_order_id ?? purchase?.id ?? null,
        status: purchase?.status ?? payload.status ?? 'completed',
    };
}

const customer: FastifyPluginAsync = async (fastify) => {

    // ── AUTH ──────────────────────────────────────────────────────────────────

    fastify.post('/auth/signup', async (req, reply) => {
        const { phone, email, full_name } = req.body as {
            phone: string; email?: string; full_name?: string;
        };
        if (!phone) return reply.code(400).send({ error: 'phone_required', message: 'phone is required.' });
        try {
            const result = await requestOtp(phone, 'signup', { email, full_name });
            return customerAuthPayload(result);
        } catch (e: any) {
            if (e instanceof AuthError) {
                return reply.code(customerAuthStatus(e.code)).send({ error: e.code, message: e.message });
            }
            throw e;
        }
    });

    fastify.post('/auth/email/signup', async (req, reply) => {
        const { email, password, full_name, phone } = req.body as {
            email: string; password: string; full_name: string; phone?: string;
        };
        if (!email || !password || !full_name) {
            return reply.code(400).send({ error: 'missing_fields', message: 'email, password, and full_name required.' });
        }
        try {
            assertPublicAuthIpRateLimited(req.ip);
            const { access_token, customer, isNew } = await signupWithEmail({ email, password, full_name, phone });
            return { access_token, customer, is_new: isNew };
        } catch (e: any) {
            if (e instanceof AuthError) {
                return reply.code(customerAuthStatus(e.code)).send({ error: e.code, message: e.message });
            }
            throw e;
        }
    });

    fastify.post('/auth/email/login', async (req, reply) => {
        const { email, password } = req.body as { email: string; password: string };
        if (!email || !password) {
            return reply.code(400).send({ error: 'missing_fields', message: 'email and password required.' });
        }
        try {
            assertPublicAuthIpRateLimited(req.ip);
            const { access_token, customer, isNew } = await loginWithEmail({ email, password });
            return { access_token, customer, is_new: isNew };
        } catch (e: any) {
            if (e instanceof AuthError) {
                return reply.code(customerAuthStatus(e.code)).send({ error: e.code, message: e.message });
            }
            throw e;
        }
    });

    fastify.post('/auth/phone/signup', async (req, reply) => {
        const { phone, password, full_name, email } = req.body as {
            phone: string; password: string; full_name: string; email?: string;
        };
        if (!phone || !password || !full_name) {
            return reply.code(400).send({ error: 'missing_fields', message: 'phone, password, and full_name required.' });
        }
        try {
            assertPublicAuthIpRateLimited(req.ip);
            const { access_token, customer, isNew } = await signupWithPhone({ phone, password, full_name, email });
            return { access_token, customer, is_new: isNew };
        } catch (e: any) {
            if (e instanceof AuthError) {
                return reply.code(customerAuthStatus(e.code)).send({ error: e.code, message: e.message });
            }
            throw e;
        }
    });

    fastify.post('/auth/phone/login', async (req, reply) => {
        const { phone, password } = req.body as { phone: string; password: string };
        if (!phone || !password) {
            return reply.code(400).send({ error: 'missing_fields', message: 'phone and password required.' });
        }
        try {
            assertPublicAuthIpRateLimited(req.ip);
            const { access_token, customer, isNew } = await loginWithPhone({ phone, password });
            return { access_token, customer, is_new: isNew };
        } catch (e: any) {
            if (e instanceof AuthError) {
                return reply.code(customerAuthStatus(e.code)).send({ error: e.code, message: e.message });
            }
            throw e;
        }
    });

    fastify.post('/auth/login', async (req, reply) => {
        const { phone } = req.body as { phone: string };
        if (!phone) return reply.code(400).send({ error: 'phone_required', message: 'phone is required.' });
        try {
            const result = await requestOtp(phone, 'login');
            return customerAuthPayload(result);
        } catch (e: any) {
            if (e instanceof AuthError) {
                return reply.code(customerAuthStatus(e.code)).send({ error: e.code, message: e.message });
            }
            throw e;
        }
    });

    fastify.post('/auth/recover', async (req, reply) => {
        const { phone } = req.body as { phone: string };
        if (!phone) return reply.code(400).send({ error: 'phone_required', message: 'phone is required.' });
        try {
            const result = await requestOtp(phone, 'recovery');
            return customerAuthPayload(result);
        } catch (e: any) {
            if (e instanceof AuthError) {
                return reply.code(customerAuthStatus(e.code)).send({ error: e.code, message: e.message });
            }
            throw e;
        }
    });

    fastify.post('/auth/verify', async (req, reply) => {
        const { challenge_id, otp } = req.body as { challenge_id: string; otp: string };
        if (!challenge_id || !otp) {
            return reply.code(400).send({ error: 'missing_fields', message: 'challenge_id and otp required.' });
        }
        try {
            const { access_token, customer, isNew } = await verifyOtp(challenge_id, otp);
            return { access_token, customer, is_new: isNew };
        } catch (e: any) {
            if (e instanceof AuthError) {
                return reply.code(customerAuthStatus(e.code))
                    .send({ error: e.code, message: e.message });
            }
            throw e;
        }
    });

    // ── EMAIL VERIFICATION (email/password accounts) ────────────────────────────

    fastify.post('/auth/email/verify/send', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { data } = await adminClient.from('customers').select('email, full_name').eq('id', req.actor!.customerId!).maybeSingle();
        const email = (data as any)?.email;
        if (!email) return reply.code(400).send({ error: 'no_email_on_file', message: 'This account has no email address.' });
        try {
            await sendEmailVerification(email, (data as any)?.full_name ?? 'there');
            return { ok: true };
        } catch (e: any) {
            if (e instanceof EmailOtpError) return reply.code(emailOtpStatus(e.code)).send({ error: e.code, message: e.message });
            throw e;
        }
    });

    fastify.post('/auth/email/verify/confirm', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { code } = z.object({ code: z.string().trim().length(6) }).parse(req.body);
        const { data } = await adminClient.from('customers').select('email').eq('id', req.actor!.customerId!).maybeSingle();
        const email = (data as any)?.email;
        if (!email) return reply.code(400).send({ error: 'no_email_on_file', message: 'This account has no email address.' });
        try {
            await confirmEmailVerification(email, code);
            return { ok: true };
        } catch (e: any) {
            if (e instanceof EmailOtpError) return reply.code(emailOtpStatus(e.code)).send({ error: e.code, message: e.message });
            throw e;
        }
    });

    // ── PASSWORD RECOVERY (email/password accounts) ──────────────────────────────

    fastify.post('/auth/email/recover', async (req, reply) => {
        const { email } = z.object({ email: z.string().email() }).parse(req.body);
        try {
            await sendPasswordRecoveryEmail(email);
        } catch (e: any) {
            if (e instanceof EmailOtpError && e.code === 'otp_rate_limited') {
                return reply.code(429).send({ error: e.code, message: e.message });
            }
            // Never leak account existence on unexpected errors either.
        }
        return { ok: true };
    });

    fastify.post('/auth/email/reset-password', async (req, reply) => {
        const { email, code, new_password } = z.object({
            email: z.string().email(),
            code: z.string().trim().length(6),
            new_password: z.string().min(8),
        }).parse(req.body);
        try {
            await confirmPasswordReset(email, code, new_password);
            return { ok: true };
        } catch (e: any) {
            if (e instanceof EmailOtpError) return reply.code(emailOtpStatus(e.code)).send({ error: e.code, message: e.message });
            throw e;
        }
    });

    // ── PROFILE ───────────────────────────────────────────────────────────────

    fastify.get('/me', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { data } = await adminClient
            .from('customers')
            .select('id, phone, email, full_name, profile_picture_url, kyc_tier, kyc_status, kyc_data, status, email_verified_at, created_at')
            .eq('id', req.actor!.customerId!)
            .single();
        if (!data) return reply.code(404).send({ error: 'not_found' });
        return shapeCustomerProfile(data);
    });

    fastify.patch('/me', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'profile_picture_url')) {
            return reply.code(400).send({ error: 'profile_picture_url_forbidden', message: 'Use the verified profile-picture upload flow.' });
        }
        if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'email')) {
            return reply.code(400).send({ error: 'email_change_forbidden', message: 'Registration email cannot be changed.' });
        }
        const { full_name } = req.body as { full_name?: string };
        const updates: Record<string, unknown> = {};
        if (full_name !== undefined) updates.full_name = full_name.trim();
        if (!Object.keys(updates).length) return reply.code(400).send({ error: 'no_fields', message: 'Nothing to update.' });

        const { data, error } = await adminClient
            .from('customers')
            .update(updates)
            .eq('id', req.actor!.customerId!)
            .select('id, phone, email, full_name, profile_picture_url, kyc_tier, kyc_status, kyc_data, status, email_verified_at, created_at')
            .single();
        if (error) return reply.code(500).send({ error: 'update_failed', message: error.message });
        return shapeCustomerProfile(data);
    });

    fastify.post('/profile-picture/upload-url', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        let sop;
        try {
            sop = assertProfilePictureSop(req.body ?? {});
        } catch (error: any) {
            return reply.code(400).send({ error: 'invalid_profile_picture', message: error?.message ?? 'Invalid upload payload.' });
        }
        const path = toProfilePicturePath('customer', req.actor!.customerId!, sop.file_name);
        const { data, error } = await adminClient.storage.from(PROFILE_PICTURE_BUCKET).createSignedUploadUrl(path);
        if (error) return reply.code(500).send({ error: 'upload_url_failed', message: error.message });
        const { data: pub } = adminClient.storage.from(PROFILE_PICTURE_BUCKET).getPublicUrl(path);
        return {
            bucket: PROFILE_PICTURE_BUCKET,
            path,
            token: data?.token,
            signed_url: data?.signedUrl,
            public_url: pub?.publicUrl ?? null,
            sop: { max_bytes: 2 * 1024 * 1024, allowed_types: ['image/jpeg', 'image/png', 'image/webp'] },
        };
    });

    fastify.post('/profile-picture/scan', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const schema = z.object({
            file_name: z.string().min(1).max(160),
            content_base64: z.string().min(8),
        });
        const body = schema.parse(req.body ?? {});
        const scan = await runMalwareScan(Buffer.from(body.content_base64, 'base64'), body.file_name);
        if (!scan.ok) return reply.code(422).send({ error: 'malware_scan_failed', details: scan.output ?? null });
        return { ok: true, mode: scan.mode };
    });

    fastify.delete('/profile-picture', { preHandler: fastify.requireCustomer() }, async (req) => {
        const customerId = req.actor!.customerId!;
        await adminClient.from('customers').update({ profile_picture_url: null }).eq('id', customerId);
        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'customer',
            action: 'customer.profile_picture.deleted',
            targetType: 'customer',
            targetId: customerId,
        });
        return { ok: true };
    });

    fastify.post('/logout', { preHandler: fastify.requireCustomer() }, async (req) => {
        await revokePortalSession(req.portalSessionKey);
        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'customer',
            action: 'customer.logout',
            targetType: 'customer',
            targetId: req.actor!.customerId!,
        });
        return { ok: true };
    });

    // ── KYC ───────────────────────────────────────────────────────────────────

    fastify.post('/kyc/tier1', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { full_name, date_of_birth, address, state, lga } = req.body as {
            full_name: string; date_of_birth: string; address: string; state: string; lga: string;
        };
        if (!full_name || !date_of_birth || !address || !state || !lga) {
            return reply.code(400).send({ error: 'missing_fields', message: 'full_name, date_of_birth, address, state and lga are required.' });
        }
        try {
            await submitKycTier1({
                customerId: req.actor!.customerId!,
                actorUserId: req.actor!.userId,
                full_name, date_of_birth, address, state, lga,
            });
            const { data } = await adminClient.from('customers').select('kyc_tier, kyc_status').eq('id', req.actor!.customerId!).single();
            return { ok: true, kyc_tier: (data as any)?.kyc_tier, kyc_status: (data as any)?.kyc_status };
        } catch (e: any) {
            if (e instanceof KycError) return reply.code(422).send({ error: e.code, message: e.message });
            throw e;
        }
    });

    fastify.post('/kyc/tier2/nin', { preHandler: fastify.requireKycTier(1) }, async (req, reply) => {
        const { nin } = req.body as { nin: string };
        if (!nin) return reply.code(400).send({ error: 'nin_required', message: 'nin is required.' });
        try {
            await submitKycTier2Nin({
                customerId: req.actor!.customerId!,
                actorUserId: req.actor!.userId,
                nin,
            });
            const { data } = await adminClient.from('customers').select('kyc_tier, kyc_status').eq('id', req.actor!.customerId!).single();
            return { ok: true, kyc_tier: (data as any)?.kyc_tier, kyc_status: (data as any)?.kyc_status };
        } catch (e: any) {
            if (e instanceof KycError) return reply.code(422).send({ error: e.code, message: e.message });
            throw e;
        }
    });

    // ── METERS ────────────────────────────────────────────────────────────────

    fastify.get('/meters', { preHandler: fastify.requireCustomer() }, async (req) => {
        const meters = await listCustomerMeters(req.actor!.customerId!);
        return { meters };
    });

    fastify.get('/vend-pin/status', { preHandler: fastify.requireCustomer() }, async (req) => {
        return customerVendPinStatus(req.actor!.customerId!);
    });

    fastify.post('/vend-pin', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const parsed = z.object({ pin: z.string().regex(/^\d{4}$/) }).safeParse(req.body ?? {});
        if (!parsed.success) {
            return reply.code(400).send({ error: 'invalid_vend_pin', message: 'Use exactly four digits.' });
        }
        try {
            return await setCustomerVendPin({
                customerId: req.actor!.customerId!,
                authUserId: req.actor!.userId,
                pin: parsed.data.pin,
                ip: req.ip,
                userAgent: req.headers['user-agent'] as string | undefined,
            });
        } catch (error) {
            if (error instanceof CustomerVendPinError) {
                return reply.code(error.code.endsWith('_failed') ? 500 : 422)
                    .send({ error: error.code, message: error.message });
            }
            throw error;
        }
    });

    fastify.get('/meters/history', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const parsed = z.object({
            limit: z.coerce.number().int().min(1).max(100).default(25),
            offset: z.coerce.number().int().min(0).default(0),
        }).safeParse(req.query ?? {});
        if (!parsed.success) return reply.code(400).send({ error: 'validation_error', message: parsed.error.message });
        try {
            return await listCustomerMeterLinkHistory(
                req.actor!.customerId!, parsed.data.limit, parsed.data.offset,
            );
        } catch (error) {
            if (error instanceof CustomerPurchaseError) {
                return reply.code(error.code === 'history_unavailable' ? 503 : 422)
                    .send({ error: error.code, message: error.message });
            }
            throw error;
        }
    });

    fastify.post('/meters', { preHandler: fastify.requireKycTier(1) }, async (req, reply) => {
        const { meter_id, nickname, meter_type } = req.body as {
            meter_id: string;
            nickname?: string;
            meter_type?: 'single_phase' | 'three_phase';
        };
        if (!meter_id) return reply.code(400).send({ error: 'meter_id_required' });
        try {
            const meter = await linkMeter(req.actor!.customerId!, req.actor!.userId, meter_id.trim().toUpperCase(), nickname, meter_type);
            return { meter };
        } catch (e: any) {
            if (e instanceof CustomerPurchaseError) return reply.code(
                e.code === 'meter_approval_unavailable' ? 503
                : e.code === 'station_assignment_required' || e.code === 'cross_station_vend_forbidden' ? 403
                : 422,
            ).send({ error: e.code, message: e.message });
            throw e;
        }
    });

    fastify.delete('/meters/:id', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { id } = req.params as { id: string };
        try {
            await unlinkMeter(req.actor!.customerId!, req.actor!.userId, id);
            return { ok: true };
        } catch (e: any) {
            if (e instanceof CustomerPurchaseError) return reply.code(e.code === 'not_found' ? 404 : 422).send({ error: e.code, message: e.message });
            throw e;
        }
    });

    // ── WALLET ────────────────────────────────────────────────────────────────

    fastify.get('/wallet', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const wallet = await findWalletByOwner('customer', req.actor!.customerId!);
        if (!wallet) return reply.code(404).send({ error: 'wallet_not_found' });

        const { data: summary, error: summaryError } = await adminClient
            .from('v_wallet_balances')
            .select('*')
            .eq('wallet_id', wallet.id)
            .maybeSingle();
        if (summaryError) throw summaryError;

        return {
            id: wallet.id,
            currency: wallet.currency,
            status: wallet.status,
            balance_minor: (summary as any)?.ledger_balance_minor ?? 0,
            holds_minor: (summary as any)?.active_holds_minor ?? 0,
            available_minor: (summary as any)?.available_balance_minor ?? 0,
            daily_debit_cap_minor: wallet.daily_debit_cap_minor,
            monthly_debit_cap_minor: wallet.monthly_debit_cap_minor,
        };
    });

    fastify.get('/wallet/ledger', { preHandler: fastify.requireCustomer() }, async (req) => {
        const wallet = await findWalletByOwner('customer', req.actor!.customerId!);
        if (!wallet) return { entries: [] };

        const { limit = 100, offset = 0 } = req.query as { limit?: number; offset?: number };
        const { data, error } = await adminClient
            .from('wallet_ledger_entries')
            .select('*')
            .eq('wallet_id', wallet.id)
            .order('created_at', { ascending: false })
            .range(Number(offset), Number(offset) + Number(limit) - 1);
        if (error) throw error;
        return { entries: data ?? [] };
    });

    fastify.post('/wallet/fund', { preHandler: fastify.requireKycTier(1) }, async (req, reply) => {
        let idempotencyKey: string;
        try { idempotencyKey = assertClientIdempotencyKey(req.headers['idempotency-key']); }
        catch (error) {
            const message = error instanceof Error ? error.message : 'A valid Idempotency-Key header is required.';
            return reply.code(400).send({ error: 'invalid_idempotency_key', message });
        }
        const { amount_minor } = z.object({
            amount_minor: z.number().int().min(50_000).max(1_000_000_000),
        }).parse(req.body);
        const { data: cu } = await adminClient.from('customers').select('email').eq('id', req.actor!.customerId!).single();
        if (!(cu as any)?.email) {
            return reply.code(422).send({ error: 'email_required', message: 'Add an email address to fund via card.' });
        }
        const scope = `customer.wallet.fund.${req.actor!.customerId!}`;
        const fingerprint = hashIdempotency([req.actor!.customerId!, amount_minor]);
        let claim;
        try {
            claim = await claimWalletIdempotency(scope, idempotencyKey, fingerprint);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not claim idempotency key.';
            if (/idempotency key payload mismatch/i.test(message)) {
                return reply.code(409).send({ error: 'idempotency_payload_mismatch', message });
            }
            throw error;
        }
        if (claim.state === 'replay') return claim.responsePayload;
        if (claim.state === 'pending') {
            return reply.code(409).send({ error: 'idempotency_in_progress', message: 'This payment request is still initializing.' });
        }
        try {
            const result = await initiateCustomerFunding({
                customerId: req.actor!.customerId!,
                customerUserId: req.actor!.userId,
                customerEmail: (cu as any).email,
                amountMinor: amount_minor,
                callbackUrl: resolveFundingCallbackUrl(
                    'customer', env.CUSTOMER_FUNDING_CALLBACK_URL, env.CUSTOMER_APP_URL,
                ),
            });
            await completeWalletIdempotency(scope, idempotencyKey, result).catch((error) => {
                req.log.error({ error, scope }, 'Paystack initialization idempotency completion failed');
            });
            return result;
        } catch (e: any) {
            await abandonWalletIdempotency(scope, idempotencyKey, fingerprint).catch(() => undefined);
            if (e instanceof CustomerPurchaseError) {
                return reply.code(
                    e.code === 'wallet_inactive' || e.code === 'wallet_frozen' || e.code === 'wallet_closed' ? 403 : 400,
                ).send({ error: e.code, message: e.message });
            }
            throw e;
        }
    });

    // ── PURCHASE ──────────────────────────────────────────────────────────────

    fastify.post('/payments/:reference/verify', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { reference } = z.object({
            reference: z.string().min(1).max(100).regex(/^[A-Za-z0-9.=-]+$/),
        }).parse(req.params);
        const result = await verifyOwnedPaystackPayment({
            reference,
            actorType: 'customer',
            actorId: req.actor!.customerId!,
        });
        if (!result) return reply.code(404).send({ error: 'payment_not_found', message: 'Payment was not found.' });
        return result;
    });

    fastify.post('/purchase/preview', { preHandler: fastify.requireKycTier(1) }, async (req, reply) => {
        const { meter_id, amount_minor } = req.body as { meter_id: string; amount_minor: number };
        if (!meter_id || !amount_minor) {
            return reply.code(400).send({ error: 'missing_fields', message: 'meter_id and amount_minor required.' });
        }
        try {
            const preview = await previewCustomerPurchase(meter_id, amount_minor, req.actor!.customerId!);
            return preview;
        } catch (e: any) {
            if (e instanceof CustomerPurchaseError) return reply.code(e.code === 'meter_approval_unavailable' ? 503 : 422).send({ error: e.code, message: e.message });
            throw e;
        }
    });

    fastify.post('/purchase', { preHandler: fastify.requireKycTier(1) }, async (req, reply) => {
        if (!/^\d{4}$/.test(String((req.body as { pin?: unknown } | null)?.pin ?? ''))) {
            return reply.code(409).send({ error: 'vend_pin_required', message: 'Enter your four-digit vending PIN.' });
        }
        const parsed = z.object({
            meter_id: z.string().trim().min(1),
            amount_minor: z.number().int().min(50000),
            mode: z.literal('wallet').default('wallet'),
            idempotency_key: z.string().uuid(),
            pin: z.string().regex(/^\d{4}$/),
        }).safeParse(req.body ?? {});
        if (!parsed.success) {
            return reply.code(400).send({
                error: 'wallet_funding_required',
                message: 'Token purchases use wallet funds. Fund your wallet before buying.',
            });
        }
        const { meter_id, amount_minor, mode, idempotency_key, pin } = parsed.data;

        const customerId = req.actor!.customerId!;
        const clientIp   = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
                         ?? req.ip ?? null;
        const userAgent  = req.headers['user-agent'] ?? null;

        try {
            await verifyCustomerVendPin({
                customerId,
                authUserId: req.actor!.userId,
                pin,
                ip: clientIp,
                userAgent,
            });
        } catch (error) {
            if (error instanceof CustomerVendPinError) {
                return reply.code(error.code === 'vend_pin_required' ? 409 : error.code === 'vend_pin_locked' ? 429 : 401)
                    .send({ error: error.code, message: error.message });
            }
            throw error;
        }

        // ── Fraud assessment ──────────────────────────────────────────────────
        const assessment = await assessPurchase({
            customerId,
            meterId:     meter_id.trim().toUpperCase(),
            amountMinor: amount_minor,
            clientIp,
            userAgent,
        });

        if (assessment.action === 'block') {
            return reply.code(403).send({
                error:   'purchase_blocked',
                message: 'This transaction has been blocked due to a security risk. Contact support if you believe this is an error.',
                fraud_score: assessment.score,
            });
        }

        if (assessment.action === 'step_up') {
            const challenge = await issueStepUpChallenge(customerId);
            return reply.code(202).send({
                step_up_required: true,
                challenge_id:     challenge.challengeId,
                expires_at:       challenge.expiresAt,
                message:          'A security code has been sent to your phone. Please verify to complete this purchase.',
            });
        }

        // ── Normal purchase ───────────────────────────────────────────────────
        const { data: cu } = await adminClient
            .from('customers')
            .select('full_name, email')
            .eq('id', customerId)
            .single();
        try {
            const result = await customerPurchase({
                customerId,
                customerUserId: req.actor!.userId,
                customerName:   (cu as any)?.full_name ?? null,
                meterId:        meter_id.trim().toUpperCase(),
                amountMinor:    amount_minor,
                mode,
                clientIdempotencyKey: idempotency_key,
            });
            // Link assessment to the resulting purchase order
            if (result.purchaseOrder?.id) {
                void linkAssessmentToPurchase(assessment.assessmentId, result.purchaseOrder.id);
                void refreshCustomerBaseline(customerId);
            }
            return result;
        } catch (e: any) {
            if (e instanceof CustomerPurchaseError) {
                return reply.code(
                    e.code === 'insufficient_balance' ? 402
                    : e.code === 'station_assignment_required' || e.code === 'cross_station_vend_forbidden' ? 403
                    : e.code === 'wallet_inactive' || e.code === 'wallet_frozen' || e.code === 'wallet_closed' ? 403
                    : e.code === 'meter_approval_unavailable' ? 503
                    : 422,
                ).send({ error: e.code, message: e.message });
            }
            throw e;
        }
    });

    fastify.post('/purchase/step-up-verify', { preHandler: fastify.requireKycTier(1) }, async (req, reply) => {
        if (!/^\d{4}$/.test(String((req.body as { pin?: unknown } | null)?.pin ?? ''))) {
            return reply.code(409).send({ error: 'vend_pin_required', message: 'Enter your four-digit vending PIN.' });
        }
        const parsed = z.object({
            challenge_id: z.string().uuid(),
            otp: z.string().trim().min(6).max(12),
            meter_id: z.string().trim().min(1),
            amount_minor: z.number().int().min(50000),
            mode: z.literal('wallet').default('wallet'),
            idempotency_key: z.string().uuid(),
            pin: z.string().regex(/^\d{4}$/),
        }).safeParse(req.body ?? {});
        if (!parsed.success) {
            return reply.code(400).send({
                error: 'wallet_funding_required',
                message: 'Token purchases use wallet funds. Fund your wallet before buying.',
            });
        }
        const { challenge_id, otp, meter_id, amount_minor, mode, idempotency_key, pin } = parsed.data;

        try {
            await verifyCustomerVendPin({
                customerId: req.actor!.customerId!,
                authUserId: req.actor!.userId,
                pin,
                ip: req.ip,
                userAgent: req.headers['user-agent'] as string | undefined,
            });
        } catch (error) {
            if (error instanceof CustomerVendPinError) {
                return reply.code(error.code === 'vend_pin_required' ? 409 : error.code === 'vend_pin_locked' ? 429 : 401)
                    .send({ error: error.code, message: error.message });
            }
            throw error;
        }

        try {
            await verifyStepUpChallenge(challenge_id, otp);
        } catch (e: any) {
            if (e instanceof StepUpError) {
                return reply.code(
                    e.code === 'invalid_otp'        ? 422
                    : e.code === 'challenge_expired' ? 410
                    : e.code === 'too_many_attempts' ? 429
                    : 400,
                ).send({ error: e.code, message: e.message });
            }
            throw e;
        }

        // OTP verified — run purchase directly, bypassing fraud check
        const customerId = req.actor!.customerId!;
        const { data: cu } = await adminClient
            .from('customers')
            .select('full_name, email')
            .eq('id', customerId)
            .single();
        try {
            const result = await customerPurchase({
                customerId,
                customerUserId: req.actor!.userId,
                customerName:   (cu as any)?.full_name ?? null,
                meterId:        meter_id.trim().toUpperCase(),
                amountMinor:    amount_minor,
                mode,
                clientIdempotencyKey: idempotency_key,
            });
            void refreshCustomerBaseline(customerId);
            return result;
        } catch (e: any) {
            if (e instanceof CustomerPurchaseError) {
                return reply.code(
                    e.code === 'insufficient_balance' ? 402
                    : e.code === 'station_assignment_required' || e.code === 'cross_station_vend_forbidden' ? 403
                    : e.code === 'wallet_inactive' || e.code === 'wallet_frozen' || e.code === 'wallet_closed' ? 403
                    : e.code === 'meter_approval_unavailable' ? 503
                    : 422,
                ).send({ error: e.code, message: e.message });
            }
            throw e;
        }
    });

    // ── TRANSACTIONS & RECEIPTS ───────────────────────────────────────────────

    const handleCustomerRemoteSend = async (req: any, reply: any) => {
        const params = z.object({
            purchaseOrderId: z.string().uuid(),
        }).parse(req.params);
        try {
            return await dispatchGeneratedCustomerToken(
                req.actor!.customerId!,
                req.actor!.userId,
                params.purchaseOrderId,
            );
        } catch (e: any) {
            if (e instanceof CustomerPurchaseError) {
                const status = e.code === 'purchase_not_found' ? 404
                    : e.code === 'token_missing' || e.code === 'purchase_not_delivered' ? 409
                    : 422;
                return reply.code(status).send({
                    error: e.code,
                    message: e.message,
                    status: 'failed',
                    deliveryState: 'remote_send_failed_needs_manual_entry',
                    delivery_state: 'remote_send_failed_needs_manual_entry',
                    remark: e.message,
                });
            }
            throw e;
        }
    };

    fastify.post('/purchase/:purchaseOrderId/remote-send', { preHandler: fastify.requireKycTier(1) }, handleCustomerRemoteSend);
    fastify.get('/purchase/:purchaseOrderId/remote-send', { preHandler: fastify.requireKycTier(1) }, handleCustomerRemoteSend);

    fastify.post('/profile-picture/activate', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { path } = z.object({ path: z.string().min(1).max(500) }).parse(req.body ?? {});
        try {
            const profilePictureUrl = await activateProfilePicture('customer', req.actor!.customerId!, path);
            await adminClient.from('customers').update({ profile_picture_url: profilePictureUrl }).eq('id', req.actor!.customerId!);
            return { profile_picture_url: profilePictureUrl };
        } catch {
            return reply.code(422).send({ error: 'profile_picture_activation_failed' });
        }
    });

    fastify.get('/transactions', { preHandler: fastify.requireCustomer() }, async (req) => {
        const { limit = 100 } = req.query as { limit?: number };
        const purchases = await listCustomerPurchases(req.actor!.customerId!, Number(limit));
        return { purchases };
    });

    // Funding history — wallet top-ups via Paystack (payment_transactions).
    fastify.get('/funding', { preHandler: fastify.requireCustomer() }, async (req) => {
        const { limit, cursor } = req.query as { limit?: string; cursor?: string };
        let query = adminClient
            .from('payment_transactions')
            .select('id, gateway, gateway_reference, amount_minor, status, created_at, metadata')
            .eq('actor_type', 'customer')
            .eq('actor_id', req.actor!.customerId!)
            .eq('purpose', 'wallet_funding')
            .order('created_at', { ascending: false })
            .limit(Math.min(Number(limit ?? 50), 200));
        if (cursor) query = query.lt('created_at', cursor);
        const { data, error } = await query;
        if (error) throw error;
        const rows = data ?? [];
        const nextCursor = rows.length === Math.min(Number(limit ?? 50), 200) ? rows[rows.length - 1].created_at : null;
        return { funding: rows, nextCursor };
    });

    fastify.get('/receipts', { preHandler: fastify.requireCustomer() }, async (req) => {
        const { data: purchaseRows, error: purchaseError } = await adminClient
            .from('purchase_orders')
            .select('id, meter_id, meter_type, amount_minor, energy_amount_minor, vat_amount_minor, vat_rate_basis_points, units_kwh, tariff_id, station_id, status')
            .eq('customer_id', req.actor!.customerId!);
        if (purchaseError) throw purchaseError;
        if (!purchaseRows?.length) return { receipts: [] };
        const purchaseById = new Map((purchaseRows ?? []).map((p: any) => [p.id, p]));
        const { data, error: receiptError } = await adminClient
            .from('receipts')
            .select('id, receipt_number, purchase_order_id, payload, created_at')
            .in(
                'purchase_order_id',
                (purchaseRows ?? []).map((r: any) => r.id),
            )
            .order('created_at', { ascending: false })
            .limit(100);
        if (receiptError) throw receiptError;
        return { receipts: (data ?? []).map((row: any) => shapeReceipt(row, purchaseById.get(row.purchase_order_id))) };
    });

    // ── METER ORDERS ─────────────────────────────────────────────────────────

    fastify.get('/meter-pricing', async () => {
        return getMeterPrices();
    });

    fastify.post('/meter-orders', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const schema = z.object({
            meter_type: z.enum(['single_phase', 'three_phase']),
            property_category: z.enum(['residential', 'commercial']).optional(),
            property_address: z.string().min(5),
            service_area: z.string().min(2),
            contact_phone: z.string().min(8),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }
        let idempotencyKey: string;
        try { idempotencyKey = assertClientIdempotencyKey(req.headers['idempotency-key']); }
        catch (error: any) { return reply.code(400).send({ error: 'idempotency_key_required', message: error.message }); }

        try {
            const result = await createCustomerPortalMeterOrder({
                customerId: req.actor!.customerId!,
                customerUserId: req.actor!.userId,
                meterType: body.meter_type,
                propertyCategory: body.property_category,
                propertyAddress: body.property_address,
                serviceArea: body.service_area,
                contactPhone: body.contact_phone,
                callbackBaseUrl: resolveMeterOrderCallbackUrl(
                    env.CUSTOMER_METER_ORDER_CALLBACK_URL,
                    env.CUSTOMER_APP_URL,
                ),
                idempotencyKey,
            });
            await logAction({
                actorUserId: req.actor!.userId,
                actorType: 'customer',
                action: 'meter_order.created',
                targetId: result.order.id,
                metadata: {
                    meter_type: body.meter_type,
                    property_category: body.property_category ?? 'residential',
                    source_channel: 'customer_portal',
                },
            });
            return { order: result.order, authorization_url: result.authorizationUrl };
        } catch (error: any) {
            return reply.code(error?.status ?? 422).send({
                error: error?.code ?? 'meter_order_create_failed',
                message: error?.message ?? 'Could not create meter order.',
            });
        }
    });

    fastify.get('/meter-orders', { preHandler: fastify.requireCustomer() }, async (req) => {
        const { data } = await adminClient
            .from('meter_purchase_orders')
            .select('*')
            .eq('customer_id', req.actor!.customerId!)
            .order('created_at', { ascending: false })
            .limit(50);
        return { orders: data ?? [] };
    });

    fastify.get('/meter-orders/:id', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const { data } = await adminClient
            .from('meter_purchase_orders')
            .select('*')
            .eq('id', id)
            .eq('customer_id', req.actor!.customerId!)
            .single();
        if (!data) return reply.code(404).send({ error: 'not_found' });
        return data;
    });

    fastify.post('/meter-orders/:id/verify-payment', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const { data: order } = await adminClient
            .from('meter_purchase_orders')
            .select('*')
            .eq('id', id)
            .eq('customer_id', req.actor!.customerId!)
            .single();
        if (!order) return reply.code(404).send({ error: 'not_found' });
        if ((order as any).status !== 'pending_payment') return order;

        let verified;
        try {
            verified = await verifyTransaction((order as any).payment_reference);
        } catch (error) {
            req.log.error({ err: error, orderId: id }, 'meter order payment verification failed');
            return reply.code(502).send({
                error: 'payment_verification_unavailable',
                message: 'Payment confirmation is temporarily unavailable. Your order remains pending safely.',
            });
        }
        const mismatch = verified.status === 'success' && (
            verifiedPrincipalAmount(verified) !== Number((order as any).amount_minor)
            || verified.reference !== (order as any).payment_reference
            || String(verified.currency).toUpperCase() !== 'NGN'
        );
        if (mismatch) {
            await logAction({
                actorUserId: req.actor!.userId,
                actorType: 'customer',
                action: 'meter_order.payment_amount_mismatch',
                targetId: id,
                metadata: {
                    reference: (order as any).payment_reference,
                    expectedAmountMinor: (order as any).amount_minor,
                    verifiedAmountMinor: verifiedPrincipalAmount(verified),
                    verifiedReference: verified.reference,
                    verifiedCurrency: verified.currency,
                },
            });
            return reply.code(409).send({ error: 'payment_amount_mismatch', message: 'Verified payment amount does not match this meter order.' });
        }
        if (verified.status === 'success') {
            const { data: paidOrder, error: paidError } = await adminClient
                .from('meter_purchase_orders')
                .update({ status: 'paid', updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('status', 'pending_payment')
                .select('*')
                .maybeSingle();
            if (paidError) return reply.code(500).send({ error: 'payment_update_failed', message: paidError.message });
            if (!paidOrder) {
                const { data: latest } = await adminClient.from('meter_purchase_orders').select('*').eq('id', id).maybeSingle();
                return latest ?? order;
            }
            await logAction({ actorUserId: req.actor!.userId, actorType: 'customer', action: 'meter_order.payment_confirmed', targetId: id });
            return paidOrder;
        }
        return order;
    });

    // ── DISPUTES ─────────────────────────────────────────────────────────────

    fastify.post('/disputes', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const schema = z.object({
            purchase_order_id: z.string().uuid().optional(),
            subject:           z.string().min(5).max(200),
            description:       z.string().min(10).max(2000),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }

        const customerId = req.actor!.customerId!;
        const result = await raiseDispute({
            raisedByActorType: 'customer',
            raisedByActorId:   customerId,
            customerId,
            purchaseOrderId:   body.purchase_order_id,
            subject:           body.subject,
            description:       body.description,
        });
        return result;
    });

    fastify.get('/disputes', { preHandler: fastify.requireCustomer() }, async (req) => {
        const { status } = req.query as { status?: string };
        return { disputes: await listDisputes({ customerId: req.actor!.customerId!, status, limit: 50 }) };
    });

    fastify.get('/disputes/:id', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const d = await getDispute(id);
        if (!d || (d as any).customer_id !== req.actor!.customerId!) {
            return reply.code(404).send({ error: 'not_found' });
        }
        const evidencePaths: string[] = Array.isArray((d as any).evidence_paths) ? (d as any).evidence_paths : [];
        const evidence = await signDisputeEvidencePaths(evidencePaths);
        return { ...d, evidence };
    });

    fastify.post('/disputes/:id/evidence/upload-url', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const customerId = req.actor!.customerId!;
        const d = await getDispute(id);
        if (!d || (d as any).customer_id !== customerId) return reply.code(404).send({ error: 'not_found' });

        let sop;
        try {
            sop = assertDisputeEvidenceSop(req.body ?? {});
        } catch (error: any) {
            return reply.code(400).send({ error: error?.code ?? 'invalid_evidence', message: error?.message ?? 'Invalid upload payload.' });
        }
        const path = toDisputeEvidencePath(customerId, id, sop.file_name);
        const { data, error } = await adminClient.storage.from(DISPUTE_EVIDENCE_BUCKET).createSignedUploadUrl(path);
        if (error) return reply.code(500).send({ error: 'upload_url_failed', message: error.message });
        return {
            bucket: DISPUTE_EVIDENCE_BUCKET,
            path,
            token: data?.token,
            signed_url: data?.signedUrl,
            sop: { max_bytes: 5 * 1024 * 1024, allowed_types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
        };
    });

    fastify.post('/disputes/:id/evidence/activate', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const customerId = req.actor!.customerId!;
        const { path } = z.object({ path: z.string().min(1) }).parse(req.body ?? {});
        try {
            const paths = await activateDisputeEvidence(customerId, id, path);
            const evidence = await signDisputeEvidencePaths(paths);
            return { evidence };
        } catch (error: any) {
            if (error instanceof DisputeEvidenceError) {
                const status = error.code === 'not_found' ? 404 : 422;
                return reply.code(status).send({ error: error.code, message: error.message });
            }
            return reply.code(422).send({ error: 'evidence_activation_failed', message: 'Could not attach evidence.' });
        }
    });

    fastify.post('/disputes/:id/messages', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const { body: msgBody } = z.object({ body: z.string().min(1).max(2000) }).parse(req.body);
        const d = await getDispute(id);
        if (!d || (d as any).customer_id !== req.actor!.customerId!) {
            return reply.code(404).send({ error: 'not_found' });
        }
        await addMessage({ disputeId: id, senderActorType: 'customer', senderActorId: req.actor!.customerId!, body: msgBody });
        return { ok: true };
    });

    // ── Support tickets ───────────────────────────────────────────────────
    async function customerName(customerId: string): Promise<string | undefined> {
        const { data } = await adminClient.from('customers').select('full_name').eq('id', customerId).maybeSingle();
        return (data as any)?.full_name ?? undefined;
    }

    fastify.post('/support/tickets', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const schema = z.object({
            subject:     z.string().min(5).max(200),
            description: z.string().min(10).max(4000),
            category:    z.string().max(60).optional(),
            priority:    z.enum(['low', 'normal', 'high', 'urgent']).optional(),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }

        const customerId = req.actor!.customerId!;
        return createTicket({
            requesterActorType: 'customer',
            requesterActorId:   customerId,
            requesterName:      await customerName(customerId),
            customerId,
            category:           body.category,
            subject:            body.subject,
            description:        body.description,
            priority:           body.priority,
        });
    });

    fastify.get('/support/tickets', { preHandler: fastify.requireCustomer() }, async (req) => {
        const { status } = req.query as { status?: string };
        return { tickets: await listTickets({ customerId: req.actor!.customerId!, status, limit: 100 }) };
    });

    fastify.get('/support/tickets/:id', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const t = await getTicket(id);
        if (!t || (t as any).customer_id !== req.actor!.customerId!) return reply.code(404).send({ error: 'not_found' });
        if ((t as any).support_ticket_messages) {
            (t as any).support_ticket_messages = (t as any).support_ticket_messages.filter((m: any) => !m.is_internal);
        }
        return t;
    });

    fastify.post('/support/tickets/:id/messages', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const { body: msgBody } = z.object({ body: z.string().min(1).max(4000) }).parse(req.body);
        const t = await getTicket(id);
        if (!t || (t as any).customer_id !== req.actor!.customerId!) return reply.code(404).send({ error: 'not_found' });
        if ((t as any).status === 'closed') return reply.code(409).send({ error: 'ticket_closed', message: 'Closed tickets cannot receive new customer replies.' });
        await addTicketMessage({
            ticketId: id, senderActorType: 'customer', senderActorId: req.actor!.customerId!,
            senderName: await customerName(req.actor!.customerId!), body: msgBody,
        });
        return { ok: true };
    });

    // ── Quick chat ────────────────────────────────────────────────────────
    fastify.post('/support/chat/session', { preHandler: fastify.requireCustomer() }, async (req) => {
        const customerId = req.actor!.customerId!;
        const { subject } = (req.body ?? {}) as { subject?: string };
        return getOrCreateChatSession({
            requesterActorType: 'customer',
            requesterActorId:   customerId,
            displayName:        await customerName(customerId),
            customerId,
            subject,
        });
    });

    fastify.get('/support/chat/:id/messages', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const { since } = req.query as { since?: string };
        const s = await getChatSession(id);
        if (!s || (s as any).requester_actor_id !== req.actor!.customerId!) return reply.code(404).send({ error: 'not_found' });
        const messages = await getChatMessages(id, { since, viewer: 'user' });
        return { session: s, messages };
    });

    fastify.post('/support/chat/:id/messages', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const { body: msgBody } = z.object({ body: z.string().min(1).max(2000) }).parse(req.body);
        const s = await getChatSession(id);
        if (!s || (s as any).requester_actor_id !== req.actor!.customerId!) return reply.code(404).send({ error: 'not_found' });
        await sendChatMessage({
            sessionId: id, senderActorType: 'customer', senderActorId: req.actor!.customerId!,
            senderName: (s as any).display_name ?? undefined, body: msgBody,
        });
        return { ok: true };
    });

    fastify.post('/support/chat/:id/end', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const s = await getChatSession(id);
        if (!s || (s as any).requester_actor_id !== req.actor!.customerId!) return reply.code(404).send({ error: 'not_found' });
        await endChatSession(id);
        return { ok: true };
    });

    fastify.post('/support/chat/:id/escalate', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const { subject } = z.object({ subject: z.string().min(3).max(200) }).parse(req.body);
        const s = await getChatSession(id);
        if (!s || (s as any).requester_actor_id !== req.actor!.customerId!) return reply.code(404).send({ error: 'not_found' });
        const customerId = req.actor!.customerId!;
        return escalateChatToTicket({
            sessionId: id, requesterActorType: 'customer', requesterActorId: customerId,
            requesterName: await customerName(customerId), customerId, subject,
        });
    });

    fastify.get('/receipts/:id', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const receipt = await getReceiptByOrder(id);
        if (!receipt) return reply.code(404).send({ error: 'not_found' });
        // Ensure receipt belongs to this customer
        const { data: po } = await adminClient
            .from('purchase_orders')
            .select('*')
            .eq('id', receipt.purchase_order_id)
            .single();
        if ((po as any)?.customer_id !== req.actor!.customerId!) {
            return reply.code(403).send({ error: 'forbidden' });
        }
        return shapeReceipt(receipt, po);
    });

    fastify.post('/receipts/:id/resend-sms', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const receipt = await getReceiptByOrder(id);
        if (!receipt) return reply.code(404).send({ error: 'not_found' });
        const { data: po } = await adminClient
            .from('purchase_orders')
            .select('id, customer_id, meter_id, amount_minor, units_kwh, token')
            .eq('id', receipt.purchase_order_id)
            .single();
        if ((po as any)?.customer_id !== req.actor!.customerId!) {
            return reply.code(403).send({ error: 'forbidden' });
        }
        try {
            const result = await sendTokenSmsToCustomer({
                customerId: req.actor!.customerId!,
                token: (po as any)?.token ?? (receipt as any)?.token ?? null,
                meterId: (po as any)?.meter_id ?? (receipt as any)?.meter_id ?? '',
                amountMinor: Number((po as any)?.amount_minor ?? (receipt as any)?.amount_minor ?? 0),
                units: Number((po as any)?.units_kwh ?? (receipt as any)?.units_kwh ?? 0),
                receiptId: (receipt as any)?.id ?? null,
                trafficKind: 'token_resend',
                actorUserId: req.actor!.userId,
            });
            if (!result.sent) {
                const status = String(result.reason ?? '').includes('rate') || String(result.reason ?? '').includes('cooldown') ? 429 : 422;
                return reply.code(status).send({ error: result.reason, message: 'Token SMS could not be sent.' });
            }
            return result;
        } catch (e: any) {
            return reply.code(502).send({ error: 'sms_send_failed', message: e?.message ?? 'Token SMS could not be sent.' });
        }
    });

    // ── NDPR: data export (right to access) ──
    fastify.post('/privacy/data-export', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const customerId = req.actor!.customerId!;
        try {
            const result = await requestDataExport(customerId);
            // Fire-and-forget: build export in background
            void buildDataExport(customerId, result.requestId);
            return { request_id: result.requestId, message: 'Export is being prepared. Check status at GET /privacy/data-export.' };
        } catch (e: any) {
            return reply.code(500).send({ error: e.code ?? 'export_error', message: e.message });
        }
    });

    fastify.get('/privacy/data-export', { preHandler: fastify.requireCustomer() }, async (req) => {
        const status = await getDataExportStatus(req.actor!.customerId!);
        return { export: status };
    });

    // ── NDPR: account deletion (right to erasure) ──
    fastify.post('/privacy/delete-account', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const schema = z.object({ reason: z.string().optional() });
        const body = schema.parse(req.body);
        try {
            const result = await requestAccountDeletion(req.actor!.customerId!, body.reason);
            return {
                request_id:    result.requestId,
                scheduled_for: result.scheduledFor,
                message:       `Your account is scheduled for deletion on ${new Date(result.scheduledFor).toLocaleDateString()}. You may cancel this request before that date.`,
            };
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'deletion_error', message: e.message });
        }
    });

    fastify.delete('/privacy/delete-account', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        try {
            await cancelDeletionRequest(req.actor!.customerId!);
            return { ok: true, message: 'Deletion request cancelled.' };
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'cancel_error', message: e.message });
        }
    });

    // ── PWA INSTALL TELEMETRY ────────────────────────────────────────────────
    // Fired once by the customer app's `appinstalled` event. Best-effort —
    // reuses the existing audit log rather than a dedicated table.
    fastify.post('/pwa-installed', { preHandler: fastify.requireCustomer() }, async (req) => {
        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'customer',
            action: 'pwa.installed',
            targetType: 'customer',
            targetId: req.actor!.customerId!,
        });
        return { ok: true };
    });

    // ── NOTIFICATIONS ─────────────────────────────────────────────────────────

    // ── Notifications inbox ───────────────────────────────────────────────────

    fastify.get('/notifications', { preHandler: fastify.requireCustomer() }, async (req) => {
        const { limit, cursor, unread_only } = req.query as {
            limit?: string; cursor?: string; unread_only?: string;
        };
        const pageSize = Math.min(Number(limit ?? 30), 100);
        const customerId = req.actor!.customerId!;
        const customerRecipientScope = `customer_id.eq.${customerId},and(recipient_type.eq.customer,recipient_id.eq.${customerId})`;

        let query = adminClient
            .from('notifications')
            .select('*')
            .or(customerRecipientScope)
            .order('created_at', { ascending: false })
            .limit(pageSize);

        if (unread_only === 'true') query = query.eq('read', false);
        if (cursor) query = query.lt('created_at', cursor);

        const { data, error } = await query;
        if (error) {
            // Table may not exist yet — return empty rather than 500
            if (isMissingNotificationsStorage(error)) {
                return { notifications: [], nextCursor: null, unreadCount: 0 };
            }
            throw error;
        }
        const deliveryQuery = adminClient
            .from('admin_announcement_deliveries')
            .select('id, notification_id, created_at, admin_announcements(id, title, body, audience, created_at)')
            .eq('recipient_type', 'customer')
            .eq('recipient_id', customerId)
            .order('created_at', { ascending: false })
            .limit(pageSize);
        if (cursor) deliveryQuery.lt('created_at', cursor);
        const { data: deliveryRows } = await deliveryQuery;
        const syntheticRows = (deliveryRows ?? []).map((row: any) => {
            const announcement = Array.isArray(row.admin_announcements) ? row.admin_announcements[0] : row.admin_announcements;
            return {
                id: row.notification_id ?? row.id,
                customer_id: customerId,
                recipient_type: 'customer',
                recipient_id: customerId,
                type: 'admin_announcement',
                title: announcement?.title ?? 'Beverly announcement',
                body: announcement?.body ?? '',
                metadata: { announcement_id: announcement?.id ?? null, delivery_id: row.id },
                read: true,
                created_at: announcement?.created_at ?? row.created_at,
            };
        });
        const byId = new Map<string, any>();
        for (const row of [...(data ?? []), ...syntheticRows]) byId.set(row.id, row);
        const rows = Array.from(byId.values())
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, pageSize);
        const nextCursor = rows.length === pageSize ? rows[rows.length - 1].created_at : null;

        // Unread count (only on first page, no cursor)
        let unreadCount = 0;
        if (!cursor) {
            const { count, error: countError } = await adminClient
                .from('notifications')
                .select('id', { count: 'exact', head: true })
                .or(customerRecipientScope)
                .eq('read', false);
            if (countError && !isMissingNotificationsStorage(countError)) throw countError;
            unreadCount = countError ? 0 : count ?? 0;
        }

        return { notifications: rows, nextCursor, unreadCount };
    });

    fastify.post('/notifications/read-all', { preHandler: fastify.requireCustomer() }, async (req) => {
        const customerId = req.actor!.customerId!;
        const { error } = await adminClient
            .from('notifications')
            .update({ read: true })
            .or(`customer_id.eq.${customerId},and(recipient_type.eq.customer,recipient_id.eq.${customerId})`)
            .eq('read', false);
        if (error && !isMissingNotificationsStorage(error)) throw error;
        return { ok: true };
    });

    fastify.patch('/notifications/:id/read', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const customerId = req.actor!.customerId!;
        const { error } = await adminClient
            .from('notifications')
            .update({ read: true })
            .eq('id', id)
            .or(`customer_id.eq.${customerId},and(recipient_type.eq.customer,recipient_id.eq.${customerId})`);
        if (isMissingNotificationsStorage(error)) return { ok: true };
        if (error) return reply.code(500).send({ error: 'update_failed', message: error.message });
        return { ok: true };
    });

    // ── Notification preferences ──────────────────────────────────────────────

    fastify.get('/notifications/preferences', { preHandler: fastify.requireCustomer() }, async (req) => {
        const { data, error } = await adminClient
            .from('customers')
            .select('notification_preferences')
            .eq('id', req.actor!.customerId!)
            .single();
        if (error && !isMissingNotificationsStorage(error)) throw error;
        return { preferences: mergeNotificationPrefs((data as any)?.notification_preferences) };
    });

    fastify.put('/notifications/preferences', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const schema = z.object({
            sms:    z.record(z.boolean()).optional(),
            email:  z.record(z.boolean()).optional(),
            in_app: z.record(z.boolean()).optional(),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }

        const { data: existing } = await adminClient
            .from('customers')
            .select('notification_preferences')
            .eq('id', req.actor!.customerId!)
            .single();

        const merged = mergeNotificationPrefs((existing as any)?.notification_preferences, body);

        const { error } = await adminClient
            .from('customers')
            .update({ notification_preferences: merged })
            .eq('id', req.actor!.customerId!);
        if (isMissingNotificationsStorage(error)) return reply.code(503).send({ error: 'notification_storage_missing', message: 'Notification preferences storage is not migrated.' });
        if (error) return reply.code(500).send({ error: 'update_failed', message: error.message });
        return { ok: true, preferences: merged };
    });

    // ── Consumption ─────────────────────────────────────────────────────────
    // A customer sees only their own meters. "Own" is the union of meters they
    // registered and meters they have actually bought tokens for — a customer
    // who paid for a meter but never registered it still sees its usage.

    /** Meter ids this customer is entitled to. Empty array means "no meters". */
    async function customerMeterIds(customerId: string): Promise<string[]> {
        const [registered, purchased] = await Promise.all([
            adminClient
                .from('customer_meters')
                .select('meter_id')
                .eq('customer_id', customerId)
                .eq('status', 'approved'),
            adminClient
                .from('purchase_orders')
                .select('meter_id')
                .eq('actor_type', 'customer')
                .eq('actor_id', customerId),
        ]);
        if (registered.error) throw registered.error;
        if (purchased.error) throw purchased.error;

        return [...new Set([...(registered.data ?? []), ...(purchased.data ?? [])]
            .map((row: any) => String(row.meter_id ?? '').trim())
            .filter(Boolean))];
    }

    fastify.get('/consumption', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const qs = req.query as Record<string, string>;
        const period = (qs.period ?? 'month') as 'day' | 'week' | 'month' | 'year';
        if (!['day', 'week', 'month', 'year'].includes(period)) {
            return reply.code(400).send({ error: 'bad_period', message: 'period must be day | week | month | year' });
        }
        const meterId = String(qs.meter_id ?? '').trim().toUpperCase();
        if (meterId && !/^[A-Z0-9_-]{3,64}$/.test(meterId)) {
            return reply.code(400).send({
                error: 'invalid_meter_id',
                message: 'Enter a valid meter number.',
            });
        }

        const customerId = req.actor!.customerId!;
        const meterIds = await customerMeterIds(customerId);

        const { queryConsumption, metersAuthority } = await import('../services/consumption.js');
        // metersAuthority([]) resolves to "see nothing", so a customer with no
        // meters gets an empty series rather than the whole estate.
        const rows = await queryConsumption(
            {
                scope: 'meter',
                scope_id: meterId || undefined,
                period_type: period,
                from: qs.from ?? undefined,
                to: qs.to ?? undefined,
                limit: Math.min(Number(qs.limit ?? 120), 500),
                withSpend: qs.spend !== 'false',
            },
            metersAuthority(meterIds),
        );
        return { rows, count: rows.length, meters: meterIds };
    });
};

export default customer;
