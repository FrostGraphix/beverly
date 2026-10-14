"use strict";

const { spawnSync } = require("node:child_process");

const EXPECTED_NODE_MAJOR = 24;
const localVersion = process.versions.node;
const localMajor = Number(localVersion.split(".")[0]);

if (localMajor !== EXPECTED_NODE_MAJOR) {
  throw new Error(`node resolves to ${process.version}; Beverly requires Node ${EXPECTED_NODE_MAJOR}.x.`);
}

const isWindows = process.platform === "win32";
const command = isWindows ? (process.env.ComSpec || "cmd.exe") : "corepack";
const args = isWindows
  ? ["/d", "/c", "corepack pnpm node -p process.versions.node"]
  : ["pnpm", "node", "-p", "process.versions.node"];
const result = spawnSync(command, args, {
  cwd: process.cwd(),
  encoding: "utf8",
  shell: false,
});

if (result.error || result.status !== 0) {
  throw new Error(`Unable to resolve pnpm's Node runtime: ${result.error?.message || result.stderr || "unknown Corepack failure"}`);
}

const pnpmVersion = result.stdout.trim();
const pnpmMajor = Number(pnpmVersion.split(".")[0]);
if (pnpmMajor !== EXPECTED_NODE_MAJOR) {
  throw new Error(`node resolves to ${localVersion}, but corepack pnpm resolves to ${pnpmVersion}. Install/select one Node 24 runtime before continuing.`);
}

console.log(JSON.stringify({
  status: "runtime parity check passed",
  node: localVersion,
  corepackPnpmNode: pnpmVersion,
  major: EXPECTED_NODE_MAJOR,
}, null, 2));
