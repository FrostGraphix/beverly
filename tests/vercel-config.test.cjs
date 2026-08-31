"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const vercelJson = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const previewJson = JSON.parse(fs.readFileSync(path.join(root, "vercel.preview.json"), "utf8"));
const vercelIgnore = fs.readFileSync(path.join(root, ".vercelignore"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!fs.existsSync(path.join(root, "now.json")), "legacy now.json must not exist");
assert(packageJson.engines?.node === "22.x", "package.json engines.node must pin Vercel to 22.x");
assert(packageJson.packageManager === "pnpm@10.28.0", "package.json packageManager must pin Vercel pnpm");
assert(vercelJson.version === 2, "vercel.json must stay on version 2");
assert(
  vercelIgnore.split(/\r?\n/).includes("/assets") && !vercelIgnore.split(/\r?\n/).includes("assets"),
  ".vercelignore must exclude only root assets, not the backend email logo required by the build"
);
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
  vercelJson.env?.CUSTOMER_APP_URL === "https://acob-beverly.vercel.app/wallet-customer/",
  "customer password resets must return to the deployed customer portal"
);
assert(
  vercelJson.env?.VENDOR_APP_URL === "https://acob-beverly.vercel.app/wallet-vendor/",
  "vendor password resets must return to the deployed vendor portal"
);
assert(
  vercelJson.env?.CUSTOMER_FUNDING_CALLBACK_URL === "https://acob-beverly.vercel.app/wallet-customer/wallet/fund?payment=return",
  "customer funding must return to the customer portal"
);
assert(
  vercelJson.env?.VENDOR_FUNDING_CALLBACK_URL === "https://acob-beverly.vercel.app/wallet-vendor/wallet/fund?payment=return",
  "vendor funding must return to the vendor portal"
);
assert(
  vercelJson.env?.CUSTOMER_METER_ORDER_CALLBACK_URL === "https://acob-beverly.vercel.app/wallet-customer/meter-orders",
  "meter payments must return to customer meter orders"
);
assert(
  vercelJson.env?.PAYSTACK_WEBHOOK_URL === "https://acob-beverly.vercel.app/api/v1/webhook/paystack",
  "Paystack webhooks must target the canonical API host"
);
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

const cspHeader = vercelJson.headers?.flatMap((h) => h.headers || []).find((h) => h.key === "Content-Security-Policy")?.value || "";
assert(
  cspHeader.includes("connect-src") &&
    cspHeader.includes("https://fonts.googleapis.com") &&
    cspHeader.includes("https://fonts.gstatic.com"),
  "vercel.json Content-Security-Policy connect-src must allow Google Fonts for Workbox service worker caching"
);
for (const config of [vercelJson, previewJson]) {
  for (const namespace of ["admin", "public", "webhook", "acobot", "customer", "vendor"]) {
    assert(
      config.rewrites.some((entry) =>
        entry.source === `/api/v1/${namespace}/:path*` &&
        entry.destination === `/api/wallet?__pathname=/api/v1/${namespace}/:path*`
      ),
      `the canonical ${namespace} API must use the real wallet backend in production and preview`
    );
  }
}
assert(!cspHeader.includes("'unsafe-eval'"), "production CSP must not allow eval");
assert(!cspHeader.includes("script-src 'self' 'unsafe-inline'"), "production scripts must not allow inline execution");
for (const config of [vercelJson, previewJson]) {
  assert(
    !config.redirects?.some((entry) =>
      entry.has?.some((condition) => condition.type === "host" && condition.value === "acob-beverly.vercel.app")
    ),
    "the public Vercel alias must serve wallet routes without leaving its origin"
  );
  assert(
    !config.redirects?.some((entry) =>
      entry.has?.some((condition) => condition.type === "host" && condition.value === "beverly.acoblighting.com")
    ),
    "the Beverly custom domain must serve routes without leaving its origin"
  );
}
for (const [source, destination] of [
  ["/wallet/:path*", "/wallet/index.html"],
  ["/wallet-admin/:path*", "/wallet-admin/index.html"],
  ["/wallet-vendor/:path*", "/wallet-vendor/index.html"],
  ["/wallet-customer/:path*", "/wallet-customer/index.html"],
  ["/admin/:path*", "/wallet-admin/index.html"],
  ["/vendor/:path*", "/wallet-vendor/index.html"],
  ["/customer/:path*", "/wallet-customer/index.html"],
]) {
  assert(
    vercelJson.rewrites.some((entry) =>
      entry.source === source &&
      entry.destination === destination
    ),
    `${source} must remain on the requested hostname`
  );
}
assert(
  vercelJson.rewrites.some((entry) => entry.source === "/((?!api/).*)" && entry.destination === "/wallet/index.html"),
  "unknown paths must stay same-origin on the wallet landing"
);
for (const [source, destination] of [
  ["/health", "/api/wallet?__pathname=/health"],
  ["/ready", "/api/wallet?__pathname=/ready"],
  ["/api/v1/health", "/api/wallet?__pathname=/health"],
  ["/api/v1/ready", "/api/wallet?__pathname=/ready"],
]) {
  assert(vercelJson.rewrites.some((entry) => entry.source === source && entry.destination === destination), `${source} must reach the wallet health backend`);
}
assert(
  !vercelJson.rewrites.some((entry) => entry.has?.some((condition) => /\.\*/.test(String(condition.value || "")))),
  "portal host routing must use exact hosts, not broad regexes"
);

console.log(JSON.stringify({
  node: packageJson.engines.node,
  vercelVersion: vercelJson.version,
  status: "vercel config passed"
}, null, 2));
