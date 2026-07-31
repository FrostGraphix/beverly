const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const dashboard = read("apps/admin/src/views/Dashboard.vue");
const adminRoutes = read("backend/wallet/src/routes/admin.ts");

assert.match(
  dashboard,
  /walletSummary\.value\.totalFloatMinor \?\? walletSummary\.value\.totalBalanceMinor \?\? 0/,
  "dashboard must read the wallet summary total float contract",
);
assert.match(
  dashboard,
  /walletSummary\.value\.byStatus\?\.active \?\? walletSummary\.value\.activeWallets \?\? 0/,
  "dashboard must read active wallet count from summary status buckets",
);
assert.ok(
  dashboard.includes('to="/wallets"') && dashboard.includes('aria-label="Open all wallets"'),
  "total wallet float KPI must link to the wallets flow",
);
assert.ok(
  adminRoutes.includes("totalBalanceMinor:  totalFloat") &&
  adminRoutes.includes("activeWallets:      byStatus.active ?? 0"),
  "wallet summary route must expose dashboard-compatible aliases",
);

assert.match(
  dashboard,
  /const recentDateFilter = ref\('all'\)/,
  "recentDateFilter must default to 'all'",
);

console.log("admin dashboard wallet summary contract passed");
