"use strict";

/**
 * Beverly dev stack runner.
 *
 *   npm run dev                  → starts everything (CRM + wallet backend + admin + vendor + customer + reference API)
 *   SKIP_WALLET=1 npm run dev    → starts only the legacy CRM + reference API
 *   ONLY=admin npm run dev       → starts only the named wallet service
 *                                  (admin | vendor | customer | wallet | crm)
 *
 * Ports:
 *   9310  reference API proxy (mock data for legacy CRM)
 *   9311  legacy CRM (Vue 2)
 *   4000  wallet Fastify backend
 *   5173  customer PWA       (Vue 3)
 *   5174  vendor portal      (Vue 3)
 *   5175  wallet admin       (Vue 3)
 */

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const referenceHandler = require("../api/reference");

const root = path.resolve(__dirname, "..");
const apiPort = Number(process.env.API_PORT || 9310);
const webPort = Number(process.env.WEB_PORT || 9311);
const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";
const pnpmCmd = isWin ? "pnpm.cmd" : "pnpm";

const SKIP_WALLET = process.env.SKIP_WALLET === "1" || process.env.SKIP_WALLET === "true";
const ONLY = (process.env.ONLY || "").trim().toLowerCase();

// ── Reference API (legacy CRM mock) ────────────────────────────────────────
function writeJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function createApiServer() {
  return http.createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      writeJson(response, 204, {});
      return;
    }
    try {
      await referenceHandler(request, {
        status(statusCode) {
          return { json(body) { writeJson(response, statusCode, body); } };
        }
      });
    } catch (error) {
      writeJson(response, 500, {
        code: 500,
        msg: error instanceof Error ? error.message : "Internal error",
        data: null
      });
    }
  });
}

// ── Labeled, colored child process output ──────────────────────────────────
const colors = {
  api:      "\x1b[36m",
  crm:      "\x1b[36m",
  wallet:   "\x1b[35m",
  admin:    "\x1b[32m",
  vendor:   "\x1b[33m",
  customer: "\x1b[34m",
};
const RESET = "\x1b[0m";

function tag(name) {
  const color = colors[name] || "";
  return `${color}[${name.padEnd(8)}]${RESET}`;
}

function log(name, msg) {
  process.stdout.write(`${tag(name)} ${msg}\n`);
}

function pipePrefixed(name, stream, sink) {
  let buf = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.length) sink.write(`${tag(name)} ${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buf.length) sink.write(`${tag(name)} ${buf}\n`);
  });
}

// ── Service definitions ────────────────────────────────────────────────────
const services = [
  {
    name: "crm",
    cmd: npmCmd,
    args: ["run", "dev:web", "--", "--port", String(webPort)],
    cwd: root,
    url: `http://127.0.0.1:${webPort}`,
    walletGroup: false,
  },
  {
    name: "wallet",
    cmd: pnpmCmd,
    args: ["dev"],
    cwd: path.join(root, "backend/wallet"),
    url: "http://localhost:4000",
    walletGroup: true,
  },
  {
    name: "admin",
    cmd: pnpmCmd,
    args: ["dev"],
    cwd: path.join(root, "apps/admin"),
    url: "http://localhost:5175",
    walletGroup: true,
  },
  {
    name: "vendor",
    cmd: pnpmCmd,
    args: ["dev"],
    cwd: path.join(root, "apps/vendor"),
    url: "http://localhost:5174",
    walletGroup: true,
  },
  {
    name: "customer",
    cmd: pnpmCmd,
    args: ["dev"],
    cwd: path.join(root, "apps/customer"),
    url: "http://localhost:5173",
    walletGroup: true,
  },
];

const selected = services.filter((s) => {
  if (ONLY) return s.name === ONLY;
  if (s.walletGroup && SKIP_WALLET) return false;
  // Only start a wallet-group service if its workspace dir exists and has a package.json.
  if (s.walletGroup && !fs.existsSync(path.join(s.cwd, "package.json"))) {
    log(s.name, `skipping — ${s.cwd} not found`);
    return false;
  }
  return true;
});

if (!selected.length) {
  console.error(`No services selected (ONLY=${ONLY}, SKIP_WALLET=${SKIP_WALLET}).`);
  process.exit(1);
}

// ── Reference API server ───────────────────────────────────────────────────
const apiServer = createApiServer();
apiServer.listen(apiPort, "127.0.0.1", () => {
  log("api", `reference API → http://127.0.0.1:${apiPort}`);
});

// ── Spawn children ─────────────────────────────────────────────────────────
const children = [];

for (const svc of selected) {
  log(svc.name, `→ ${svc.url}  (${svc.cmd} ${svc.args.join(" ")})`);
  const child = spawn(svc.cmd, svc.args, {
    cwd: svc.cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: isWin,
  });
  pipePrefixed(svc.name, child.stdout, process.stdout);
  pipePrefixed(svc.name, child.stderr, process.stderr);
  child.on("exit", (code) => {
    log(svc.name, `exited (code ${code})`);
    // If the legacy CRM dies, exit the whole stack. Wallet-group crashes are isolated.
    if (svc.name === "crm") shutdown(code || 0);
  });
  children.push({ svc, child });
}

// ── Banner ─────────────────────────────────────────────────────────────────
setTimeout(() => {
  log("api", "");
  log("api", "─────────────────── Beverly dev stack ───────────────────");
  for (const svc of selected) log(svc.name, svc.url);
  log("api", `reference API: http://127.0.0.1:${apiPort}`);
  log("api", "─────────────────────────────────────────────────────────");
}, 250);

// ── Shutdown ───────────────────────────────────────────────────────────────
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("api", "shutting down…");
  apiServer.close();
  for (const { child } of children) {
    if (!child.killed) {
      try { child.kill(isWin ? undefined : "SIGTERM"); } catch { /* noop */ }
    }
  }
  setTimeout(() => process.exit(code), 1500).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
