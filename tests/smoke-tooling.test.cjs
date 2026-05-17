"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const vercelSmoke = read("tools/vercel-smoke.cjs");
const stagingSmoke = read("tools/staging-write-smoke.cjs");
const browserQa = read("tests/vue-app.browser.test.cjs");

assert(vercelSmoke.includes("process.env.PREVIEW_TARGET_URL"), "vercel smoke must accept preview target fallback");
assert(vercelSmoke.includes("x-vercel-protection-bypass"), "vercel smoke must support Vercel protection bypass");
assert(vercelSmoke.includes("SMOKE_AUTH_TOKEN"), "vercel smoke must support token-authenticated previews");
assert(vercelSmoke.includes("SMOKE_USER_ID"), "vercel smoke must support smoke login credentials");
assert(vercelSmoke.includes("dashboard read unauthorized"), "vercel smoke must explain API auth failures");
assert(vercelSmoke.includes("Expected JSON from"), "vercel smoke must report non-JSON protection failures clearly");
assert(vercelSmoke.includes("if (!protectionBypass) return \"\";"), "vercel smoke must not post protected failure hooks without bypass");

assert(stagingSmoke.includes("process.env.PREVIEW_TARGET_URL"), "staging smoke must fall back to preview target");
assert(stagingSmoke.includes("x-vercel-protection-bypass"), "staging smoke must support Vercel protection bypass");
assert(stagingSmoke.includes("set VERCEL_PROTECTION_BYPASS"), "staging smoke must explain protected preview failures");

assert(browserQa.includes("defaultBrowserTarget"), "browser QA must choose a platform-safe default");
assert(browserQa.includes('fs.existsSync(edgePath) ? "edge" : "chromium"'), "browser QA must default to Edge on Windows");

console.log(JSON.stringify({
  status: "smoke tooling passed"
}, null, 2));
