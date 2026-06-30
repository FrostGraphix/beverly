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
assert(packageJson.packageManager === "pnpm@10.28.0", "package.json packageManager must pin Vercel pnpm");
assert(vercelJson.version === 2, "vercel.json must stay on version 2");
assert(!Object.values(vercelJson.functions ?? {}).some((entry) => entry.runtime), "vercel.json must not set custom runtimes for current api functions");
assert(
  vercelJson.functions?.["api/reference.js"]?.excludeFiles?.includes("tmp") &&
    vercelJson.functions?.["api/[...path].js"]?.excludeFiles?.includes("tmp"),
  "vercel api functions must exclude tmp deployment artifacts"
);
assert(Array.isArray(vercelJson.rewrites), "vercel rewrites must exist");
assert(!vercelJson.env?.ALLOW_LIVE_WRITES, "vercel must not enable live writes");
assert(!vercelJson.env?.APPROVED_LIVE_WRITES, "vercel must not approve live writes");
assert(!vercelJson.env?.VITE_ALLOW_LIVE_WRITES, "vercel must not expose live write flags");
assert(
  vercelJson.rewrites.some((entry) => entry.source === "/api/:path*" && entry.destination === "/api/reference?__pathname=/api/:path*"),
  "vercel.json must forward api paths to api/reference"
);
assert(
  vercelJson.rewrites.some((entry) => entry.source === "/wallet-admin/:path*" && entry.destination === "/wallet-admin/index.html"),
  "vercel.json must route wallet admin subpaths to the embedded admin app"
);
assert(
  vercelJson.rewrites.some((entry) => entry.source === "/wallet-vendor/:path*" && entry.destination === "/wallet-vendor/index.html"),
  "vercel.json must route vendor wallet subpaths to the embedded vendor app"
);
assert(
  vercelJson.rewrites.some((entry) => entry.source === "/wallet-customer/:path*" && entry.destination === "/wallet-customer/index.html"),
  "vercel.json must route customer wallet subpaths to the embedded customer app"
);
for (const [host, destination] of [
  ["admin-acob-beverly.vercel.app", "/wallet-admin/index.html"],
  ["vendor-acob-beverly.vercel.app", "/wallet-vendor/index.html"],
  ["customer-acob-beverly.vercel.app", "/wallet-customer/index.html"],
]) {
  assert(
    vercelJson.rewrites.some((entry) =>
      entry.destination === destination &&
      Array.isArray(entry.has) &&
      entry.has.some((condition) => condition.type === "host" && condition.value === host)
    ),
    `vercel.json must route ${host} to ${destination}`
  );
}

console.log(JSON.stringify({
  node: packageJson.engines.node,
  vercelVersion: vercelJson.version,
  status: "vercel config passed"
}, null, 2));
