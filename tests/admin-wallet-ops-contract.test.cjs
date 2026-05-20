"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function main() {
  const adminRoute = read("backend/wallet/src/routes/admin.ts");
  const auditPage = read("apps/admin/src/views/Audit.vue");
  const disputesPage = read("apps/admin/src/views/Disputes.vue");
  const refundsPage = read("apps/admin/src/views/Refunds.vue");
  const settlementPage = read("apps/admin/src/views/Settlement.vue");
  const reconciliationPage = read("apps/admin/src/views/Reconciliation.vue");
  const vendingPage = read("apps/admin/src/views/Vending.vue");
  const refundsService = read("backend/wallet/src/services/refunds.ts");
  const disputesService = read("backend/wallet/src/services/disputes.ts");
  const settlementService = read("backend/wallet/src/services/settlement.ts");
  const reconciliationService = read("backend/wallet/src/services/reconciliation.ts");

  for (const route of [
    "fastify.get('/audit'",
    "fastify.get('/security-events'",
    "fastify.get('/disputes'",
    "fastify.patch('/disputes/:id'",
    "fastify.get('/refunds'",
    "fastify.post('/refunds/:id/approve'",
    "fastify.post('/refunds/:id/reject'",
    "fastify.get('/settlement'",
    "fastify.get('/reconciliation'",
    "fastify.post('/reconciliation/run'",
    "fastify.get('/purchases'",
    "fastify.get('/vending'",
  ]) {
    assert(adminRoute.includes(route), `Missing admin route: ${route}`);
  }

  assert(auditPage.includes("/api/v1/admin/audit?"), "Audit page must load audit rows.");
  assert(auditPage.includes("/api/v1/admin/security-events?"), "Audit page must load security rows.");
  assert(auditPage.includes("/api/v1/admin/audit/summary?"), "Audit page must load audit summary.");
  assert(auditPage.includes("/api/v1/admin/audit/export.csv?"), "Audit page must export CSV.");

  assert(disputesPage.includes("/api/v1/admin/disputes"), "Disputes page must use admin disputes API.");
  assert(adminRoute.includes("dispute.message"), "Dispute note-only updates must be audit logged.");
  assert(adminRoute.includes("status_required"), "Resolution notes must require status updates.");
  assert(disputesService.includes("listAllDisputes"), "Dispute list service contract missing.");

  assert(refundsPage.includes("statusFilter = ref('pending')"), "Refunds page must use backend pending status.");
  assert(!refundsPage.includes('value="requested"'), "Refunds page must not use unsupported requested status.");
  assert(refundsService.includes("status !== 'pending'"), "Refund approvals must enforce pending status.");
  assert(adminRoute.includes("status === 'requested' || status === 'under_review'"), "Refund route must keep legacy status aliases.");

  assert(settlementPage.includes("/api/v1/admin/settlement"), "Settlement page must use settlement API.");
  assert(settlementService.includes("listSettlementBatches"), "Settlement service contract missing.");

  assert(reconciliationPage.includes("/api/v1/admin/reconciliation"), "Reconciliation page must use reconciliation API.");
  assert(reconciliationPage.includes("/api/v1/admin/reconciliation/run"), "Reconciliation page must trigger backend runs.");
  assert(adminRoute.includes("db_total_minor"), "Reconciliation route must expose UI-compatible DB totals.");
  assert(reconciliationService.includes("listReconciliationRuns"), "Reconciliation service contract missing.");

  assert(vendingPage.includes("/api/v1/admin/purchases"), "Vending monitor must use real purchases endpoint.");
  assert(vendingPage.includes("bw-error-banner"), "Vending monitor must show load failures.");
  assert(adminRoute.includes("nextCursor"), "Purchases/vending routes must expose pagination cursors.");
  assert(adminRoute.includes("function isUuid"), "Purchase search must guard UUID equality filters.");
  assert(adminRoute.includes("if (isUuid(q)) filters.push(`id.eq.${q}`);"), "Purchase search must avoid invalid UUID filters.");

  console.log(JSON.stringify({
    status: "admin wallet ops contract passed",
    coverage: ["audit", "security", "disputes", "refunds", "settlement", "reconciliation", "vending"]
  }, null, 2));
}

main();
