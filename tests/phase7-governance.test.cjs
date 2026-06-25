const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('phase 7 migration owns webhook retention and VAT policy tables', () => {
  const migration = read('supabase/migrations/20260624100000_phase7_data_governance.sql');

  assert.match(migration, /alter table public\.payment_webhooks/);
  assert.match(migration, /payload_encrypted text/);
  assert.match(migration, /expires_at timestamptz not null default/);
  assert.match(migration, /retention_purged_at timestamptz/);
  assert.match(migration, /create table if not exists public\.vat_policies/);
  assert.match(migration, /rate_basis_points integer not null/);
  assert.match(migration, /'Nigeria VAT 7\.5%'/);
  assert.match(migration, /\b750\b/);
  assert.match(migration, /purge_expired_payment_webhooks/);
});

test('webhooks store minimal payload and encrypted raw payload', () => {
  const webhooks = read('backend/wallet/src/routes/webhooks.ts');

  assert.match(webhooks, /encryptSecret\(raw\)/);
  assert.match(webhooks, /raw_payload: storedPayload/);
  assert.doesNotMatch(webhooks, /raw_payload:\s*payload/);
});

test('worker schedules webhook retention purge', () => {
  const worker = read('backend/wallet/src/worker.ts');

  assert.match(worker, /purgeExpiredWebhookPayloads/);
  assert.match(worker, /name: 'webhook-retention'/);
});

test('VAT policy is authoritative for new token previews', () => {
  const tokenEngine = read('backend/wallet/src/services/token-engine.ts');
  const vendorRoutes = read('backend/wallet/src/routes/vendor.ts');
  const vending = read('backend/wallet/src/services/vending.ts');
  const customerPurchase = read('backend/wallet/src/services/customer-purchase.ts');
  const paymentTransactions = read('backend/wallet/src/services/payment-transactions.ts');

  assert.match(tokenEngine, /resolveVatRateBasisPoints/);
  assert.match(tokenEngine, /previewPurchaseWithCurrentVat/);
  assert.match(vendorRoutes, /previewPurchaseWithCurrentVat/);
  assert.match(vending, /previewPurchaseWithCurrentVat/);
  assert.match(customerPurchase, /previewPurchaseWithCurrentVat/);
  assert.match(paymentTransactions, /vat_rate_basis_points/);
  assert.match(paymentTransactions, /previewPurchaseWithCurrentVat/);
});

test('admin VAT routes require explicit permission and route policy', () => {
  const admin = read('backend/wallet/src/routes/admin.ts');
  const routePolicy = read('backend/wallet/src/contracts/route-policy.ts');

  assert.match(admin, /wallet\.vat\.manage/);
  assert.match(admin, /fastify\.get\('\/vat-policies'/);
  assert.match(admin, /fastify\.post\('\/vat-policies'/);
  assert.match(admin, /fastify\.post\('\/vat-policies\/:id\/approve'/);
  assert.match(routePolicy, /post\('\/api\/v1\/admin\/vat-policies'\)/);
  assert.match(routePolicy, /post\('\/api\/v1\/admin\/vat-policies\/:id\/approve'\)/);
});
