const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const admin = read("backend/wallet/src/routes/admin.ts");
const service = read("backend/wallet/src/services/dev-console.ts");
const router = read("apps/admin/src/router/index.ts");
const migration = read("supabase/migrations/20260601120000_dev_console_access.sql");
const bootstrap = read("tools/ensure-dev-console-user.mjs");
const serviceHealthView = read("apps/admin/src/views/DevServiceHealth.vue");
const queueMonitorView = read("apps/admin/src/views/DevQueueMonitor.vue");
const schemaExplorerView = read("apps/admin/src/views/DevSchemaExplorer.vue");
const pkg = JSON.parse(read("package.json"));

const routeContracts = [
  "GET /dev/api-keys",
  "POST /dev/api-keys",
  "DELETE /dev/api-keys/:id",
  "POST /dev/api-keys/:id/rotate",
  "GET /dev/webhooks",
  "POST /dev/webhooks",
  "PATCH /dev/webhooks/:id",
  "DELETE /dev/webhooks/:id",
  "GET /dev/webhooks/deliveries",
  "POST /dev/webhooks/deliveries/:id/replay",
  "GET /dev/api-log",
  "GET /dev/sandbox/status",
  "GET /dev/sandbox/activity",
  "POST /dev/sandbox/mode",
  "POST /dev/sandbox/seed-wallet",
  "POST /dev/sandbox/mock-vend",
  "GET /dev/health",
  "GET /dev/health/incidents",
  "GET /dev/queues",
  "GET /dev/queues/jobs",
  "POST /dev/queues/jobs/:id/retry",
  "DELETE /dev/queues/jobs/:id",
  "POST /dev/queues/retry-all-failed",
  "GET /dev/errors",
  "POST /dev/errors/:fingerprint/resolve",
  "GET /dev/slow-queries",
  "POST /dev/toolkit/simulate-vend",
  "POST /dev/toolkit/eih-inspect",
  "GET /dev/toolkit/ledger/:id",
  "GET /dev/migrations",
  "POST /dev/migrations/dry-run",
  "GET /dev/sys-config",
  "PUT /dev/sys-config/:key",
  "GET /dev/notif-templates",
  "PUT /dev/notif-templates/:id",
  "POST /dev/notif-templates/:id/test-send",
  "GET /dev/schema",
  "GET /dev/role-matrix",
  "GET /dev/deploy-log",
];

for (const contract of routeContracts) {
  assert.match(admin, new RegExp(`'${contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}': 'dev\\.console'`));
}

const handlers = [
  "fastify.get('/dev/api-keys'",
  "fastify.post('/dev/api-keys'",
  "fastify.delete('/dev/api-keys/:id'",
  "fastify.post('/dev/api-keys/:id/rotate'",
  "fastify.get('/dev/webhooks'",
  "fastify.post('/dev/webhooks'",
  "fastify.patch('/dev/webhooks/:id'",
  "fastify.delete('/dev/webhooks/:id'",
  "fastify.get('/dev/webhooks/deliveries'",
  "fastify.post('/dev/webhooks/deliveries/:id/replay'",
  "fastify.get('/dev/schema'",
  "fastify.get('/dev/role-matrix'",
  "fastify.get('/dev/deploy-log'",
];

for (const marker of handlers) {
  assert.ok(admin.includes(marker), `missing handler ${marker}`);
}

const devRoutes = [...router.matchAll(/path: '\/dev[^']*'[\s\S]{0,180}?permission: '([^']+)'/g)];
assert.ok(devRoutes.length >= 10, "admin router must expose dev console views");
for (const route of devRoutes) {
  assert.equal(route[1], "dev.console", "all /dev routes must require dev.console");
}

for (const table of [
  "dev_api_keys",
  "dev_webhooks",
  "dev_webhook_deliveries",
  "dev_queue_jobs",
  "dev_sys_config",
  "dev_notification_templates",
  "dev_sandbox_activity",
  "dev_error_groups",
  "dev_slow_queries",
  "dev_service_incidents",
  "dev_deploy_log",
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
}

assert.match(service, /hashSecret/);
assert.match(service, /seedSandboxWallet/);
assert.match(service, /getSandboxMode/);
assert.match(service, /sandbox_test_mode_required/);
assert.match(service, /listRoleMatrix/);
assert.match(service, /parseSchemaFromMigrations/);
assert.match(service, /listDevHealth/);
assert.match(service, /listDevIncidents/);
assert.match(service, /listDevQueues/);
assert.match(service, /listDevDeployLog/);
assert.match(serviceHealthView, /\/api\/v1\/admin\/dev\/health/);
assert.match(serviceHealthView, /\/api\/v1\/admin\/dev\/health\/incidents/);
assert.match(queueMonitorView, /\/api\/v1\/admin\/dev\/queues/);
assert.match(queueMonitorView, /retry-all-failed/);
assert.match(schemaExplorerView, /\/api\/v1\/admin\/dev\/deploy-log/);
assert.match(bootstrap, /DEV_CONSOLE_PASSWORD/);
assert.match(bootstrap, /route_hash', 'dev\.console'/);
assert.match(pkg.scripts["dev-console:user"], /ensure-dev-console-user\.mjs/);
assert.match(pkg.scripts["test:wallet"], /admin-dev-console-contract\.test\.cjs/);

console.log("admin dev console contract passed");
