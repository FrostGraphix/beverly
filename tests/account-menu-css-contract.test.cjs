"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const layouts = fs.readFileSync(path.join(root, "src", "styles", "layouts.css"), "utf8");
const shell = fs.readFileSync(path.join(root, "src", "styles", "vercel-shell.css"), "utf8");

const globalDropdown = layouts.match(/\.bw-user-dropdown\s*\{[\s\S]*?\n\}/)?.[0] || "";
const globalAvatar = layouts.match(/\.bw-avatar\s*\{[\s\S]*?\n\}/)?.[0] || "";

assert(globalDropdown.includes("width: min(224px, calc(100vw - 18px));"), "account dropdown width must be global");
assert(globalDropdown.includes("padding: 7px;"), "account dropdown padding must be global");
assert(globalDropdown.includes("border-radius: 16px;"), "account dropdown radius must be global");
assert(globalAvatar.includes("width: 26px;"), "account avatar width must be global");
assert(globalAvatar.includes("height: 26px;"), "account avatar height must be global");
assert(!/data-theme=.*\.bw-user-dropdown[^,{]*\{/.test(shell), "themes must not override account dropdown sizing");

console.log("account menu CSS contract passed");
