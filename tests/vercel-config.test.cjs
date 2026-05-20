"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const vercelJson = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!fs.existsSync(path.join(root, "now.json")), "legacy now.json must not exist");
assert(packageJson.engines?.node === "22.x", "package.json engines.node must pin Vercel to 22.x");
assert(vercelJson.version === 2, "vercel.json must stay on version 2");
assert(!("functions" in vercelJson), "vercel.json must not set custom runtimes for current api functions");
assert(Array.isArray(vercelJson.rewrites), "vercel rewrites must exist");
assert(vercelJson.env?.ALLOW_LIVE_WRITES === "true", "vercel ALLOW_LIVE_WRITES must stay enabled");
assert(vercelJson.env?.APPROVED_LIVE_WRITES === "true", "vercel APPROVED_LIVE_WRITES must stay enabled");
assert(vercelJson.env?.VITE_ALLOW_LIVE_WRITES === "true", "vercel VITE_ALLOW_LIVE_WRITES must stay enabled");
assert(
  vercelJson.rewrites.some((entry) => entry.source === "/api/:path*" && entry.destination === "/api/reference?__pathname=/api/:path*"),
  "vercel.json must forward api paths to api/reference"
);

console.log(JSON.stringify({
  node: packageJson.engines.node,
  vercelVersion: vercelJson.version,
  status: "vercel config passed"
}, null, 2));
