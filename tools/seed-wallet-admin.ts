/**
 * Seed script: creates the Beverly Wallet admin user in Supabase.
 * Run once: npx tsx tools/seed-wallet-admin.ts
 *
 * Idempotent — if the user already exists it updates their metadata.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL             = 'https://qpoipyqgrjsjdvfqmxok.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwb2lweXFncmpzamR2ZnFteG9rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODczMDQ5MCwiZXhwIjoyMDg0MzA2NDkwfQ.IFafEGSJw6CV39f14Wpuoc2dnl5a0UV1qVAfJRu8NO8';

const ADMIN_EMAIL    = 'admin@acoblighting.com';
const ADMIN_PASSWORD = 'Abdul$amad123';
const ADMIN_ROLE     = 'super-admin';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
    console.log(`Seeding wallet admin user: ${ADMIN_EMAIL}`);

    // Check if user already exists
    const { data: existingList } = await supabase.auth.admin.listUsers();
    const existing = existingList?.users?.find((u) => u.email === ADMIN_EMAIL);

    if (existing) {
        console.log('User already exists — updating metadata and password…');
        const { error } = await supabase.auth.admin.updateUserById(existing.id, {
            password: ADMIN_PASSWORD,
            user_metadata: { role: ADMIN_ROLE, full_name: 'Beverly Admin' },
            email_confirm: true,
        });
        if (error) {
            console.error('Update failed:', error.message);
            process.exit(1);
        }
        console.log('Updated successfully. User ID:', existing.id);
        return;
    }

    // Create new user
    const { data, error } = await supabase.auth.admin.createUser({
        email:           ADMIN_EMAIL,
        password:        ADMIN_PASSWORD,
        email_confirm:   true,
        user_metadata:   { role: ADMIN_ROLE, full_name: 'Beverly Admin' },
    });

    if (error) {
        console.error('Create failed:', error.message);
        process.exit(1);
    }

    console.log('Created successfully. User ID:', data.user.id);
}

run().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
