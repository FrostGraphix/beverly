const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertIncludes(file, expected) {
  assert(file.includes(expected), `Expected ${expected}`);
}

const app = readProjectFile("src/App.vue");
const settings = readProjectFile("src/components/SettingsPage.vue");
const referenceCss = readProjectFile("src/styles/reference.css");
const legacyCss = fs.readdirSync(path.join(root, "src/styles"))
  .filter((file) => file.startsWith("legacy-") && file.endsWith(".css"))
  .map((file) => readProjectFile(`src/styles/${file}`))
  .join("\n");
const combinedCss = `${referenceCss}\n${legacyCss}`;
const themesCss = readProjectFile("src/styles/themes.css");
const tokensCss = readProjectFile("src/styles/tokens.css");

for (const theme of ["system", "light", "executive", "contrast"]) {
  assertIncludes(app, `id: "${theme}"`);
  assertIncludes(settings, `id: "${theme}"`);
}

assertIncludes(app, "data-theme-choice");
assertIncludes(app, "role=\"menuitemradio\"");
assertIncludes(themesCss, "[data-theme=\"executive\"]");
assertIncludes(themesCss, "[data-theme=\"contrast\"]");
assertIncludes(themesCss, "--color-brand: #22c55e");
assertIncludes(tokensCss, "--primary: var(--color-brand)");
assertIncludes(tokensCss, "--theme-color: var(--color-brand)");
assertIncludes(app, 'label: "Executive"');
assertIncludes(settings, 'label: "Executive"');
assertIncludes(combinedCss, ".theme-command-menu");
assertIncludes(combinedCss, ".theme-swatch");
assertIncludes(themesCss, "color-scheme: dark");
assertIncludes(themesCss, "color-scheme: light");
assertIncludes(combinedCss, ".sidebar-logo-icon");
assertIncludes(combinedCss, "color: var(--text-inverse)");

const lightThemeCss = themesCss.match(/\[data-theme="light"\]\s*\{[\s\S]*?\n\}/)?.[0] || "";
const walletLightThemeTokens = [
  "--color-brand: #008000",
  "--color-brand-hover: #006600",
  "--color-brand-soft: #e6f4e6",
  "--color-surface-page: #f2f4f2",
  "--color-surface-card: #ffffff",
  "--color-border: #e5eae5",
  "--theme-color-bright: #c6e000",
  "--sidebar-bg-start: #011508",
  "--sidebar-active-border: #c6e000"
];

for (const token of walletLightThemeTokens) {
  assertIncludes(lightThemeCss, token);
}

const greenThemeCss = [
  themesCss.match(/\[data-theme="executive"\]\s*\{[\s\S]*?\n\}/)?.[0] || ""
].join("\n");

const forbiddenGreenThemeTokens = [
  "#d6b15e",
  "#0891b2",
  "#0ea5e9",
  "#38bdf8",
  "#7dd3fc",
  "#bae6fd"
];

for (const token of forbiddenGreenThemeTokens) {
  assert(!greenThemeCss.includes(token), `Theme token must stay green: ${token}`);
}

console.log("theme-contract ok");
