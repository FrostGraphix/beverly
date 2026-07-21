import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command, mode }) => {
    const env = loadEnv(mode, resolve(__dirname, '../..'), '');
    const base = process.env.VITE_VENDOR_BASE ?? (command === 'build' ? '/wallet-vendor/' : '/');
    const assetPath = (file: string) => `${base.replace(/\/?$/, '/')}${file}`;

    return {
        base,
        define: {
            'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || env.SUPABASE_URL),
            'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY),
        },
        plugins: [
            vue(),
            VitePWA({
                registerType: 'autoUpdate',
                includeAssets: ['brand/beverly-mark.png', 'apple-touch-icon.png'],
                manifest: {
                    name: 'Beverly Vendor',
                    short_name: 'Beverly Vendor',
                    description: 'Beverly Vendor Portal - Your Smart Power Partner.',
                    theme_color: '#22c55e',
                    background_color: '#0a0e14',
                    display: 'standalone',
                    start_url: base,
                    icons: [
                        { src: assetPath('pwa-192.png'), sizes: '192x192', type: 'image/png' },
                        { src: assetPath('pwa-512.png'), sizes: '512x512', type: 'image/png' },
                        { src: assetPath('pwa-512-maskable.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                    ],
                },
                workbox: {
                    navigateFallback: assetPath('index.html'),
                    runtimeCaching: [
                        {
                            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
                            handler: 'CacheFirst',
                            options: { cacheName: 'google-fonts', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
                        },
                        {
                            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
                            handler: 'NetworkFirst',
                            options: { cacheName: 'api', networkTimeoutSeconds: 4 },
                        },
                    ],
                },
            }),
        ],
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
