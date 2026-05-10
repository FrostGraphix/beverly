const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function readFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const files = {
  picker: readFile("src/components/PickerModal.vue"),
  success: readFile("src/components/SuccessModal.vue"),
  drawer: readFile("src/components/consumption/CustomerDrawer.vue"),
  shell: readFile("src/components/base/BaseModalShell.vue"),
  taskOutput: readFile("src/components/TaskOutputModal.vue"),
  profile: readFile("src/components/ProfilePage.vue"),
  styles: readFile("src/styles/reference.css"),
};

assert(
  files.picker.includes("picker-kicker") &&
    files.picker.includes("picker-state-cell") &&
    files.picker.includes('aria-label="Close picker"'),
  "Picker modal should expose polished header, states, and close control."
);

assert(
  files.success.includes("var(--bg-overlay)") &&
    files.success.includes("var(--shadow-glow-sm)") &&
    files.success.includes("BaseButton"),
  "Success modal should use branded overlay, depth, and base controls."
);

assert(
  files.drawer.includes("var(--bg-overlay)") &&
    files.drawer.includes("var(--bg-glass)") &&
    files.drawer.includes("backdrop-filter: blur(10px)"),
  "Customer drawer should use the shared modal surface language."
);

assert(
  files.shell.includes(".base-modal-shell") &&
    files.shell.includes("var(--radius-xl)") &&
    files.shell.includes("var(--bg-glass)"),
  "Base modal shell should provide shared themed structure."
);

assert(
  files.taskOutput.includes("var(--bg-overlay)") &&
    files.taskOutput.includes("var(--shadow-glow-sm)"),
  "Task output modal should remain on the branded theme system."
);

assert(
  files.styles.includes("MODAL EXPERIENCE SYSTEM") &&
    files.styles.includes(".modal button:focus-visible") &&
    files.styles.includes("prefers-reduced-motion"),
  "Global modal styles should cover focus, motion, and shared surfaces."
);

assert(
  files.styles.includes("justify-content: center") &&
    files.styles.includes("profileModalIn") &&
    !files.styles.includes("@keyframes slideInRight") &&
    !files.profile.includes("profile-avatar-ring") &&
    files.styles.includes(".profile-panel {\n  border-radius: var(--radius-lg) !important;"),
  "Profile settings should open as a centered hover modal instead of a side drawer."
);

console.log("modal-ui-contract ok");
