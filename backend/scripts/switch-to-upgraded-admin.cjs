#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadEnvFile } = require('../../tools/env-loader.cjs');
loadEnvFile();

const { encryptSecret } = require('../src/services/oem-credential-crypto.js');
const { restRequest } = require('../src/services/supabase-service.js');
const storage = require('../src/services/storage-adapter.js');

function apiCall(pathName, method, body, token) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: '8.208.16.168',
      port: 9310,
      path: pathName,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data, status: res.statusCode });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function syncUpgradedAdmin() {
  console.log('1. Logging in as upgraded admin (ACOB_ADMIN)...');
  const loginRes = await apiCall('/api/user/login', 'POST', { userId: 'admin', password: 'ACOB_ADMIN' });
  if (loginRes.code !== 0 || !loginRes.result?.token) {
    throw new Error('Admin login failed: ' + JSON.stringify(loginRes));
  }
  const newToken = loginRes.result.token;
  console.log('✅ Admin login successful! Acquired upgraded bearer token.');

  console.log('\n2. Updating .env with upgraded admin credentials...');
  const envPath = path.resolve(__dirname, '../../.env');
  let envContent = fs.readFileSync(envPath, 'utf8');

  envContent = envContent.replace(/^UPSTREAM_USERNAME=.*$/m, 'UPSTREAM_USERNAME=admin');
  envContent = envContent.replace(/^UPSTREAM_PASSWORD=.*$/m, 'UPSTREAM_PASSWORD=ACOB_ADMIN');
  envContent = envContent.replace(/^UPSTREAM_BEARER_TOKEN=.*$/m, `UPSTREAM_BEARER_TOKEN=${newToken}`);
  envContent = envContent.replace(/^LIVE_API_BEARER_TOKEN=.*$/m, `LIVE_API_BEARER_TOKEN=${newToken}`);
  envContent = envContent.replace(/^ENERGY_BEARER_TOKEN=.*$/m, `ENERGY_BEARER_TOKEN=${newToken}`);
  envContent = envContent.replace(/^GPRS_UPSTREAM_BEARER_TOKEN=.*$/m, `GPRS_UPSTREAM_BEARER_TOKEN=${newToken}`);

  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('✅ .env updated.');

  console.log('\n3. Encrypting and saving token in SQLite oem_credentials...');
  const encrypted = encryptSecret(newToken);
  const CALIN_OEM_ID = '7c34faca-e608-4dfe-9ccc-aa8e29b1107f';
  const CALIN_PROD_OEM_ID = 'bd7e4242-651b-41ca-a3de-b0cd4ffe7927';

  await storage.upsertOemCredentials({
    oemId: CALIN_OEM_ID,
    authStrategy: 'bearer_static',
    baseUrl: 'http://8.208.16.168:9310',
    encryptedBearerToken: encrypted,
    encryptionKeyVersion: 1,
    updatedBy: 'sync-upgraded-admin'
  });
  console.log('✅ Local SQLite oem_credentials updated.');

  console.log('\n4. Syncing to Supabase oem_credentials...');
  try {
    const existingCreds = await restRequest('/oem_credentials?select=*');
    for (const cred of existingCreds) {
      if (cred.oem_id === CALIN_OEM_ID || cred.oem_id === CALIN_PROD_OEM_ID) {
        await restRequest(`/oem_credentials?oem_id=eq.${cred.oem_id}`, 'PATCH', {
          encrypted_bearer_token: encrypted,
          updated_at: new Date().toISOString()
        });
        console.log(`✅ Supabase oem_credentials updated for oem_id: ${cred.oem_id}`);
      }
    }
  } catch (err) {
    console.warn('⚠️ Supabase update warning:', err.message);
  }

  console.log('\n5. Verifying dashboard with upgraded admin token:');
  const panel = await apiCall('/api/dashboard/readPanelGroup', 'POST', {}, newToken);
  console.log('Dashboard panelGroup:', panel.result);

  console.log('\n🎉 Upgraded admin account synchronized successfully across all layers!');
}

syncUpgradedAdmin().catch(console.error);
