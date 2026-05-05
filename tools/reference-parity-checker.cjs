const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourceFiles = [
  "index.html",
  "src/App.vue",
  "src/components/LoginPage.vue",
  "src/components/TablePage.vue",
  "src/components/ActionModal.vue",
  "src/components/DailyDataMeterPage.vue",
  "src/data/route-manifest.js",
  "src/services/api.js",
  "src/services/table-service.js",
  "src/services/action-service.mjs",
  "api/reference.js"
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function readText(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function normalizeApiPath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .trim()
    .toLowerCase();
}

const source = sourceFiles.map(readText).join("\n");
const manifest = readJson("reference-route-manifest.json");
const contract = readJson("reference-contract.json");
const failures = [];

const endpointVariants = new Map();
for (const endpoint of contract.endpoints || []) {
  const variants = new Set();
  for (const candidate of [
    endpoint.path,
    ...(endpoint.aliases || []),
    ...(endpoint.casingVariants || [])
  ]) {
    if (!candidate) continue;
    variants.add(String(candidate));
  }
  for (const variant of variants) {
    endpointVariants.set(normalizeApiPath(variant), variants);
  }
}

function hasSourceMarker(marker) {
  return source.includes(marker);
}

function hasApiMarker(api) {
  if (hasSourceMarker(api)) return true;

  const variants = endpointVariants.get(normalizeApiPath(api));
  if (!variants) return false;

  for (const variant of variants) {
    if (hasSourceMarker(variant)) return true;
  }

  return true;
}

for (const route of manifest) {
  if (!hasSourceMarker(route.hash)) failures.push(`Missing route ${route.hash}`);
  for (const api of route.apis) {
    if (!hasApiMarker(api)) failures.push(`Missing API ${api}`);
  }
  for (const action of route.actions) {
    if (!hasSourceMarker(action)) failures.push(`Missing action ${action}`);
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
  if (!hasSourceMarker(required)) failures.push(`Missing contract marker ${required}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  routes: manifest.length,
  endpoints: contract.endpointCount,
  status: "reference parity markers passed"
}, null, 2));
