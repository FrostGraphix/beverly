/**
 * Station scoping helpers shared by the admin route groups.
 *
 * Staff other than super-admins only see records belonging to the stations
 * assigned to them. These two functions are the single source of that rule, so
 * every route group scopes identically.
 */
import type { FastifyRequest } from 'fastify';
import { adminClient } from '../db/supabase.js';

/** Stations this staff member is limited to, or null for unrestricted (super-admin). */
export function staffStations(req: FastifyRequest): string[] | null {
    if (req.actor?.role === 'super-admin') return null;
    return [...new Set((req.actor?.stationIds ?? [req.actor?.stationId])
        .map((value) => String(value ?? '').trim().toUpperCase())
        .filter(Boolean))];
}

/** Vendor organizations and customers reachable from the given stations. */
export async function stationOwnerIds(stationIds: string[]): Promise<{ vendors: Set<string>; customers: Set<string> }> {
    const [{ data: vendors }, { data: meters }] = await Promise.all([
        adminClient.from('vendor_organizations').select('id').overlaps('operating_stations', stationIds),
        adminClient.from('customer_meters').select('customer_id').in('station_id', stationIds),
    ]);
    return {
        vendors: new Set((vendors ?? []).map((row: any) => row.id)),
        customers: new Set((meters ?? []).map((row: any) => row.customer_id)),
    };
}
