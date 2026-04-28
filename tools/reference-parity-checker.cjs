const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = [
  "index.html",
  "src/App.vue",
  "src/components/LoginPage.vue",
  "src/components/TablePage.vue",
  "src/components/ActionModal.vue",
  "src/data/route-manifest.js",
  "src/services/api.js",
  "api/reference.js"
];
const source = files.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "reference-route-manifest.json"), "utf8"));
const failures = [];

for (const route of manifest) {
  if (!source.includes(route.hash)) failures.push(`Missing route ${route.hash}`);
  for (const api of route.apis) {
    if (!source.includes(api)) failures.push(`Missing API ${api}`);
  }
  for (const action of route.actions) {
    if (!source.includes(action)) failures.push(`Missing action ${action}`);
  }
}

for (const required of [
  "LIVE_API_BASE_URL",
  "http://8.208.16.168:9310",
  "baseURL: \"/api\"",
  "name=\"userId\"",
  "name=\"password\"",
  "name=\"verifycode\"",
  "setCookie(\"token\"",
  "Authorization"
]) {
  if (!source.includes(required)) failures.push(`Missing contract marker ${required}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  routes: manifest.length,
  status: "reference parity markers passed"
}, null, 2));
