const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.vue"), "utf8");
const page = fs.readFileSync(path.join(__dirname, "..", "src", "components", "wallet", "AdminWalletOperationsPage.vue"), "utf8");

assert(!app.includes("wallet-role-pill"), "wallet sidebar must not show Finance Admin role pill");
assert(!page.includes('placeholder="Search vendors, users, transactions..."'), "wallet page header must not show top-right search bar");
assert(!/<BaseInput[^>]*class="search-field"[^>]*type="search"/.test(page), "wallet page header must not render search input");

console.log("wallet header sidebar cleanup passed");
