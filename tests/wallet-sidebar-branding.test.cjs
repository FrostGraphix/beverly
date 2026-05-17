const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const appPath = path.join(__dirname, "..", "src", "App.vue");
const app = fs.readFileSync(appPath, "utf8");

assert(
  app.includes('<span class="sidebar-logo-icon">B</span>'),
  "sidebar logo icon must stay Beverly B"
);

assert(
  app.includes('<strong>{{ isVendorPortal ? "Beverly Vendor" : "Beverly" }}</strong>'),
  "wallet staff sidebar brand must stay Beverly"
);

assert(
  !app.includes("ACOB CRM3") && !app.includes("Lighting Technology Ltd</small>"),
  "wallet sidebar must not replace Beverly branding with ACOB branding"
);

console.log("wallet sidebar branding contract passed");
