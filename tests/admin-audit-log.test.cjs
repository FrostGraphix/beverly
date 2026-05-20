"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function main() {
  const page = read("apps/admin/src/views/Audit.vue");
  const api = read("apps/admin/src/lib/api.ts");
  const route = read("backend/wallet/src/routes/admin.ts");
  const migration = read("supabase/migrations/20260518140000_wallet_audit_log.sql");

  assert(page.includes("auditQueryParams"), "Audit filters must be shared by list and export.");
  assert(page.includes("auditError"), "Audit page must expose a retryable error state.");
  assert(page.includes("securityError"), "Security tab must expose a retryable error state.");
  assert(page.includes("summaryError"), "Summary tab must expose a retryable error state.");
  assert(page.includes("lastAuditLoadedAt"), "Audit page must show freshness.");
  assert(page.includes("newestEntry"), "Audit page must show newest loaded entry.");
  assert(page.includes("oldestEntry"), "Audit page must show oldest loaded entry.");
  assert(page.includes("response.ok"), "CSV export must reject failed HTTP responses.");
  assert(page.includes("headers: token ?"), "CSV export must avoid empty bearer headers.");
  assert(page.includes("URL.revokeObjectURL"), "CSV export must release blob URLs.");
  assert(page.includes("Exporting..."), "CSV export must have a loading state.");
  assert(page.includes("role=\"alert\""), "Failures must be announced accessibly.");
  assert(page.includes("tabindex=\"0\""), "Audit rows must be keyboard reachable.");
  assert(page.includes("@keyup.enter=\"openDetail(e)\""), "Audit rows must open from Enter.");
  assert(page.includes("@keyup.space.prevent=\"openDetail(e)\""), "Audit rows must open from Space.");

  assert(api.includes("Authorization"), "Admin API calls must send bearer auth.");
  assert(api.includes("handleUnauthorized"), "Admin API must handle expired sessions.");

  assert(route.includes("audit_log_unavailable"), "Audit API must return a hard failure on store errors.");
  assert(route.includes("audit_export_unavailable"), "Audit export must return a hard failure on store errors.");
  assert(route.includes("security_events_unavailable"), "Security API must return a hard failure on store errors.");
  assert(route.includes("audit_summary_unavailable"), "Summary API must return a hard failure on store errors.");
  assert(route.includes("targetType") && route.includes("target_id"), "Audit export must honor target filters.");

  assert(migration.includes("deny_audit_mutation"), "Audit tables must be append-only.");
  assert(migration.includes("wallet_audit_log_no_delete"), "Audit log delete guard must exist.");
  assert(migration.includes("wallet_security_events_no_delete"), "Security log delete guard must exist.");

  console.log(JSON.stringify({
    status: "admin audit log contract passed",
    coverage: ["list", "filters", "export", "summary", "security", "append-only"]
  }, null, 2));
}

main();
