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
const profile = readProjectFile("src/components/ProfilePage.vue");
const referenceCss = readProjectFile("src/styles/reference.css");
const legacyCss = fs.readdirSync(path.join(root, "src/styles"))
  .filter((file) => file.startsWith("legacy-") && file.endsWith(".css"))
  .map((file) => readProjectFile(`src/styles/${file}`))
  .join("\n");
const combinedCss = `${referenceCss}\n${legacyCss}`;
const themesCss = readProjectFile("src/styles/themes.css");
const tokensCss = readProjectFile("src/styles/tokens.css");

for (const theme of ["system", "light", "dark", "executive", "ocean", "contrast"]) {
  assertIncludes(app, `id: "${theme}"`);
  assertIncludes(profile, `id: '${theme}'`);
}

assertIncludes(app, "data-theme-choice");
assertIncludes(app, "role=\"menuitemradio\"");
assertIncludes(themesCss, "[data-theme=\"executive\"]");
assertIncludes(themesCss, "[data-theme=\"ocean\"]");
assertIncludes(themesCss, "[data-theme=\"contrast\"]");
assertIncludes(themesCss, "--color-brand: #22c55e");
assertIncludes(themesCss, "--color-brand: #047857");
assertIncludes(tokensCss, "--primary: var(--color-brand)");
assertIncludes(tokensCss, "--theme-color: var(--color-brand)");
assertIncludes(app, 'label: "Canopy"');
assertIncludes(profile, "label: 'Canopy'");
assertIncludes(combinedCss, ".theme-command-menu");
assertIncludes(combinedCss, ".theme-swatch");
assertIncludes(themesCss, "color-scheme: dark");
assertIncludes(themesCss, "color-scheme: light");
assertIncludes(combinedCss, ".sidebar-logo-icon");
assertIncludes(combinedCss, "color: var(--text-inverse)");

const greenThemeCss = [
  themesCss.match(/\[data-theme="executive"\]\s*\{[\s\S]*?\n\}/)?.[0] || "",
  themesCss.match(/\[data-theme="ocean"\]\s*\{[\s\S]*?\n\}/)?.[0] || ""
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
