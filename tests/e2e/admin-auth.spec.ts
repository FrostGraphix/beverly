import { test, expect } from '@playwright/test';

const ADMIN_EMAIL    = 'admin@acoblighting.com';
const ADMIN_PASSWORD = 'Abdul$amad123';

test.describe('Admin authentication', () => {
    test('login page renders', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByRole('heading', { name: /Wallet Admin/i })).toBeVisible();
        await expect(page.getByLabel(/Email/i)).toBeVisible();
        await expect(page.getByLabel(/Password/i)).toBeVisible();
    });

    test('rejects wrong password', async ({ page }) => {
        await page.goto('/login');
        await page.getByLabel(/Email/i).fill(ADMIN_EMAIL);
        await page.getByLabel(/Password/i).fill('wrongpassword');
        await page.getByRole('button', { name: /Sign in/i }).click();
        await expect(page.locator('.bw-alert')).toBeVisible({ timeout: 8000 });
    });

    test('signs in with correct credentials and lands on dashboard', async ({ page }) => {
        await page.goto('/login');
        await page.getByLabel(/Email/i).fill(ADMIN_EMAIL);
        await page.getByLabel(/Password/i).fill(ADMIN_PASSWORD);
        await page.getByRole('button', { name: /Sign in/i }).click();
        await expect(page).toHaveURL('/', { timeout: 10000 });
        await expect(page.locator('.bw-brand')).toBeVisible();
    });

    test('unauthenticated access redirects to login', async ({ page }) => {
        await page.goto('/vendors');
        await expect(page).toHaveURL(/login/, { timeout: 5000 });
    });

    test('non-staff user is blocked with access denied', async ({ page }) => {
        // Simulate login with a non-staff token
        await page.goto('/login');
        await page.getByLabel(/Email/i).fill('customer@test.com');
        await page.getByLabel(/Password/i).fill('anypassword');
        await page.getByRole('button', { name: /Sign in/i }).click();
        await expect(page.locator('.bw-alert')).toContainText(/denied|Staff|invalid/i, { timeout: 8000 });
    });
});
