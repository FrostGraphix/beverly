const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const actionModal = fs.readFileSync(path.join(root, "src/components/ActionModal.vue"), "utf8");
const taskOutputModal = fs.readFileSync(path.join(root, "src/components/TaskOutputModal.vue"), "utf8");
const css = fs.readFileSync(path.join(root, "src/styles/reference.css"), "utf8");

assert(actionModal.includes("token-stepper"), "Token flow must show a clear stepper.");
assert(actionModal.includes("token-customer-card"), "Token flow must summarize picked customer.");
assert(actionModal.includes("token-review-hero"), "Credit token review must use a designed review hero.");
assert(actionModal.includes("token-final-panel"), "Token flow must keep a final success/failure panel.");
assert(actionModal.includes("requestLog && !isTokenFlow"), "Token flow must hide API request preview.");
assert(actionModal.includes("responseLog && !isTokenFlow"), "Token flow must hide API response preview.");
assert(!actionModal.includes("<h3>Preview Result</h3>"), "Credit token flow must not show generic preview result.");
assert(css.includes(".modal-token-flow"), "Token modal must have branded theme styling.");
assert(css.includes(".token-vault"), "Generated token must have a themed token vault.");
assert(taskOutputModal.includes("var(--bg-overlay)"), "Remote output modal must use theme overlay.");
assert(taskOutputModal.includes("var(--primary)"), "Remote output modal must use brand primary.");

console.log("token-modal-ui-contract ok");
