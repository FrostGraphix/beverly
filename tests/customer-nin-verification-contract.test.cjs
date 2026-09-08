const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const adapter = read('backend/wallet/src/adapters/paystack.ts');
const service = read('backend/wallet/src/services/customer-kyc.ts');
const route = read('backend/wallet/src/routes/customer.ts');
const view = read('apps/customer/src/views/Kyc.vue');

assert(!adapter.includes('/identity/verify_nin'), 'unsupported Paystack NIN endpoint must stay removed');
assert(service.includes("'nin_service_unavailable'"), 'service must fail closed');
assert(!service.includes('PAYSTACK_SECRET_KEY'), 'KYC errors must not name secret configuration');
assert(route.includes("'/kyc/tier2/nin/status'"), 'availability endpoint must exist');
assert(route.includes("e.code === 'nin_service_unavailable' ? 503 : 422"), 'unavailable service must return 503');
assert(view.includes('ninAvailable !== true'), 'form must be gated by live availability');
assert(view.includes('watch(tier'), 'availability must refresh after Tier 1 completes');
assert(!view.includes('verified via Paystack Identity'), 'UI must not claim unsupported Paystack verification');
assert(view.includes('role="alert"'), 'verification errors must be announced');
assert(view.includes('aria-describedby="nin-help nin-error"'), 'NIN help and errors must be associated');

console.log('customer NIN verification contract passed');
