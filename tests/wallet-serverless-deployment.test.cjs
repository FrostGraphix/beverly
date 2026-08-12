const assert = require("node:assert");
const fs = require("node:fs");

const adapter = fs.readFileSync("api/wallet-service.mjs", "utf8");
const server = fs.readFileSync("backend/wallet/src/server.ts", "utf8");
const queues = fs.readFileSync("backend/wallet/src/queue/index.ts", "utf8");
const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));

assert.match(adapter, /app\.inject/);
assert.match(adapter, /export async function injectWallet/);
assert.match(adapter, /x-vercel-forwarded-for/);
assert.match(adapter, /remoteAddress: clientAddress\(request\)/);
assert.match(fs.readFileSync("backend/wallet/src/services/audit.ts", "utf8"), /ip:\s+req\.ip/);
assert.match(fs.readFileSync("api/reference.js", "utf8"), /walletApiBaseUrl === "internal"/);
assert.match(server, /export async function build/);
assert.match(queues, /WALLET_SERVERLESS/);
assert(vercel.rewrites.some((route) =>
  route.source === "/api/wallet-service/:path*"
  && route.destination === "/api/wallet-service"
));

console.log("wallet serverless deployment contract passed");
