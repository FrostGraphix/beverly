const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(__dirname, "..", "src", "components", "wallet", "AdminWalletOperationsPage.vue");
const page = fs.readFileSync(pagePath, "utf8");

const vendorsSection = page.match(/<section v-else-if="activePage === 'vendors'"[\s\S]*?<section v-else-if="activePage === 'createVendor'"/)?.[0] || "";
const usersSection = page.match(/<section v-else-if="activePage === 'users'"[\s\S]*?<section v-else-if="activePage === 'verification'"/)?.[0] || "";

assert(vendorsSection.includes("wallet-crm-table-page"), "vendors page must use CRM table page shell");
assert(usersSection.includes("wallet-crm-table-page"), "users page must use CRM table page shell");
assert(vendorsSection.includes("filter-toolbar wallet-table-toolbar"), "vendors page must use Beverly filter toolbar");
assert(usersSection.includes("filter-toolbar wallet-table-toolbar"), "users page must use Beverly filter toolbar");
assert(!vendorsSection.includes("kpi-grid"), "vendors page must not lead with KPI cards");
assert(!vendorsSection.includes("side-stack"), "vendors page must not split the table with side cards");
assert(!usersSection.includes("matrix-table"), "users page must keep the Beverly table page focused on the table");
assert(/\.wallet-table-toolbar\s*\{[^}]*border-bottom:\s*0/s.test(page), "wallet table toolbar must attach to table card");

console.log("wallet table page parity passed");
