const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function walkVueFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkVueFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".vue") ? [fullPath] : [];
  });
}

const referenceCss = read("src/styles/reference.css");
const tokensCss = read("src/styles/tokens.css");
const themesCss = read("src/styles/themes.css");
const primitivesCss = read("src/styles/primitives.css");

assert(referenceCss.trimStart().startsWith('@import "./tokens.css";'), "reference.css must remain an import hub first.");
assert(!/^\s*:root\s*\{/m.test(referenceCss), "Legacy :root token block must stay out of reference.css.");
assert(!/^\s*\[data-theme="(?:light|dark|executive|ocean|contrast)"\]\s*\{/m.test(referenceCss), "Theme token blocks must stay in themes.css.");

for (const token of [
  "--theme-color",
  "--theme-color-bright",
  "--bg-header",
  "--sidebar-bg-start",
  "--sidebar-active-bg",
  "--shadow-glow-sm",
  "--z-toast"
]) {
  assert(tokensCss.includes(token), `Expected promoted legacy alias ${token}.`);
}

for (const theme of ["dark", "executive", "ocean", "contrast"]) {
  const themeBlock = themesCss.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{[\\s\\S]*?\\n\\}`))?.[0] || "";
  for (const token of ["--color-brand", "--color-surface-page", "--bg-header", "--sidebar-bg-start", "--sidebar-hover-bg"]) {
    assert(themeBlock.includes(token), `${theme} must override ${token}.`);
  }
}

for (const primitive of [".base-button", ".base-input", ".base-select", ".base-checkbox", ".base-toggle"]) {
  assert(primitivesCss.includes(primitive), `Expected primitive ${primitive}.`);
}

const rawControlViolations = [];
for (const filePath of walkVueFiles(path.join(root, "src", "components"))) {
  const relativePath = path.relative(root, filePath).replace(/\\/g, "/");
  if (relativePath.startsWith("src/components/base/")) continue;
  const source = fs.readFileSync(filePath, "utf8");
  const lines = source.split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!/<(?:button|select)\b|<input\b/.test(trimmed)) return;
    if (relativePath === "src/components/ActionModal.vue" && trimmed.includes('type="file"')) return;
    rawControlViolations.push(`${relativePath}:${index + 1}:${trimmed}`);
  });
}

assert.deepStrictEqual(rawControlViolations, [], "Raw controls must use base primitives.");

console.log("design-system-hardening ok");
