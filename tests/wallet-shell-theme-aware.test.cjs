const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const appPath = path.join(__dirname, "..", "src", "App.vue");
const app = fs.readFileSync(appPath, "utf8");
const walletStyle = app.match(/\.wallet-staff-shell\s*\{[\s\S]*?<\/style>/)?.[0] || "";

assert(app.includes('<span class="sidebar-logo-icon">B</span>'), "wallet sidebar must keep Beverly B logo");
assert(walletStyle.includes("background: var(--bg-page);"), "wallet shell background must use theme page background");
assert(walletStyle.includes("background: var(--bg-header);"), "wallet header background must use theme header background");
assert(walletStyle.includes("--wallet-sidebar: var(--sidebar-bg-start);"), "wallet sidebar must inherit theme sidebar start");
assert(walletStyle.includes("--wallet-sidebar-2: var(--sidebar-bg-end);"), "wallet sidebar must inherit theme sidebar end");
assert(walletStyle.includes("color: var(--sidebar-text);"), "wallet sidebar text must use theme tokens");
assert(walletStyle.includes("background: var(--sidebar-active-bg);"), "wallet active nav must use theme token");
assert(!/background:\s*#fff(?:fff)?\b|background:\s*rgba\(255,\s*255,\s*255|color:\s*#fff(?:fff)?\b|--wallet-(?:lime|green|ink|muted|sidebar|sidebar-2|line):\s*#/.test(walletStyle), "wallet shell must not lock backgrounds or palette to literals");

console.log("wallet shell theme aware passed");
