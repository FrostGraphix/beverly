"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function main() {
  const customerApi = read("apps/customer/src/lib/api.ts");
  const customerRouter = read("apps/customer/src/router/index.ts");

  const vendorApi = read("apps/vendor/src/lib/api.ts");
  const vendorRouter = read("apps/vendor/src/router/index.ts");

  const adminApi = read("apps/admin/src/lib/api.ts");
  const adminRouter = read("apps/admin/src/router/index.ts");

  // 1. Assert Customer app base path isolation
  assert.match(customerApi, /return '\/wallet-customer\/';/);
  assert.match(customerApi, /path\.startsWith\('\/customer'\)/);
  assert.match(customerRouter, /base \|\| '\/wallet-customer\/';/);

  // 2. Assert Vendor app base path isolation
  assert.match(vendorApi, /return '\/wallet-vendor\/';/);
  assert.match(vendorApi, /path\.startsWith\('\/vendor'\)/);
  assert.match(vendorRouter, /base \|\| '\/wallet-vendor\/';/);

  // 3. Assert Admin app base path isolation
  assert.match(adminApi, /return '\/wallet-admin\/';/);
  assert.match(adminApi, /path\.startsWith\('\/admin'\)/);
  assert.match(adminRouter, /base \|\| '\/wallet-admin\/';/);

  console.log({
    status: "portal redirect isolation contract passed",
    isolatedPortals: ["/wallet-customer/", "/wallet-vendor/", "/wallet-admin/"],
  });
}

main();
