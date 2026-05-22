import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command }) => {
    const base = process.env.VITE_CUSTOMER_BASE ?? (command === 'build' ? '/wallet-customer/' : '/');
    const assetPath = (file: string) => `${base.replace(/\/?$/, '/')}${file}`;

    return {
        base,
        plugins: [
            vue(),
            VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            manifest: {
                name: 'Beverly',
                short_name: 'Beverly',
                description: 'Beverly — electricity tokens, anywhere',
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
        port: 5173,
        proxy: {
            '/api': { target: 'http://localhost:4000', changeOrigin: true },
        },
    },
    build: {
        target: 'es2022',
        sourcemap: true,
        outDir: resolve(__dirname, process.env.VITE_CUSTOMER_OUT_DIR ?? '../../dist/wallet-customer'),
        emptyOutDir: false,
    },
    };
});
