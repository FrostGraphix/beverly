const fs = require("fs");

const files = [
  "source-crawl/app.11575024.js",
  "source-crawl/chunk-9c0ed7d2.97bce3b4.js",
  "source-crawl/chunk-16301c8a.c5f2312d.js"
].filter((file) => fs.existsSync(file));
const terms = [
  "Dashboard",
  "Purchase Money",
  "ACB",
  "login",
  "/dashboard",
  "Admin-Token",
  "Token",
  "baseURL",
  "/prod-api",
  "username",
  "password",
  "name:",
  "accountCount",
  "purchaseTimes",
  "purchaseUnit",
  "dailyConsumption",
  "communicationSuccessRate",
  "getDashboard"
];

for (const file of files) {
  const js = fs.readFileSync(file, "utf8");
  console.log(`\n================ ${file} ================`);
  for (const term of terms) {
    console.log(`\n--- ${term} ---`);
    let idx = -1;
    let count = 0;
    while ((idx = js.indexOf(term, idx + 1)) !== -1 && count < 8) {
      const start = Math.max(0, idx - 220);
      const end = Math.min(js.length, idx + 380);
      console.log(js.slice(start, end).replace(/\s+/g, " "));
      count += 1;
    }
    console.log(`shown: ${count}`);
  }
}
