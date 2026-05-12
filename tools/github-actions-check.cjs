"use strict";

const { execFileSync } = require("node:child_process");

const repo = process.env.GITHUB_REPOSITORY || "FrostGraphix/beverly";
const workflow = process.env.GITHUB_WORKFLOW_FILE || "ci.yml";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function currentBranch() {
  return process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git(["branch", "--show-current"]);
}

async function main() {
  const branch = currentBranch();
  const url = new URL(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/runs`);
  url.searchParams.set("branch", branch);
  url.searchParams.set("per_page", "1");

  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "acob-crm-ci-check"
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const response = await fetch(url, { headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || `GitHub Actions lookup failed: ${response.status}`);
  }

  const run = body.workflow_runs?.[0];
  if (!run) {
    console.log(JSON.stringify({ repo, workflow, branch, status: "no runs found" }, null, 2));
    return;
  }

  console.log(JSON.stringify({
    repo,
    workflow,
    branch,
    runId: run.id,
    conclusion: run.conclusion,
    status: run.status,
    url: run.html_url
  }, null, 2));

  if (process.env.GITHUB_ACTIONS_CHECK_STRICT === "true" && run.conclusion && run.conclusion !== "success") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
