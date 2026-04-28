import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue2";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 9311,
    strictPort: false,
    proxy: {
      "/api": "http://127.0.0.1:9310"
    }
  },
  build: {
    outDir: "dist",
    sourcemap: true
  }
});
