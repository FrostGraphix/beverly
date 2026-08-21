const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const shell = fs.readFileSync(path.join(root, "apps/admin/src/components/AppShell.vue"), "utf8");

assert.ok(shell.includes("'https://beverly.acoblighting.com'"), "production CRM base must target the canonical hosted CRM");
assert.ok(shell.includes(":9311"), "development CRM base must target the legacy CRM port");
assert.ok(shell.includes("function toCrmUrl"), "CRM URL helper must normalize the base URL");
assert.ok(shell.includes("return `${urlWithoutHash.replace(/\\/+$/, '')}/`;"), "CRM link must open site root");
assert.ok(!shell.includes("/#/dashboard`;"), "CRM link must not force the dashboard hash");
assert.ok(shell.includes("const isSuperAdmin = computed(() => auth.user?.role === 'super-admin' || auth.user?.role === 'super_admin');"), "CRM return must be Super Admin only");
assert.match(shell, /const isCrmEligible = computed\([\s\S]*?operations-manager/, "CRM return must be limited to approved staff roles");
assert.match(shell, /v-if="isCrmEligible"\s+:href="CRM_URL"\s+class="bw-back"/, "sidebar CRM return must be gated");
assert.match(shell, /v-if="isCrmEligible" :href="CRM_URL" class="bw-user-menu-item"/, "menu CRM return must be gated");

console.log("admin CRM link contract passed");
