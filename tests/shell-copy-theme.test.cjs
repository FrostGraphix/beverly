const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src", "App.vue"), "utf8");
const layout = fs.readFileSync(path.join(root, "src", "styles", "layouts.css"), "utf8");
const legacyComponents = fs.readFileSync(path.join(root, "src", "styles", "legacy-components.css"), "utf8");
const shellCss = `${layout}\n${legacyComponents}`;

assert(!app.includes(">Log out<"), "Account menu should say Sign Out.");
assert(app.includes(">Sign Out<"), "Account menu should include Sign Out.");
assert(shellCss.includes(".user-dropdown"));
assert(shellCss.includes("var(--bg-card)"), "User dropdown should use theme surface tokens.");
assert(shellCss.includes("var(--text-main)"), "User dropdown should use theme text tokens.");
assert(shellCss.includes("var(--theme-color)"), "User dropdown should use theme accent tokens.");
assert(!/user-dropdown[\s\S]*?#f7fff9/.test(shellCss), "User dropdown must not pin dark text colors.");
assert(!legacyComponents.includes("rgba(18,24,20"), "Legacy dropdown override must be theme aware.");

console.log("shell-copy-theme ok");
