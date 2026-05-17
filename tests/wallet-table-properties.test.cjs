const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(__dirname, "..", "src", "components", "wallet", "AdminWalletOperationsPage.vue");
const page = fs.readFileSync(pagePath, "utf8");

assert(page.includes("table-command-strip"), "wallet tables must include Beverly command strip metadata");
assert(page.includes("pageSize: 10"), "wallet tables must keep Beverly default page size");
assert(page.includes("visibleRows()"), "wallet tables must paginate visible rows");
assert(page.includes('class: "pagination wallet-pagination"'), "wallet tables must use Beverly pagination styling");
assert(page.includes("selectedKey"), "wallet tables must support selected row state");
assert(/th\s*\{[^}]*position:\s*sticky/s.test(page), "wallet tables must use sticky Beverly headers");
assert(/tbody tr:hover,[\s\S]*tbody tr\.selected/s.test(page), "wallet tables must use Beverly hover and selected row states");

console.log("wallet table properties passed");
