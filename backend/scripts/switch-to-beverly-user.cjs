/**
 * Switch Beverly CRM upstream token to the newly created `Beverly` user account on Calinmeter.
 * Usage: node backend/scripts/switch-to-beverly-user.cjs [password]
 */
require('../../tools/env-loader.cjs').loadEnvFile();
const fs = require('fs');
const http = require('http');
const localDb = require('../src/services/local-database');
const { restRequest } = require('../src/services/supabase-service');
const { encryptSecret } = require('../src/services/oem-credential-crypto');

const userId = 'Beverly';
const password = process.argv[2] || process.env.UPSTREAM_PASSWORD || 'ACOB_ADMIN';

function login(u, p) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ userId: u, password: p });
    const req = http.request({
      hostname: '8.208.16.168',
      port: 9310,
      path: '/api/user/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Login response non-JSON: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log(`Authenticating as ${userId} against Calinmeter HES...`);
  const res = await login(userId, password);
  if (!res || res.code !== 0 || !res.result || !res.result.token) {
    console.error(`❌ Failed to login as ${userId}:`, res ? res.reason : 'No response');
    console.error('Please ensure user "Beverly" has been created on Calinmeter Web Portal (http://8.208.16.168:9310).');
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
    baseUrl: 'http://8.208.16.168:9310',
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
