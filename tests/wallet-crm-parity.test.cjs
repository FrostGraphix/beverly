const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src/App.vue"), "utf8");
const wallet = fs.readFileSync(path.join(root, "src/components/wallet/AdminWalletOperationsPage.vue"), "utf8");

assert(app.includes("--wallet-sidebar-width: var(--layout-sidebar-width);"));
assert(app.includes("height: var(--layout-header-height);"));
assert(app.includes("font-size: 13px;"));
assert(app.includes("box-shadow: inset 3px 0 0 var(--sidebar-active-border)"));

assert(wallet.includes("font-family: var(--font-family);"));
assert(wallet.includes("min-height: 74px;"));
assert(wallet.includes("font-size: 26px;"));
assert(wallet.includes("padding: 10px 12px;"));
assert(wallet.includes("min-height: var(--button-height-md);"));
assert(!wallet.includes("font-family: Poppins"));
assert(!wallet.includes("min-height: 143px"));
assert(!wallet.includes("height: 124px"));

console.log("wallet-crm-parity ok");
