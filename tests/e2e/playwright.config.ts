import { defineConfig, devices } from 'playwright/test';

export default defineConfig({
    testDir: './',
    timeout: 30_000,
    expect: { timeout: 8_000 },
    fullyParallel: true,
    retries: process.env.CI ? 2 : 0,
    reporter: [['html', { open: 'never' }], ['list']],

    use: {
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },

    projects: [
        {
            name: 'api-contracts',
            testMatch: 'ledger-integrity.spec.ts',
            use: { trace: 'off', screenshot: 'off', video: 'off' },
        },
        {
            name: 'customer-chromium',
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.CUSTOMER_URL ?? 'http://localhost:5173',
            },
            testMatch: 'customer-*.spec.ts',
        },
        {
            name: 'customer-mobile',
            use: {
                ...devices['Pixel 7'],
                baseURL: process.env.CUSTOMER_URL ?? 'http://localhost:5173',
            },
            testMatch: 'customer-*.spec.ts',
        },
        {
            name: 'vendor-chromium',
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.VENDOR_URL ?? 'http://localhost:5174',
            },
            testMatch: 'vendor-*.spec.ts',
        },
        {
            name: 'admin-chromium',
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.ADMIN_URL ?? 'http://localhost:5175',
            },
            testMatch: 'admin-*.spec.ts',
        },
    ],
});
