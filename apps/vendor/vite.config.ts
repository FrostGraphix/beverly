import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ command, mode }) => {
    const env = loadEnv(mode, resolve(__dirname, '../..'), '');

    return {
        base: process.env.VITE_VENDOR_BASE ?? (command === 'build' ? '/wallet-vendor/' : '/'),
        define: {
            'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || env.SUPABASE_URL),
            'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY),
        },
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
    };
});
