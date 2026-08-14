/**
 * Customer routes  /api/v1/customer/*
 *
 * Public (no auth):
 *   POST /auth/signup   — send OTP for new account
 *   POST /auth/login    — send OTP for existing account
 *   POST /auth/verify   — verify OTP, get access_token
 *
 * Authenticated (requireCustomer):
 *   GET    /me
 *   PATCH  /me
 *   POST   /logout
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
import { adminClient } from '../db/supabase.js';
import {
    requestOtp, verifyOtp, signupWithEmail, loginWithEmail, AuthError,
} from '../services/customer-auth.js';
import {
    requestPasswordReset, confirmPasswordReset, PasswordResetError,
} from '../services/password-reset.js';
import {
    submitKycTier1, submitKycTier2Nin, KycError,
} from '../services/customer-kyc.js';
import {
    customerPurchase, previewCustomerPurchase, initiateCustomerFunding,
    linkMeter, unlinkMeter, listCustomerMeters, listCustomerPurchases, sendTokenSmsToCustomer,
    CustomerPurchaseError,
} from '../services/customer-purchase.js';
import { findWalletByOwner } from '../services/wallets.js';
import { getReceiptByOrder } from '../services/vending.js';
import { logAction } from '../services/audit.js';
import { initializeTransaction } from '../adapters/paystack.js';
import { assessPurchase, linkAssessmentToPurchase, refreshCustomerBaseline } from '../services/fraud-engine.js';
import { issueStepUpChallenge, verifyStepUpChallenge, StepUpError } from '../services/step-up-auth.js';
import { raiseDispute, listDisputes, getDispute, addMessage } from '../services/disputes.js';
import {
    createTicket, listTickets, getTicket, addTicketMessage,
    getOrCreateChatSession, sendChatMessage, getChatMessages, getChatSession, endChatSession, escalateChatToTicket,
} from '../services/support.js';
import { requestDataExport, getDataExportStatus, buildDataExport, requestAccountDeletion, cancelDeletionRequest } from '../services/data-privacy.js';
import { assertProfilePictureSop, PROFILE_PICTURE_BUCKET, toProfilePicturePath } from '../services/profile-picture.js';
import { runMalwareScan } from '../services/file-scan.js';

function customerAuthStatus(code: string): number {
    return code === 'rate_limit' ? 429
        : code === 'sms_otp_rate_limited' || code === 'sms_otp_resend_limited' ? 429
        : code === 'sms_country_blocked' || code === 'sms_country_not_allowed' ? 403
        : code === 'otp_storage_missing' || code === 'otp_send_failed' ? 503
        : code === 'auth_not_configured' || code === 'auth_upstream_unreachable' ? 503
        : code === 'customer_not_found' ? 404
        : code === 'email_in_use' || code === 'phone_in_use' ? 409
        : code === 'invalid_credentials' ? 401
        : code === 'invalid_otp' || code === 'otp_expired' || code === 'max_attempts' ? 401
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
    sms: { token_purchased: false, wallet_funded: true, login_otp: true, low_balance: false, meter_order_update: false },
    email: { token_purchased: false, wallet_funded: false, promotions: false, kyc_update: false, dispute_update: false, payment_failed: false },
    in_app: { token_purchased: true, wallet_funded: true, kyc_update: true, dispute_update: true, low_balance: true, payment_failed: true, meter_order_update: true },
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

function shapeReceipt(row: any, purchase?: any) {
    const payload = row?.payload ?? {};
    return {
        ...row,
        ...payload,
        token: payload.token ?? purchase?.token ?? row?.token ?? null,
        meter_id: payload.meterId ?? payload.meter_id ?? purchase?.meter_id ?? null,
        meter_type: payload.meterType ?? payload.meter_type ?? purchase?.meter_type ?? null,
        amount_minor: payload.amountMinor ?? payload.amount_minor ?? purchase?.amount_minor ?? null,
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
            const { access_token, customer, isNew } = await loginWithEmail({ email, password });
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

    // ── PASSWORD RESET (email-auth customers only) ────────────────────────────

    fastify.post('/auth/email/reset-request', async (req, reply) => {
        const { email } = req.body as { email?: string };
        if (!email?.trim()) {
            return reply.code(400).send({ error: 'email_required', message: 'email is required.' });
        }
        // Always returns ok to avoid user enumeration.
        await requestPasswordReset(email.trim().toLowerCase(), 'customer').catch(() => null);
        return { ok: true };
    });

    fastify.post('/auth/email/reset-confirm', async (req, reply) => {
        const { token, new_password } = req.body as { token?: string; new_password?: string };
        if (!token || !new_password) {
            return reply.code(400).send({ error: 'missing_fields', message: 'token and new_password are required.' });
        }
        try {
            await confirmPasswordReset(token, new_password, 'customer');
            return { ok: true };
        } catch (e: any) {
            if (e instanceof PasswordResetError) {
                const status = e.code === 'invalid_token' || e.code === 'token_expired' ? 400 : 422;
                return reply.code(status).send({ error: e.code, message: e.message });
            }
            throw e;
        }
    });

    // ── PROFILE ───────────────────────────────────────────────────────────────

    fastify.get('/me', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { data } = await adminClient
            .from('customers')
            .select('id, phone, email, full_name, profile_picture_url, kyc_tier, kyc_status, status, created_at')
            .eq('id', req.actor!.customerId!)
            .single();
        if (!data) return reply.code(404).send({ error: 'not_found' });
        return data;
    });

    fastify.patch('/me', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { full_name, email, profile_picture_url } = req.body as { full_name?: string; email?: string; profile_picture_url?: string | null };
        const updates: Record<string, unknown> = {};
        if (full_name !== undefined) updates.full_name = full_name.trim();
        if (email !== undefined) updates.email = email.trim().toLowerCase() || null;
        if (profile_picture_url !== undefined) updates.profile_picture_url = (profile_picture_url ?? '').trim() || null;
        if (!Object.keys(updates).length) return reply.code(400).send({ error: 'no_fields', message: 'Nothing to update.' });

        const { data, error } = await adminClient
            .from('customers')
            .update(updates)
            .eq('id', req.actor!.customerId!)
            .select('id, phone, email, full_name, profile_picture_url, kyc_tier, kyc_status, status')
            .single();
        if (error) return reply.code(500).send({ error: 'update_failed', message: error.message });
        return data;
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
            if (e instanceof CustomerPurchaseError) return reply.code(422).send({ error: e.code, message: e.message });
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

        const { data: summary } = await adminClient
            .from('v_wallet_balances')
            .select('*')
            .eq('wallet_id', wallet.id)
            .maybeSingle();

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
        const { data } = await adminClient
            .from('wallet_ledger_entries')
            .select('*')
            .eq('wallet_id', wallet.id)
            .order('created_at', { ascending: false })
            .range(Number(offset), Number(offset) + Number(limit) - 1);
        return { entries: data ?? [] };
    });

    fastify.post('/wallet/fund', { preHandler: fastify.requireKycTier(1) }, async (req, reply) => {
        const { amount_minor, callback_url } = req.body as { amount_minor: number; callback_url?: string };
        if (!amount_minor || amount_minor < 50000) {
            return reply.code(400).send({ error: 'amount_too_low', message: 'Minimum ₦500.' });
        }
        const { data: cu } = await adminClient.from('customers').select('email').eq('id', req.actor!.customerId!).single();
        if (!(cu as any)?.email) {
            return reply.code(422).send({ error: 'email_required', message: 'Add an email address to fund via card.' });
        }
        try {
            const result = await initiateCustomerFunding({
                customerId: req.actor!.customerId!,
                customerUserId: req.actor!.userId,
                customerEmail: (cu as any).email,
                amountMinor: amount_minor,
                callbackUrl: callback_url,
            });
            return result;
        } catch (e: any) {
            if (e instanceof CustomerPurchaseError) {
                return reply.code(
                    e.code === 'wallet_inactive' || e.code === 'wallet_frozen' || e.code === 'wallet_closed' ? 403 : 400,
                ).send({ error: e.code, message: e.message });
            }
            throw e;
        }
    });

    // ── PURCHASE ──────────────────────────────────────────────────────────────

    fastify.post('/purchase/preview', { preHandler: fastify.requireKycTier(1) }, async (req, reply) => {
        const { meter_id, amount_minor } = req.body as { meter_id: string; amount_minor: number };
        if (!meter_id || !amount_minor) {
            return reply.code(400).send({ error: 'missing_fields', message: 'meter_id and amount_minor required.' });
        }
        try {
            const preview = await previewCustomerPurchase(meter_id, amount_minor, req.actor!.customerId!);
            return preview;
        } catch (e: any) {
            if (e instanceof CustomerPurchaseError) return reply.code(422).send({ error: e.code, message: e.message });
            throw e;
        }
    });

    fastify.post('/purchase', { preHandler: fastify.requireKycTier(1) }, async (req, reply) => {
        const { meter_id, amount_minor, mode, idempotency_key } = req.body as {
            meter_id: string; amount_minor: number;
            mode: 'wallet' | 'direct_pay'; idempotency_key: string;
        };
        if (!meter_id || !amount_minor || !mode || !idempotency_key) {
            return reply.code(400).send({ error: 'missing_fields' });
        }
        if (!['wallet', 'direct_pay'].includes(mode)) {
            return reply.code(400).send({ error: 'invalid_mode', message: 'mode must be wallet or direct_pay.' });
        }

        const customerId     = req.actor!.customerId!;
        const clientIp       = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
                             ?? req.ip ?? null;
        const userAgent      = req.headers['user-agent'] ?? null;
        const clientCountry  = (req.headers['cf-ipcountry'] as string)
                             ?? (req.headers['x-vercel-ip-country'] as string)
                             ?? null;
        // Richer fingerprint: UA + Accept-Language + client hints
        const deviceFingerprint = [
            userAgent ?? '',
            (req.headers['accept-language'] as string) ?? '',
            (req.headers['sec-ch-ua'] as string) ?? '',
            (req.headers['sec-ch-ua-platform'] as string) ?? '',
        ].join('|') || null;

        // ── Fraud assessment ──────────────────────────────────────────────────
        const assessment = await assessPurchase({
            customerId,
            meterId:     meter_id.trim().toUpperCase(),
            amountMinor: amount_minor,
            clientIp,
            userAgent,
            deviceFingerprint,
            clientCountry,
            mode,
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
                customerEmail:  (cu as any)?.email ?? null,
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
                    : e.code === 'wallet_inactive' || e.code === 'wallet_frozen' || e.code === 'wallet_closed' ? 403
                    : 422,
                ).send({ error: e.code, message: e.message });
            }
            throw e;
        }
    });

    fastify.post('/purchase/step-up-verify', { preHandler: fastify.requireKycTier(1) }, async (req, reply) => {
        const { challenge_id, otp, meter_id, amount_minor, mode, idempotency_key } = req.body as {
            challenge_id: string; otp: string;
            meter_id: string; amount_minor: number;
            mode: 'wallet' | 'direct_pay'; idempotency_key: string;
        };
        if (!challenge_id || !otp || !meter_id || !amount_minor || !mode || !idempotency_key) {
            return reply.code(400).send({ error: 'missing_fields' });
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
                customerEmail:  (cu as any)?.email ?? null,
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
                    : e.code === 'wallet_inactive' || e.code === 'wallet_frozen' || e.code === 'wallet_closed' ? 403
                    : 422,
                ).send({ error: e.code, message: e.message });
            }
            throw e;
        }
    });

    // ── TRANSACTIONS & RECEIPTS ───────────────────────────────────────────────

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
        const { data } = await query;
        const rows = data ?? [];
        const nextCursor = rows.length === Math.min(Number(limit ?? 50), 200) ? rows[rows.length - 1].created_at : null;
        return { funding: rows, nextCursor };
    });

    fastify.get('/receipts', { preHandler: fastify.requireCustomer() }, async (req) => {
        const { data: purchaseRows } = await adminClient
            .from('purchase_orders')
            .select('id, meter_id, meter_type, amount_minor, units_kwh, tariff_id, station_id, status')
            .eq('customer_id', req.actor!.customerId!);
        const purchaseById = new Map((purchaseRows ?? []).map((p: any) => [p.id, p]));
        const { data } = await adminClient
            .from('receipts')
            .select('id, receipt_number, purchase_order_id, payload, created_at')
            .in(
                'purchase_order_id',
                (purchaseRows ?? []).map((r: any) => r.id),
            )
            .order('created_at', { ascending: false })
            .limit(100);
        return { receipts: (data ?? []).map((row: any) => shapeReceipt(row, purchaseById.get(row.purchase_order_id))) };
    });

    // ── METER ORDERS ─────────────────────────────────────────────────────────

    fastify.post('/meter-orders', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const schema = z.object({
            meter_type:      z.enum(['single_phase', 'three_phase']),
            property_address: z.string().min(5),
            service_area:    z.string().min(2),
            contact_phone:   z.string().min(8),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }

        const amount_minor = body.meter_type === 'three_phase' ? 7_500_000 : 5_000_000; // ₦75k / ₦50k
        const reference    = `mord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const { data: user } = await adminClient
            .from('users')
            .select('email, full_name')
            .eq('id', req.actor!.userId)
            .single();

        // Initialize Paystack transaction
        const ps = await initializeTransaction({
            email:     (user as any)?.email ?? '',
            amountMinor: amount_minor,
            reference,
            metadata:  { customer_id: req.actor!.customerId, order_type: 'meter_purchase' },
            callbackUrl: `${process.env.CUSTOMER_APP_URL ?? 'http://localhost:5173'}/meter-orders?ref=${reference}`,
        });
        if (!ps.authorization_url) {
            return reply.code(502).send({ error: 'paystack_error', message: 'Could not initialize payment' });
        }

        const { data: order, error } = await adminClient
            .from('meter_purchase_orders')
            .insert({
                customer_id:      req.actor!.customerId!,
                meter_type:       body.meter_type,
                property_address: body.property_address,
                service_area:     body.service_area,
                contact_phone:    body.contact_phone,
                amount_minor,
                payment_reference: reference,
                status:           'pending_payment',
            })
            .select()
            .single();
        if (error) return reply.code(500).send({ error: 'db_error', message: error.message });

        await logAction({ actorUserId: req.actor!.userId, actorType: 'customer', action: 'meter_order.created', targetId: (order as any).id, metadata: { meter_type: body.meter_type } });
        return { order, authorization_url: ps.authorization_url };
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

        // Verify with Paystack
        const res = await fetch(`https://api.paystack.co/transaction/verify/${(order as any).payment_reference}`, {
            headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
        });
        const ps: any = await res.json();
        if (ps.data?.status === 'success') {
            await adminClient
                .from('meter_purchase_orders')
                .update({ status: 'paid', updated_at: new Date().toISOString() })
                .eq('id', id);
            await logAction({ actorUserId: req.actor!.userId, actorType: 'customer', action: 'meter_order.payment_confirmed', targetId: id });
            return { ...(order as any), status: 'paid' };
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
        return d;
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

    // ── NOTIFICATIONS ─────────────────────────────────────────────────────────

    // ── Notifications inbox ───────────────────────────────────────────────────

    fastify.get('/notifications', { preHandler: fastify.requireCustomer() }, async (req) => {
        const { limit, cursor, unread_only } = req.query as {
            limit?: string; cursor?: string; unread_only?: string;
        };
        const pageSize = Math.min(Number(limit ?? 30), 100);

        let query = adminClient
            .from('notifications')
            .select('*')
            .eq('customer_id', req.actor!.customerId!)
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
        const rows = data ?? [];
        const nextCursor = rows.length === pageSize ? rows[rows.length - 1].created_at : null;

        // Unread count (only on first page, no cursor)
        let unreadCount = 0;
        if (!cursor) {
            const { count, error: countError } = await adminClient
                .from('notifications')
                .select('id', { count: 'exact', head: true })
                .eq('customer_id', req.actor!.customerId!)
                .eq('read', false);
            if (countError && !isMissingNotificationsStorage(countError)) throw countError;
            unreadCount = countError ? 0 : count ?? 0;
        }

        return { notifications: rows, nextCursor, unreadCount };
    });

    fastify.post('/notifications/read-all', { preHandler: fastify.requireCustomer() }, async (req) => {
        const { error } = await adminClient
            .from('notifications')
            .update({ read: true })
            .eq('customer_id', req.actor!.customerId!)
            .eq('read', false);
        if (error && !isMissingNotificationsStorage(error)) throw error;
        return { ok: true };
    });

    fastify.patch('/notifications/:id/read', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const { error } = await adminClient
            .from('notifications')
            .update({ read: true })
            .eq('id', id)
            .eq('customer_id', req.actor!.customerId!);
        if (isMissingNotificationsStorage(error)) return { ok: true };
        if (error) return reply.code(500).send({ error: 'update_failed', message: error.message });
        return { ok: true };
    });

    // ── Push token registration ───────────────────────────────────────────────

    fastify.post('/notifications/push-token', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const schema = z.object({
            token:    z.string().min(10).max(512),
            platform: z.enum(['ios', 'android', 'web']),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }

        // Upsert: same token might belong to different customers across re-installs
        await adminClient
            .from('customer_push_tokens')
            .upsert(
                { customer_id: req.actor!.customerId!, token: body.token, platform: body.platform, active: true },
                { onConflict: 'token' },
            );
        return { ok: true };
    });

    fastify.delete('/notifications/push-token', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const schema = z.object({ token: z.string().min(10).max(512) });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }

        await adminClient
            .from('customer_push_tokens')
            .update({ active: false })
            .eq('token', body.token)
            .eq('customer_id', req.actor!.customerId!);
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
            push:   z.record(z.boolean()).optional(),
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

    // ── KYC document upload ───────────────────────────────────────────────────

    fastify.post('/kyc/documents/upload-url', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const schema = z.object({
            doc_type:       z.enum(['national_id', 'voters_card', 'passport', 'drivers_license', 'utility_bill', 'bank_statement', 'selfie', 'signature']),
            kyc_tier:       z.literal(1).or(z.literal(2)),
            mime_type:      z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
            size_bytes:     z.number().int().positive().max(10 * 1024 * 1024),
            doc_expires_at: z.string().optional(),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }

        const { generateUploadUrl, KycDocumentError } = await import('../services/kyc-documents.js');
        try {
            const result = await generateUploadUrl({
                customerId:   req.actor!.customerId!,
                docType:      body.doc_type,
                kycTier:      body.kyc_tier,
                mimeType:     body.mime_type,
                sizeBytes:    body.size_bytes,
                docExpiresAt: body.doc_expires_at,
            });
            return result;
        } catch (e: any) {
            const code = e instanceof KycDocumentError ? 400 : 500;
            return reply.code(code).send({ error: e.code ?? 'upload_url_failed', message: e.message });
        }
    });

    fastify.get('/kyc/documents', { preHandler: fastify.requireCustomer() }, async (req) => {
        const { listDocuments } = await import('../services/kyc-documents.js');
        const docs = await listDocuments(req.actor!.customerId!);
        return { documents: docs };
    });
};

export default customer;
