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
const layoutsCss = readProjectFile("src/styles/layouts.css");
const vercelShellCss = readProjectFile("src/styles/vercel-shell.css");
const liquidGlassCss = readProjectFile("src/styles/liquid-glass.css");

for (const theme of ["system", "light", "executive", "contrast"]) {
  assertIncludes(app, `id: "${theme}"`);
  assertIncludes(settings, `id: "${theme}"`);
}

assertIncludes(app, "data-theme-choice");
assertIncludes(app, "role=\"menuitemradio\"");
assertIncludes(app, "handleUserMenuKeydown");
assertIncludes(app, ":inert=\"width <= 1024 && !sidebarOpen ? '' : null\"");
assertIncludes(app, ":inert=\"width <= 1024 && sidebarOpen ? '' : null\"");
assertIncludes(themesCss, "[data-theme=\"executive\"]");
assertIncludes(themesCss, "[data-theme=\"contrast\"]");
assertIncludes(themesCss, "--color-brand: #22c55e");
assertIncludes(tokensCss, "--primary: var(--color-brand)");
assertIncludes(tokensCss, "--theme-color: var(--color-brand)");
assertIncludes(tokensCss, "--tags-view-item-text:");
assertIncludes(tokensCss, "--tags-view-item-active-text:");
assertIncludes(combinedCss, "color: var(--tags-view-item-text)");
assertIncludes(combinedCss, "color: var(--tags-view-item-active-text)");
assertIncludes(app, 'label: "Executive"');
assertIncludes(settings, 'label: "Executive"');
assertIncludes(combinedCss, ".theme-command-menu");
assertIncludes(combinedCss, ".theme-swatch");
assertIncludes(themesCss, "color-scheme: dark");
assertIncludes(themesCss, "color-scheme: light");
assertIncludes(combinedCss, ".sidebar-logo-icon");
assertIncludes(combinedCss, "color: var(--text-inverse)");
assertIncludes(vercelShellCss, "background: linear-gradient(180deg, var(--sidebar-bg-start), var(--sidebar-bg-end))");
assertIncludes(vercelShellCss, "background: var(--sidebar-hover-bg)");
assertIncludes(vercelShellCss, "border-color: var(--sidebar-hover-border)");
assertIncludes(vercelShellCss, "box-shadow: inset 3px 0 0 var(--sidebar-active-border)");
assertIncludes(vercelShellCss, ".sidebar-item:focus-visible");
assertIncludes(vercelShellCss, "background: transparent !important");
assert(referenceCss.trim().endsWith('@import "./liquid-glass.css";'), "Liquid glass must load last.");
for (const token of ["--glass-surface", "--glass-surface-strong", "--glass-border", "--glass-shadow", "--glass-blur"]) {
  assertIncludes(tokensCss, token);
}
assertIncludes(liquidGlassCss, "prefers-reduced-transparency");
assertIncludes(liquidGlassCss, "@supports not");
assertIncludes(liquidGlassCss, ".auth-page .auth-card");
assertIncludes(liquidGlassCss, "background: var(--glass-surface-strong)");
assertIncludes(liquidGlassCss, ".auth-bg-orb");
assertIncludes(layoutsCss, "justify-content: flex-start");
assertIncludes(layoutsCss, ".bw-user-menu-item > span");
assertIncludes(layoutsCss, "env(safe-area-inset-bottom, 0px)");
assertIncludes(layoutsCss, "scrollbar-gutter: stable");
assertIncludes(layoutsCss, "min-height: 44px");
assert((app.match(/class="bw-user-menu-separator"/g) || []).length >= 2, "Account menu needs grouped action sections");

const lightThemeCss = themesCss.match(/\[data-theme="light"\]\s*\{[\s\S]*?\n\}/)?.[0] || "";
// Wallet-mirrored light theme uses oklch values from packages/tokens/theme.css
const walletLightThemeTokens = [
  "--color-brand:        oklch(70% 0.19 145)",
  "--color-brand-hover:  oklch(62% 0.17 145)",
  "--color-brand-soft:   oklch(70% 0.19 145 / 0.18)",
  "--color-surface-page:    oklch(98% 0.004 240)",
  "--color-surface-card:    oklch(100% 0 0)",
  "--color-border:        oklch(20% 0.020 240 / 0.08)",
  "--theme-color:        oklch(70% 0.19 145)",
  "--theme-color-bright: oklch(80% 0.16 145)",
  "--sidebar-active-border: oklch(80% 0.16 145)"
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
