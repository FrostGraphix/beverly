"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const migration = read("supabase/migrations/20260729160000_wallet_activity_summary.sql");
const ledger = read("backend/wallet/src/services/ledger.ts");

assert.match(
  migration,
  /fn_wallet_activity_summary\(\s*p_wallet_id uuid,\s*p_day_start timestamptz\s*\)/,
  "the database function must expose the exact named arguments used by PostgREST",
);
assert.match(
  migration,
  /grant execute on function public\.fn_wallet_activity_summary\(uuid, timestamptz\) to service_role/,
  "the wallet backend must be allowed to execute the summary function",
);
assert.match(
  migration,
  /notify pgrst, 'reload schema'/,
  "PostgREST must reload its schema after the function is installed",
);
assert.match(ledger, /rpc\('fn_wallet_activity_summary'/, "the wallet service must call the summary function");
assert.match(ledger, /p_wallet_id: walletId/, "the wallet service must send the wallet argument");
assert.match(ledger, /p_day_start: dayStart\.toISOString\(\)/, "the wallet service must send the day boundary");
assert.match(
  ledger,
  /Wallet summary is temporarily unavailable\./,
  "database details must not leak into the vendor dashboard",
);

console.log("wallet activity summary contract passed");
