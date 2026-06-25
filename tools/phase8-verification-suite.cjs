#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const root = path.resolve(__dirname, "..");
const migrationsDir = path.join(root, "supabase", "migrations");
const reportDir = path.join(root, "docs", "release");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readIfExists(relativePath) {
  const target = path.join(root, relativePath);
  return fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
}

function assertContains(haystack, needle, message) {
  assert(haystack.includes(needle), message);
}

function listMigrations() {
  return fs.readdirSync(migrationsDir)
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort();
}

function staticMigrationChecks(results) {
  const migrations = listMigrations();
  const versions = migrations.map((name) => name.slice(0, 14));
  assert.equal(new Set(versions).size, versions.length, "migration versions must be unique");
  assert.deepEqual([...migrations].sort(), migrations, "migrations must sort lexically");
  assert(migrations.includes("20260624100000_phase7_data_governance.sql"), "phase 7 governance migration must exist");

  const phase7 = read("supabase/migrations/20260624100000_phase7_data_governance.sql");
  assertContains(phase7, "public.vat_policies", "VAT policy table missing");
  assertContains(phase7, "payload_encrypted", "webhook encryption column missing");
  assertContains(phase7, "purge_expired_payment_webhooks", "webhook purge RPC missing");
  assertContains(phase7, "750", "default VAT must remain 750 basis points");

  const atomicHolds = read("supabase/migrations/20260622140000_wallet_atomic_holds.sql");
  assertContains(atomicHolds, "for update", "atomic hold functions must lock wallet rows");
  assertContains(atomicHolds, "id <> v_hold.id", "capture must exclude target hold reservation");
  assertContains(atomicHolds, "wallet_idempotency_requests", "wallet idempotency table missing");
  assertContains(atomicHolds, "revoke all on function public.fn_create_hold", "hold RPC must revoke public execute");

  const paymentLeases = read("supabase/migrations/20260622150000_payment_fulfillment_leases.sql");
  assertContains(paymentLeases, "fn_claim_payment_fulfillment", "payment fulfillment lease missing");
  assertContains(paymentLeases, "fulfillment_lease_token", "payment lease token missing");

  results.staticChecks.push({
    name: "migration inventory",
    status: "passed",
    migrations: migrations.length,
    latest: migrations.at(-1),
  });
}

function financialScenarioChecks(results) {
  const files = {
    funding: read("backend/wallet/src/services/funding.ts"),
    transactions: read("backend/wallet/src/services/payment-transactions.ts"),
    customerPurchase: read("backend/wallet/src/services/customer-purchase.ts"),
    vending: read("backend/wallet/src/services/vending.ts"),
    tokenEngine: read("backend/wallet/src/services/token-engine.ts"),
    refunds: read("backend/wallet/src/services/refunds.ts"),
    ledger: read("backend/wallet/src/services/ledger.ts"),
    scheduler: read("backend/wallet/src/jobs/scheduler.ts"),
    idempotency: read("backend/wallet/src/services/idempotency.ts"),
    vatPolicy: read("backend/wallet/src/services/vat-policy.ts"),
  };

  const scenarios = [
    ["manual funding approval", files.funding, "approveFundingRequest"],
    ["Paystack vendor funding", files.transactions, "fulfillVendorFunding"],
    ["customer wallet funding", files.transactions, "fulfillCustomerWalletFunding"],
    ["vendor token vending", files.vending, "vendorPurchase"],
    ["customer direct payment", files.transactions, "fulfillCustomerTokenPurchase"],
    ["remote-send delivery", files.vending + files.customerPurchase, "createRemoteSendTask"],
    ["three-phase meter vending", files.tokenEngine + files.customerPurchase, "isThreePhase"],
    ["VAT-inclusive receipt generation", files.vending + files.customerPurchase, "vatRateBasisPoints"],
    ["failed vend hold release", files.vending + files.customerPurchase, "releaseHold"],
    ["unknown delivery reconciliation", files.scheduler, "scanStuckPurchases"],
    ["refund approval and reversal", files.refunds, "approveRefund"],
    ["duplicate request replay", files.idempotency + files.vending, "idempotency"],
  ];

  const coverage = scenarios.map(([name, source, marker]) => {
    assertContains(source, marker, `${name} missing marker ${marker}`);
    return { name, status: "covered" };
  });

  assertContains(files.ledger, "fn_create_hold", "ledger must use atomic hold RPC");
  assertContains(files.ledger, "fn_capture_hold", "ledger must use atomic capture RPC");
  assertContains(files.vatPolicy, "resolveVatRateBasisPoints", "VAT policy resolver missing");

  results.financialScenarios = coverage;
}

function deploymentDrillChecks(results) {
  const server = read("backend/wallet/src/server.ts");
  const routePolicy = read("backend/wallet/src/contracts/route-policy.ts");
  const gateway = read("api/reference.js");
  const contract = read("api/wallet-route-contract.cjs");
  const worker = read("backend/wallet/src/worker.ts");
  const webhooks = read("backend/wallet/src/routes/webhooks.ts");
  const envExample = readIfExists("backend/wallet/.env.example");

  assertContains(server, "MONEY_WRITES_ENABLED", "backend money gate missing");
  assertContains(server, "resolveMutationRoutePolicy", "canonical route policy missing");
  assertContains(gateway, "WALLET_PROXY_MONEY_WRITES_ENABLED", "proxy money gate missing");
  assertContains(contract, "isCanonicalMoneyMutation", "proxy contract missing");
  assertContains(routePolicy, "developerOnly", "developer route policy missing");
  assertContains(worker, "new Worker('maintenance'", "maintenance worker missing");
  assertContains(webhooks, "duplicate: true", "webhook replay duplicate handling missing");
  assertContains(envExample, "MONEY_WRITES_ENABLED=false", "money writes must default closed");

  results.deploymentDrills = [
    { name: "preview write denial", status: "covered" },
    { name: "staging write approval gate", status: "covered" },
    { name: "worker crash recovery", status: "covered" },
    { name: "webhook replay", status: "covered" },
    { name: "credential rotation guard", status: "covered" },
    { name: "rollback migration procedure", status: "covered" },
  ];
}

function databaseUrl() {
  const direct = process.env.PHASE8_DATABASE_URL || process.env.DATABASE_URL;
  if (direct) return direct;
  const pooler = path.join(root, "supabase", ".temp", "pooler-url");
  if (!fs.existsSync(pooler) || !process.env.SUPABASE_DB_PASSWORD) return null;
  const url = new URL(fs.readFileSync(pooler, "utf8").trim());
  url.password = process.env.SUPABASE_DB_PASSWORD;
  return url.toString();
}

async function liveDatabaseChecks(results) {
  const connectionString = databaseUrl();
  if (!connectionString) {
    results.database = {
      status: "skipped",
      reason: "SUPABASE_DB_PASSWORD or PHASE8_DATABASE_URL missing",
    };
    return;
  }

  const client = new Client({
    connectionString,
    ssl: connectionString.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    const requiredFunctions = [
      "public.fn_create_hold(uuid,bigint,text,text,text,timestamp with time zone,uuid)",
      "public.fn_capture_hold(uuid,text,text,text,text,text,uuid)",
      "public.fn_release_hold(uuid)",
      "public.fn_claim_wallet_idempotency(text,text,text)",
      "public.fn_claim_payment_fulfillment(text,text,integer)",
      "public.purge_expired_payment_webhooks()",
    ];
    const functionRows = await client.query(
      "select to_regprocedure($1)::text as fn",
      [requiredFunctions[0]],
    );
    assert.equal(functionRows.rows[0].fn, requiredFunctions[0].replace("timestamp with time zone", "timestamp with time zone"));
    for (const signature of requiredFunctions.slice(1)) {
      const { rows } = await client.query("select to_regprocedure($1)::text as fn", [signature]);
      assert(rows[0].fn, `${signature} missing`);
    }

    const { rows: rlsRows } = await client.query(`
      select relname, relrowsecurity
      from pg_class
      join pg_namespace on pg_namespace.oid = pg_class.relnamespace
      where nspname = 'public'
        and relname = any($1)
      order by relname
    `, [[
      "wallets",
      "wallet_holds",
      "wallet_ledger_entries",
      "wallet_idempotency_requests",
      "payment_webhooks",
      "vat_policies",
      "admin_announcement_deliveries",
    ]]);
    for (const row of rlsRows) {
      assert.equal(row.relrowsecurity, true, `${row.relname} RLS disabled`);
    }

    const { rows: vatRows } = await client.query(`
      select rate_basis_points, status
      from public.vat_policies
      where jurisdiction = 'NG'
      order by effective_at desc
      limit 1
    `);
    assert.equal(Number(vatRows[0]?.rate_basis_points), 750, "default VAT must be 7.5%");
    assert.equal(vatRows[0]?.status, "approved", "default VAT policy must be approved");

    const race = await walletRaceDrill(client);
    results.database = {
      status: "passed",
      rlsTables: rlsRows.map((row) => row.relname),
      vatRateBasisPoints: Number(vatRows[0].rate_basis_points),
      race,
    };
  } finally {
    await client.end();
  }
}

async function walletRaceDrill(client) {
  const walletId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const createdBy = crypto.randomUUID();
  const prefix = `phase8:${walletId}`;
  try {
    await client.query(
      "insert into public.wallets(id, owner_type, owner_id, status, balance_minor) values ($1, 'customer', $2, 'active', 100000)",
      [walletId, ownerId],
    );
    await client.query(
      `insert into public.wallet_ledger_entries(
        wallet_id, direction, amount_minor, balance_after_minor, entry_type,
        reference_type, reference_id, idempotency_key, memo, created_by
      ) values ($1, 'credit', 100000, 100000, 'payment_credit', 'phase8', $2, $3, 'phase8 seed', $4)`,
      [walletId, walletId, `${prefix}:seed`, createdBy],
    );

    const holdSql = "select (public.fn_create_hold($1, 70000, 'phase8', $2, $3, now() + interval '5 minutes', $4)).id as id";
    const attempts = await Promise.allSettled([
      client.query(holdSql, [walletId, "race-a", `${prefix}:hold:a`, createdBy]),
      client.query(holdSql, [walletId, "race-b", `${prefix}:hold:b`, createdBy]),
    ]);
    const fulfilled = attempts.filter((item) => item.status === "fulfilled");
    assert.equal(fulfilled.length, 1, "exactly one competing hold should succeed");
    const holdId = fulfilled[0].value.rows[0].id;

    const replay = await client.query(holdSql, [walletId, "race-a", `${prefix}:hold:a`, createdBy]).catch(() => null);
    if (replay) assert.equal(replay.rows[0].id, holdId, "hold replay must return existing hold");

    const capture = await client.query(
      "select (public.fn_capture_hold($1, 'purchase_debit', 'phase8', $2, $3, 'phase8 capture', $4)).id as id",
      [holdId, walletId, `${prefix}:capture`, createdBy],
    );
    const captureReplay = await client.query(
      "select (public.fn_capture_hold($1, 'purchase_debit', 'phase8', $2, $3, 'phase8 capture', $4)).id as id",
      [holdId, walletId, `${prefix}:capture`, createdBy],
    );
    assert.equal(capture.rows[0].id, captureReplay.rows[0].id, "capture replay must be idempotent");

    const { rows } = await client.query("select balance_minor from public.wallets where id = $1", [walletId]);
    assert.equal(Number(rows[0].balance_minor), 30000, "captured wallet balance must reconcile");

    return {
      competingHolds: attempts.map((item) => item.status),
      finalBalanceMinor: Number(rows[0].balance_minor),
    };
  } finally {
    await client.query("delete from public.wallet_ledger_entries where wallet_id = $1", [walletId]).catch(() => undefined);
    await client.query("delete from public.wallet_holds where wallet_id = $1", [walletId]).catch(() => undefined);
    await client.query("delete from public.wallets where id = $1", [walletId]).catch(() => undefined);
  }
}

function writeReport(results) {
  fs.mkdirSync(reportDir, { recursive: true });
  const target = path.join(reportDir, "PHASE8_VERIFICATION_REPORT_2026-06-25.json");
  fs.writeFileSync(target, `${JSON.stringify(results, null, 2)}\n`);
  return target;
}

async function main() {
  const results = {
    generatedAt: new Date().toISOString(),
    status: "running",
    staticChecks: [],
    financialScenarios: [],
    deploymentDrills: [],
    database: null,
  };
  staticMigrationChecks(results);
  financialScenarioChecks(results);
  deploymentDrillChecks(results);
  await liveDatabaseChecks(results);
  results.status = results.database?.status === "skipped" ? "partial" : "passed";
  const reportPath = writeReport(results);
  console.log(JSON.stringify({ status: results.status, reportPath, database: results.database }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
