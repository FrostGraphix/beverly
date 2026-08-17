const assert = require('node:assert/strict');

const { walletPaymentEnv } = require('../tools/dev-wallet-payment-env.cjs');

const env = walletPaymentEnv({ KEEP_ME: 'yes' });

assert.equal(env.KEEP_ME, 'yes');
assert.equal(env.CUSTOMER_APP_URL, 'http://localhost:5173');
assert.equal(env.VENDOR_PORTAL_URL, 'http://localhost:5174');
assert.equal(env.CUSTOMER_FUNDING_CALLBACK_URL, 'http://localhost:5173/wallet/fund?payment=return');
assert.equal(env.VENDOR_FUNDING_CALLBACK_URL, 'http://localhost:5174/wallet/fund?payment=return');
assert.equal(env.CUSTOMER_METER_ORDER_CALLBACK_URL, 'http://localhost:5173/meter-orders');

console.log('development payment callbacks passed');
