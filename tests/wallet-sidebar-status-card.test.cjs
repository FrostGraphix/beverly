const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const appPath = path.join(__dirname, "..", "src", "App.vue");
const app = fs.readFileSync(appPath, "utf8");

assert(!app.includes("wallet-system-card"), "wallet sidebar must not render the system status card");
assert(!app.includes("All systems operational"), "wallet sidebar must not show operational status copy");
assert(!app.includes("View status"), "wallet sidebar must not show status link");

console.log("wallet sidebar status card removed");
