import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const referenceModulePath = require.resolve("./api/reference");

// The handler used to be required once at config load, so every edit to the
// proxy needed a full dev-server restart — and stale server code silently
// contradicted the freshly hot-reloaded UI. It is now re-required whenever the
// file (or anything it pulled in from this repo) changes on disk.
let referenceHandlerCache = require(referenceModulePath);
let referenceHandlerStamp = 0;

function clearServerModuleCache() {
  const root = process.cwd();
  for (const id of Object.keys(require.cache)) {
    if (!id.startsWith(root)) continue;
    if (id.includes("node_modules")) continue;
    delete require.cache[id];
  }
}

function loadReferenceHandler() {
  return referenceHandlerCache;
}

function reloadReferenceHandler(reason) {
  const now = Date.now();
  if (now - referenceHandlerStamp < 50) return;
  referenceHandlerStamp = now;
  try {
    clearServerModuleCache();
    referenceHandlerCache = require(referenceModulePath);
    console.log(`[api-reload] reloaded server handler after change in ${reason}`);
  } catch (error) {
    console.error("[api-reload] failed, keeping previous handler:", error instanceof Error ? error.message : error);
  }
}

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET
  || (process.env.API_PORT ? `http://127.0.0.1:${process.env.API_PORT}` : "http://127.0.0.1:9310");

function serveRawDocs() {
  return {
    name: "serve-raw-docs",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = request.url ? request.url.split("?")[0] : "";
        if (url.startsWith("/docs/") && url.endsWith(".jsx")) {
          const filePath = path.join(process.cwd(), url);
          try {
            const content = await fs.readFile(filePath, "utf-8");
            response.statusCode = 200;
            response.setHeader("Content-Type", "text/plain; charset=utf-8");
            response.end(content);
            return;
          } catch (error) {
            // Let next middleware handle it
          }
        }
        next();
      });
    }
  };
}

function embeddedReferenceApi() {
  return {
    name: "beverly-embedded-reference-api",
    configureServer(server) {
      const watchRoots = ["api", "backend/src", "packages"].map((dir) => path.resolve(process.cwd(), dir));
      server.watcher.add(watchRoots);
      const onServerFileChange = (file) => {
        const resolved = path.resolve(file);
        if (!watchRoots.some((root) => resolved.startsWith(root))) return;
        if (!/\.(c?js|mjs|json)$/.test(resolved)) return;
        reloadReferenceHandler(path.relative(process.cwd(), resolved));
      };
      server.watcher.on("change", onServerFileChange);
      server.watcher.on("add", onServerFileChange);

      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith("/api")) {
          next();
          return;
        }

        try {
          response.status = (statusCode) => ({
            json(body) {
              if (response.writableEnded) return;
              response.statusCode = statusCode;
              response.setHeader("Content-Type", "application/json; charset=utf-8");
              response.end(JSON.stringify(body));
            }
          });
          await loadReferenceHandler()(request, response);
        } catch (error) {
          if (response.writableEnded) return;
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({
            code: 500,
            msg: error instanceof Error ? error.message : "Internal Server Error",
            reason: error instanceof Error ? error.message : "Internal Server Error",
            data: null,
            result: null,
            _proxy: {
              source: "vite-embedded-api",
              pathname: request.url
            }
          }));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [serveRawDocs(), embeddedReferenceApi(), vue()],
  server: {
    port: 9311,
    strictPort: false,
    proxy: {
      "/api": apiProxyTarget
    },
    watch: {
      // Root Vite serves only the CRM (src/, packages/tokens). Without this,
      // chokidar recursively watches the ENTIRE project tree by default —
      // every app under apps/* (each of which already runs its own dev
      // server/watcher), docs, Supabase SQL migrations, and worst of all
      // backend/data/*.sqlite* (the runtime DB, which churns on every write).
      // Confirmed via direct instrumentation: this inflated the process to
      // ~3650 open FSWatcher handles, which starved new outbound HTTPS
      // connections (Windows shares I/O-completion resources between file
      // watches and socket I/O) — e.g. a Supabase RPC that takes ~250ms in a
      // fresh process took 4.8-5.8s+ here, intermittently exceeding the 5s
      // request timeout and surfacing as "aborted due to timeout" errors on
      // Station Consumption and other Supabase-backed reads.
      ignored: [
        "**/apps/**",
        "**/backend/data/**",
        "**/backend/wallet/**",
        "**/docs/**",
        "**/supabase/**",
        "**/contracts/**",
        "**/tools/**",
        "**/.tools/**",
        "**/.codex-temp/**",
        "**/tmp/**",
        "**/replica-screenshots/**",
        "**/source-crawl/**",
        "**/*.log",
      ],
    },
  },
  esbuild: {
    supported: {
      destructuring: true
    }
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/echarts")) return "vendor-echarts";
          if (id.includes("node_modules/zrender")) return "vendor-zrender";
          if (id.includes("node_modules/vue")) return "vendor-vue";
          return undefined;
        }
      }
    }
  }
});
