import vue from '@vitejs/plugin-vue';

export const baseConfig = {
    plugins: [vue()],
    server: {
        proxy: {
            '/api': { target: 'http://localhost:4000', changeOrigin: true },
        },
    },
    build: { target: 'es2022', sourcemap: true },
};
