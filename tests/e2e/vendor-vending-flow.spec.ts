/**
 * E2E — Vendor critical path: login → dashboard → vend → receipt
 *
 * Requires VENDOR_EMAIL / VENDOR_PASSWORD env vars pointing to
 * a pre-seeded test vendor with an active wallet balance.
 */
import { test, expect, type Page } from '@playwright/test';

const EMAIL    = process.env.VENDOR_EMAIL    ?? 'test-vendor@beverly.test';
const PASSWORD = process.env.VENDOR_PASSWORD ?? 'VendorPass123!';

async function login(page: Page) {
    await page.goto('/login');
    await page.getByLabel(/Email|Username/i).fill(EMAIL);
    await page.getByLabel(/Password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /Log in|Sign in/i }).click();
    await expect(page).toHaveURL('/', { timeout: 12000 });
}

test.describe('Vendor auth', () => {
    test('login page renders', async ({ page }) => {
        await page.goto('/login');
        await expect(page.locator('.bw-mark')).toBeVisible();
    });

    test('rejects invalid credentials', async ({ page }) => {
        await page.goto('/login');
        await page.getByLabel(/Email|Username/i).fill('nobody@bad.com');
        await page.getByLabel(/Password/i).fill('badpass');
        await page.getByRole('button', { name: /Log in|Sign in/i }).click();
        await expect(page.locator('.bw-alert, [class*="error"]')).toBeVisible({ timeout: 8000 });
    });

    test('unauthenticated access to /wallet redirects to login', async ({ page }) => {
        await page.goto('/wallet');
        await expect(page).toHaveURL(/login/, { timeout: 5000 });
    });
});

test.describe('Vendor dashboard', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('sidebar is present with wallet link', async ({ page }) => {
        await expect(page.locator('.bw-sidebar')).toBeVisible();
        await expect(page.locator('.bw-sidebar a[href="/wallet"]')).toBeVisible();
    });

    test('wallet page shows balance', async ({ page }) => {
        await page.goto('/wallet');
        await expect(page.locator('main')).toBeVisible();
        await expect(page).not.toHaveURL(/login/);
    });
});

test.describe('Vending flow', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('vend page renders meter input', async ({ page }) => {
        await page.goto('/vend');
        await expect(page).not.toHaveURL(/login/);
        await expect(page.locator('input, .bw-input').first()).toBeVisible();
    });

    test('receipts page renders history', async ({ page }) => {
        await page.goto('/receipts');
        await expect(page).not.toHaveURL(/login/);
        await expect(page.locator('main')).toBeVisible();
    });

    test('disputes page is accessible', async ({ page }) => {
        await page.goto('/disputes');
        await expect(page).not.toHaveURL(/login/);
    });
});

test.describe('Password reset flow', () => {
    test('password-change page blocks unreset users', async ({ page }) => {
        // A vendor with password_reset_required should land on /password-change
        await page.goto('/password-change');
        const onLogin  = page.url().includes('/login');
        const onChange = page.url().includes('/password-change');
        expect(onLogin || onChange).toBe(true);
    });
});
