"use strict";

const supabase = require("./supabase-service");

const defaultRetention = {
  hotReadingDays: 90,
  cacheDays: 1,
  snapshotDays: 14,
  exportDays: 180,
  printDays: 365,
  importDays: 365,
  writeConfirmationDays: 730,
  automationDeliveryDays: 90
};

function governanceEnabled() {
  return process.env.DATA_GOVERNANCE_ENABLED === "true" || process.env.SESSION_STORE_MODE === "supabase";
}

function retentionPolicy() {
  return {
    hotReadingDays: Number(process.env.CONSUMPTION_HOT_RETENTION_DAYS || defaultRetention.hotReadingDays),
    cacheDays: Number(process.env.CACHE_RETENTION_DAYS || defaultRetention.cacheDays),
    snapshotDays: Number(process.env.SNAPSHOT_RETENTION_DAYS || defaultRetention.snapshotDays),
    exportDays: Number(process.env.EXPORT_RETENTION_DAYS || defaultRetention.exportDays),
    printDays: Number(process.env.PRINT_RETENTION_DAYS || defaultRetention.printDays),
    importDays: Number(process.env.IMPORT_RETENTION_DAYS || defaultRetention.importDays),
    writeConfirmationDays: Number(process.env.WRITE_CONFIRMATION_RETENTION_DAYS || defaultRetention.writeConfirmationDays),
    automationDeliveryDays: Number(process.env.AUTOMATION_DELIVERY_RETENTION_DAYS || defaultRetention.automationDeliveryDays)
  };
}

function cutoffIso(days, now = new Date()) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - Math.max(1, Number(days || 1)));
  return date.toISOString();
}

async function deleteOlderThan(table, column, cutoff, dryRun) {
  if (dryRun) {
    return { table, deleted: 0, cutoff, dryRun: true };
  }
  await supabase.restRequest(`/${table}?${column}=lt.${encodeURIComponent(cutoff)}`, {
    method: "DELETE",
    prefer: "return=minimal"
  });
  return { table, deleted: null, cutoff, dryRun: false };
}

async function deleteArtifactJobsOlderThan(table, column, cutoff, dryRun) {
  if (dryRun) {
    return { table, deleted: 0, storageDeleted: 0, cutoff, dryRun: true };
  }
  const rows = await supabase.restRequest(
    `/${table}?select=id,storage_bucket,storage_path&${column}=lt.${encodeURIComponent(cutoff)}&order=${column}.asc&limit=500`
  );
  const jobs = Array.isArray(rows) ? rows : [];
  const grouped = new Map();
  for (const job of jobs) {
    const bucket = String(job.storage_bucket || "").trim();
    const objectPath = String(job.storage_path || "").trim();
    if (!bucket || !objectPath) continue;
    if (!grouped.has(bucket)) grouped.set(bucket, new Set());
    grouped.get(bucket).add(objectPath);
  }

  let storageDeleted = 0;
  for (const [bucket, objectPathSet] of grouped) {
    const objectPaths = [...objectPathSet];
    await supabase.deleteStorageObjects(bucket, objectPaths);
    storageDeleted += objectPaths.length;
  }

  const ids = jobs.map((job) => String(job.id || "").trim()).filter(Boolean);
  if (ids.length) {
    await supabase.restRequest(`/${table}?id=in.(${ids.map(encodeURIComponent).join(",")})`, {
      method: "DELETE",
      prefer: "return=minimal"
    });
  }
  return {
    table,
    deleted: ids.length,
    storageDeleted,
    cutoff,
    dryRun: false,
    batchLimited: jobs.length === 500
  };
}

async function runRetentionCleanup(options = {}) {
  if (!governanceEnabled() || !supabase.serviceConfigured()) {
    return {
      ok: false,
      reason: "Supabase governance disabled",
      results: []
    };
  }

  const now = options.now || new Date();
  const dryRun = options.dryRun === true;
  const policy = retentionPolicy();
  const jobs = [
    ["api_cache", "updated_at", policy.cacheDays],
    ["operational_snapshots", "captured_at", policy.snapshotDays],
    ["import_jobs", "created_at", policy.importDays],
    ["write_confirmations", "created_at", policy.writeConfirmationDays],
    ["automation_deliveries", "created_at", policy.automationDeliveryDays]
  ];

  const results = [];
  for (const [table, column, days] of jobs) {
    results.push(await deleteOlderThan(table, column, cutoffIso(days, now), dryRun));
  }
  results.splice(2, 0,
    await deleteArtifactJobsOlderThan("export_jobs", "created_at", cutoffIso(policy.exportDays, now), dryRun),
    await deleteArtifactJobsOlderThan("print_jobs", "created_at", cutoffIso(policy.printDays, now), dryRun)
  );
  if (!dryRun) {
    results.push({
      table: "application_retention",
      deleted: await supabase.restRequest("/rpc/cleanup_app_retention", { method: "POST", body: {} }),
      cutoff: null,
      dryRun: false
    });
  }

  return {
    ok: true,
    dryRun,
    policy,
    results
  };
}

async function rolePermissionAudit() {
  if (!governanceEnabled() || !supabase.serviceConfigured()) {
    return {
      ok: false,
      reason: "Supabase governance disabled",
      findings: []
    };
  }

  const [roles, users, permissions] = await Promise.all([
    supabase.restRequest("/roles?select=role_key,role_name"),
    supabase.restRequest("/users?select=user_id,user_name,role_key"),
    supabase.restRequest("/permissions?select=role_key,route_hash")
  ]);

  const roleKeys = new Set((Array.isArray(roles) ? roles : []).map((role) => role.role_key));
  const permissionRoles = new Set((Array.isArray(permissions) ? permissions : []).map((permission) => permission.role_key));
  const findings = [];

  for (const role of Array.isArray(roles) ? roles : []) {
    if (!permissionRoles.has(role.role_key)) {
      findings.push({
        severity: "medium",
        kind: "role-without-permissions",
        roleKey: role.role_key,
        message: `${role.role_name || role.role_key} has no permissions`
      });
    }
  }

  for (const user of Array.isArray(users) ? users : []) {
    if (!roleKeys.has(user.role_key)) {
      findings.push({
        severity: "high",
        kind: "user-invalid-role",
        userId: user.user_id,
        roleKey: user.role_key,
        message: `${user.user_name || user.user_id} references missing role ${user.role_key}`
      });
    }
  }

  if (!permissionRoles.has("super-admin")) {
    findings.push({
      severity: "critical",
      kind: "super-admin-missing-permission",
      roleKey: "super-admin",
      message: "Super admin has no permission entry"
    });
  }

  return {
    ok: findings.length === 0,
    roles: Array.isArray(roles) ? roles.length : 0,
    users: Array.isArray(users) ? users.length : 0,
    permissions: Array.isArray(permissions) ? permissions.length : 0,
    findings
  };
}

async function runGovernance(options = {}) {
  const [cleanup, permissions] = await Promise.all([
    runRetentionCleanup(options),
    rolePermissionAudit()
  ]);
  return {
    ok: cleanup.ok && permissions.ok,
    cleanup,
    permissions
  };
}

function governancePlan() {
  return {
    retention: retentionPolicy(),
    cadence: "daily at 00:00 UTC via Vercel Cron",
    backup: {
      database: "Supabase dashboard scheduled backups or pg_dump",
      storage: "monthly bucket inventory and archive review",
      restoreDrill: "monthly restore into staging"
    },
    audits: [
      "role permission audit",
      "cache expiry cleanup",
      "snapshot retention cleanup",
      "export retention cleanup",
      "receipt retention cleanup"
    ]
  };
}

module.exports = {
  cutoffIso,
  deleteArtifactJobsOlderThan,
  governancePlan,
  retentionPolicy,
  rolePermissionAudit,
  runGovernance,
  runRetentionCleanup
};
