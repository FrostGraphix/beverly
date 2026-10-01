/**
 * Switch Beverly CRM upstream token to the newly created `Beverly` user account on Calinmeter.
 * Usage: node backend/scripts/switch-to-beverly-user.cjs --apply
 */
require('../../tools/env-loader.cjs').loadEnvFile();
const fs = require('fs');
const localDb = require('../src/services/local-database');
const { restRequest } = require('../src/services/supabase-service');
const { encryptSecret } = require('../src/services/oem-credential-crypto');

if (!process.argv.includes('--apply')) throw new Error('Credential synchronization requires --apply');

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const userId = required('UPSTREAM_USERNAME');
const password = required('UPSTREAM_PASSWORD');
const upstreamBaseUrl = required('UPSTREAM_API_URL').replace(/\/$/, '');

async function login(u, p) {
  const response = await fetch(`${upstreamBaseUrl}/api/user/login`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: u, password: p }),
  });
  if (!response.ok) throw new Error(`Upstream login failed: HTTP ${response.status}`);
  return response.json();
}

async function main() {
  console.log(`Authenticating as ${userId} against Calinmeter HES...`);
  const res = await login(userId, password);
  if (!res || res.code !== 0 || !res.result || !res.result.token) {
    console.error(`Failed to login as ${userId}.`);
    process.exit(1);
  }

  const newToken = res.result.token;
  console.log(`✅ Successfully logged in as ${userId}! Acquired new Bearer Token.`);

  // 1. Update .env
  let envText = fs.readFileSync('.env', 'utf8');
  envText = envText.replace(/UPSTREAM_USERNAME=.*/g, `UPSTREAM_USERNAME=${userId}`);
  envText = envText.replace(/UPSTREAM_BEARER_TOKEN=.*/g, `UPSTREAM_BEARER_TOKEN=${newToken}`);
  envText = envText.replace(/GPRS_UPSTREAM_BEARER_TOKEN=.*/g, `GPRS_UPSTREAM_BEARER_TOKEN=${newToken}`);
  envText = envText.replace(/LIVE_API_BEARER_TOKEN=.*/g, `LIVE_API_BEARER_TOKEN=${newToken}`);
  envText = envText.replace(/ENERGY_BEARER_TOKEN=.*/g, `ENERGY_BEARER_TOKEN=${newToken}`);
  fs.writeFileSync('.env', envText);
  console.log('✅ Updated .env configuration with Beverly credentials.');

  // 2. Update local SQLite database
  const encrypted = encryptSecret(newToken);
  localDb.upsertOemCredentials({
    oemId: 'bd7e4242-651b-41ca-a3de-b0cd4ffe7927',
    authStrategy: 'bearer_static',
    baseUrl: upstreamBaseUrl,
    encryptedBearerToken: encrypted,
    encryptionKeyVersion: 1,
    updatedBy: 'switch-to-beverly-user'
  });
  console.log('✅ Updated local SQLite database oem_credentials.');

  // 3. Update Supabase cloud database
  try {
    const oemId = 'bd7e4242-651b-41ca-a3de-b0cd4ffe7927';
    await restRequest('/oem_credentials?oem_id=eq.' + encodeURIComponent(oemId), {
      method: 'PATCH',
      prefer: 'return=representation',
      body: {
        encrypted_bearer_token: encrypted,
        updated_at: new Date().toISOString(),
        updated_by: 'switch-to-beverly-user'
      }
    });
    console.log('✅ Updated Supabase cloud database oem_credentials.');
  } catch (err) {
    console.warn('⚠️ Supabase cloud patch skipped/warning:', err.message);
  }

  console.log(`\n🎉 ALL DONE! Beverly CRM is now running under upstream user "${userId}"!`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
