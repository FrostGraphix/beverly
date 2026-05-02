import assert from "node:assert/strict";
import {
  buildTokenPayload,
  calculateTokenAmount,
  calculateTokenUnits,
  findTariff,
  parseTariffUnitPrice,
  tokenEndpoint,
  tokenValidationError
} from "../src/services/token-flow.mjs";

const tariff = { tariffId: "T1", price: "350" };
const bandTariff = { tariffId: "T2", price: "0~999999~350" };
const creditRoute = { hash: "/token-generate/credit-token" };
const clearCreditRoute = { hash: "/token-generate/clear-credit-token" };
const clearTamperRoute = { hash: "/token-generate/clear-tamper-token" };
const powerRoute = { hash: "/token-generate/set-maximum-power-limit-token" };

assert.equal(parseTariffUnitPrice("350"), 350);
assert.equal(parseTariffUnitPrice("0~999999~350"), 350);
assert.equal(parseTariffUnitPrice("0~999999~0"), 0);

assert.deepEqual(findTariff([tariff], "t1"), tariff);
assert.equal(findTariff([tariff], "missing"), null);

assert.equal(calculateTokenUnits(350, tariff), "1.0");
assert.equal(calculateTokenUnits(500, bandTariff), "1.4");
assert.equal(calculateTokenUnits(2000, tariff), "5.7");
assert.equal(calculateTokenAmount(1.4, tariff), "490");

const form = {
  customerId: "123",
  meterId: "47005346144",
  tariffId: "T1",
  authorizationPassword: "secret",
  purchaseWay: "paid",
  amount: "500",
  totalUnit: "1.4",
  payDebtPercent: "0",
  paymentMethod: "Cash"
};

assert.equal(tokenValidationError(creditRoute, form, tariff), "");
assert.equal(tokenValidationError(creditRoute, { ...form, authorizationPassword: "" }, tariff), "authorizationPassword is required");
assert.equal(tokenValidationError(creditRoute, { ...form, authorizationPassword: "" }, tariff, { requireAuthorization: false }), "");
assert.equal(tokenValidationError(creditRoute, form, null), "Tariff data is missing");

assert.deepEqual(buildTokenPayload(creditRoute, form, { isPreview: true }), {
  customerId: "123",
  meterId: "47005346144",
  tariffId: "T1",
  authorizationPassword: "secret",
  remark: "",
  isPreview: true,
  isVendByTotalPaid: true,
  amount: 500,
  totalUnit: 1.4,
  payDebtPercent: 0,
  paymentMethod: "Cash",
  isS2: false
});

assert.equal(buildTokenPayload(creditRoute, form, { isPreview: false }).isPreview, false);
assert.equal(tokenEndpoint(creditRoute, "Recharge"), "/api/token/creditToken/generate");
assert.equal(tokenEndpoint(clearCreditRoute, "Generate Token"), "/api/token/clearCreditToken/generate");
assert.equal(tokenEndpoint(clearTamperRoute, "Generate Token"), "/api/token/clearTamperToken/generate");
assert.equal(tokenEndpoint(powerRoute, "Generate Token"), "/api/token/setMaximumPowerLimitToken/generate");

assert.equal(tokenValidationError(powerRoute, { ...form, maximumPower: "" }, tariff), "maximumPower is required");
assert.equal(tokenValidationError(powerRoute, { ...form, maximumPower: "3000" }, tariff), "");

console.log("token-flow tests passed");
