/**
 * Vendor routes — /api/v1/vendor/*
 *
 * Backend trusts session for actor identity; never trusts payload `vendorOrganizationId`.
 */
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { adminClient } from '../db/supabase.js';
import { env } from '../config/env.js';
import { resolveFundingCallbackUrl } from '../config/funding-callbacks.js';
import { findWalletByOwner, getOrCreateWallet } from '../services/wallets.js';
import { getBalance, getEntries, getActivitySummary } from '../services/ledger.js';
import {
    initiatePaystackFunding, initiateBankProofFunding, listVendorFunding, uploadBankFundingProof, FundingError,
} from '../services/funding.js';
import {
    vendorPurchase,
    dispatchGeneratedVendorToken,
    listVendorPurchases,
    getReceiptByOrder,
    VendingError,
} from '../services/vending.js';
import {
    previewPurchaseWithPolicy,
    lookupMeter,
    TokenEngineError,
    assertEnergyVendReady,
    buildCreditTokenPreviewPlan,
    buildRemoteTokenTaskPayload,
} from '../services/token-engine.js';
import { assertStationVendAllowed, StationVendScopeError } from '../services/station-vend-scope.js';
import { logSecurityEvent } from '../services/audit.js';
import { logAction } from '../services/audit.js';
import { verifyOwnedPaystackPayment } from '../services/payment-webhooks.js';
import { raiseDispute, listDisputes, getDispute, addMessage } from '../services/disputes.js';
import {
    requestPasswordReset, confirmPasswordReset, PasswordResetError,
} from '../services/password-reset.js';
import {
    createTicket, listTickets, getTicket, addTicketMessage,
    getOrCreateChatSession, sendChatMessage, getChatMessages, getChatSession, endChatSession, escalateChatToTicket,
} from '../services/support.js';
import { listSettlementBatches } from '../services/settlement.js';
import {
    beginVendorMfaEnrollment,
    beginVendorMfaReplacement,
    disableVendorMfa,
    regenerateVendorRecoveryCodes,
    VendorMfaError,
    vendorMfaStatus,
    verifyVendorMfaChallenge,
    verifyVendorMfaEnrollment,
    vendorMfaSessionVerified,
} from '../services/vendor-mfa.js';
import {
    hasVendorVendCredential,
    setVendorVendCredential,
    vendorVendCredentialStatus,
    VendorVendCredentialError,
    verifyVendorVendCredential,
} from '../services/vendor-vend-credential.js';
import { activateProfilePicture, assertProfilePictureSop, PROFILE_PICTURE_BUCKET, toProfilePicturePath } from '../services/profile-picture.js';
import { runMalwareScan } from '../services/file-scan.js';
import { cancelVendorMeterOrder, createVendorSponsoredMeterOrder, getMeterPrices, vendorMeterOrderCancellationEligibility } from '../services/meter-orders.js';
import {
    abandonWalletIdempotency,
    assertClientIdempotencyKey,
    claimWalletIdempotency,
    completeWalletIdempotency,
    hashIdempotency,
} from '../services/idempotency.js';
import { revokePortalSession } from '../services/portal-session.js';

function bearerToken(req: FastifyRequest): string {
    const auth = req.headers.authorization ?? '';
    return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

function vendorActorOrReply(req: FastifyRequest, reply: FastifyReply) {
    const actor = req.actor;
    if (!actor || actor.type !== 'vendor_user') {
        reply.code(403).send({ error: 'forbidden', message: 'Vendor user required.' });
        return null;
    }
    return actor;
}

function assertVendorEmailVerified(actor: any, reply: FastifyReply): boolean {
    if (env.NODE_ENV === 'test') return true;
    if (actor.emailVerified === false) {
        reply.code(403).send({
            error: 'email_verification_required',
            message: 'Vendor email verification is required before performing this operation.',
        });
        return false;
    }
    return true;
}

function mfaMeta(req: FastifyRequest) {
    return {
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
    };
}

function requireIdempotencyKey(req: FastifyRequest, reply: FastifyReply): string | null {
    try {
        return assertClientIdempotencyKey(req.headers['idempotency-key']);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'A valid Idempotency-Key header is required.';
        reply.code(400).send({ error: 'invalid_idempotency_key', message });
        return null;
    }
}

function sendMfaError(reply: FastifyReply, error: unknown) {
    if (error instanceof VendorMfaError) {
        const status = ['invalid_otp', 'mfa_setup_not_started'].includes(error.code) ? 400 : 409;
        return reply.code(status).send({ error: error.code, message: error.message });
    }
    throw error;
}

function sendVendCredentialError(reply: FastifyReply, error: unknown) {
    if (error instanceof VendorVendCredentialError) {
        const status = error.code === 'vend_credential_required'
            ? 428
            : error.code === 'vend_credential_locked'
                ? 429
            : error.code === 'vendor_user_not_found'
                ? 404
                : error.code.endsWith('_failed')
                    ? 503
                    : 400;
        return reply.code(status).send({ error: error.code, message: error.message });
    }
    throw error;
}

function sendTokenEngineError(reply: FastifyReply, error: TokenEngineError) {
    const configurationUnavailable = ['energy_authorization_missing', 'energy_authorization_misconfigured', 'energy_authorization_rejected'].includes(error.code);
    const status = error.code === 'meter_not_found' ? 404 : error.retryable || configurationUnavailable ? 503 : 400;
    const messages: Record<string, string> = {
        energy_authorization_missing: 'Vending authorization is not configured. Beverly support must restore the token service.',
        energy_authorization_misconfigured: 'Vending authorization is misconfigured. Beverly support must restore the token service.',
        energy_authorization_rejected: 'Vending authorization was rejected upstream. Beverly support must restore the token service.',
        meter_lookup_unavailable:
            'Meter lookup is temporarily unavailable. No wallet was touched and no vend was attempted; retry shortly or bind this meter in the account catalog.',
        meter_offline:
            'This meter is offline. No wallet was touched and no vend was attempted; retry after the meter reconnects.',
        energy_query_failed:
            'The energy backend could not complete the meter query. No wallet was touched and no vend was attempted.',
        energy_report_query_failed:
            'The energy report lookup could not confirm this meter. No wallet was touched and no vend was attempted.',
        meter_not_found:
            'Meter not found in the live account records or the local binding catalog.',
    };
    return reply.code(status).send({
        error: error.code,
        message: messages[error.code] ?? error.message,
        retryable: error.retryable,
        details: {
            noVendAttempted: true,
            recommendedAction: error.retryable ? 'retry_or_bind_meter' : 'check_meter_number_or_bind_meter',
        },
    });
}

function sendVendPreviewUnavailable(
    req: FastifyRequest,
    reply: FastifyReply,
    stage: 'meter_lookup' | 'pricing',
    cause: unknown,
) {
    const error = stage === 'meter_lookup'
        ? 'vend_meter_lookup_unavailable'
        : 'vend_pricing_unavailable';
    const message = stage === 'meter_lookup'
        ? 'Live meter verification is temporarily unavailable. No wallet debit or vend was attempted.'
        : 'Current vending pricing is temporarily unavailable. No wallet debit or vend was attempted.';
    req.log.error({ err: cause, stage, meterId: (req.body as any)?.meterId }, 'Vendor vending preview failed');
    return reply.code(503).send({
        error,
        message,
        retryable: true,
        correlationId: req.id,
        details: {
            noVendAttempted: true,
            stage,
            recommendedAction: 'retry_or_contact_support',
            correlationId: req.id,
        },
    });
}

function sendRemoteSendUnavailable(req: FastifyRequest, reply: FastifyReply, cause: unknown) {
    const message = 'Remote delivery is temporarily unavailable. The token remains valid for manual meter entry.';
    req.log.error({ err: cause, purchaseOrderId: (req.params as any)?.purchaseOrderId }, 'Vendor remote send failed unexpectedly');
    return reply.code(503).send({
        error: 'remote_send_service_unavailable',
        message,
        status: 'failed',
        deliveryState: 'remote_send_failed_needs_manual_entry',
        delivery_state: 'remote_send_failed_needs_manual_entry',
        remark: message,
        retryable: true,
        correlationId: req.id,
        details: {
            tokenRemainsValid: true,
            recommendedAction: 'enter_token_manually_or_retry_remote_send',
            correlationId: req.id,
        },
    });
}

function profileCode(prefix: string, id: string | null | undefined): string | null {
    if (!id) return null;
    return `${prefix}-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

function profileSite(stations: unknown): string | null {
    if (Array.isArray(stations) && stations.length) return stations.filter(Boolean).join(', ');
    if (typeof stations === 'string' && stations.trim()) return stations.trim();
    return null;
}

function walletNumber(prefix: string, id: string | null | undefined, explicit?: string | null): string | null {
    if (explicit) return explicit;
    const code = profileCode(prefix, id);
    return code ? code.replace(`${prefix}-`, `WLT-${prefix}-`) : null;
}

async function legacyVendorWallet(organizationId: string | null | undefined): Promise<{ wallet_number: string | null; status: string | null }> {
    if (!organizationId) return { wallet_number: null, status: null };
    const { data } = await adminClient
        .from('vendor_wallets')
        .select('wallet_number, status')
        .eq('organization_id', organizationId)
        .maybeSingle();
    return {
        wallet_number: (data as any)?.wallet_number ?? null,
        status: (data as any)?.status ?? null,
    };
}

async function shapeVendorProfile(row: any, mfaVerified: boolean | undefined) {
    const org = row?.vendor_organizations;
    const orgId = row?.vendor_organization_id ?? null;
    const wallet = orgId ? await findWalletByOwner('vendor', orgId).catch(() => null) : null;
    const legacyWallet = await legacyVendorWallet(orgId).catch(() => ({ wallet_number: null, status: null }));
    const orgStatus = org?.status ?? null;
    return {
        id: row?.id,
        vendor_organization_id: orgId,
        role: row?.role,
        full_name: row?.full_name,
        phone: row?.phone ?? org?.contact_phone ?? null,
        email: row?.email ?? org?.contact_email ?? null,
        profile_picture_url: row?.profile_picture_url ?? null,
        mfa_enrolled: row?.mfa_enrolled,
        mfa_verified: mfaVerified,
        password_reset_required: row?.password_reset_required,
        vend_credential_configured: hasVendorVendCredential(row),
        vend_credential_type: row?.vend_credential_type ?? null,
        organization_name: org?.trading_name ?? org?.legal_name,
        organization_status: orgStatus,
        vendor_code: profileCode('VND', orgId),
        site: profileSite(org?.operating_stations),
        wallet_number: walletNumber('VND', orgId, legacyWallet.wallet_number),
        wallet_status: wallet?.status ?? legacyWallet.status ?? null,
        account_status: orgStatus,
        contact_person: row?.full_name ?? null,
        primary_phone: row?.phone ?? org?.contact_phone ?? null,
        contact_email: row?.email ?? org?.contact_email ?? null,
        kyc_status: orgStatus === 'approved' || orgStatus === 'active' ? 'approved' : orgStatus,
        cac_number: org?.cac_number ?? null,
        tin: org?.tin ?? null,
        kyc_approved_date: org?.approved_at ?? null,
        kyc_expiry: null,
    };
}

const route: FastifyPluginAsync = async (fastify) => {
    // ── me ──
    fastify.get('/me', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        if (req.actor?.type !== 'vendor_user') {
            return reply.code(403).send({ error: 'forbidden', message: 'Vendor user required.' });
        }
        const actor = req.actor!;
        const { data: vu } = await adminClient
            .from('vendor_users')
            .select('id, vendor_organization_id, role, full_name, phone, email, profile_picture_url, mfa_enrolled, password_reset_required, vend_credential_type, vend_credential_hash, vend_credential_salt, vend_credential_set_at, vendor_organizations(legal_name, trading_name, status, contact_phone, contact_email, operating_stations, cac_number, tin, approved_at)')
            .eq('id', actor.actorId).single();
        return shapeVendorProfile(vu, actor.mfaVerified);
    });

    fastify.patch('/me', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'profile_picture_url')) {
            return reply.code(400).send({ error: 'profile_picture_url_forbidden', message: 'Use the verified profile-picture upload flow.' });
        }
        const schema = z.object({
            full_name: z.string().trim().min(1).max(120).optional(),
            phone: z.string().trim().min(6).max(32).optional(),
        });
        const body = schema.parse(req.body ?? {});
        const updates: Record<string, unknown> = {};
        if (body.full_name !== undefined) updates.full_name = body.full_name;
        if (body.phone !== undefined) updates.phone = body.phone;
        if (!Object.keys(updates).length) {
            return reply.code(400).send({ error: 'no_fields', message: 'Nothing to update.' });
        }
        const { data, error } = await adminClient
            .from('vendor_users')
            .update(updates)
            .eq('id', req.actor!.actorId)
            .select('id, vendor_organization_id, role, full_name, phone, email, profile_picture_url, mfa_enrolled, password_reset_required, vend_credential_type, vend_credential_set_at, vendor_organizations(legal_name, trading_name, status, contact_phone, contact_email, operating_stations, cac_number, tin, approved_at)')
            .single();
        if (error) return reply.code(500).send({ error: 'update_failed', message: error.message });
        return shapeVendorProfile(data, req.actor?.mfaVerified);
    });

    fastify.post('/profile-picture/upload-url', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        let sop;
        try {
            sop = assertProfilePictureSop(req.body ?? {});
        } catch (error: any) {
            return reply.code(400).send({ error: 'invalid_profile_picture', message: error?.message ?? 'Invalid upload payload.' });
        }
        const path = toProfilePicturePath('vendor', req.actor!.actorId, sop.file_name);
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

    fastify.post('/profile-picture/scan', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const schema = z.object({
            file_name: z.string().min(1).max(160),
            content_base64: z.string().min(8),
        });
        const body = schema.parse(req.body ?? {});
        const scan = await runMalwareScan(Buffer.from(body.content_base64, 'base64'), body.file_name);
        if (!scan.ok) return reply.code(422).send({ error: 'malware_scan_failed', details: scan.output ?? null });
        return { ok: true, mode: scan.mode };
    });

    fastify.delete('/profile-picture', { preHandler: fastify.requireVendor() }, async (req) => {
        const actorId = req.actor!.actorId;
        await adminClient.from('vendor_users').update({ profile_picture_url: null }).eq('id', actorId);
        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'vendor_user',
            action: 'vendor.profile_picture.deleted',
            targetType: 'vendor_user',
            targetId: actorId,
        });
        return { ok: true };
    });

    // Fired once by the vendor app's `appinstalled` event. Best-effort —
    // reuses the existing audit log rather than a dedicated table.
    fastify.post('/pwa-installed', { preHandler: fastify.requireVendor() }, async (req) => {
        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'vendor_user',
            action: 'pwa.installed',
            targetType: 'vendor_user',
            targetId: req.actor!.actorId,
        });
        return { ok: true };
    });

    fastify.post('/profile-picture/activate', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const { path } = z.object({ path: z.string().min(1).max(500) }).parse(req.body ?? {});
        try {
            const profilePictureUrl = await activateProfilePicture('vendor', req.actor!.actorId, path);
            await adminClient.from('vendor_users').update({ profile_picture_url: profilePictureUrl }).eq('id', req.actor!.actorId);
            return { profile_picture_url: profilePictureUrl };
        } catch (error) {
            return reply.code(422).send({ error: 'profile_picture_activation_failed' });
        }
    });

    fastify.get('/notifications', { preHandler: fastify.requireVendor() }, async (req) => {
        const query = z.object({
            limit: z.coerce.number().int().min(1).max(50).optional(),
            cursor: z.string().optional(),
        }).parse(req.query);
        const limit = query.limit ?? 20;
        const { data: vendorUser } = await adminClient
            .from('vendor_users')
            .select('vendor_organization_id')
            .eq('id', req.actor!.actorId)
            .maybeSingle();
        const orgId = (vendorUser as any)?.vendor_organization_id;
        if (!orgId) return { notifications: [], nextCursor: null, unreadCount: 0 };
        const vendorRecipientScope = `vendor_organization_id.eq.${orgId},and(recipient_type.eq.vendor,recipient_id.eq.${orgId})`;

        let inbox = adminClient
            .from('notifications')
            .select('id, type, title, body, metadata, read, created_at')
            .or(vendorRecipientScope)
            .order('created_at', { ascending: false })
            .limit(limit + 1);
        if (query.cursor) inbox = inbox.lt('created_at', query.cursor);
        const { data, error } = await inbox;
        if (error) throw error;
        const deliveryQuery = adminClient
            .from('admin_announcement_deliveries')
            .select('id, notification_id, created_at, admin_announcements(id, title, body, audience, created_at)')
            .eq('recipient_type', 'vendor')
            .eq('recipient_id', orgId)
            .order('created_at', { ascending: false })
            .limit(limit + 1);
        if (query.cursor) deliveryQuery.lt('created_at', query.cursor);
        const { data: deliveryRows } = await deliveryQuery;
        const syntheticRows = (deliveryRows ?? []).map((row: any) => {
            const announcement = Array.isArray(row.admin_announcements) ? row.admin_announcements[0] : row.admin_announcements;
            return {
                id: row.notification_id ?? row.id,
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
            .slice(0, limit + 1);
        const nextCursor = rows.length > limit ? rows[limit - 1]?.created_at ?? null : null;
        const { count } = await adminClient
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .or(vendorRecipientScope)
            .eq('read', false);
        return { notifications: rows.slice(0, limit), nextCursor, unreadCount: count ?? 0 };
    });

    fastify.post('/notifications/read-all', { preHandler: fastify.requireVendor() }, async (req) => {
        const { data: vendorUser } = await adminClient
            .from('vendor_users')
            .select('vendor_organization_id')
            .eq('id', req.actor!.actorId)
            .maybeSingle();
        const orgId = (vendorUser as any)?.vendor_organization_id;
        if (!orgId) return { ok: true };
        await adminClient
            .from('notifications')
            .update({ read: true })
            .or(`vendor_organization_id.eq.${orgId},and(recipient_type.eq.vendor,recipient_id.eq.${orgId})`)
            .eq('read', false);
        return { ok: true };
    });

    fastify.patch('/notifications/:id/read', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
        const { data: vendorUser } = await adminClient
            .from('vendor_users')
            .select('vendor_organization_id')
            .eq('id', req.actor!.actorId)
            .maybeSingle();
        const orgId = (vendorUser as any)?.vendor_organization_id;
        if (!orgId) return reply.code(404).send({ error: 'not_found' });
        await adminClient
            .from('notifications')
            .update({ read: true })
            .eq('id', id)
            .or(`vendor_organization_id.eq.${orgId},and(recipient_type.eq.vendor,recipient_id.eq.${orgId})`);
        return { ok: true };
    });

    fastify.get('/vend-credential/status', { preHandler: fastify.requireVendor({ requireMfa: false }) }, async (req) => {
        return vendorVendCredentialStatus(req.actor!.actorId);
    });

    fastify.post('/vend-credential', { preHandler: fastify.requireVendor({ requireMfa: false }) }, async (req, reply) => {
        const actor = req.actor!;
        if (!assertVendorEmailVerified(actor, reply)) return reply;
        const schema = z.object({
              type: z.literal('pin'),
              credential: z.string().regex(/^\d{4}$/),
        });
        const body = schema.parse(req.body);
        try {
            const result = await setVendorVendCredential({
                vendorUserId: actor.actorId,
                authUserId: actor.userId,
                type: body.type,
                credential: body.credential,
                ip: req.ip,
                userAgent: req.headers['user-agent'] as string | undefined,
            });
            return result;
        } catch (error) {
            return sendVendCredentialError(reply, error);
        }
    });

    // ── MFA / 2FA ──
    fastify.get('/mfa/status', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = vendorActorOrReply(req, reply);
        if (!actor) return undefined;
        return vendorMfaStatus(actor.actorId, actor.userId, bearerToken(req));
    });

    fastify.post('/mfa/setup/start', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = vendorActorOrReply(req, reply);
        if (!actor) return undefined;
        try {
            return await beginVendorMfaEnrollment(actor);
        } catch (error) {
            return sendMfaError(reply, error);
        }
    });

    fastify.post('/mfa/setup/verify', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = vendorActorOrReply(req, reply);
        if (!actor) return undefined;
        const schema = z.object({ code: z.string().min(6).max(24) });
        const { code } = schema.parse(req.body);
        try {
            return await verifyVendorMfaEnrollment(actor, bearerToken(req), code, mfaMeta(req));
        } catch (error) {
            return sendMfaError(reply, error);
        }
    });

    fastify.post('/mfa/setup/reset', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = vendorActorOrReply(req, reply);
        if (!actor) return undefined;
        const schema = z.object({ code: z.string().min(6).max(24) });
        const { code } = schema.parse(req.body);
        try {
            return await beginVendorMfaReplacement(actor, code, mfaMeta(req));
        } catch (error) {
            return sendMfaError(reply, error);
        }
    });

    fastify.post('/mfa/challenge/verify', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = vendorActorOrReply(req, reply);
        if (!actor) return undefined;
        const schema = z.object({ code: z.string().min(6).max(24) });
        const { code } = schema.parse(req.body);
        try {
            return await verifyVendorMfaChallenge(actor, bearerToken(req), code, mfaMeta(req));
        } catch (error) {
            return sendMfaError(reply, error);
        }
    });

    fastify.post('/mfa/recovery/regenerate', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = vendorActorOrReply(req, reply);
        if (!actor) return undefined;
        const schema = z.object({ code: z.string().min(6).max(24) });
        const { code } = schema.parse(req.body);
        try {
            return await regenerateVendorRecoveryCodes(actor, code, mfaMeta(req));
        } catch (error) {
            return sendMfaError(reply, error);
        }
    });

    fastify.post('/mfa/disable', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = vendorActorOrReply(req, reply);
        if (!actor) return undefined;
        const schema = z.object({ code: z.string().min(6).max(24) });
        const { code } = schema.parse(req.body);
        try {
            return await disableVendorMfa(actor, code, mfaMeta(req));
        } catch (error) {
            return sendMfaError(reply, error);
        }
    });

    // ── email + password login (unauthenticated) ───────────────────────────
    // Backend-mediated so the vendor SPA does not need Supabase keys at build
    // time. Performs the Supabase password grant, verifies the vendor account,
    // and returns the access token plus the canonical vendor profile.
    fastify.post('/auth/email/login', async (req, reply) => {
        const schema = z.object({
            email:    z.string().trim().min(3).max(200),
            password: z.string().min(1).max(200),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body ?? {}); }
        catch { return reply.code(400).send({ error: 'missing_fields', message: 'Email and password are required.' }); }
        const email = body.email.trim().toLowerCase();

        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
            return reply.code(503).send({ error: 'auth_not_configured', message: 'Authentication is not configured. Contact support.' });
        }

        let tokRes: Response;
        try {
            tokRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: process.env.SUPABASE_ANON_KEY },
                body: JSON.stringify({ email, password: body.password }),
            });
        } catch {
            return reply.code(503).send({ error: 'auth_upstream_unreachable', message: 'Authentication service is temporarily unavailable. Try again shortly.' });
        }
        const tokData = await tokRes.json().catch(() => ({})) as { access_token?: string; user?: { id?: string } };
        if (!tokRes.ok || !tokData.access_token || !tokData.user?.id) {
            return reply.code(401).send({ error: 'invalid_credentials', message: 'Invalid email or password.' });
        }
        const accessToken = tokData.access_token;
        const userId = tokData.user.id;

        const { data: vu } = await adminClient
            .from('vendor_users')
            .select('id, vendor_organization_id, role, full_name, phone, email, profile_picture_url, mfa_enrolled, password_reset_required, vend_credential_type, vend_credential_set_at, status, vendor_organizations(legal_name, trading_name, status)')
            .eq('auth_user_id', userId)
            .maybeSingle();
        if (!vu) {
            return reply.code(403).send({ error: 'not_vendor', message: 'This account is not linked to a vendor.' });
        }
        if ((vu as any).status !== 'active') {
            return reply.code(403).send({ error: 'account_inactive', message: 'This vendor account is not active.' });
        }
        const org = (vu as any).vendor_organizations;
        if (org?.status !== 'approved') {
            return reply.code(403).send({ error: 'org_not_approved', message: 'Your vendor organization is not approved yet.' });
        }

        const mfaEnrolled = (vu as any).mfa_enrolled === true;
        const mfaVerified = mfaEnrolled ? await vendorMfaSessionVerified(userId, accessToken) : true;

        await logAction({
            actorUserId: userId,
            actorType: 'vendor_user',
            action: 'vendor.email_login',
            targetType: 'vendor_user',
            targetId: (vu as any).id,
            after: { email },
        }).catch(() => undefined);

        return {
            access_token: accessToken,
            vendor: {
                id: (vu as any).id,
                vendor_organization_id: (vu as any).vendor_organization_id,
                role: (vu as any).role,
                full_name: (vu as any).full_name,
                phone: (vu as any).phone,
                email: (vu as any).email,
                profile_picture_url: (vu as any).profile_picture_url ?? null,
                mfa_enrolled: mfaEnrolled,
                mfa_verified: mfaVerified,
                password_reset_required: (vu as any).password_reset_required,
                vend_credential_configured: Boolean((vu as any).vend_credential_set_at),
                vend_credential_type: (vu as any).vend_credential_type ?? null,
                organization_name: org?.trading_name ?? org?.legal_name,
                organization_status: org?.status,
            },
        };
    });

    // ── password reset (self-service, unauthenticated) ──────────────────────
    fastify.post('/auth/reset-request', {
        config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    }, async (req, reply) => {
        const { email } = z.object({
            email: z.string().trim().email().max(320),
        }).parse(req.body);
        try {
            await requestPasswordReset(email.toLowerCase(), 'vendor_user');
            await logSecurityEvent('password_reset_requested', {
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                metadata: { userType: 'vendor_user' },
            });
            return { ok: true };
        } catch (error) {
            const code = error instanceof PasswordResetError
                ? error.code
                : 'password_reset_request_failed';
            await logSecurityEvent('password_reset_failed', {
                severity: 'high',
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                metadata: { userType: 'vendor_user', code },
            });
            return reply.code(503).send({
                error: 'password_reset_unavailable',
                message: 'Password reset is temporarily unavailable. Please try again shortly.',
            });
        }
    });

    fastify.post('/auth/reset-confirm', {
        config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    }, async (req, reply) => {
        const { token, new_password } = z.object({
            token: z.string().regex(/^[a-f0-9]{64}$/i),
            new_password: z.string().min(12).max(128),
        }).parse(req.body);
        try {
            await confirmPasswordReset(token, new_password, 'vendor_user');
            await logSecurityEvent('password_reset_completed', {
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                metadata: { userType: 'vendor_user' },
            });
            return { ok: true };
        } catch (e: any) {
            if (e instanceof PasswordResetError) {
                await logSecurityEvent('password_reset_failed', {
                    severity: 'medium',
                    ip: req.ip,
                    userAgent: req.headers['user-agent'],
                    metadata: { userType: 'vendor_user', code: e.code },
                });
                const status = e.code === 'invalid_token' || e.code === 'token_expired' ? 400 : 422;
                return reply.code(status).send({ error: e.code, message: e.message });
            }
            throw e;
        }
    });

    // ── password change ──
    fastify.post('/password-change', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = req.actor!;
        if (actor.type !== 'vendor_user') {
            return reply.code(403).send({ error: 'forbidden', message: 'Vendor user only.' });
        }
        const schema = z.object({
            current: z.string().min(1, 'Current password required.'),
            next:    z.string().min(12, 'New password must be at least 12 characters.'),
        });
        const { current, next } = schema.parse(req.body);

        if (current === next) {
            return reply.code(400).send({
                error: 'same_password',
                message: 'New password must be different from the current one.',
            });
        }

        const wasTempPassword = actor.passwordResetRequired === true;

        // Verify current password by re-authenticating
        if (!actor.email) {
            return reply.code(400).send({ error: 'no_email', message: 'Account has no email.' });
        }
        const verifyRes = await fetch(
            `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': process.env.SUPABASE_ANON_KEY ?? '',
                },
                body: JSON.stringify({ email: actor.email, password: current }),
            },
        );
        if (!verifyRes.ok) {
            await logSecurityEvent('mfa_failure', {
                actorUserId: actor.userId,
                severity: 'medium',
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                metadata: { reason: 'current_password_invalid_on_change' },
            });
            return reply.code(400).send({
                error: 'invalid_current_password',
                message: 'Current password is incorrect.',
            });
        }

        // Update via service role
        const { error: authErr } = await adminClient.auth.admin.updateUserById(actor.userId, {
            password: next,
        });
        if (authErr) return reply.code(400).send({ error: 'password_update_failed', message: authErr.message });

        await adminClient.from('vendor_users')
            .update({ password_reset_required: false })
            .eq('id', actor.actorId);

        await logSecurityEvent('password_change', {
            actorUserId: actor.userId,
            severity: 'info',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            metadata: { was_temp_password: wasTempPassword },
        });
        if (wasTempPassword) {
            await logSecurityEvent('temp_password_used', {
                actorUserId: actor.userId,
                severity: 'info',
                ip: req.ip,
                userAgent: req.headers['user-agent'],
            });
        }

        return { ok: true, was_temp_password: wasTempPassword };
    });

    // ── wallet summary ──
    fastify.get('/wallet', { preHandler: fastify.requireVendor() }, async (req) => {
        const orgId = req.actor!.vendorOrganizationId!;
        const wallet = await getOrCreateWallet('vendor', orgId, { dailyCapMinor: 500_000_000 });
        const balance = await getBalance(wallet.id);
        let activity = { todayVendedMinor: 0, todayVendedCount: 0, todayFundedMinor: 0, totalFundedMinor: 0, totalReversedMinor: 0 };
        try {
            activity = await getActivitySummary(wallet.id);
        } catch (err) {
            req.log.warn({ err, walletId: wallet.id }, 'failed to load wallet activity summary');
        }
        return {
            wallet_id: wallet.id,
            currency: wallet.currency,
            status: wallet.status,
            balance_minor: balance.ledgerBalanceMinor,
            holds_minor: balance.activeHoldsMinor,
            available_minor: balance.availableMinor,
            daily_cap_minor: wallet.daily_debit_cap_minor,
            activity: {
                today_vended_minor: activity.todayVendedMinor,
                today_vended_count: activity.todayVendedCount,
                today_funded_minor: activity.todayFundedMinor,
                total_funded_minor: activity.totalFundedMinor,
                total_reversed_minor: activity.totalReversedMinor,
            },
        };
    });

    // ── ledger entries ──
    fastify.get('/wallet/ledger', { preHandler: fastify.requireVendor() }, async (req) => {
        const orgId = req.actor!.vendorOrganizationId!;
        const wallet = await findWalletByOwner('vendor', orgId);
        if (!wallet) return { entries: [] };
        const q = (req.query as { limit?: string; cursor?: string });
        const entries = await getEntries(wallet.id, {
            limit: Math.min(Number(q.limit ?? 50), 200),
            cursorAt: q.cursor,
        });
        const orderIds = entries
            .filter((entry: any) => entry.reference_type === 'meter_order' && entry.reference_id)
            .map((entry: any) => entry.reference_id);
        if (!orderIds.length) return { entries };
        const [{ data: orders }, { data: organization }] = await Promise.all([
            adminClient.from('meter_purchase_orders')
                .select('id, customer_id, customer_name_snapshot, meter_type, property_category, property_address, service_area, contact_phone, amount_minor, status, sponsor_mode, created_by_actor_id, created_at, rejection_reason, rejection_refund_destination, rejected_at, customers(full_name, phone, email)')
                .eq('vendor_organization_id', orgId)
                .in('id', orderIds),
            adminClient.from('vendor_organizations').select('legal_name, trading_name').eq('id', orgId).maybeSingle(),
        ]);
        const actorIds = Array.from(new Set((orders ?? []).map((order: any) => order.created_by_actor_id).filter(Boolean)));
        const { data: actors } = actorIds.length
            ? await adminClient.from('vendor_users').select('auth_user_id, full_name, email, phone').in('auth_user_id', actorIds)
            : { data: [] as any[] };
        const actorMap = new Map((actors ?? []).map((actor: any) => [actor.auth_user_id, actor]));
        const orderMap = new Map((orders ?? []).map((order: any) => [order.id, order]));
        return { entries: entries.map((entry: any) => {
            const order: any = entry.reference_type === 'meter_order' ? orderMap.get(entry.reference_id) : null;
            if (!order) return entry;
            const actor: any = actorMap.get(order.created_by_actor_id);
            const customer: any = Array.isArray(order.customers) ? order.customers[0] : order.customers;
            return { ...entry, meter_order: {
                id: order.id,
                ordered_by_name: actor?.full_name ?? 'Vendor operator',
                ordered_by_email: actor?.email ?? null,
                vendor_name: organization?.trading_name ?? organization?.legal_name ?? 'Vendor',
                customer_id: order.customer_id,
                customer_name: customer?.full_name ?? order.customer_name_snapshot,
                customer_phone: customer?.phone ?? order.contact_phone,
                customer_email: customer?.email ?? null,
                meter_type: order.meter_type,
                property_category: order.property_category,
                property_address: order.property_address,
                service_area: order.service_area,
                contact_phone: order.contact_phone,
                status: order.status,
                sponsor_mode: order.sponsor_mode,
                created_at: order.created_at,
                rejection_reason: order.rejection_reason,
                rejection_refund_destination: order.rejection_refund_destination,
                rejected_at: order.rejected_at,
            } };
        }) };
    });

    fastify.get('/customers', { preHandler: fastify.requireVendor() }, async (req) => {
        const { q, limit } = z.object({
            q: z.string().optional(),
            limit: z.coerce.number().int().min(1).max(50).optional(),
        }).parse(req.query);
        const pageSize = limit ?? 20;
        const { data: walletRows, error: walletErr } = await adminClient
            .from('wallets')
            .select('owner_id')
            .eq('owner_type', 'customer');
        if (walletErr) return { customers: [] };
        const customerIds = Array.from(new Set((walletRows ?? []).map((row: any) => row.owner_id).filter(Boolean)));
        if (!customerIds.length) return { customers: [] };
        let query = adminClient
            .from('customers')
            .select('id, full_name, phone, email, status')
            .in('id', customerIds)
            .order('created_at', { ascending: false })
            .limit(pageSize);
        if (q?.trim()) {
            const safeQ = q.trim().replace(/[(),]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
            query = query.or(`full_name.ilike.%${safeQ}%,phone.ilike.%${safeQ}%,email.ilike.%${safeQ}%`);
        }
        const { data, error } = await query;
        if (error) return { customers: [] };
        return { customers: data ?? [] };
    });

    fastify.get('/meter-pricing', { preHandler: fastify.requireVendor() }, async () => {
        return getMeterPrices();
    });

    fastify.post('/meter-orders', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const body = z.object({
            customer_id: z.string().uuid(),
            meter_type: z.enum(['single_phase', 'three_phase']),
            property_category: z.enum(['residential', 'commercial']).optional(),
            property_address: z.string().trim().min(5).max(240),
            service_area: z.string().trim().min(2).max(120),
            contact_phone: z.string().trim().min(8).max(32),
        }).parse(req.body ?? {});
        const idempotencyKey = requireIdempotencyKey(req, reply);
        if (!idempotencyKey) return reply;
        try {
            const order = await createVendorSponsoredMeterOrder({
                vendorOrganizationId: req.actor!.vendorOrganizationId!,
                actorUserId: req.actor!.userId,
                actorType: 'vendor_user',
                customerId: body.customer_id,
                meterType: body.meter_type,
                propertyCategory: body.property_category,
                propertyAddress: body.property_address,
                serviceArea: body.service_area,
                contactPhone: body.contact_phone,
                idempotencyKey,
            });
            await logAction({
                actorUserId: req.actor!.userId,
                actorType: 'vendor_user',
                action: 'meter_order.created',
                targetType: 'meter_order',
                targetId: order.id,
                metadata: {
                    meter_type: body.meter_type,
                    property_category: body.property_category ?? 'residential',
                    source_channel: 'vendor_portal',
                    customer_id: body.customer_id,
                },
            });
            return { order };
        } catch (error: any) {
            return reply.code(error?.status ?? 422).send({
                error: error?.code ?? 'meter_order_create_failed',
                message: error?.message ?? 'Could not create meter order.',
            });
        }
    });

    fastify.get('/meter-orders', { preHandler: fastify.requireVendor() }, async (req) => {
        const { status, q, limit } = z.object({
            status: z.string().optional(),
            q: z.string().optional(),
            limit: z.coerce.number().int().min(1).max(100).optional(),
        }).parse(req.query);
        const pageSize = limit ?? 50;
        let query = adminClient
            .from('meter_purchase_orders')
            .select('*, customers(full_name, phone, email)')
            .eq('vendor_organization_id', req.actor!.vendorOrganizationId!)
            .order('created_at', { ascending: false })
            .limit(pageSize);
        if (status) query = query.eq('status', status);
        if (q?.trim()) {
            const safeQ = q.trim().replace(/[(),]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
            query = query.or(`property_address.ilike.%${safeQ}%,service_area.ilike.%${safeQ}%,contact_phone.ilike.%${safeQ}%,customer_name_snapshot.ilike.%${safeQ}%`);
        }
        const { data } = await query;
        return { orders: (data ?? []).map((order: any) => ({
            ...order,
            cancellation_eligible: vendorMeterOrderCancellationEligibility(order).eligible,
            cancellation_deadline: vendorMeterOrderCancellationEligibility(order).deadline,
            cancellation_ineligible_reason: vendorMeterOrderCancellationEligibility(order).reason,
        })) };
    });

    fastify.post('/meter-orders/:id/cancel', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
        const { reason } = z.object({ reason: z.string().trim().min(5).max(500) }).parse(req.body);
        try {
            const order = await cancelVendorMeterOrder({
                orderId: id,
                vendorOrganizationId: req.actor!.vendorOrganizationId!,
                actorUserId: req.actor!.userId,
                reason,
            });
            return { order };
        } catch (error: any) {
            return reply.code(error?.status ?? 422).send({ error: error?.code ?? 'meter_order_cancellation_failed', message: error?.message });
        }
    });

    fastify.get('/meter-orders/:id', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
        const { data, error } = await adminClient
            .from('meter_purchase_orders')
            .select('*, customers(full_name, phone, email)')
            .eq('id', id)
            .eq('vendor_organization_id', req.actor!.vendorOrganizationId!)
            .maybeSingle();
        if (error || !data) return reply.code(404).send({ error: 'not_found', message: 'Meter order not found.' });
        return data;
    });

    // ── funding: initiate Paystack ──
    fastify.post('/funding/paystack', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        if (!env.PAYSTACK_PAYMENTS_ENABLED) {
            return reply.code(503).send({
                error: 'paystack_temporarily_unavailable',
                message: 'Paystack is temporarily unavailable. Kindly use bank transfer.',
            });
        }
        const orgId = req.actor!.vendorOrganizationId!;
        const idempotencyKey = requireIdempotencyKey(req, reply);
        if (!idempotencyKey) return;
        const schema = z.object({
            amountMinor: z.number().int().min(50_000).max(1_000_000_000),
        });
        const body = schema.parse(req.body);
        const scope = `vendor.funding.paystack.${orgId}`;
        const fingerprint = hashIdempotency([orgId, body.amountMinor]);
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
            const email = req.actor!.email?.trim() ?? '';
            const result = await initiatePaystackFunding({
                vendorOrganizationId: orgId,
                amountMinor: body.amountMinor,
                submittedBy: req.actor!.userId,
                email,
                callbackUrl: resolveFundingCallbackUrl(
                    'vendor', env.VENDOR_FUNDING_CALLBACK_URL, env.VENDOR_PORTAL_URL,
                ),
            });
            await completeWalletIdempotency(scope, idempotencyKey, result).catch((error) => {
                req.log.error({ error, scope }, 'Paystack initialization idempotency completion failed');
            });
            return result;
        } catch (e: any) {
            await abandonWalletIdempotency(scope, idempotencyKey, fingerprint).catch(() => undefined);
            if (e instanceof FundingError) {
                return reply.code(['wallet_inactive', 'wallet_frozen', 'wallet_closed'].includes(e.code) ? 403 : 422)
                    .send({ error: e.code, message: e.message });
            }
            throw e;
        }
    });

    // ── funding: bank transfer proof ──
    fastify.post('/payments/:reference/verify', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const { reference } = z.object({
            reference: z.string().min(1).max(100).regex(/^[A-Za-z0-9.=-]+$/),
        }).parse(req.params);
        const result = await verifyOwnedPaystackPayment({
            reference,
            actorType: 'vendor',
            actorId: req.actor!.vendorOrganizationId!,
        });
        if (!result) return reply.code(404).send({ error: 'payment_not_found', message: 'Payment was not found.' });
        return result;
    });

    fastify.post('/funding/bank-transfer', {
        preHandler: fastify.requireVendor(),
        bodyLimit: 12 * 1024 * 1024,
    }, async (req, reply) => {
        const orgId = req.actor!.vendorOrganizationId!;
        const schema = z.object({
            amountMinor: z.number().int().min(100000),
            proofFileName: z.string().min(1).max(180),
            proofMimeType: z.string().min(1).max(120),
            proofBase64: z.string().min(1),
        });
        const body = schema.parse(req.body);
        try {
            const proof = await uploadBankFundingProof({
                vendorOrganizationId: orgId,
                submittedBy: req.actor!.userId,
                fileName: body.proofFileName,
                mimeType: body.proofMimeType,
                base64: body.proofBase64,
            });
            return await initiateBankProofFunding({
                vendorOrganizationId: orgId,
                amountMinor: body.amountMinor,
                submittedBy: req.actor!.userId,
                proofFilePath: proof.proofFilePath,
                proofHash: proof.proofHash,
            });
        } catch (e: any) {
            if (e instanceof FundingError) {
                return reply.code(['wallet_inactive', 'wallet_frozen', 'wallet_closed'].includes(e.code) ? 403 : 422)
                    .send({ error: e.code, message: e.message });
            }
            throw e;
        }
    });

    fastify.get('/funding', { preHandler: fastify.requireVendor() }, async (req) => {
        const orgId = req.actor!.vendorOrganizationId!;
        const list = await listVendorFunding(orgId, Math.min(Number((req.query as any).limit ?? 50), 200));
        return { funding: list };
    });

    // ── vending: preview ──
    fastify.post('/vend/preview', { preHandler: fastify.requireVendor({ requireMfa: false }) }, async (req, reply) => {
        const schema = z.object({
            meterId: z.string().min(1),
            amountMinor: z.number().int().min(10000),
        });
        const body = schema.parse(req.body);
        let meter;
        try {
            assertEnergyVendReady();
            meter = await lookupMeter(body.meterId);
        } catch (e: any) {
            if (e instanceof TokenEngineError) return sendTokenEngineError(reply, e);
            return sendVendPreviewUnavailable(req, reply, 'meter_lookup', e);
        }
        try {
            assertStationVendAllowed(req.actor!.stationId, meter.stationId);
        } catch (e: any) {
            if (e instanceof StationVendScopeError) {
                const status = e.code === 'meter_station_unavailable' ? 422 : 403;
                return reply.code(status).send({ error: e.code, message: e.message });
            }
            return sendVendPreviewUnavailable(req, reply, 'meter_lookup', e);
        }
        try {
            const preview = await previewPurchaseWithPolicy(body.amountMinor, meter.tariffId);
            return { meter, preview };
        } catch (e: any) {
            if (e instanceof TokenEngineError) return sendTokenEngineError(reply, e);
            return sendVendPreviewUnavailable(req, reply, 'pricing', e);
        }
    });

    // Safe live integration planner. It resolves the meter and returns the exact
    // upstream payloads without creating wallet holds, purchase orders, tokens, or tasks.
    fastify.post('/vend/live-plan', { preHandler: fastify.requireVendor({ requireMfa: false }) }, async (req, reply) => {
        const schema = z.object({
            meterId: z.string().min(1),
            amountMinor: z.number().int().min(10000),
            mode: z.enum(['wallet', 'remote_send']).default('wallet'),
        });
        const body = schema.parse(req.body);
        try {
            const meter = await lookupMeter(body.meterId);
            assertStationVendAllowed(req.actor!.stationId, meter.stationId);
            const preview = await previewPurchaseWithPolicy(body.amountMinor, meter.tariffId);
            const reference = `DRY-RUN-${Date.now()}`;
            const tokenInput = {
                meterId: meter.meterId,
                customerId: meter.customerId,
                customerName: meter.customerName,
                stationId: meter.stationId,
                amountMinor: preview.energyAmountMinor,
                units: preview.units,
                tariffId: meter.tariffId,
                isThreePhase: meter.isThreePhase,
                reference,
            };
            const tokenPlan = buildCreditTokenPreviewPlan(tokenInput);
            return {
                liveWrite: false,
                meter,
                preview,
                tokenGeneration: {
                    ...tokenPlan,
                    payload: {
                        ...tokenPlan.payload,
                        authorizationPassword: '[REDACTED]',
                    },
                },
                remoteSend: body.mode === 'remote_send'
                    ? {
                        endpoint: '/API/RemoteMeterTask/CreateTokenTask',
                        method: 'POST',
                        liveWrite: false,
                        payload: buildRemoteTokenTaskPayload({
                            customerId: meter.customerId,
                            customerName: meter.customerName,
                            meterId: meter.meterId,
                            stationId: meter.stationId,
                            protocolVersion: meter.protocolVersion,
                            token: '0000 0000 0000 0000 0000',
                            reference,
                        }),
                    }
                    : null,
            };
        } catch (e: any) {
            if (e instanceof StationVendScopeError) {
                const status = e.code === 'meter_station_unavailable' ? 422 : 403;
                return reply.code(status).send({ error: e.code, message: e.message });
            }
            if (e instanceof TokenEngineError) {
                return sendTokenEngineError(reply, e);
            }
            throw e;
        }
    });

    // ── vending: token ──
    fastify.post('/vend', { preHandler: fastify.requireVendor({ requireMfa: false }) }, async (req, reply) => {
        const schema = z.object({
            meterId: z.string().min(1),
            amountMinor: z.number().int().min(10000),
            mode: z.enum(['wallet', 'remote_send']).default('wallet'),
            authorization: z.string().regex(/^\d{4}$/),
        });
        const body = schema.parse(req.body);
        const clientKey = requireIdempotencyKey(req, reply);
        if (!clientKey) return reply;
        try {
            assertEnergyVendReady();
        } catch (error) {
            if (error instanceof TokenEngineError) return sendTokenEngineError(reply, error);
            throw error;
        }
        try {
            await verifyVendorVendCredential({
                vendorUserId: req.actor!.actorId,
                authUserId: req.actor!.userId,
                credential: body.authorization,
                ip: req.ip,
                userAgent: req.headers['user-agent'] as string | undefined,
            });
        } catch (error) {
            return sendVendCredentialError(reply, error);
        }
        try {
            const purchase = await vendorPurchase({
                vendorOrganizationId: req.actor!.vendorOrganizationId!,
                vendorUserId: req.actor!.userId,
                vendorStationId: req.actor!.stationId ?? '',
                meterId: body.meterId,
                amountMinor: body.amountMinor,
                mode: 'wallet',
                clientIdempotencyKey: clientKey,
            });
            if (body.mode !== 'remote_send') return purchase;

            try {
                const remote = await dispatchGeneratedVendorToken(
                    req.actor!.vendorOrganizationId!,
                    req.actor!.userId,
                    purchase.purchaseOrder.id,
                );
                return {
                    ...purchase,
                    purchaseOrder: remote.purchaseOrder,
                    remoteTaskId: remote.remoteTaskId,
                    remoteSend: remote,
                };
            } catch (error) {
                if (error instanceof VendingError) {
                    return {
                        ...purchase,
                        remoteSend: {
                            status: 'failed' as const,
                            deliveryState: 'remote_send_failed_needs_manual_entry',
                            remark: error.message,
                            code: error.code,
                        },
                    };
                }
                req.log.error({ err: error, purchaseOrderId: purchase.purchaseOrder.id }, 'Vendor remote send failed unexpectedly');
                return {
                    ...purchase,
                    remoteSend: {
                        status: 'failed' as const,
                        deliveryState: 'remote_send_failed_needs_manual_entry',
                        remark: 'Remote delivery is temporarily unavailable. The token remains valid for manual meter entry.',
                        code: 'remote_send_service_unavailable',
                        retryable: true,
                    },
                };
            }
        } catch (error) {
            if (error instanceof VendingError) {
                const status = error.code === 'insufficient_balance' ? 402
                    : error.code === 'oem_insufficient_quota' ? 422
                    : error.code === 'wallet_missing' ? 404
                    : error.code === 'station_assignment_required' || error.code === 'cross_station_vend_forbidden' ? 403
                    : error.code === 'wallet_inactive' || error.code === 'wallet_frozen' || error.code === 'wallet_closed' ? 403
                    : 422;
                return reply.code(status).send({ error: error.code, message: error.message });
            }
            throw error;
        }
    });

    const handleRemoteSend = async (req: any, reply: any) => {
        const params = z.object({
            purchaseOrderId: z.string().uuid(),
        }).parse(req.params);
        try {
            return await dispatchGeneratedVendorToken(
                req.actor!.vendorOrganizationId!,
                req.actor!.userId,
                params.purchaseOrderId,
            );
        } catch (error) {
            if (error instanceof VendingError) {
                const status = error.code === 'purchase_not_found' ? 404
                    : error.code === 'token_missing' || error.code === 'purchase_not_delivered' ? 409
                    : 422;
                return reply.code(status).send({
                    error: error.code,
                    message: error.message,
                    status: 'failed',
                    deliveryState: 'remote_send_failed_needs_manual_entry',
                    delivery_state: 'remote_send_failed_needs_manual_entry',
                    remark: error.message,
                });
            }
            return sendRemoteSendUnavailable(req, reply, error);
        }
    };

    fastify.post('/vend/:purchaseOrderId/remote-send', { preHandler: fastify.requireVendor({ requireMfa: false }) }, handleRemoteSend);
    fastify.get('/vend/:purchaseOrderId/remote-send', { preHandler: fastify.requireVendor({ requireMfa: false }) }, handleRemoteSend);

    // ── purchases history ──
    fastify.get('/transactions', { preHandler: fastify.requireVendor() }, async (req) => {
        const orgId = req.actor!.vendorOrganizationId!;
        const query = z.object({
            limit: z.coerce.number().int().min(1).max(500).default(100),
            offset: z.coerce.number().int().min(0).default(0),
            period: z.enum(['1d', '7d', '30d', 'all']).default('all'),
        }).parse(req.query);
        const days = query.period === 'all' ? null : Number(query.period.slice(0, -1));
        const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined;
        const purchases = await listVendorPurchases(orgId, query.limit, query.offset, since);
        return { purchases, has_more: purchases.length === query.limit };
    });

    // ── single receipt ──
    fastify.get('/receipts', { preHandler: fastify.requireVendor() }, async (req) => {
        const orgId = req.actor!.vendorOrganizationId!;
        const { limit } = z.object({
            limit: z.coerce.number().int().min(1).max(500).default(100),
        }).parse(req.query);
        const { data: withReceipts, error: purchaseError } = await adminClient
            .from('purchase_orders')
            .select('*')
            .eq('actor_type', 'vendor')
            .eq('actor_id', orgId)
            .eq('status', 'delivered')
            .not('receipt_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (purchaseError) throw purchaseError;
        if (!withReceipts.length) return { receipts: [] };
        const { data: receipts, error: receiptError } = await adminClient
            .from('receipts')
            .select('id, receipt_number, purchase_order_id, payload, created_at')
            .in('purchase_order_id', withReceipts.map((p: any) => p.id));
        if (receiptError) throw receiptError;
        const receiptByOrder = new Map((receipts ?? []).map((r: any) => [r.purchase_order_id, r]));
        return {
            receipts: withReceipts.map((purchase: any) => {
                const receipt: any = receiptByOrder.get(purchase.id);
                const payload = receipt?.payload ?? {};
                return {
                    id: receipt?.id ?? purchase.receipt_id,
                    receipt_number: receipt?.receipt_number ?? payload.receiptNumber ?? purchase.id,
                    purchase_order_id: purchase.id,
                    customer_name: purchase.customer_name ?? null,
                    customer_phone: purchase.customer_phone ?? null,
                    meter_id: purchase.meter_id,
                    meter_type: purchase.meter_type ?? payload.meterType ?? null,
                    amount_minor: purchase.amount_minor,
                    gross_amount_minor: purchase.amount_minor,
                    energy_amount_minor: purchase.energy_amount_minor ?? payload.energyAmountMinor ?? null,
                    vat_amount_minor: purchase.vat_amount_minor ?? payload.vatAmountMinor ?? null,
                    vat_rate_basis_points: purchase.vat_rate_basis_points ?? payload.vatRateBasisPoints ?? null,
                    units_kwh: purchase.units_kwh,
                    token: purchase.token,
                    status: purchase.status,
                    created_at: receipt?.created_at ?? purchase.created_at,
                };
            }),
        };
    });

    fastify.get('/receipts/:orderId', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const orderId = (req.params as { orderId: string }).orderId;
        const orgId = req.actor!.vendorOrganizationId!;
        const { data: po } = await adminClient
            .from('purchase_orders')
            .select('id, actor_type, actor_id')
            .eq('id', orderId).maybeSingle();
        if (!po || (po as any).actor_type !== 'vendor' || (po as any).actor_id !== orgId) {
            return reply.code(404).send({ error: 'not_found', message: 'Receipt not found.' });
        }
        const receipt = await getReceiptByOrder(orderId);
        if (!receipt) return reply.code(404).send({ error: 'not_found', message: 'Receipt not generated yet.' });
        return receipt;
    });

    // ── logout ──
    fastify.post('/logout', { preHandler: fastify.requireAuth() }, async (req) => {
        await revokePortalSession(req.portalSessionKey);
        await logSecurityEvent('logout', {
            actorUserId: req.actor!.userId,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
        });
        return { ok: true };
    });

    // ── disputes ──
    fastify.post('/disputes', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const schema = z.object({
            purchase_order_id: z.string().uuid().optional(),
            subject:           z.string().min(5),
            description:       z.string().min(10),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }

        const actor = req.actor!;
        const { data: vu } = await adminClient
            .from('vendor_users')
            .select('vendor_organization_id')
            .eq('id', actor.actorId)
            .single();
        if (!vu) return reply.code(403).send({ error: 'vendor_not_found' });

        try {
            const id = await raiseDispute({
                raisedByActorType:   'vendor',
                raisedByActorId:     actor.actorId,
                vendorOrganizationId: (vu as any).vendor_organization_id,
                purchaseOrderId:     body.purchase_order_id,
                subject:             body.subject,
                description:         body.description,
            });
            return { id };
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'dispute_error', message: e.message });
        }
    });

    fastify.get('/disputes', { preHandler: fastify.requireVendor() }, async (req) => {
        const actor = req.actor!;
        const { status } = req.query as { status?: string };
        const { data: vu2 } = await adminClient
            .from('vendor_users')
            .select('vendor_organization_id')
            .eq('id', actor.actorId)
            .single();
        const orgId = (vu2 as any)?.vendor_organization_id;
        return { disputes: await listDisputes({ vendorOrganizationId: orgId, status, limit: 100 }) };
    });

    fastify.get('/disputes/:id', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const d = await getDispute(id);
        if (!d) return reply.code(404).send({ error: 'not_found' });
        return d;
    });

    fastify.post('/disputes/:id/messages', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({ body: z.string().min(1) });
        let parsed: z.infer<typeof schema>;
        try { parsed = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }

        const actor = req.actor!;
        try {
            await addMessage({ disputeId: id, senderActorType: 'vendor', senderActorId: actor.actorId, body: parsed.body });
            return { ok: true };
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'message_error', message: e.message });
        }
    });

    // ── Support tickets ───────────────────────────────────────────────────
    async function vendorContext(actorId: string, fallbackOrgId?: string | null): Promise<{ orgId?: string; name?: string }> {
        const { data } = await adminClient
            .from('vendor_users')
            .select('vendor_organization_id, full_name, vendor_organizations(trading_name, legal_name)')
            .eq('id', actorId)
            .maybeSingle();
        if (!data) return { orgId: fallbackOrgId ?? undefined };
        const org = (data as any).vendor_organizations;
        return {
            orgId: (data as any).vendor_organization_id ?? fallbackOrgId ?? undefined,
            name: org?.trading_name ?? org?.legal_name ?? (data as any).full_name ?? undefined,
        };
    }

    fastify.post('/support/tickets', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const schema = z.object({
            subject:     z.string().min(5).max(200),
            description: z.string().min(10).max(4000),
            category:    z.string().max(60).optional(),
            priority:    z.enum(['low', 'normal', 'high', 'urgent']).optional(),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }

        const actor = req.actor!;
        const ctx = await vendorContext(actor.actorId, actor.vendorOrganizationId);
        if (!ctx.orgId) return reply.code(403).send({ error: 'vendor_organization_required' });
        return createTicket({
            requesterActorType:   'vendor',
            requesterActorId:     actor.actorId,
            requesterName:        ctx.name,
            vendorOrganizationId: ctx.orgId,
            category:             body.category,
            subject:              body.subject,
            description:          body.description,
            priority:             body.priority,
        });
    });

    fastify.get('/support/tickets', { preHandler: fastify.requireVendor() }, async (req) => {
        const { status } = req.query as { status?: string };
        const ctx = await vendorContext(req.actor!.actorId, req.actor!.vendorOrganizationId);
        if (!ctx.orgId) return { tickets: [] };
        return { tickets: await listTickets({ vendorOrganizationId: ctx.orgId, status, limit: 100 }) };
    });

    fastify.get('/support/tickets/:id', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const ctx = await vendorContext(req.actor!.actorId, req.actor!.vendorOrganizationId);
        if (!ctx.orgId) return reply.code(403).send({ error: 'vendor_organization_required' });
        const t = await getTicket(id);
        if (!t || (t as any).vendor_organization_id !== ctx.orgId) return reply.code(404).send({ error: 'not_found' });
        if ((t as any).support_ticket_messages) {
            (t as any).support_ticket_messages = (t as any).support_ticket_messages.filter((m: any) => !m.is_internal);
        }
        return t;
    });

    fastify.post('/support/tickets/:id/messages', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const { body: msgBody } = z.object({ body: z.string().min(1).max(4000) }).parse(req.body);
        const ctx = await vendorContext(req.actor!.actorId, req.actor!.vendorOrganizationId);
        if (!ctx.orgId) return reply.code(403).send({ error: 'vendor_organization_required' });
        const t = await getTicket(id);
        if (!t || (t as any).vendor_organization_id !== ctx.orgId) return reply.code(404).send({ error: 'not_found' });
        if ((t as any).status === 'closed') return reply.code(409).send({ error: 'ticket_closed', message: 'Closed tickets cannot receive new vendor replies.' });
        await addTicketMessage({
            ticketId: id, senderActorType: 'vendor', senderActorId: req.actor!.actorId,
            senderName: ctx.name, body: msgBody,
        });
        return { ok: true };
    });

    // ── Quick chat ────────────────────────────────────────────────────────
    fastify.post('/support/chat/session', { preHandler: fastify.requireVendor() }, async (req) => {
        const actor = req.actor!;
        const ctx = await vendorContext(actor.actorId, actor.vendorOrganizationId);
        const { subject } = (req.body ?? {}) as { subject?: string };
        return getOrCreateChatSession({
            requesterActorType:   'vendor',
            requesterActorId:     actor.actorId,
            displayName:          ctx.name,
            vendorOrganizationId: ctx.orgId,
            subject,
        });
    });

    fastify.get('/support/chat/:id/messages', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const { since } = req.query as { since?: string };
        const s = await getChatSession(id);
        if (!s || (s as any).requester_actor_id !== req.actor!.actorId) return reply.code(404).send({ error: 'not_found' });
        const messages = await getChatMessages(id, { since, viewer: 'user' });
        return { session: s, messages };
    });

    fastify.post('/support/chat/:id/messages', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const { body: msgBody } = z.object({ body: z.string().min(1).max(2000) }).parse(req.body);
        const s = await getChatSession(id);
        if (!s || (s as any).requester_actor_id !== req.actor!.actorId) return reply.code(404).send({ error: 'not_found' });
        await sendChatMessage({
            sessionId: id, senderActorType: 'vendor', senderActorId: req.actor!.actorId,
            senderName: (s as any).display_name ?? undefined, body: msgBody,
        });
        return { ok: true };
    });

    fastify.post('/support/chat/:id/end', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const s = await getChatSession(id);
        if (!s || (s as any).requester_actor_id !== req.actor!.actorId) return reply.code(404).send({ error: 'not_found' });
        await endChatSession(id);
        return { ok: true };
    });

    fastify.post('/support/chat/:id/escalate', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const { subject } = z.object({ subject: z.string().min(3).max(200) }).parse(req.body);
        const s = await getChatSession(id);
        if (!s || (s as any).requester_actor_id !== req.actor!.actorId) return reply.code(404).send({ error: 'not_found' });
        const ctx = await vendorContext(req.actor!.actorId, req.actor!.vendorOrganizationId);
        if (!ctx.orgId) return reply.code(403).send({ error: 'vendor_organization_required' });
        return escalateChatToTicket({
            sessionId: id, requesterActorType: 'vendor', requesterActorId: req.actor!.actorId,
            requesterName: ctx.name, vendorOrganizationId: ctx.orgId, subject,
        });
    });

    // ── settlement ──
    fastify.get('/settlement', { preHandler: fastify.requireVendor() }, async (req) => {
        const actor = req.actor!;
        const { data: vu } = await adminClient
            .from('vendor_users')
            .select('vendor_organization_id')
            .eq('id', actor.actorId)
            .single();
        if (!vu) return { batches: [] };
        return { batches: await listSettlementBatches({ vendorOrganizationId: (vu as any).vendor_organization_id, limit: 100 }) };
    });

    // ── Consumption ─────────────────────────────────────────────────────────
    // A vendor sees their single assigned station, including meter-level detail
    // for the customers at that site. Authority comes from the actor's station,
    // never from the query string, so a vendor cannot ask for another site.

    fastify.get('/consumption', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const actor = vendorActorOrReply(req, reply);
        if (!actor) return undefined;

        const qs = req.query as Record<string, string>;
        const scope  = (qs.scope ?? 'station') as 'meter' | 'station' | 'cumulative';
        const period = (qs.period ?? 'month') as 'day' | 'week' | 'month' | 'year';

        if (!['meter', 'station', 'cumulative'].includes(scope)) {
            return reply.code(400).send({ error: 'bad_scope', message: 'scope must be meter | station | cumulative' });
        }
        if (!['day', 'week', 'month', 'year'].includes(period)) {
            return reply.code(400).send({ error: 'bad_period', message: 'period must be day | week | month | year' });
        }
        const meterId = String(qs.meter_id ?? '').trim();
        if (meterId && !/^[A-Za-z0-9_-]{3,64}$/.test(meterId)) {
            return reply.code(400).send({
                error: 'invalid_meter_id',
                message: 'Enter a valid meter number.',
            });
        }
        if (!actor.stationId) {
            return reply.code(409).send({
                error: 'no_station_assigned',
                message: 'No station is assigned to your vendor account. Contact Beverly operations.',
            });
        }

        const { queryConsumption, stationsAuthority } = await import('../services/consumption.js');
        const rows = await queryConsumption(
            {
                scope,
                // Meter drill-down stays inside the vendor's own station because
                // the authority below is ANDed with any scope_id supplied here.
                scope_id: scope === 'meter' ? (meterId || undefined) : actor.stationId,
                period_type: period,
                from: qs.from ?? undefined,
                to: qs.to ?? undefined,
                limit: Math.min(Number(qs.limit ?? 120), 500),
                withSpend: qs.spend === 'true',
            },
            stationsAuthority([actor.stationId]),
        );
        return { rows, count: rows.length, stationId: actor.stationId };
    });
};

export default route;
