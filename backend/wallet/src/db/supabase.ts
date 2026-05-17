/**
 * Supabase clients.
 *
 *   adminClient   — service-role, bypasses RLS, used by trusted server code.
 *   userClient(jwt) — anon-role + user JWT, respects RLS.
 *
 * Never expose the service role key to the frontend.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

export const adminClient: SupabaseClient = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { 'x-application-name': 'beverly-wallet-backend' } },
    },
);

export function userClient(accessToken: string): SupabaseClient {
    return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'x-application-name': 'beverly-wallet-backend',
            },
        },
    });
}
