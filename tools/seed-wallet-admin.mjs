/**
 * Seed script: creates the Beverly Wallet admin user in Supabase.
 * Run once: node tools/seed-wallet-admin.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ADMIN_EMAIL    = process.env.WALLET_ADMIN_EMAIL ?? 'admin@acoblighting.com';
const ADMIN_PASSWORD = process.env.WALLET_ADMIN_PASSWORD;
const ADMIN_ROLE     = 'super-admin';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_PASSWORD) {
    console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and WALLET_ADMIN_PASSWORD are required.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
    console.log(`Seeding wallet admin: ${ADMIN_EMAIL}`);

    const { data: existingList, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) { console.error('listUsers failed:', listErr.message); process.exit(1); }

    const existing = existingList?.users?.find((u) => u.email === ADMIN_EMAIL);

    if (existing) {
        console.log('User exists — updating password + metadata…');
        const { error } = await supabase.auth.admin.updateUserById(existing.id, {
            password: ADMIN_PASSWORD,
            user_metadata: { role: ADMIN_ROLE, full_name: 'Beverly Admin' },
            email_confirm: true,
        });
        if (error) { console.error('Update failed:', error.message); process.exit(1); }
        console.log('Updated. ID:', existing.id);
        return;
    }

    const { data, error } = await supabase.auth.admin.createUser({
        email:         ADMIN_EMAIL,
        password:      ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { role: ADMIN_ROLE, full_name: 'Beverly Admin' },
    });

    if (error) { console.error('Create failed:', error.message); process.exit(1); }
    console.log('Created. ID:', data.user.id);
}

run().catch((err) => { console.error('Unexpected:', err); process.exit(1); });
