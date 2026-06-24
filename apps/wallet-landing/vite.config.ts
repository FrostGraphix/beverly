import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ command }) => ({
    base: process.env.VITE_LANDING_BASE ?? (command === 'build' ? '/wallet/' : '/'),
    plugins: [vue()],
    server: {
        port: 5176,
        proxy: { '/api': { target: `http://localhost:${process.env.WALLET_PORT || 4000}`, changeOrigin: true } },
    },
    esbuild: {
        supported: {
            destructuring: true
        }
    },
    optimizeDeps: {
        esbuildOptions: {
            target: 'es2022',
        },
    },
    build: {
        target: 'es2022',
        sourcemap: true,
        outDir: resolve(__dirname, process.env.VITE_LANDING_OUT_DIR ?? '../../dist/wallet'),
        emptyOutDir: false,
    },
}));
