"use strict";

/**
 * Proxy-side money contract. Keep this small and explicit: the Fastify
 * route policy is the complete mutation catalog; this module controls only
 * the write paths the legacy gateway may forward to it.
 */
const moneyMutations = new Set([
  "POST /api/v1/webhook/paystack",
  "POST /api/v1/vendor/funding/paystack",
  "POST /api/v1/vendor/payments/:reference/verify",
  "POST /api/v1/vendor/funding/bank-transfer",
  "POST /api/v1/vendor/meter-orders",
  "POST /api/v1/vendor/vend",
  "POST /api/v1/customer/wallet/fund",
  "POST /api/v1/customer/payments/:reference/verify",
  "POST /api/v1/customer/purchase",
  "POST /api/v1/customer/meter-orders",
  "POST /api/v1/customer/meter-orders/:id/verify-payment",
  "POST /api/v1/admin/funding/reconcile-approved",
  "POST /api/v1/admin/funding/:id/approve",
  "POST /api/v1/admin/funding/:id/reject",
  "POST /api/v1/admin/refunds",
  "POST /api/v1/admin/refunds/:id/approve",
  "POST /api/v1/admin/refunds/:id/reject",
  "POST /api/v1/admin/reconciliation/run",
  "POST /api/v1/admin/meter-orders",
  "PATCH /api/v1/admin/meter-orders/:id",
  "PATCH /api/v1/admin/wallets/:id/status",
  "PATCH /api/v1/admin/wallets/:id/limits"
]);

function matchesPath(template, pathname) {
  const expected = template.split("/").filter(Boolean);
  const actual = String(pathname || "").split("?")[0].split("/").filter(Boolean);
  if (expected.length !== actual.length) return false;
  return expected.every((segment, index) => segment.startsWith(":") || segment === actual[index]);
}

function isCanonicalMoneyMutation(pathname, method) {
  const key = String(method || "GET").toUpperCase();
  for (const entry of moneyMutations) {
    const space = entry.indexOf(" ");
    if (entry.slice(0, space) !== key) continue;
    if (matchesPath(entry.slice(space + 1), pathname)) return true;
  }
  return false;
}

module.exports = { isCanonicalMoneyMutation, moneyMutations };
