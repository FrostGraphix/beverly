const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const forms = fs.readFileSync(path.join(root, "src/services/management-forms.mjs"), "utf8");
const writes = fs.readFileSync(path.join(root, "src/services/write-helpers.mjs"), "utf8");
const mapper = fs.readFileSync(path.join(root, "src/services/mappers/table-mapper.mjs"), "utf8");
const actionService = fs.readFileSync(path.join(root, "src/services/action-service.mjs"), "utf8");
const supabase = fs.readFileSync(path.join(root, "backend/src/services/supabase-service.js"), "utf8");
const app = fs.readFileSync(path.join(root, "src/App.vue"), "utf8");
const api = fs.readFileSync(path.join(root, "src/services/api.js"), "utf8");

assert(forms.includes('field("status",    "Status"'), "Admin user create/edit must expose a Status selector.");
assert(forms.includes('{ value: "true", label: "Active" }'), "Status selector must include Active.");
assert(forms.includes('{ value: "false", label: "Inactive" }'), "Status selector must include Inactive.");
assert(writes.includes("normalizeWriteValue"), "Write payloads must normalize status values.");
assert(writes.includes('/\\/api\\/user\\/(?:create|update)\\b/i'), "Status coercion must stay scoped to admin user writes.");
assert(mapper.includes('record.status = "Active"'), "User table must show active users clearly.");
assert(mapper.includes('record.status = "Inactive"'), "User table must show inactive users clearly.");
assert(fs.readFileSync(path.join(root, "src/components/ActionModalSopFlow.vue"), "utf8").includes("sopReviewValue(field)"), "Admin user review must show friendly status labels.");
assert(actionService.includes('route.hash.includes("admin/user")) moduleName = "user"'), "Admin user actions must target user endpoints.");
assert(supabase.includes("ban_duration"), "Supabase Auth sync must activate or disable users.");
assert(supabase.includes("userStatusFromPayload"), "Supabase Auth sync must derive user status from CRM payloads.");
assert(app.includes("async goDashboard()"), "Dashboard entry must refresh validated identity.");
assert(app.includes("await this.loadUser()"), "Dashboard entry must await validated identity.");
assert(app.includes('["", "null", "undefined"]'), "Null-like roles must remain unready.");
assert(api.includes('if (normalized.userName) setCookie("userName"'), "Missing names must not become cookie text.");
assert(api.includes('if (normalized.roleId) setCookie("roleId"'), "Missing roles must not become cookie text.");

console.log("admin user flow passed");
