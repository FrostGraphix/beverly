export const purchaseWays = [
  { value: "paid", label: "Vend By Total Paid" },
  { value: "unit", label: "Vend By Total Unit" }
];

export const paymentMethods = ["Cash", "Check", "E-Pay"];

export function isTokenGenerateRoute(route = {}) {
  return String(route.hash || "").includes("token-generate");
}

export function isTokenGenerateAction(route = {}, action = "") {
  return isTokenGenerateRoute(route) && ["Recharge", "Generate Token"].includes(action);
}

export function isCreditTokenRoute(route = {}) {
  return String(route.hash || "").includes("credit-token") && !String(route.hash || "").includes("clear-credit");
}

export function tokenEndpoint(route = {}, action = "") {
  const hash = String(route.hash || "");
  if (action === "Recharge") return "/api/token/creditToken/generate";
  if (hash.includes("clear-credit")) return "/api/token/clearCreditToken/generate";
  if (hash.includes("clear-tamper")) return "/api/token/clearTamperToken/generate";
  if (hash.includes("set-maximum-power-limit")) return "/api/token/setMaximumPowerLimitToken/generate";
  return "";
}

export function parseTariffUnitPrice(price) {
  const parts = String(price ?? "").split("~").map((part) => Number(part)).filter((value) => Number.isFinite(value));
  if (parts.length >= 3) return parts[2] > 0 ? parts[2] : 0;
  return parts[0] > 0 ? parts[0] : 0;
}

export function findTariff(tariffs = [], tariffId = "") {
  const id = String(tariffId || "").trim().toLowerCase();
  return tariffs.find((tariff) => String(tariff.tariffId || tariff.id || "").trim().toLowerCase() === id) || null;
}

export function roundOneDecimal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return (Math.round(number * 10) / 10).toFixed(1);
}

export function calculateTokenUnits(amount, tariff) {
  const unitPrice = parseTariffUnitPrice(tariff?.price);
  const paid = Number(amount);
  if (!unitPrice || !Number.isFinite(paid)) return "";
  return roundOneDecimal(paid / unitPrice);
}

export function calculateTokenAmount(totalUnit, tariff) {
  const unitPrice = parseTariffUnitPrice(tariff?.price);
  const units = Number(totalUnit);
  if (!unitPrice || !Number.isFinite(units)) return "";
  return String(Math.round(units * unitPrice * 100) / 100);
}

export function tokenValidationError(route, form = {}, tariff = null) {
  if (!String(form.meterId || "").trim()) return "meterId is required";
  if (!String(form.authorizationPassword || "").trim()) return "authorizationPassword is required";
  if (isCreditTokenRoute(route)) {
    if (!tariff) return "Tariff data is missing";
    if (!parseTariffUnitPrice(tariff.price)) return "Tariff price is invalid";
    if (String(form.purchaseWay || "paid") === "paid" && !(Number(form.amount) > 0)) return "amount is required";
    if (String(form.purchaseWay || "paid") === "unit" && !(Number(form.totalUnit) > 0)) return "totalUnit is required";
  }
  if (String(route.hash || "").includes("set-maximum-power-limit") && !(Number(form.maximumPower) > 0)) {
    return "maximumPower is required";
  }
  return "";
}

export function buildTokenPayload(route, form = {}, options = {}) {
  const isPreview = options.isPreview !== false;
  const base = {
    customerId: form.customerId,
    meterId: form.meterId,
    tariffId: form.tariffId,
    authorizationPassword: form.authorizationPassword,
    remark: form.remark || "",
    isPreview
  };

  if (isCreditTokenRoute(route)) {
    return {
      ...base,
      isVendByTotalPaid: String(form.purchaseWay || "paid") !== "unit",
      amount: Number(form.amount || 0),
      totalUnit: Number(form.totalUnit || 0),
      payDebtPercent: Number(form.payDebtPercent || 0),
      paymentMethod: form.paymentMethod || "Cash",
      isS2: false
    };
  }

  if (String(route.hash || "").includes("set-maximum-power-limit")) {
    return {
      ...base,
      maximumPower: Number(form.maximumPower || 0)
    };
  }

  return base;
}

export function tokenResultFields(payload = {}) {
  const source = payload.result || payload.data || payload;
  return [
    ["Receipt Id", source.receiptId || source.id],
    ["Token", source.token || source.tokenFirst],
    ["Create Time", source.createDate || source.createTime || source.time],
    ["Status", source.status === false ? "Failed" : source.status === true ? "Success" : source.reason || source.msg]
  ].filter((field) => field[1] !== undefined && field[1] !== null && field[1] !== "");
}
