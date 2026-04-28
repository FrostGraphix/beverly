"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { createServer: createFacadeServer } = require("../backend/reference-facade/server");

const root = path.resolve(__dirname, "..");
const apiPort = Number(process.env.API_PORT || 9310);
const webPort = Number(process.env.WEB_PORT || 9311);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml; charset=utf-8"]
]);

function safePath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0] || "/");
  const filePath = cleanPath === "/" ? "index.html" : cleanPath.replace(/^\/+/, "");
  const resolved = path.resolve(root, filePath);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

function createWebServer() {
  return http.createServer((request, response) => {
    const resolved = safePath(request.url || "/");
    if (!resolved || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    const extension = path.extname(resolved).toLowerCase();
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(extension) || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    fs.createReadStream(resolved).pipe(response);
  });
}

const apiServer = createFacadeServer();
const webServer = createWebServer();

apiServer.listen(apiPort, "127.0.0.1", () => {
  console.log(`api http://127.0.0.1:${apiPort}`);
});

webServer.listen(webPort, "127.0.0.1", () => {
  console.log(`web http://127.0.0.1:${webPort}`);
});

function shutdown() {
  apiServer.close();
  webServer.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
