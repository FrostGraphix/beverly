"use strict";

const assert = require("node:assert/strict");
const { buildSmokeCreditTokenPayload, parseTariffUnitPrice } = require("../tools/smoke-credit-token.cjs");

const account = {
  customerId: "47005377107",
  meterId: "47005377107",
  tariffId: "RESIDENTIAL"
};

const payload = buildSmokeCreditTokenPayload(account, {
  unitToVend: 0.1,
  unitPrice: parseTariffUnitPrice("350"),
  authorizationPassword: "secret",
  isPreview: true
});

assert.equal(payload.isVendByTotalPaid, true);
assert.equal(payload.amount, 35);
assert.equal(payload.totalUnit, 0.1);
assert.equal(payload.customerId, "47005377107");
assert.equal(payload.meterId, "47005377107");
assert.equal(payload.isPreview, true);

console.log("smoke-credit-token regression passed");
