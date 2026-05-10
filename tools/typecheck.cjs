const { spawnSync } = require("node:child_process");

const command = process.platform === "win32" ? "node_modules\\.bin\\tsc.cmd" : "node_modules/.bin/tsc";
const result = spawnSync(command, ["--noEmit"], {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: process.platform === "win32"
});

process.exit(result.status ?? 1);
