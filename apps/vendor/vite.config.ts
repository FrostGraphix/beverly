import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ command }) => ({
    base: process.env.VITE_VENDOR_BASE ?? (command === 'build' ? '/wallet-vendor/' : '/'),
    plugins: [vue()],
    server: {
        port: 5174,
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
        sourcemap: false,
        outDir: resolve(__dirname, process.env.VITE_VENDOR_OUT_DIR ?? '../../dist/wallet-vendor'),
        emptyOutDir: false,
    },
}));
