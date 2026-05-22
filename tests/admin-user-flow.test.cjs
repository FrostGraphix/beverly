const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const forms = fs.readFileSync(path.join(root, "src/services/management-forms.mjs"), "utf8");
const writes = fs.readFileSync(path.join(root, "src/services/write-helpers.mjs"), "utf8");
const mapper = fs.readFileSync(path.join(root, "src/services/mappers/table-mapper.mjs"), "utf8");
const actionService = fs.readFileSync(path.join(root, "src/services/action-service.mjs"), "utf8");
const supabase = fs.readFileSync(path.join(root, "backend/src/services/supabase-service.js"), "utf8");

assert(forms.includes('field("status",    "Status"'), "Admin user create/edit must expose a Status selector.");
assert(forms.includes('{ value: "true", label: "Active" }'), "Status selector must include Active.");
assert(forms.includes('{ value: "false", label: "Inactive" }'), "Status selector must include Inactive.");
assert(writes.includes("normalizeWriteValue"), "Write payloads must normalize status values.");
assert(writes.includes('/\\/api\\/user\\/(?:create|update)\\b/i'), "Status coercion must stay scoped to admin user writes.");
assert(mapper.includes('record.status = "Active"'), "User table must show active users clearly.");
assert(mapper.includes('record.status = "Inactive"'), "User table must show inactive users clearly.");
assert(fs.readFileSync(path.join(root, "src/components/ActionModal.vue"), "utf8").includes("sopReviewValue(field)"), "Admin user review must show friendly status labels.");
assert(actionService.includes('route.hash.includes("admin/user")) moduleName = "user"'), "Admin user actions must target user endpoints.");
assert(supabase.includes("ban_duration"), "Supabase Auth sync must activate or disable users.");
assert(supabase.includes("userStatusFromPayload"), "Supabase Auth sync must derive user status from CRM payloads.");

console.log("admin user flow passed");
