#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { loadEnvFile } = require('../../tools/env-loader.cjs');
loadEnvFile();

const { encryptSecret } = require('../src/services/oem-credential-crypto.js');
const { restRequest } = require('../src/services/supabase-service.js');
const storage = require('../src/services/storage-adapter.js');

if (!process.argv.includes('--apply')) {
  throw new Error('Credential synchronization requires --apply');
}

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const upstreamBaseUrl = required('UPSTREAM_API_URL').replace(/\/$/, '');
const upstreamUsername = required('UPSTREAM_USERNAME');
const upstreamPassword = required('UPSTREAM_PASSWORD');

async function apiCall(pathName, method, body, token) {
  const response = await fetch(`${upstreamBaseUrl}${pathName}`, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Upstream request failed: HTTP ${response.status}`);
  return response.json();
}

function setEnvLine(content, name, value) {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  return pattern.test(content) ? content.replace(pattern, () => line) : `${content.trimEnd()}\n${line}\n`;
}

async function syncUpgradedAdmin() {
  console.log('1. Logging in using configured credentials...');
  const loginRes = await apiCall('/api/user/login', 'POST', { userId: upstreamUsername, password: upstreamPassword });
  if (loginRes.code !== 0 || !loginRes.result?.token) {
    throw new Error('Admin login failed');
  }
  const newToken = loginRes.result.token;
  console.log('✅ Admin login successful! Acquired upgraded bearer token.');

  console.log('\n2. Updating .env with upgraded admin credentials...');
  const envPath = path.resolve(__dirname, '../../.env');
  let envContent = fs.readFileSync(envPath, 'utf8');

  envContent = setEnvLine(envContent, 'UPSTREAM_USERNAME', upstreamUsername);
  envContent = setEnvLine(envContent, 'UPSTREAM_PASSWORD', upstreamPassword);
  envContent = setEnvLine(envContent, 'UPSTREAM_BEARER_TOKEN', newToken);
  envContent = setEnvLine(envContent, 'LIVE_API_BEARER_TOKEN', newToken);
  envContent = setEnvLine(envContent, 'ENERGY_BEARER_TOKEN', newToken);
  envContent = setEnvLine(envContent, 'GPRS_UPSTREAM_BEARER_TOKEN', newToken);

  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('✅ .env updated.');

  console.log('\n3. Encrypting and saving token in SQLite oem_credentials...');
  const encrypted = encryptSecret(newToken);
  const CALIN_OEM_ID = '7c34faca-e608-4dfe-9ccc-aa8e29b1107f';
  const CALIN_PROD_OEM_ID = 'bd7e4242-651b-41ca-a3de-b0cd4ffe7927';

  await storage.upsertOemCredentials({
    oemId: CALIN_OEM_ID,
    authStrategy: 'bearer_static',
    baseUrl: upstreamBaseUrl,
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
        await restRequest(`/oem_credentials?oem_id=eq.${cred.oem_id}`, {
          method: "PATCH",
          prefer: "return=representation",
          body: {
            encrypted_bearer_token: encrypted,
            updated_at: new Date().toISOString(),
            updated_by: "sync-upgraded-admin"
          }
        });
        console.log(`✅ Supabase oem_credentials updated for oem_id: ${cred.oem_id}`);
      }
    }
  } catch (err) {
    console.warn('⚠️ Supabase update warning:', err.message);
  }

  console.log('\n5. Verifying dashboard with upgraded admin token:');
  const panel = await apiCall('/api/dashboard/readPanelGroup', 'POST', {}, newToken);
  if (!panel?.result) throw new Error('Dashboard verification failed');
  console.log('Dashboard verification succeeded.');

  console.log('\n🎉 Upgraded admin account synchronized successfully across all layers!');
}

syncUpgradedAdmin().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Credential synchronization failed');
  process.exitCode = 1;
});
