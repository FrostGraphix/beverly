"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
for (const filename of ["gate-p1.cjs", "gate-p5.cjs"]) {
  const source = fs.readFileSync(path.join(__dirname, "../tools", filename), "utf8");
  assert.match(source, /SUPABASE_DB_URL is required/);
  assert.match(source, /rejectUnauthorized:\s*true/);
  assert.doesNotMatch(source, /rejectUnauthorized:\s*false/);
  assert.doesNotMatch(source, /SUPABASE_DB_PASSWORD\s*\|\|/);
  assert.doesNotMatch(source, /postgresql:\/\/postgres\./);
}
console.log("database gate secret boundaries passed");
