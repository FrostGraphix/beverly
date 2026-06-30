import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ command }) => ({
    base: process.env.VITE_ADMIN_BASE ?? (command === 'build' ? '/wallet-admin/' : '/'),
    plugins: [vue()],
    server: {
        port: 5175,
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
        outDir: resolve(__dirname, '../../dist/wallet-admin'),
        emptyOutDir: false,
    },
}));
