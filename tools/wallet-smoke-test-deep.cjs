#!/usr/bin/env node
/**
 * Deeper interactive smoke test: exercises forms and multi-step flows.
 * Saves screenshots to tmp/smoke/.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve(__dirname, '../tmp/smoke');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CUSTOMER = 'http://localhost:5173';
const VENDOR   = 'http://localhost:5174';
const ADMIN    = 'http://localhost:5175';

const checks = [];

async function shot(page, name) {
    const p = path.join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: p, fullPage: true });
    return p;
}

async function record(label, fn) {
    const errors = [];
    const failed = [];
    const ctx = await BROWSER.newContext();
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message.slice(0, 200)}`));
    page.on('requestfailed', (r) => failed.push(`${r.method()} ${r.url().slice(0, 100)}`));
    page.on('response', (r) => {
        if (r.status() >= 400 && !r.url().includes('/_/api/') && !r.url().includes('/sourcemap')) {
            failed.push(`${r.status()} ${r.url().slice(0, 100)}`);
        }
    });

    let result = 'OK';
    let detail = '';
    let shotPath = null;
    try {
        await fn(page);
        shotPath = await shot(page, label.replace(/[^a-z0-9]+/gi, '_').toLowerCase());
    } catch (e) {
        result = 'FAIL';
        detail = e.message.slice(0, 300);
    } finally {
        await ctx.close();
    }
    checks.push({ label, result, errors: errors.slice(0, 5), failed: failed.slice(0, 5), detail, shotPath });
    process.stdout.write(`  ${result.padEnd(6)} ${label}\n`);
}

let BROWSER;

(async () => {
    BROWSER = await chromium.launch({ headless: true });

    // ── 1. Customer login form: focus + render + validation ──
    await record('customer-login-empty-submit', async (page) => {
        await page.goto(`${CUSTOMER}/login`, { waitUntil: 'networkidle' });
        const phoneInput = await page.$('#login-phone');
        if (!phoneInput) throw new Error('phone input missing');
        await page.click('button[type="submit"]');
        await page.waitForTimeout(300);
        const errorText = await page.evaluate(() => document.querySelector('.auth-error span')?.textContent || '');
        if (!errorText.toLowerCase().includes('valid')) throw new Error(`expected validation error, got: "${errorText}"`);
    });

    // ── 2. Customer signup multi-field render ──
    await record('customer-signup', async (page) => {
        await page.goto(`${CUSTOMER}/signup`, { waitUntil: 'networkidle' });
        const name = await page.$('#signup-name');
        const phone = await page.$('#signup-phone');
        const email = await page.$('#signup-email');
        if (!name || !phone || !email) throw new Error('signup fields missing');
    });

    // ── 3. Customer recover ──
    await record('customer-recover', async (page) => {
        await page.goto(`${CUSTOMER}/recover`, { waitUntil: 'networkidle' });
        const phone = await page.$('#recovery-phone');
        if (!phone) throw new Error('recovery phone input missing');
    });

    // ── 4. Vendor login form ──
    await record('vendor-login', async (page) => {
        await page.goto(`${VENDOR}/login`, { waitUntil: 'networkidle' });
        const email = await page.$('input[type="email"]');
        const pwd = await page.$('input[type="password"]');
        if (!email || !pwd) throw new Error('vendor login fields missing');
    });

    // ── 5. Admin login form ──
    await record('admin-login', async (page) => {
        await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' });
        const email = await page.$('input[type="email"]');
        const pwd = await page.$('input[type="password"]');
        if (!email || !pwd) throw new Error('admin login fields missing');
    });

    // ── 6. Admin VendorCreate: multi-step stepper visible ──
    await record('admin-vendor-create-stepper', async (page) => {
        await page.goto(`${ADMIN}/vendors/new`, { waitUntil: 'networkidle' });
        // If unauthenticated, will redirect to /login — that's OK, just verify route loads
        const url = page.url();
        if (url.includes('/login')) return; // expected behavior for unauth
        // If page loaded, check the Stepper renders 4 steps
        const stepCount = await page.evaluate(() => document.querySelectorAll('.stepper-item').length);
        if (stepCount === 0) throw new Error('stepper did not render (logged in but no steps)');
    });

    // ── 7. Customer KYC stepper (would need auth, but check route) ──
    await record('customer-kyc-route', async (page) => {
        await page.goto(`${CUSTOMER}/kyc`, { waitUntil: 'networkidle' });
        // Unauth redirects to login — that itself is the auth guard working
    });

    // ── 8. Customer home (unauth → redirect to /login) ──
    await record('customer-home-redirect-when-unauth', async (page) => {
        await page.goto(`${CUSTOMER}/`, { waitUntil: 'networkidle' });
        const url = page.url();
        if (!url.includes('/login')) throw new Error(`expected /login redirect, got ${url}`);
    });

    // ── 9. Vendor dashboard redirects unauth ──
    await record('vendor-dashboard-redirect-when-unauth', async (page) => {
        await page.goto(`${VENDOR}/`, { waitUntil: 'networkidle' });
        const url = page.url();
        if (!url.includes('/login')) throw new Error(`expected /login redirect, got ${url}`);
    });

    // ── 10. Admin redirects unauth ──
    await record('admin-redirect-when-unauth', async (page) => {
        await page.goto(`${ADMIN}/`, { waitUntil: 'networkidle' });
        const url = page.url();
        if (!url.includes('/login')) throw new Error(`expected /login redirect, got ${url}`);
    });

    // ── 11. Session-timeout banner shows ──
    await record('session-timeout-banner-customer', async (page) => {
        await page.goto(`${CUSTOMER}/login?reason=session_timeout`, { waitUntil: 'networkidle' });
        const banner = await page.evaluate(() => document.querySelector('.session-banner')?.textContent || '');
        if (!banner.toLowerCase().includes('session timed out')) throw new Error(`banner missing, got: "${banner}"`);
    });

    // ── 12. Customer phone-input prefix shows ──
    await record('customer-phone-prefix-renders', async (page) => {
        await page.goto(`${CUSTOMER}/login`, { waitUntil: 'networkidle' });
        const prefix = await page.evaluate(() => document.querySelector('.phone-prefix')?.textContent || '');
        if (!prefix.includes('+234')) throw new Error(`+234 prefix missing, got: "${prefix}"`);
    });

    // ── 13. Customer login: enter phone, submit fires API call ──
    await record('customer-login-api-call', async (page) => {
        const apiCalls = [];
        page.on('request', (r) => { if (r.url().includes('/api/v1/customer/auth/login')) apiCalls.push(r.url()); });
        await page.goto(`${CUSTOMER}/login`, { waitUntil: 'networkidle' });
        await page.fill('#login-phone', '08012345678');
        await page.click('button[type="submit"]');
        await page.waitForTimeout(1500);
        if (apiCalls.length === 0) throw new Error('login API was not called');
    });

    // ── 14. Onboarding checklist renders on customer home after redirect ──
    // (will redirect to /login since unauth — just verify no JS errors)
    await record('customer-no-js-errors-on-home', async (page) => {
        await page.goto(`${CUSTOMER}/`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
    });

    // ── 15. Vendor onboarding doesn't crash ──
    await record('vendor-no-js-errors-on-dashboard', async (page) => {
        await page.goto(`${VENDOR}/`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
    });

    await BROWSER.close();

    // ── Summary ──
    console.log('\n══════════════════════════════════════════');
    console.log('SUMMARY');
    console.log('══════════════════════════════════════════');
    const ok = checks.filter((c) => c.result === 'OK' && c.errors.length === 0).length;
    const fail = checks.filter((c) => c.result === 'FAIL').length;
    const withErrors = checks.filter((c) => c.errors.length > 0).length;
    console.log(`  Total:       ${checks.length}`);
    console.log(`  Pass:        ${ok}`);
    console.log(`  Fail:        ${fail}`);
    console.log(`  Console err: ${withErrors}`);
    console.log(`  Screenshots: ${OUT_DIR}`);

    const issues = checks.filter((c) => c.result === 'FAIL' || c.errors.length > 0 || c.failed.length > 0);
    if (issues.length) {
        console.log('\n══════════════════════════════════════════');
        console.log('ISSUES');
        console.log('══════════════════════════════════════════');
        for (const c of issues) {
            console.log(`\n[${c.result}] ${c.label}`);
            if (c.detail) console.log(`  detail: ${c.detail}`);
            c.errors.forEach((e) => console.log(`  console: ${e}`));
            c.failed.forEach((e) => console.log(`  network: ${e}`));
        }
    }
    process.exit(fail > 0 ? 1 : 0);
})();
