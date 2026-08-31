"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function testLoginPageErrorHandling() {
  const loginPage = read("src/components/LoginPage.vue");

  // 1. Verify exact 403 access denial / portal restriction message preservation
  assert.match(loginPage, /if \(status === 403 \|\| \/access denied\|cannot sign in\|permission\|forbidden\/i\.test\(serverMsg\)\)/, "LoginPage must preserve 403 server error messages");
  assert.match(loginPage, /return serverMsg \|\| "Access Denied: You do not have permission to sign in to Beverly CRM\."/, "LoginPage must return serverMsg on 403");

  // 2. Verify 401 invalid credentials, 429 rate limits, and 500 service outages
  assert.match(loginPage, /if \(status === 401 \|\| \(status === 400 && \/invalid\.\*credentials\/i\.test\(serverMsg\)\)\)/, "LoginPage must handle 401 invalid credentials");
  assert.match(loginPage, /if \(status === 429\)/, "LoginPage must handle 429 rate limit");
  assert.match(loginPage, /if \(status >= 500\)/, "LoginPage must handle 500 server errors");

  // 3. Verify field error clearing and query parameter session notices
  assert.match(loginPage, /clearFieldError\(field\)/, "LoginPage must implement clearFieldError");
  assert.match(loginPage, /hash\.includes\("timeout=true"\)/, "LoginPage must handle timeout=true notice");
  assert.match(loginPage, /hash\.includes\("denied=true"\)/, "LoginPage must handle denied=true notice");
  assert.match(loginPage, /hash\.includes\("expired=true"\)/, "LoginPage must handle expired=true notice");
}

function testAppVueErrorHandling() {
  const appVue = read("src/App.vue");

  // Verify loadUser differentiates 401/403 session rejection from transient errors
  assert.match(appVue, /const status = Number\(error\?\.status \|\| error\?\.response\?\.status\)/, "App.vue loadUser must inspect error status");
  assert.match(appVue, /if \(status === 401 \|\| status === 403 \|\| !readSessionState\(\)\)/, "App.vue loadUser must only purge session on 401/403 or missing session state");
  assert.match(appVue, /await refreshSession\(\)/, "App.vue must refresh an expired access token before purging the session");
  assert.match(appVue, /fetch\("\/api\/auth\/me", \{ credentials: "include" \}\)/, "App.vue must retry server identity after refresh");
}

function main() {
  testLoginPageErrorHandling();
  testAppVueErrorHandling();

  console.log({
    status: "crm auth error handling contract passed",
    features: [
      "403-access-denial-preservation",
      "401-credentials-formatting",
      "429-rate-limit-handling",
      "500-service-outage-formatting",
      "field-error-clearing",
      "query-param-session-notices",
      "resilient-session-recovery"
    ]
  });
}

main();
