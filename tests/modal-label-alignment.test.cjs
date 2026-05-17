const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "src/styles/legacy-profile.css"), "utf8");

assert(css.includes(".modal-field { display: flex; flex-direction: column; align-items: stretch; gap: 6px; text-align: left; }"));
assert(css.includes(".modal-field > span,\n.modal-field-label { width: 100%; justify-content: flex-start; text-align: left; }"));

console.log("modal-label-alignment ok");
