import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    plugins: [vue()],
    server: {
        port: 5175,
        proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
    },
    build: { target: 'es2022', sourcemap: true },
});
