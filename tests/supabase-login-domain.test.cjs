"use strict";

const assert = require("assert");
const { emailFromLogin } = require("../backend/src/services/supabase-service");

const previousAdminEmails = process.env.ADMIN_EMAILS;
const previousLoginEmailDomain = process.env.LOGIN_EMAIL_DOMAIN;

process.env.ADMIN_EMAILS = "admin@acoblighting.com";
delete process.env.LOGIN_EMAIL_DOMAIN;

assert.strictEqual(emailFromLogin("mary"), "mary@org.acoblighting.com");
assert.strictEqual(emailFromLogin("mary@org.acoblighting.com"), "mary@org.acoblighting.com");
assert.strictEqual(emailFromLogin("admin"), "admin@acoblighting.com");

process.env.LOGIN_EMAIL_DOMAIN = "staff.acoblighting.com";
assert.strictEqual(emailFromLogin("jane"), "jane@staff.acoblighting.com");

if (typeof previousAdminEmails === "undefined") delete process.env.ADMIN_EMAILS;
else process.env.ADMIN_EMAILS = previousAdminEmails;

if (typeof previousLoginEmailDomain === "undefined") delete process.env.LOGIN_EMAIL_DOMAIN;
else process.env.LOGIN_EMAIL_DOMAIN = previousLoginEmailDomain;

console.log(JSON.stringify({
  status: "supabase login domain passed"
}, null, 2));
