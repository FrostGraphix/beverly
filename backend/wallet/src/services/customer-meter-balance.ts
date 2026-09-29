import { adminClient } from '../db/supabase.js';

type MeterBalanceRow = {
    meter_id: string;
    station_id: string | null;
    balance_kwh: number | string | null;
    reading_date: string | null;
    captured_at: string | null;
};

export type CustomerMeterBalance = {
    meterId: string;
    stationId: string | null;
    balanceKwh: number | null;
    status: 'available' | 'unavailable';
    readingDate: string | null;
    reportedAt: string | null;
};

export class CustomerMeterBalanceError extends Error {
    constructor(message: string, public code: 'meter_balance_unavailable') {
        super(message);
        this.name = 'CustomerMeterBalanceError';
    }
}

/**
 * Returns the last received meter credit for approved customer links only.
 * The database function enforces ownership before it touches meter telemetry.
 */
export async function getCustomerMeterBalances(
    customerId: string,
    meterId?: string,
): Promise<CustomerMeterBalance[]> {
    const { data, error } = await adminClient.rpc('get_customer_meter_balances', {
        p_customer_id: customerId,
        p_meter_id: meterId?.trim() || null,
    });
    if (error) {
        throw new CustomerMeterBalanceError('Meter balance is temporarily unavailable.', 'meter_balance_unavailable');
    }

    return ((data ?? []) as MeterBalanceRow[]).map((row) => {
        const parsedBalance = row.balance_kwh === null ? null : Number(row.balance_kwh);
        const balanceKwh = Number.isFinite(parsedBalance) ? parsedBalance : null;
        const reportedAt = row.captured_at || null;
        const readingDate = row.reading_date || null;
        return {
            meterId: String(row.meter_id),
            stationId: row.station_id || null,
            balanceKwh,
            status: balanceKwh === null || !reportedAt || !readingDate ? 'unavailable' : 'available',
            readingDate,
            reportedAt,
        };
    });
}
