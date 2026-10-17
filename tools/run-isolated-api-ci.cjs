'use strict';
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const path = require('node:path');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const apiBase = 'http://127.0.0.1:4000';
function localUrl(value) {
  const url = new URL(value);
  assert(['127.0.0.1', 'localhost'].includes(url.hostname), 'Only loopback CI services are allowed');
  return url;
}
function mask(value) { console.log(`::add-mask::${value}`); }
async function authRequest(base, key, route, body) {
  const response = await fetch(`${base}/auth/v1/${route}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert(response.ok, `Synthetic authentication request failed (${response.status})`);
  return response.json();
}
async function main() {
  assert.equal(process.env.CI, 'true', 'This runner is restricted to disposable CI');
  const status = JSON.parse(execFileSync('pnpm', ['exec', 'supabase', 'status', '--workdir', 'tests/ci', '-o', 'json'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }));
  const authBase = localUrl(status.API_URL).origin;
  const dbUrl = localUrl(status.DB_URL);
  assert.equal(dbUrl.port, '54322');
  assert.equal(new URL(authBase).port, '54321');
  for (const key of [status.ANON_KEY, status.SERVICE_ROLE_KEY]) {
    assert(typeof key === 'string' && key.length > 20, 'Local Supabase keys unavailable');
    mask(key);
  }
  const password = randomBytes(32).toString('base64url');
  mask(password);
  const email = `ci-${randomBytes(8).toString('hex')}@beverly-ci.test`;
  const user = await authRequest(authBase, status.SERVICE_ROLE_KEY, 'admin/users', { email, password, email_confirm: true });
  assert(user.id, 'Synthetic user creation did not return an ID');
  const database = new Client({ connectionString: dbUrl.toString() });
  try {
    await database.connect();
    await database.query('insert into public.users(auth_user_id,user_id,user_name,email,role_key) values($1,$1,$2,$3,$4)',
      [user.id, 'Synthetic CI Staff', email, 'custom-ci-flags']);
  } finally { await database.end(); }
  const session = await authRequest(authBase, status.ANON_KEY, 'token?grant_type=password', { email, password });
  assert(session.access_token && session.expires_in <= 600, 'Expected a short-lived local staff session');
  mask(session.access_token);
  if (session.refresh_token) mask(session.refresh_token);

  const backend = spawn(process.execPath, ['tests/ci/serve.mjs'], {
    cwd: root, stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env, VERCEL_ENV: 'test', APP_ENV: 'test', NODE_ENV: 'test', LOG_LEVEL: 'error',
      SUPABASE_URL: authBase, EXPECTED_SUPABASE_PROJECT_REF: new URL(authBase).hostname.split('.')[0],
      SUPABASE_ANON_KEY: status.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
      WALLET_SERVERLESS: 'true', MONEY_WRITES_ENABLED: 'true', PAYSTACK_PAYMENTS_ENABLED: 'false',
      PAYSTACK_SECRET_KEY: `sk_test_${randomBytes(24).toString('hex')}`,
      OEM_REGISTRY_DISABLED: 'true', ENERGY_BACKEND_URL: 'http://127.0.0.1:9', UPSTREAM_API_URL: 'http://127.0.0.1:9',
    },
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (backend.exitCode !== null) throw new Error('Isolated wallet backend exited before readiness');
      try { ready = (await fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert(ready, 'Isolated wallet backend did not become healthy');
    const testProcess = spawn(process.execPath, [
      'node_modules/playwright/cli.js', 'test', 'tests/e2e/ledger-integrity.spec.ts',
      '--config=tests/e2e/playwright.config.ts', '--project=api-contracts', '--workers=1', '--retries=0', '--reporter=list',
    ], { cwd: root, stdio: 'inherit', env: { ...process.env, API_BASE: apiBase, STAFF_TOKEN: session.access_token } });
    const code = await new Promise((resolve, reject) => { testProcess.once('error', reject); testProcess.once('exit', resolve); });
    assert.equal(code, 0, 'Isolated API checks failed');
  } finally {
    backend.kill('SIGTERM');
    await new Promise(resolve => { if (backend.exitCode !== null) resolve(); else backend.once('exit', resolve); });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
