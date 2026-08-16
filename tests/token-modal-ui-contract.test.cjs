const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const actionModal = fs.readFileSync(path.join(root, "src/components/ActionModalTokenFlow.vue"), "utf8");
const actionModalShell = fs.readFileSync(path.join(root, "src/components/ActionModal.vue"), "utf8");
const rechargeWizard = fs.readFileSync(path.join(root, "src/components/RechargeWizard.vue"), "utf8");
const taskOutputModal = fs.readFileSync(path.join(root, "src/components/TaskOutputModal.vue"), "utf8");
const css = fs.readFileSync(path.join(root, "src/styles/legacy-modals.css"), "utf8");

assert(actionModal.includes("token-stepper"), "Token flow must show a clear stepper.");
assert(actionModal.includes("token-customer-card"), "Token flow must summarize picked customer.");
assert(actionModal.includes("token-review-hero"), "Credit token review must use a designed review hero.");
assert(actionModal.includes("token-final-panel"), "Token flow must keep a final success/failure panel.");
assert(!actionModal.includes("<h3>Preview Result</h3>"), "Credit token flow must not show generic preview result.");
assert(css.includes(".modal-token-flow"), "Token modal must have branded theme styling.");
assert(css.includes(".token-vault"), "Generated token must have a themed token vault.");
assert(taskOutputModal.includes("var(--bg-overlay)"), "Remote output modal must use theme overlay.");
assert(taskOutputModal.includes("var(--primary)"), "Remote output modal must use brand primary.");
assert(rechargeWizard.includes('aria-label="Close recharge wizard"'), "Recharge wizard must have a visible close action.");
assert(rechargeWizard.includes("document.addEventListener('keydown', this.handleKeydown)"), "Recharge wizard must support Escape dismissal.");
assert(rechargeWizard.includes("height: calc(100dvh - 16px)"), "Recharge wizard must fit mobile viewports.");
assert(rechargeWizard.includes("min-height: 44px"), "Recharge wizard actions must meet mobile touch sizing.");
assert(actionModalShell.includes("modal-backdrop--recharge"), "Recharge must disable the shared modal overlay.");
assert(actionModalShell.includes("backdrop-filter: blur(4px) saturate(108%)"), "Recharge must use the account overlay blur.");
assert(rechargeWizard.includes('aria-label="Selected meter details"'), "Recharge amount step must identify its meter summary.");

console.log("token-modal-ui-contract ok");
