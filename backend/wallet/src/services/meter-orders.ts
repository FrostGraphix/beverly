import { adminClient } from '../db/supabase.js';
import { initializeTransaction } from '../adapters/paystack.js';
import { postEntry, LedgerError } from './ledger.js';
import { findWalletByOwner, assertWalletCanTransact } from './wallets.js';
import { hashIdempotency, ledgerKey } from './idempotency.js';

export type MeterOrderStatus =
    | 'pending_payment'
    | 'paid'
    | 'assigned'
    | 'dispatched'
    | 'installed'
    | 'cancelled';

export type MeterOrderSourceChannel = 'customer_portal' | 'vendor_portal' | 'admin_portal';
export type MeterOrderActorType = 'customer' | 'vendor_user' | 'staff';
export type MeterOrderType = 'single_phase' | 'three_phase';
const METER_ORDER_TRANSITIONS: Record<MeterOrderStatus, MeterOrderStatus[]> = {
    pending_payment: ['paid', 'cancelled'],
    paid: ['assigned', 'cancelled'],
    assigned: ['dispatched', 'cancelled'],
    dispatched: ['installed'],
    installed: [],
    cancelled: [],
};

export interface MeterOrderRecord {
    id: string;
    customer_id: string;
    customer_name_snapshot: string | null;
    vendor_organization_id: string | null;
    wallet_id: string | null;
    ledger_entry_id: string | null;
    meter_type: MeterOrderType;
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
}

export class MeterOrderError extends Error {
    constructor(message: string, public code: string, public status = 400) {
        super(message);
        this.name = 'MeterOrderError';
    }
}

export function meterOrderAmountMinor(meterType: MeterOrderType): number {
    return meterType === 'three_phase' ? 7_500_000 : 5_000_000;
}

export function assertMeterOrderTransition(from: MeterOrderStatus, to: MeterOrderStatus): void {
    if (!METER_ORDER_TRANSITIONS[from]?.includes(to)) {
        throw new MeterOrderError(`Cannot move meter order from ${from} to ${to}.`, 'invalid_status_transition', 409);
    }
}

function paymentReference(prefix: 'mord' | 'mordv' | 'morda'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
    propertyAddress: string;
    serviceArea: string;
    contactPhone: string;
    callbackBaseUrl: string;
    idempotencyKey: string;
}): Promise<{ order: MeterOrderRecord; authorizationUrl: string }> {
    const customer = await readCustomer(input.customerId);
    const email = String(customer.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new MeterOrderError('A valid customer email is required for meter order payment.', 'email_required', 422);
    }
    const amountMinor = meterOrderAmountMinor(input.meterType);
    const reference = `mord_${hashIdempotency(['customer_meter_order', input.customerId, input.idempotencyKey])}`;
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
}

export async function createVendorSponsoredMeterOrder(input: {
    vendorOrganizationId: string;
    actorUserId: string;
    actorType?: 'vendor_user' | 'staff';
    customerId: string;
    meterType: MeterOrderType;
    propertyAddress: string;
    serviceArea: string;
    contactPhone: string;
    idempotencyKey: string;
}): Promise<MeterOrderRecord> {
    const customer = await readCustomer(input.customerId);
    const wallet = await findWalletByOwner('vendor', input.vendorOrganizationId);
    try {
        assertWalletCanTransact(wallet, 'sponsor meter orders');
    } catch (error: any) {
        throw new MeterOrderError(error.message, error.code ?? 'wallet_inactive', error.status ?? 403);
    }
    const amountMinor = meterOrderAmountMinor(input.meterType);
    const idemKey = hashIdempotency([
        'vendor_meter_order',
        input.vendorOrganizationId,
        input.customerId,
        input.meterType,
        input.propertyAddress,
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

export async function createAdminMeterOrder(input: {
    staffUserId: string;
    customerId: string;
    meterType: MeterOrderType;
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

    const customer = await readCustomer(input.customerId);
    const amountMinor = meterOrderAmountMinor(input.meterType);
    return createOrderRow({
        customerId: input.customerId,
        customerName: customer.full_name,
        meterType: input.meterType,
        propertyAddress: input.propertyAddress,
        serviceArea: input.serviceArea,
        contactPhone: input.contactPhone,
        amountMinor,
        paymentReference: paymentReference('morda'),
        status: 'paid',
        sourceChannel: 'admin_portal',
        sponsorMode: 'manual_paid',
        createdByActorType: 'staff',
        createdByActorId: input.staffUserId,
        notes: input.notes?.trim() || 'Staff-assisted meter order.',
    });
}
