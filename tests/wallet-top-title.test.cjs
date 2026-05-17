const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const appPath = path.join(__dirname, "..", "src", "App.vue");
const app = fs.readFileSync(appPath, "utf8");

assert(
  !app.includes("Finance Admin · ACOB Lighting Technology Ltd") && !app.includes("Finance Admin Â· ACOB Lighting Technology Ltd"),
  "wallet top title must not show the Finance Admin company subtext"
);

assert(
  /\.wallet-top-title strong\s*\{[^}]*font-size:\s*1\.05rem/.test(app),
  "wallet top title must use compact text sizing"
);

assert(
  /\.wallet-staff-shell \.main-container\s*\{[^}]*padding-top:\s*56px/s.test(app),
  "wallet shell must not reserve the old tags-view header band"
);

assert(
  /\.wallet-staff-shell \.fixed-header\s*\{[^}]*height:\s*56px/s.test(app),
  "wallet fixed header must only be navbar height"
);

console.log("wallet top title contract passed");
