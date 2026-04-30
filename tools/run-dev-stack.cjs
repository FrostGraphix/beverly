"use strict";

const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const referenceHandler = require("../api/reference");

const root = path.resolve(__dirname, "..");
const apiPort = Number(process.env.API_PORT || 9310);
const webPort = Number(process.env.WEB_PORT || 9311);

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
          return {
            json(body) {
              writeJson(response, statusCode, body);
            }
          };
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

const apiServer = createApiServer();

apiServer.listen(apiPort, "127.0.0.1", () => {
  console.log(`api proxy http://127.0.0.1:${apiPort}`);
});

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const vite = spawn(npmCommand, ["run", "dev:web", "--", "--port", String(webPort)], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32"
});

function shutdown() {
  apiServer.close();
  if (!vite.killed) vite.kill();
}

vite.on("exit", (code) => {
  apiServer.close(() => process.exit(code || 0));
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
