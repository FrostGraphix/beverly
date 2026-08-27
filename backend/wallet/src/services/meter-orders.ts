import { adminClient } from '../db/supabase.js';
import { initializeTransaction } from '../adapters/paystack.js';
import { postEntry, LedgerError } from './ledger.js';
import { findWalletByOwner, assertWalletCanTransact } from './wallets.js';
import {
    abandonWalletIdempotency,
    claimWalletIdempotency,
    completeWalletIdempotency,
    hashIdempotency,
    ledgerKey,
} from './idempotency.js';

export type MeterOrderStatus =
    | 'pending_payment'
    | 'paid'
    | 'assigned'
    | 'dispatched'
    | 'installed'
    | 'cancelled'
    | 'rejected';

export type MeterOrderSourceChannel = 'customer_portal' | 'vendor_portal' | 'admin_portal';
export type MeterOrderActorType = 'customer' | 'vendor_user' | 'staff';
export type MeterOrderType = 'single_phase' | 'three_phase';
export type PropertyCategory = 'residential' | 'commercial';

const METER_ORDER_TRANSITIONS: Record<MeterOrderStatus, MeterOrderStatus[]> = {
    pending_payment: ['paid', 'cancelled', 'rejected'],
    paid: ['assigned', 'cancelled', 'rejected'],
    assigned: ['dispatched', 'cancelled'],
    dispatched: ['installed'],
    installed: [],
    cancelled: [],
    rejected: [],
};

export function meterOrderRejectionEligibility(status: MeterOrderStatus): {
    eligible: boolean;
    refundRequired: boolean;
} {
    return {
        eligible: status === 'pending_payment' || status === 'paid',
        refundRequired: status === 'paid',
    };
}

export async function rejectMeterOrder(input: {
    orderId: string;
    rejectedByUserId: string;
    reason: string;
}): Promise<MeterOrderRecord> {
    const { data, error } = await adminClient.rpc('fn_reject_meter_order', {
        p_order_id: input.orderId,
        p_rejected_by_user_id: input.rejectedByUserId,
        p_reason: input.reason.trim(),
    });
    if (error) {
        const message = String(error.message ?? 'Could not reject meter order.');
        if (message.includes('order_not_found')) throw new MeterOrderError('Meter order not found.', 'meter_order_not_found', 404);
        if (message.includes('order_already_processed')) throw new MeterOrderError('Only unapproved orders can be rejected.', 'order_already_processed', 409);
        if (message.includes('refund_wallet_missing')) throw new MeterOrderError('The refund wallet is unavailable. Rejection was not applied.', 'refund_wallet_missing', 409);
        throw new MeterOrderError(message, 'meter_order_rejection_failed', 422);
    }
    return data as MeterOrderRecord;
}

export interface MeterOrderRecord {
    id: string;
    customer_id: string;
    customer_name_snapshot: string | null;
    vendor_organization_id: string | null;
    wallet_id: string | null;
    ledger_entry_id: string | null;
    meter_type: MeterOrderType;
    property_category?: PropertyCategory | null;
    property_address: string;
    service_area: string;
    contact_phone: string;
    amount_minor: number;
    payment_reference: string;
    status: MeterOrderStatus;
    technician_name: string | null;
    notes: string | null;
    source_channel: MeterOrderSourceChannel;
    sponsor_mode: 'manual_paid' | 'vendor_wallet';
    created_by_actor_type: MeterOrderActorType;
    created_by_actor_id: string | null;
    created_at: string;
    updated_at: string;
    cancelled_at?: string | null;
    cancelled_by?: string | null;
    cancellation_reason?: string | null;
    reversal_ledger_entry_id?: string | null;
    rejected_at?: string | null;
    rejected_by?: string | null;
    rejection_reason?: string | null;
    rejection_refund_entry_id?: string | null;
    rejection_refund_destination?: 'none' | 'vendor_wallet' | 'customer_wallet' | null;
}

export const VENDOR_METER_ORDER_CANCELLATION_HOURS = 6;

export function vendorMeterOrderCancellationEligibility(
    order: Pick<MeterOrderRecord, 'status' | 'sponsor_mode' | 'created_at'>,
    now = new Date(),
): { eligible: boolean; deadline: string; reason: string | null } {
    const deadline = new Date(new Date(order.created_at).getTime() + VENDOR_METER_ORDER_CANCELLATION_HOURS * 60 * 60 * 1000);
    let reason: string | null = null;
    if (order.status === 'cancelled') reason = 'already_cancelled';
    else if (order.status !== 'paid') reason = 'order_approved';
    else if (order.sponsor_mode !== 'vendor_wallet') reason = 'not_vendor_sponsored';
    else if (!Number.isFinite(deadline.getTime()) || now.getTime() > deadline.getTime()) reason = 'cancellation_window_expired';
    return { eligible: reason === null, deadline: deadline.toISOString(), reason };
}

export async function cancelVendorMeterOrder(input: {
    orderId: string;
    vendorOrganizationId: string;
    actorUserId: string;
    reason: string;
}): Promise<MeterOrderRecord> {
    const { data, error } = await adminClient.rpc('fn_cancel_vendor_meter_order', {
        p_order_id: input.orderId,
        p_vendor_organization_id: input.vendorOrganizationId,
        p_actor_user_id: input.actorUserId,
        p_reason: input.reason.trim(),
    });
    if (error) {
        const message = String(error.message ?? 'Could not cancel meter order.');
        if (message.includes('window_expired')) throw new MeterOrderError('The six-hour cancellation window has ended.', 'cancellation_window_expired', 409);
        if (message.includes('order_approved')) throw new MeterOrderError('Approved orders cannot be cancelled.', 'order_approved', 409);
        if (message.includes('order_not_found')) throw new MeterOrderError('Meter order not found.', 'meter_order_not_found', 404);
        throw new MeterOrderError(message, 'meter_order_cancellation_failed', 422);
    }
    return data as MeterOrderRecord;
}

export class MeterOrderError extends Error {
    constructor(message: string, public code: string, public status = 400) {
        super(message);
        this.name = 'MeterOrderError';
    }
}

export interface MeterPrices {
    residential_minor: number;
    commercial_minor: number;
}

export async function getMeterPrices(): Promise<MeterPrices> {
    try {
        const { data } = await adminClient
            .from('system_settings')
            .select('key, value')
            .in('key', ['meter_price_residential_minor', 'meter_price_commercial_minor']);

        let residential = 3_000_000;
        let commercial = 15_000_000;

        if (data && Array.isArray(data)) {
            for (const row of data) {
                if (row.key === 'meter_price_residential_minor' && row.value != null) {
                    residential = Number(row.value);
                } else if (row.key === 'meter_price_commercial_minor' && row.value != null) {
                    commercial = Number(row.value);
                }
            }
        }
        return { residential_minor: residential, commercial_minor: commercial };
    } catch {
        return { residential_minor: 3_000_000, commercial_minor: 15_000_000 };
    }
}

export async function updateMeterPrices(
    prices: { residential_minor?: number; commercial_minor?: number },
    updatedBy?: string,
): Promise<MeterPrices> {
    if (prices.residential_minor !== undefined) {
        if (prices.residential_minor <= 0) throw new MeterOrderError('Residential price must be positive', 'invalid_price', 400);
        await adminClient.from('system_settings').upsert({
            key: 'meter_price_residential_minor',
            value: prices.residential_minor,
            updated_at: new Date().toISOString(),
            updated_by: updatedBy ?? null,
        });
    }
    if (prices.commercial_minor !== undefined) {
        if (prices.commercial_minor <= 0) throw new MeterOrderError('Commercial price must be positive', 'invalid_price', 400);
        await adminClient.from('system_settings').upsert({
            key: 'meter_price_commercial_minor',
            value: prices.commercial_minor,
            updated_at: new Date().toISOString(),
            updated_by: updatedBy ?? null,
        });
    }
    return getMeterPrices();
}

export async function meterOrderAmountMinor(propertyCategory: PropertyCategory = 'residential'): Promise<number> {
    const prices = await getMeterPrices();
    return propertyCategory === 'commercial' ? prices.commercial_minor : prices.residential_minor;
}

export function assertMeterOrderTransition(from: MeterOrderStatus, to: MeterOrderStatus): void {
    if (!METER_ORDER_TRANSITIONS[from]?.includes(to)) {
        throw new MeterOrderError(`Cannot move meter order from ${from} to ${to}.`, 'invalid_status_transition', 409);
    }
}

export function deterministicMeterOrderReference(
    prefix: 'mord' | 'mordv' | 'morda',
    parts: (string | number | null | undefined)[],
): string {
    return `${prefix}_${hashIdempotency(parts)}`;
}

export async function runIdempotentMeterOrder<T>(
    scope: string,
    idempotencyKey: string,
    fingerprintParts: (string | number | null | undefined)[],
    operation: () => Promise<T>,
): Promise<T> {
    const fingerprint = hashIdempotency(fingerprintParts);
    const claim = await claimWalletIdempotency(scope, idempotencyKey, fingerprint);
    if (claim.state === 'replay') return claim.responsePayload as T;
    if (claim.state === 'pending') {
        throw new MeterOrderError(
            'This meter order request is still processing.',
            'idempotency_in_progress',
            409,
        );
    }
    try {
        const result = await operation();
        await completeWalletIdempotency(scope, idempotencyKey, result);
        return result;
    } catch (error) {
        await abandonWalletIdempotency(scope, idempotencyKey, fingerprint).catch(() => undefined);
        throw error;
    }
}

async function readCustomer(customerId: string) {
    const { data, error } = await adminClient
        .from('customers')
        .select('id, full_name, phone, email, status')
        .eq('id', customerId)
        .maybeSingle();
    if (error) throw new MeterOrderError(error.message, 'customer_lookup_failed', 500);
    if (!data) throw new MeterOrderError('Customer not found.', 'customer_not_found', 404);
    return data as {
        id: string;
        full_name: string | null;
        phone: string | null;
        email: string | null;
        status: string | null;
    };
}

async function createOrderRow(input: {
    customerId: string;
    customerName: string | null;
    meterType: MeterOrderType;
    propertyCategory?: PropertyCategory | null;
    propertyAddress: string;
    serviceArea: string;
    contactPhone: string;
    amountMinor: number;
    paymentReference: string;
    status: MeterOrderStatus;
    sourceChannel: MeterOrderSourceChannel;
    sponsorMode?: 'manual_paid' | 'vendor_wallet';
    createdByActorType: MeterOrderActorType;
    createdByActorId: string | null;
    vendorOrganizationId?: string | null;
    walletId?: string | null;
    notes?: string | null;
  }): Promise<MeterOrderRecord> {
    const { data, error } = await adminClient
        .from('meter_purchase_orders')
        .insert({
            customer_id: input.customerId,
            customer_name_snapshot: input.customerName,
            meter_type: input.meterType,
            property_category: input.propertyCategory ?? 'residential',
            property_address: input.propertyAddress,
            service_area: input.serviceArea,
            contact_phone: input.contactPhone,
            amount_minor: input.amountMinor,
            payment_reference: input.paymentReference,
            status: input.status,
            source_channel: input.sourceChannel,
            sponsor_mode: input.sponsorMode ?? 'manual_paid',
            created_by_actor_type: input.createdByActorType,
            created_by_actor_id: input.createdByActorId,
            vendor_organization_id: input.vendorOrganizationId ?? null,
            wallet_id: input.walletId ?? null,
            notes: input.notes ?? null,
        })
        .select('*')
        .single();
    if (error) throw new MeterOrderError(error.message, 'meter_order_create_failed', 500);
    return data as MeterOrderRecord;
}

export async function createCustomerPortalMeterOrder(input: {
    customerId: string;
    customerUserId: string;
    meterType: MeterOrderType;
    propertyCategory?: PropertyCategory;
    propertyAddress: string;
    serviceArea: string;
    contactPhone: string;
    callbackBaseUrl: string;
    idempotencyKey: string;
}): Promise<{ order: MeterOrderRecord; authorizationUrl: string }> {
    return runIdempotentMeterOrder(
        `meter_order.customer.${input.customerId}`,
        input.idempotencyKey,
        [
            input.customerId,
            input.meterType,
            input.propertyCategory ?? 'residential',
            input.propertyAddress,
            input.serviceArea,
            input.contactPhone,
        ],
        async () => {
            const customer = await readCustomer(input.customerId);
            const email = String(customer.email ?? '').trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                throw new MeterOrderError('A valid customer email is required for meter order payment.', 'email_required', 422);
            }
            const category = input.propertyCategory ?? 'residential';
            const amountMinor = await meterOrderAmountMinor(category);
            const reference = deterministicMeterOrderReference('mord', [
                'customer_meter_order',
                input.customerId,
                input.idempotencyKey,
            ]);
            const callbackUrl = new URL(input.callbackBaseUrl);
            callbackUrl.searchParams.set('ref', reference);
            const paystack = await initializeTransaction({
                email,
                amountMinor,
                reference,
                metadata: { customer_id: input.customerId, order_type: 'meter_purchase' },
                callbackUrl: callbackUrl.toString(),
            });
            if (!paystack.authorization_url) {
                throw new MeterOrderError('Could not initialize payment.', 'payment_init_failed', 502);
            }
            const order = await createOrderRow({
                customerId: input.customerId,
                customerName: customer.full_name,
                meterType: input.meterType,
                propertyCategory: category,
                propertyAddress: input.propertyAddress,
                serviceArea: input.serviceArea,
                contactPhone: input.contactPhone,
                amountMinor,
                paymentReference: reference,
                status: 'pending_payment',
                sourceChannel: 'customer_portal',
                sponsorMode: 'manual_paid',
                createdByActorType: 'customer',
                createdByActorId: input.customerUserId,
            });
            return { order, authorizationUrl: paystack.authorization_url };
        },
    );
}

type VendorMeterOrderInput = {
    vendorOrganizationId: string;
    actorUserId: string;
    actorType?: 'vendor_user' | 'staff';
    customerId: string;
    meterType: MeterOrderType;
    propertyCategory?: PropertyCategory;
    propertyAddress: string;
    serviceArea: string;
    contactPhone: string;
    idempotencyKey: string;
};

async function createVendorSponsoredMeterOrderOnce(input: VendorMeterOrderInput): Promise<MeterOrderRecord> {
    const customer = await readCustomer(input.customerId);
    const wallet = await findWalletByOwner('vendor', input.vendorOrganizationId);
    try {
        assertWalletCanTransact(wallet, 'sponsor meter orders');
    } catch (error: any) {
        throw new MeterOrderError(error.message, error.code ?? 'wallet_inactive', error.status ?? 403);
    }
    const category = input.propertyCategory ?? 'residential';
    const amountMinor = await meterOrderAmountMinor(category);
    const idemKey = deterministicMeterOrderReference('mordv', [
        'vendor_meter_order',
        input.vendorOrganizationId,
        input.idempotencyKey,
    ]);
    const { data: existing } = await adminClient
        .from('meter_purchase_orders')
        .select('*')
        .eq('payment_reference', idemKey)
        .maybeSingle();
    if (existing) return existing as MeterOrderRecord;

    const order = await createOrderRow({
        customerId: input.customerId,
        customerName: customer.full_name,
        meterType: input.meterType,
        propertyCategory: category,
        propertyAddress: input.propertyAddress,
        serviceArea: input.serviceArea,
        contactPhone: input.contactPhone,
        amountMinor,
        paymentReference: idemKey,
        status: 'paid',
        sourceChannel: 'vendor_portal',
        sponsorMode: 'vendor_wallet',
        createdByActorType: 'vendor_user',
        createdByActorId: input.actorUserId,
        vendorOrganizationId: input.vendorOrganizationId,
        walletId: wallet!.id,
        notes: 'Vendor-sponsored meter order.',
    });

    let ledgerEntryId: string | null = null;
    try {
        const entry = await postEntry({
            walletId: wallet!.id,
            direction: 'debit',
            amountMinor,
            entryType: 'meter_order_debit',
            referenceType: 'meter_order',
            referenceId: order.id,
            idempotencyKey: ledgerKey('meter_order', 'debit', order.id, 'vendor_final'),
            memo: `Meter order · ${customer.full_name ?? input.customerId}`,
            createdBy: input.actorUserId,
            audit: { actorType: input.actorType ?? 'vendor_user' },
        });
        ledgerEntryId = entry.id;
    } catch (error: any) {
        const status = error instanceof LedgerError && error.code === 'insufficient_balance' ? 402 : 422;
        await adminClient.from('meter_purchase_orders').delete().eq('id', order.id);
        throw new MeterOrderError(error.message ?? 'Could not debit vendor wallet.', error.code ?? 'meter_order_debit_failed', status);
    }

    const { data, error } = await adminClient
        .from('meter_purchase_orders')
        .update({ ledger_entry_id: ledgerEntryId })
        .eq('id', order.id)
        .select('*')
        .single();
    if (error) throw new MeterOrderError(error.message, 'meter_order_update_failed', 500);
    return data as MeterOrderRecord;
}

export async function createVendorSponsoredMeterOrder(input: VendorMeterOrderInput): Promise<MeterOrderRecord> {
    return runIdempotentMeterOrder(
        `meter_order.vendor.${input.vendorOrganizationId}`,
        input.idempotencyKey,
        [
            input.customerId,
            input.meterType,
            input.propertyCategory ?? 'residential',
            input.propertyAddress,
            input.serviceArea,
            input.contactPhone,
        ],
        () => createVendorSponsoredMeterOrderOnce(input),
    );
}

export async function createAdminMeterOrder(input: {
    staffUserId: string;
    customerId: string;
    meterType: MeterOrderType;
    propertyCategory?: PropertyCategory;
    propertyAddress: string;
    serviceArea: string;
    contactPhone: string;
    sponsorMode: 'manual_paid' | 'vendor_wallet';
    vendorOrganizationId?: string | null;
    notes?: string | null;
    idempotencyKey: string;
}): Promise<MeterOrderRecord> {
    if (input.sponsorMode === 'vendor_wallet') {
        if (!input.vendorOrganizationId) {
            throw new MeterOrderError('Vendor sponsor is required.', 'vendor_required', 422);
        }
        const order = await createVendorSponsoredMeterOrder({
            vendorOrganizationId: input.vendorOrganizationId,
            actorUserId: input.staffUserId,
            actorType: 'staff',
            customerId: input.customerId,
            meterType: input.meterType,
            propertyCategory: input.propertyCategory,
            propertyAddress: input.propertyAddress,
            serviceArea: input.serviceArea,
            contactPhone: input.contactPhone,
            idempotencyKey: input.idempotencyKey,
        });
        const { data, error } = await adminClient
            .from('meter_purchase_orders')
            .update({
                source_channel: 'admin_portal',
                created_by_actor_type: 'staff',
                created_by_actor_id: input.staffUserId,
                notes: input.notes?.trim() || order.notes,
            })
            .eq('id', order.id)
            .select('*')
            .single();
        if (error) throw new MeterOrderError(error.message, 'meter_order_update_failed', 500);
        return data as MeterOrderRecord;
    }

    return runIdempotentMeterOrder(
        `meter_order.admin.${input.staffUserId}`,
        input.idempotencyKey,
        [
            input.customerId,
            input.meterType,
            input.propertyCategory ?? 'residential',
            input.propertyAddress,
            input.serviceArea,
            input.contactPhone,
            input.sponsorMode,
            input.vendorOrganizationId,
            input.notes,
        ],
        async () => {
            const customer = await readCustomer(input.customerId);
            const category = input.propertyCategory ?? 'residential';
            const amountMinor = await meterOrderAmountMinor(category);
            return createOrderRow({
                customerId: input.customerId,
                customerName: customer.full_name,
                meterType: input.meterType,
                propertyCategory: category,
                propertyAddress: input.propertyAddress,
                serviceArea: input.serviceArea,
                contactPhone: input.contactPhone,
                amountMinor,
                paymentReference: deterministicMeterOrderReference('morda', [
                    'admin_meter_order',
                    input.staffUserId,
                    input.idempotencyKey,
                ]),
                status: 'paid',
                sourceChannel: 'admin_portal',
                sponsorMode: 'manual_paid',
                createdByActorType: 'staff',
                createdByActorId: input.staffUserId,
                notes: input.notes?.trim() || 'Staff-assisted meter order.',
            });
        },
    );
}
