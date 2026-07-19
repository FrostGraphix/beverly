import assert from "node:assert/strict";
import {
  buildLocalTokenPreview,
  buildTokenPayload,
  buildChangeMeterKeyTokenPayload,
  buildMeterKeyUpdatePayload,
  calculateTokenAmount,
  calculateTokenUnits,
  calculateVendingVatBreakdown,
  extractChangeMeterKeyTokens,
  findTariff,
  guardedPreviewError,
  isTokenRejectRemark,
  keySyncEligible,
  meterPhaseFromRow,
  parseTariffUnitPrice,
  tokenEndpoint,
  tokenUsesS2,
  isThreePhaseTokenMode,
  tokenValidationError,
  usesLocalTokenPreview
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

// VAT-inclusive: customer pays 2000 total; VAT is extracted in minor units.
assert.deepEqual(calculateVendingVatBreakdown(2000), { grossAmount: 2000, energyAmount: 1860.47, vatAmount: 139.53, vatRateBasisPoints: 750 });
assert.equal(calculateTokenUnits(350, tariff), "0.9302");
assert.equal(calculateTokenUnits(500, bandTariff), "1.3289");
assert.equal(calculateTokenUnits(1000, tariff), "2.6578");
assert.equal(calculateTokenUnits(2000, tariff), "5.3156");
assert.equal(calculateTokenAmount(1.4, tariff), "526.75");

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
assert.equal(meterPhaseFromRow({ isThreePhase: 1 }), "three-phase");
assert.equal(meterPhaseFromRow({ isThreePhase: 0 }), "single-phase");
assert.equal(meterPhaseFromRow({ meterType: "3 phase split" }), "three-phase");
assert.equal(tokenValidationError(creditRoute, { ...form, requireThreePhase: true, isThreePhase: 0 }, tariff), "3-phase meter is required");
assert.equal(tokenValidationError(creditRoute, { ...form, requireThreePhase: true, isThreePhase: 1 }, tariff), "");
assert.equal(tokenUsesS2(form), false);
assert.equal(tokenUsesS2({ ...form, isThreePhase: 1 }), true);
assert.equal(tokenUsesS2({ ...form, requireThreePhase: true, isThreePhase: 1 }), true);
assert.equal(isThreePhaseTokenMode({ meterPhaseMode: "three-phase" }), true);
assert.equal(tokenValidationError(creditRoute, { ...form, meterPhaseMode: "three-phase", isThreePhase: 0 }, tariff), "3-phase meter is required");
assert.equal(keySyncEligible({ ...form, isThreePhase: 1 }), true);
assert.equal(keySyncEligible(form), false);
assert.equal(isTokenRejectRemark("Remote send failed: TokenReject"), true);
assert.equal(isTokenRejectRemark("Remote send failed"), false);

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
assert.equal(buildTokenPayload(creditRoute, { ...form, isThreePhase: 1 }, { isPreview: false }).isS2, true);
assert.equal(Object.prototype.hasOwnProperty.call(buildTokenPayload(creditRoute, form), "isThreePhase"), false);
assert.deepEqual(buildChangeMeterKeyTokenPayload(form), { meterId: "47005346144" });
assert.deepEqual(buildMeterKeyUpdatePayload({
  meterId: "47300481810",
  sgc: "250405",
  krn: 1,
  ken: 255,
  ti: 1,
  kt: 0,
  baseYear: 2014
}), [{
  meterId: "47300481810",
  sgcNew: "250405",
  krnNew: 1,
  kenNew: 255,
  tiNew: 1,
  ktNew: 0,
  baseYearNew: 2014
}]);
assert.equal(buildMeterKeyUpdatePayload({ meterId: "47300481810" }), null);
assert.deepEqual(extractChangeMeterKeyTokens({
  result: {
    tokenFirst: "1111 2222 3333 4444 5555",
    tokenSecond: "6666 7777 8888 9999 0000"
  }
}), ["11112222333344445555", "66667777888899990000"]);
assert.equal(tokenEndpoint(creditRoute, "Recharge"), "/api/token/creditToken/generate");
assert.equal(tokenEndpoint(clearCreditRoute, "Generate Token"), "/api/token/clearCreditToken/generate");
assert.equal(tokenEndpoint(clearTamperRoute, "Generate Token"), "/api/token/clearTamperToken/generate");
assert.equal(tokenEndpoint(powerRoute, "Generate Token"), "/api/token/setMaximumPowerLimitToken/generate");
assert.equal(usesLocalTokenPreview(creditRoute), true);
assert.equal(usesLocalTokenPreview(clearCreditRoute), false);
assert.equal(guardedPreviewError({ response: { status: 403, data: { _proxy: { source: "guard" } } } }), true);
assert.equal(guardedPreviewError(new Error("Request failed with status code 500")), false);

const localPreview = buildLocalTokenPreview(creditRoute, form);
assert.equal(localPreview.code, 0);
assert.equal(localPreview.data.meterId, form.meterId);
assert.match(localPreview.data.token, /^\d{4} \d{4} \d{4} \d{4} \d{4}$/);

assert.equal(tokenValidationError(powerRoute, { ...form, maximumPower: "" }, tariff), "maximumPower is required");
assert.equal(tokenValidationError(powerRoute, { ...form, maximumPower: "3000" }, tariff), "");

console.log("token-flow tests passed");
