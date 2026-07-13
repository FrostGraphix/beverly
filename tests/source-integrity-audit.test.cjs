const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const reportService = read("src/services/report-service.mjs");
assert(!/generateDemo[A-Za-z]*Report/.test(reportService), "report-service must not include demo report generators");
assert(!/Math\.random/.test(reportService), "report-service must not synthesize report data");

const supabaseService = read("backend/src/services/supabase-service.js");
assert(!/enrollMFAFactor|verifyMFAFactor|listMFAFactors|unenrollMFAFactor/.test(supabaseService), "legacy MFA stubs must stay removed");
assert(!/Production stubs/.test(supabaseService), "production stub markers must stay removed");

const mfaSetup = read("src/components/MfaSetupFlow.vue");
assert(!/v-html/.test(mfaSetup), "MFA setup must not render raw HTML");

const appShell = read("src/App.vue");
assert(!/v-html/.test(appShell), "app shell navigation must not render raw HTML");

const walletOps = read("src/components/wallet/AdminWalletOperationsPage.vue");
assert(!/v-html/.test(walletOps), "wallet admin navigation must not render raw HTML");

console.log("source integrity audit passed");
