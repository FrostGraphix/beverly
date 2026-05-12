"use strict";

const fs = require("fs");
const path = require("path");

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const separator = trimmed.indexOf("=");
  if (separator === -1) return null;
  const key = trimmed.slice(0, separator).trim();
  const value = trimmed.slice(separator + 1).trim();
  if (!key) return null;
  return { key, value };
}

function loadEnvFile(filePath = path.resolve(process.cwd(), ".env")) {
  const entrypoint = String(process.argv[1] || "");
  if (process.env.FORCE_LOAD_ENV !== "true" && /(^|[\\/])tests([\\/]|$)/i.test(entrypoint)) return;
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const entry = parseEnvLine(line);
    if (!entry) continue;
    if (!(entry.key in process.env)) process.env[entry.key] = entry.value;
  }
}

module.exports = { loadEnvFile };
