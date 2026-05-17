const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const appPath = path.join(__dirname, "..", "src", "App.vue");
const app = fs.readFileSync(appPath, "utf8");

assert(
  !app.includes('class="wallet-sidebar-user"'),
  "wallet sidebar footer must not render a separate Finance Admin user card"
);

assert(
  !/\.wallet-staff-shell \.sidebar-signout\s*\{/.test(app),
  "wallet sidebar sign out must use the standard Beverly CRM signout styling"
);

assert(
  /<div class="sidebar-footer">\s*<BaseButton class="sidebar-signout"/.test(app),
  "wallet sidebar footer must keep the same direct signout structure as Beverly CRM"
);

console.log("wallet sidebar footer parity passed");
