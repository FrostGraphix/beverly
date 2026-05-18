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
    requestOtp, verifyOtp, AuthError,
} from '../services/customer-auth.js';
import {
    submitKycTier1, submitKycTier2Nin, KycError,
} from '../services/customer-kyc.js';
import {
    customerPurchase, previewCustomerPurchase, initiateCustomerFunding,
    linkMeter, unlinkMeter, listCustomerMeters, listCustomerPurchases,
    CustomerPurchaseError,
} from '../services/customer-purchase.js';
import { findWalletByOwner } from '../services/wallets.js';
import { getReceiptByOrder } from '../services/vending.js';
import { logAction } from '../services/audit.js';
import { initializeTransaction } from '../adapters/paystack.js';
import { assessPurchase, linkAssessmentToPurchase, refreshCustomerBaseline } from '../services/fraud-engine.js';
import { issueStepUpChallenge, verifyStepUpChallenge, StepUpError } from '../services/step-up-auth.js';
import { raiseDispute, listDisputes, getDispute, addMessage } from '../services/disputes.js';
import { requestDataExport, getDataExportStatus, buildDataExport, requestAccountDeletion, cancelDeletionRequest } from '../services/data-privacy.js';

const customer: FastifyPluginAsync = async (fastify) => {

    // ── AUTH ──────────────────────────────────────────────────────────────────

    fastify.post('/auth/signup', async (req, reply) => {
        const { phone, email, full_name } = req.body as {
            phone: string; email?: string; full_name?: string;
        };
        if (!phone) return reply.code(400).send({ error: 'phone_required', message: 'phone is required.' });
        try {
            const result = await requestOtp(phone, 'signup', { email, full_name });
            return { challenge_id: result.challengeId };
        } catch (e: any) {
            if (e instanceof AuthError) return reply.code(e.code === 'rate_limit' ? 429 : 400).send({ error: e.code, message: e.message });
            throw e;
        }
    });

    fastify.post('/auth/login', async (req, reply) => {
        const { phone } = req.body as { phone: string };
        if (!phone) return reply.code(400).send({ error: 'phone_required', message: 'phone is required.' });
        try {
            const result = await requestOtp(phone, 'login');
            return { challenge_id: result.challengeId };
        } catch (e: any) {
            if (e instanceof AuthError) {
                return reply.code(
                    e.code === 'rate_limit' ? 429
                    : e.code === 'customer_not_found' ? 404
                    : 400,
                ).send({ error: e.code, message: e.message });
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
                return reply.code(e.code === 'invalid_otp' || e.code === 'otp_expired' ? 401 : 400)
                    .send({ error: e.code, message: e.message });
            }
            throw e;
        }
    });

    // ── PROFILE ───────────────────────────────────────────────────────────────

    fastify.get('/me', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { data } = await adminClient
            .from('customers')
            .select('id, phone, email, full_name, kyc_tier, kyc_status, status, created_at')
            .eq('id', req.actor!.customerId!)
            .single();
        if (!data) return reply.code(404).send({ error: 'not_found' });
        return data;
    });

    fastify.patch('/me', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { full_name, email } = req.body as { full_name?: string; email?: string };
        const updates: Record<string, unknown> = {};
        if (full_name !== undefined) updates.full_name = full_name.trim();
        if (email !== undefined) updates.email = email.trim().toLowerCase() || null;
        if (!Object.keys(updates).length) return reply.code(400).send({ error: 'no_fields', message: 'Nothing to update.' });

        const { data, error } = await adminClient
            .from('customers')
            .update(updates)
            .eq('id', req.actor!.customerId!)
            .select('id, phone, email, full_name, kyc_tier, kyc_status, status')
            .single();
        if (error) return reply.code(500).send({ error: 'update_failed', message: error.message });
        return data;
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
        const { meter_id, nickname } = req.body as { meter_id: string; nickname?: string };
        if (!meter_id) return reply.code(400).send({ error: 'meter_id_required' });
        try {
            const meter = await linkMeter(req.actor!.customerId!, req.actor!.userId, meter_id.trim().toUpperCase(), nickname);
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
            balance_minor: (summary as any)?.balance_minor ?? 0,
            holds_minor: (summary as any)?.holds_minor ?? 0,
            available_minor: (summary as any)?.available_minor ?? 0,
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
            if (e instanceof CustomerPurchaseError) return reply.code(400).send({ error: e.code, message: e.message });
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
            const preview = await previewCustomerPurchase(meter_id, amount_minor);
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

        const customerId = req.actor!.customerId!;
        const clientIp   = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
                         ?? req.ip ?? null;
        const userAgent  = req.headers['user-agent'] ?? null;

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
                    : e.code === 'wallet_inactive'    ? 403
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
                    : e.code === 'wallet_inactive'    ? 403
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

    fastify.get('/receipts', { preHandler: fastify.requireCustomer() }, async (req) => {
        const { data } = await adminClient
            .from('receipts')
            .select('id, receipt_number, purchase_order_id, created_at')
            .in(
                'purchase_order_id',
                (
                    await adminClient
                        .from('purchase_orders')
                        .select('id')
                        .eq('customer_id', req.actor!.customerId!)
                ).data?.map((r: any) => r.id) ?? [],
            )
            .order('created_at', { ascending: false })
            .limit(100);
        return { receipts: data ?? [] };
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

    fastify.get('/receipts/:id', { preHandler: fastify.requireCustomer() }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const receipt = await getReceiptByOrder(id);
        if (!receipt) return reply.code(404).send({ error: 'not_found' });
        // Ensure receipt belongs to this customer
        const { data: po } = await adminClient
            .from('purchase_orders')
            .select('customer_id')
            .eq('id', receipt.purchase_order_id)
            .single();
        if ((po as any)?.customer_id !== req.actor!.customerId!) {
            return reply.code(403).send({ error: 'forbidden' });
        }
        return receipt;
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
};

export default customer;
