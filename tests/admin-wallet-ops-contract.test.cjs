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
  const adminAuditRoute = read("backend/wallet/src/routes/admin-audit.ts");
  const adminRoutes = `${adminRoute}\n${adminAuditRoute}`;
  const auditPage = read("apps/admin/src/views/Audit.vue");
  const disputesPage = read("apps/admin/src/views/Disputes.vue");
  const refundsPage = read("apps/admin/src/views/Refunds.vue");
  const settlementPage = read("apps/admin/src/views/Settlement.vue");
  const reconciliationPage = read("apps/admin/src/views/Reconciliation.vue");
  const vendingPage = read("apps/admin/src/views/Vending.vue");
  const refundsService = read("backend/wallet/src/services/refunds.ts");
  const refundApprovalRpc = read("supabase/migrations/20260606110000_refund_approval_rpc.sql");
  const scheduler = read("backend/wallet/src/jobs/scheduler.ts");
  const refundExpiryMigration = read("supabase/migrations/20260601133000_refund_expiry_status.sql");
  const disputesService = read("backend/wallet/src/services/disputes.ts");
  const settlementService = read("backend/wallet/src/services/settlement.ts");
  const reconciliationService = read("backend/wallet/src/services/reconciliation.ts");

  for (const route of [
    "fastify.get('/audit'",
    "fastify.get('/security-events'",
    "fastify.get('/disputes'",
    "fastify.patch('/disputes/:id'",
    "fastify.get('/refunds'",
    "fastify.get('/refunds/summary'",
    "fastify.post('/refunds/:id/approve'",
    "fastify.post('/refunds/:id/reject'",
    "fastify.get('/settlement'",
    "fastify.get('/reconciliation'",
    "fastify.post('/reconciliation/run'",
    "fastify.get('/purchases'",
    "fastify.get('/vending'",
  ]) {
    assert(adminRoutes.includes(route), `Missing admin route: ${route}`);
  }

  assert(auditPage.includes("/api/v1/admin/audit?"), "Audit page must load audit rows.");
  assert(auditPage.includes("/api/v1/admin/security-events?"), "Audit page must load security rows.");
  assert(auditPage.includes("/api/v1/admin/audit/summary?"), "Audit page must load audit summary.");
  assert(auditPage.includes("/api/v1/admin/audit/export.csv?"), "Audit page must export CSV.");

  assert(disputesPage.includes("/api/v1/admin/disputes"), "Disputes page must use admin disputes API.");
  assert(adminRoute.includes("dispute.message"), "Dispute note-only updates must be audit logged.");
  assert(adminRoute.includes("status_required"), "Resolution notes must require status updates.");
  assert(disputesService.includes("listAllDisputes"), "Dispute list service contract missing.");

  assert.match(refundsPage, /statusFilter\s*=\s*ref(?:<[^>]+>)?\('pending'\)/, "Refunds page must use backend pending status.");
  assert(refundsPage.includes('/api/v1/admin/refunds/summary'), "Refunds page must load server summary cards.");
  assert(refundsPage.includes('class="bw-kpi-grid refund-kpis"'), "Refunds page must render summary cards.");
  assert(refundsService.includes("count: 'exact', head: true"), "Refund summary must use exact server counts.");
  assert(!refundsPage.includes('value="requested"'), "Refunds page must not use unsupported requested status.");
  assert(refundsService.includes("fn_approve_refund_request"), "Refund approvals must use the atomic RPC.");
  assert(refundApprovalRpc.includes("for update"), "Refund approval RPC must lock the request row.");
  assert(refundApprovalRpc.includes("v_request.status <> 'pending'"), "Refund approval RPC must enforce pending status.");
  assert(refundApprovalRpc.includes("fn_post_ledger_entry"), "Refund approval RPC must write the ledger entry.");
  assert(refundApprovalRpc.includes("ledger_entry_id = v_entry.id"), "Refund approval RPC must persist ledger linkage.");
  assert(refundsService.includes(".select('status, reason')"), "Refund rejection must preserve the original reason.");
  assert(refundsService.includes(".eq('status', 'pending')"), "Refund rejection must atomically require pending status.");
  assert(refundsService.includes("if (updateError)"), "Refund rejection must surface failed database updates.");
  assert(refundsService.includes("Could not load refund requests"), "Refund listing must not turn database failures into empty results.");
  assert(refundsService.includes("'pending', 'approved', 'rejected', 'expired'"), "Refund summary must include expired requests.");
  assert(refundsPage.includes('<option value="expired">Expired</option>'), "Refund filters must expose expired requests.");
  assert(refundsPage.includes("Second approver required"), "Refund approvals must explain maker-checker separation.");
  assert(refundsPage.includes("Try again"), "Refund load failures must offer recovery.");
  assert(refundsService.includes("state_transition_missing"), "Refund approval must fail loudly if state does not update after credit.");
  assert(scheduler.includes("status: 'expired'"), "Refund expiry job must transition stale pending refunds.");
  assert(refundExpiryMigration.includes("add value if not exists 'expired'"), "Refund enum must allow expired status.");
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
  assert(adminRoute.includes("if (isUuid(safeQ)) filters.push(`id.eq.${safeQ}`);"), "Purchase search must avoid invalid UUID filters.");

  console.log(JSON.stringify({
    status: "admin wallet ops contract passed",
    coverage: ["audit", "security", "disputes", "refunds", "settlement", "reconciliation", "vending"]
  }, null, 2));
}

main();
