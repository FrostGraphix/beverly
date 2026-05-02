"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const logPatterns = [/^tmp-.*\.log$/i, /^tmp-.*\.err\.log$/i];
const sensitivePatterns = [
  /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
  /Bearer\s+[a-zA-Z0-9._-]+/gi,
  /JWT_SECRET\s*=\s*[^\s]+/gi,
  /UPSTREAM_BEARER_TOKEN\s*=\s*[^\s]+/gi,
  /LIVE_API_BEARER_TOKEN\s*=\s*[^\s]+/gi
];
const markers = [
  "[live-auth-failure]",
  "[live-schema-drift]",
  "[fallback-cache]",
  "[fallback-facade]",
  "[write-request]",
  "[write-response]",
  "rate-limit"
];

function listLogFiles() {
  return fs.readdirSync(root)
    .filter((name) => logPatterns.some((pattern) => pattern.test(name)))
    .map((name) => path.join(root, name))
    .filter((filePath) => fs.statSync(filePath).isFile());
}

function reviewLogs() {
  const files = listLogFiles();
  const markerCounts = Object.fromEntries(markers.map((marker) => [marker, 0]));
  const findings = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    for (const marker of markers) {
      markerCounts[marker] += content.split(marker).length - 1;
    }
    for (const pattern of sensitivePatterns) {
      const matches = content.match(pattern) || [];
      if (matches.length) {
        findings.push({
          file: path.relative(root, filePath),
          issue: "sensitive value pattern found",
          count: matches.length
        });
      }
    }
  }

  return {
    filesReviewed: files.map((filePath) => path.relative(root, filePath)),
    markerCounts,
    findings,
    ok: findings.length === 0
  };
}

if (require.main === module) {
  const result = reviewLogs();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

module.exports = {
  reviewLogs
};
