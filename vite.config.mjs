import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const referenceHandler = require("./api/reference");

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET
  || (process.env.API_PORT ? `http://127.0.0.1:${process.env.API_PORT}` : "http://127.0.0.1:9310");

function embeddedReferenceApi() {
  return {
    name: "beverly-embedded-reference-api",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith("/api")) {
          next();
          return;
        }

        try {
          await referenceHandler(request, {
            setHeader(name, value) {
              response.setHeader(name, value);
            },
            status(statusCode) {
              return {
                json(body) {
                  if (response.writableEnded) return;
                  response.statusCode = statusCode;
                  response.setHeader("Content-Type", "application/json; charset=utf-8");
                  response.end(JSON.stringify(body));
                }
              };
            }
          });
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
  plugins: [embeddedReferenceApi(), vue()],
  server: {
    port: 9311,
    strictPort: false,
    proxy: {
      "/api": apiProxyTarget
    }
  },
  build: {
    outDir: "dist",
    sourcemap: true,
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
