const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const status = read("backend/wallet/src/services/payment-status.ts");
const fulfillment = read("backend/wallet/src/services/payment-transactions.ts");
const paymentWebhooks = read("backend/wallet/src/services/payment-webhooks.ts");
const admin = read("backend/wallet/src/routes/admin.ts");
const scheduler = read("backend/wallet/src/jobs/scheduler.ts");
const webhooks = read("backend/wallet/src/routes/webhooks.ts");
const customerPurchase = read("backend/wallet/src/services/customer-purchase.ts");
const migration = read("supabase/migrations/20260531103000_payment_transaction_status_reconciliation.sql");
const customerFundingHistory = read("apps/customer/src/views/FundingHistory.vue");
const reconciliation = read("backend/wallet/src/services/reconciliation.ts");
const paystack = read("backend/wallet/src/adapters/paystack.ts");
const customerRoutes = read("backend/wallet/src/routes/customer.ts");
const vendorRoutes = read("backend/wallet/src/routes/vendor.ts");
const routePolicy = read("backend/wallet/src/contracts/route-policy.ts");

assert.match(status, /PAYMENT_STATUS/);
assert.match(status, /LEGACY_SUCCESS:\s*'success'/);
assert.match(status, /PAYMENT_SUCCEEDED_STATUSES[\s\S]*PAYMENT_STATUS\.SUCCEEDED[\s\S]*PAYMENT_STATUS\.LEGACY_SUCCESS/);
assert.match(status, /PAYMENT_RECONCILABLE_STATUSES[\s\S]*PAYMENT_STATUS\.INITIATED[\s\S]*PAYMENT_STATUS\.PENDING/);

assert.match(fulfillment, /fulfillSuccessfulPaystackTransaction/);
assert.match(fulfillment, /wallet_funded_notified_at/);
assert.match(fulfillment, /fulfillment_completed_at/);
assert.match(fulfillment, /payment_transactions[\s\S]*status:\s*PAYMENT_STATUS\.SUCCEEDED/);
assert.match(fulfillment, /PAYMENT_SUCCEEDED_STATUSES/);
assert.match(fulfillment, /includes\(tx\.status\)[\s\S]*fulfillment_completed_at/);
assert.match(fulfillment, /Number\(tx\.amount_minor\) !== Number\(verified\.amount\)/);
assert.match(fulfillment, /Number\(\(fr as any\)\.amount_minor\) !== Number\(tx\.amount_minor\)/);
assert.match(fulfillment, /Number\(\(po as any\)\.amount_minor\) !== Number\(tx\.amount_minor\)/);
assert.match(fulfillment, /payment_amount_mismatch/);
assert.match(fulfillment, /paystack_amount_mismatch/);
assert.match(fulfillment, /payment_reference_mismatch/);
assert.match(fulfillment, /payment_currency_mismatch/);

const adminSucceededFilters = admin.match(/\.in\('status', Array\.from\(PAYMENT_SUCCEEDED_STATUSES\)\)/g) ?? [];
assert.equal(adminSucceededFilters.length, 3, "admin funding aggregates must count canonical and legacy success states");

assert.match(scheduler, /\.select\('\*'\)/);
assert.match(scheduler, /\.in\('status', Array\.from\(PAYMENT_RECONCILABLE_STATUSES\)\)/);
assert.match(scheduler, /txn\.gateway_reference/);
assert.match(scheduler, /verifyTransaction\(reference\)/);
assert.match(scheduler, /fulfillSuccessfulPaystackTransaction/);
assert.doesNotMatch(scheduler, /\.select\('id, reference, amount_minor'\)/);
assert.doesNotMatch(scheduler, /\.from\('payment_transactions'\)[\s\S]{0,180}\.eq\('status', 'pending'\)/);

assert.match(paymentWebhooks, /fulfillSuccessfulPaystackTransaction/);
assert.match(paymentWebhooks, /verifyOwnedPaystackPayment/);
assert.match(paymentWebhooks, /verifyTransaction\(reference\)/);
assert.match(paymentWebhooks, /\.eq\('gateway_reference', reference\)/);
assert.match(webhooks, /processPaystackChargeSuccess/);
assert.match(webhooks, /\.select\('id'\)\.single\(\)/);
assert.match(webhooks, /const webhookId = \(webhookRow as any\)\.id as string/);
assert.match(webhooks, /if \(!valid\)[\s\S]{0,120}reply\.code\(401\)/);
assert(webhooks.indexOf('if (!valid)') < webhooks.indexOf("from('payment_webhooks').insert"));
assert.match(webhooks, /markWebhookProcessed\(webhookId, `ignored_event=\$\{eventType\}`\)/);
assert.match(webhooks, /\.eq\('id', webhookId\)\.eq\('processed', false\)/);
assert.doesNotMatch(webhooks, /\.eq\('gateway_reference', payload\.data\?\.reference/);
assert.doesNotMatch(webhooks, /postEntry/);
assert.doesNotMatch(webhooks, /blockWebhookFulfillment/);

assert.match(fulfillment, /requires_ops_review/);
assert.match(fulfillment, /PAYMENT_STATUS\.REQUIRES_REVIEW/);
assert.match(fulfillment, /token_delivery_failed/);
assert.match(fulfillment, /unsupported_payment_target/);

assert.match(customerPurchase, /checkout_init_failed_at/);
assert.match(customerPurchase, /customer\.purchase\.direct_pay_failed/);
assert.match(customerPurchase, /customer\.fund\.initiate_failed/);
assert.match(customerPurchase, /callbackUrl:\s*input\.callbackUrl/);
assert.match(customerPurchase, /callbackUrl\?: string/);

assert.match(paystack, /AbortSignal\.timeout\(REQUEST_TIMEOUT_MS\)/);
assert.match(paystack, /createHmac\('sha512', env\.PAYSTACK_SECRET_KEY\)/);
assert.doesNotMatch(paystack, /PAYSTACK_WEBHOOK_SECRET/);
assert.match(customerRoutes, /fastify\.post\('\/payments\/:reference\/verify'/);
assert.match(vendorRoutes, /fastify\.post\('\/payments\/:reference\/verify'/);
assert.match(customerRoutes, /CUSTOMER_APP_URL/);
assert.match(vendorRoutes, /VENDOR_PORTAL_URL/);
assert.match(routePolicy, /customer\/payments\/:reference\/verify', \{ money: true \}/);
assert.match(routePolicy, /vendor\/payments\/:reference\/verify', \{ money: true \}/);

assert.match(migration, /add column if not exists channel text/);
assert.match(migration, /add column if not exists completed_at timestamptz/);
assert.match(migration, /where status = 'success'/);
assert.match(migration, /create table if not exists public\.payment_webhooks/);
assert.match(migration, /payment_webhooks_unprocessed_reference_idx/);
assert.match(migration, /wallet service role all payment webhooks/);

assert.match(customerFundingHistory, /isSuccessfulStatus/);
assert.match(customerFundingHistory, /\['succeeded', 'success'\]/);
assert.match(customerFundingHistory, /succeeded:\s*'success'/);

assert.match(reconciliation, /\.gte\('completed_at', since\)/);
assert.match(reconciliation, /\.lte\('completed_at', until\)/);
assert.match(reconciliation, /PAYMENT_SUCCEEDED_STATUSES/);
assert.match(reconciliation, /\.in\('status', Array\.from\(PAYMENT_SUCCEEDED_STATUSES\)\)/);
assert.doesNotMatch(reconciliation, /\.eq\('status', 'succeeded'\)/);

assert.doesNotMatch(scheduler, /void adminClient\.rpc\('fn_release_hold'/);
assert.match(scheduler, /const \{ error \} = await adminClient\.rpc\('fn_release_hold'/);
assert.match(scheduler, /released\+\+/);

console.log("payment transaction status contract passed");
