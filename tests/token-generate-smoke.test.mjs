import assert from "node:assert/strict";
import {
  buildTokenPayload,
  calculateTokenUnits,
  findTariff
} from "../src/services/token-flow.mjs";

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:9410";
const creditRoute = { hash: "/token-generate/credit-token" };

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { text };
  }
  assert.notEqual(response.status, 502, `${path} returned 502`);
  assert.ok(response.ok, `${path} returned ${response.status}`);
  return json;
}

function rows(payload) {
  const source = payload?.result || payload?.data || payload;
  if (Array.isArray(source?.data)) return source.data;
  if (Array.isArray(source?.list)) return source.list;
  if (Array.isArray(source)) return source;
  return [];
}

const accountResponse = await post("/api/account/read", { page: 1, pageSize: 20 });
const tariffResponse = await post("/api/tariff/read", { page: 1, pageSize: 100 });
const accounts = rows(accountResponse);
const tariffs = rows(tariffResponse);
const account = accounts.find((row) => findTariff(tariffs, row.tariffId));

assert.ok(account, "No account has matching tariff data");

const tariff = findTariff(tariffs, account.tariffId);
const form = {
  customerId: account.customerId,
  customerName: account.customerName,
  meterId: account.meterId,
  tariffId: account.tariffId,
  purchaseWay: "paid",
  amount: "350",
  totalUnit: calculateTokenUnits("350", tariff),
  payDebtPercent: "0",
  paymentMethod: "Cash",
  authorizationPassword: ""
};

const previewPayload = buildTokenPayload(creditRoute, form, { isPreview: true });
const previewResponse = await post("/api/token/creditToken/generate", previewPayload);
assert.equal(previewResponse.code, 0, previewResponse.reason || "Preview failed");
assert.ok(previewResponse.result || previewResponse.data, "Preview result missing");

console.log("token-generate preview smoke passed");
