import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue2";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET
  || (process.env.API_PORT ? `http://127.0.0.1:${process.env.API_PORT}` : "http://127.0.0.1:9310");

export default defineConfig({
  plugins: [vue()],
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
