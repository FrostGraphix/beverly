"use strict";

// Parallel test orchestrator.
//
// The legacy `npm test` chain runs ~50 node test files sequentially with `&&`,
// aborting on first failure and wasting cores. This runner expands the same
// package.json script chains, runs the files on a worker pool, keeps going on
// failure, and prints one aggregated report.
//
// Usage:
//   node tools/test-runner.cjs               # expands the "test" script
//   node tools/test-runner.cjs test:wallet   # expands another script
//   TEST_CONCURRENCY=8 node tools/test-runner.cjs

const { spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageJson = require(path.join(root, "package.json"));

// Tests that mutate shared state (tmp/ control files, sqlite paths, cwd
// fixtures) and must not overlap with anything else.
const serialPatterns = [
  /automation-control/,
  /local-database/,
  /rate-limit-cors/,
  /server-session-timeout/,
  /consumption-store/,
  /smoke-tooling/,
  /production-log-review/
];

function expandScript(name, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const script = packageJson.scripts[name];
  if (!script) throw new Error(`No script named "${name}"`);
  const jobs = [];
  for (const segment of script.split("&&").map((part) => part.trim())) {
    const nested = segment.match(/^npm run ([a-zA-Z:._-]+)$/);
    if (nested) {
      jobs.push(...expandScript(nested[1], seen));
      continue;
    }
    const nodeFile = segment.match(/^node (?:--[^ ]+ )*([^ ]+\.(?:cjs|mjs|js))$/);
    if (nodeFile) {
      jobs.push({ kind: "node", file: nodeFile[1], label: nodeFile[1] });
      continue;
    }
    // Anything else (e.g. wallet vitest via npm --prefix) runs as a raw shell job.
    jobs.push({ kind: "shell", command: segment, label: segment.slice(0, 80) });
  }
  return jobs;
}

function runJob(job) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = job.kind === "node"
      ? spawn(process.execPath, ["--disable-warning=ExperimentalWarning", job.file], { cwd: root, shell: false })
      : spawn(job.command, { cwd: root, shell: true });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("close", (code) => {
      resolve({ job, code: code ?? 1, output, durationMs: Date.now() - startedAt });
    });
  });
}

async function runPool(jobs, concurrency) {
  const queue = [...jobs];
  const results = [];
  async function worker() {
    while (queue.length) {
      const job = queue.shift();
      const result = await runJob(job);
      results.push(result);
      const mark = result.code === 0 ? "PASS" : "FAIL";
      console.log(`[${mark}] ${result.job.label} (${result.durationMs}ms)`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return results;
}

(async () => {
  const scriptName = process.argv[2] || "test";
  const startedAt = Date.now();
  const jobs = expandScript(scriptName);
  const isSerial = (job) => serialPatterns.some((pattern) => pattern.test(job.label)) || job.kind === "shell";
  const parallelJobs = jobs.filter((job) => !isSerial(job));
  const serialJobs = jobs.filter(isSerial);
  const concurrency = Number(process.env.TEST_CONCURRENCY || Math.min(8, os.cpus().length));

  console.log(`Expanding "${scriptName}": ${jobs.length} jobs (${parallelJobs.length} parallel @ ${concurrency}, ${serialJobs.length} serial)`);
  const results = await runPool(parallelJobs, concurrency);
  results.push(...await runPool(serialJobs, 1));

  const failed = results.filter((result) => result.code !== 0);
  const totalMs = Date.now() - startedAt;
  console.log(`\n${results.length - failed.length}/${results.length} passed in ${(totalMs / 1000).toFixed(1)}s`);
  for (const failure of failed) {
    console.error(`\n===== FAIL ${failure.job.label} =====\n${failure.output.slice(-4000)}`);
  }
  process.exit(failed.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
