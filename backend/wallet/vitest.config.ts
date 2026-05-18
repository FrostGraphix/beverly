import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./vitest.setup.ts'],
        include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
        coverage: {
            reporter: ['text', 'lcov'],
            include: ['src/services/**', 'src/adapters/**'],
            exclude: ['src/**/__tests__/**', 'src/**/index.ts'],
        },
        testTimeout: 10_000,
    },
});
