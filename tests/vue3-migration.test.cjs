"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function walkFiles(dir, matcher, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, matcher, result);
      continue;
    }
    if (matcher(fullPath)) result.push(fullPath);
  }
  return result;
}

const packageJson = JSON.parse(read("package.json"));
const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

assert.strictEqual(dependencies.vue?.startsWith("^3.") || dependencies.vue?.startsWith("3."), true, "Vue must stay on v3");
assert(dependencies.pinia, "Pinia must be installed");
assert(dependencies["@vitejs/plugin-vue"], "Vue 3 Vite plugin must be installed");
assert(!dependencies["@vitejs/plugin-vue2"], "Vue 2 Vite plugin must be removed");
assert(!dependencies.vuex, "Vuex must be removed");

assert(read("src/main.js").includes("createApp"), "main.js must use Vue 3 createApp");
assert(read("src/main.js").includes("createPinia"), "main.js must install Pinia");
assert(read("vite.config.mjs").includes("@vitejs/plugin-vue"), "Vite must use Vue 3 plugin");
assert(!read("vite.config.mjs").includes("@vitejs/plugin-vue2"), "Vite must not use Vue 2 plugin");

const sourceFiles = walkFiles(path.join(root, "src"), (file) => /\.(js|mjs|vue)$/.test(file));
const forbiddenPatterns = [
  ["new Vue", /\bnew\s+Vue\s*\(/],
  ["Vue.use", /\bVue\.use\s*\(/],
  ["Vue 2 lifecycle", /\bbeforeDestroy\s*\(/],
  ["Vue 2 listener bag", /\$listeners\b/],
  ["Vue.set", /\$set\s*\(/],
  ["Vue.delete", /\$delete\s*\(/]
];

const violations = [];
for (const file of sourceFiles) {
  const content = fs.readFileSync(file, "utf8");
  for (const [label, pattern] of forbiddenPatterns) {
    if (pattern.test(content)) {
      violations.push(`${path.relative(root, file)}: ${label}`);
    }
  }
}

assert.deepStrictEqual(violations, [], "Vue 2 compatibility residue found");

console.log(JSON.stringify({
  sourceFiles: sourceFiles.length,
  status: "vue3 migration passed"
}, null, 2));
