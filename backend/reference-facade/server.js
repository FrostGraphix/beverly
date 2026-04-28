"use strict";

const http = require("http");
const { URL } = require("url");
const { dispatch } = require("./handlers");

const DEFAULT_PORT = 9310;
const MAX_BODY_BYTES = 1024 * 1024;

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({ raw });
      }
    });
    request.on("error", reject);
  });
}

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

function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      if (request.method === "OPTIONS") {
        writeJson(response, 204, {});
        return;
      }
      if (request.method === "GET" && url.pathname === "/health") {
        writeJson(response, 200, { ok: true, service: "reference-facade" });
        return;
      }
      const body = await readBody(request);
      const result = dispatch(request.method || "GET", url.pathname, body);
      writeJson(response, result.status, result.body);
    } catch (error) {
      writeJson(response, 500, {
        code: 500,
        msg: error instanceof Error ? error.message : "Internal error",
        data: null
      });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || DEFAULT_PORT);
  createServer().listen(port, "127.0.0.1", () => {
    console.log(`reference-facade listening on http://127.0.0.1:${port}`);
  });
}

module.exports = {
  createServer
};
