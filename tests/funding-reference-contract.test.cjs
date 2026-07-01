const fs = require('fs');
const assert = require('assert');

const service = fs.readFileSync('backend/wallet/src/services/funding.ts', 'utf8');
const vendorRoute = fs.readFileSync('backend/wallet/src/routes/vendor.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260530153000_funding_reference_standardization.sql', 'utf8');

assert.match(service, /generateFundingReference/);
assert.match(service, /BEV-FND-/);
assert.match(service, /generateFundingReference\('paystack'/);
assert.match(service, /generateFundingReference\('bank_transfer'/);
assert.match(service, /funding_reference:\s*await generateFundingReference\('bank_transfer'/);
assert.match(service, /normalizeFundingEmail/);
assert.match(service, /checkout_init_failed_at/);
assert.match(service, /status:\s*'failed'/);
assert.match(service, /status:\s*'cancelled'/);
assert.match(service, /payment_init_failed/);
assert.doesNotMatch(vendorRoute, /no-email@example\.com/);
assert.match(migration, /funding_requests_funding_reference_unique_idx/);
assert.match(migration, /BEV-FND-/);
assert.match(migration, /channel = 'bank_transfer' then 'BT'/);
assert.match(migration, /channel = 'paystack' then 'PS'/);

console.log(JSON.stringify({ status: 'funding reference contract passed' }));
