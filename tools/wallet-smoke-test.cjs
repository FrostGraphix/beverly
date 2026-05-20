#!/usr/bin/env node
/**
 * Browser smoke test for the wallet ecosystem.
 * Visits every public route in each app, captures:
 *   • HTTP status of the page
 *   • Console errors during load
 *   • Failed network requests (4xx/5xx)
 *   • Whether the page rendered (#app has children)
 *   • Visible page title heuristic
 *
 * Apps assumed running:
 *   customer  http://localhost:5173
 *   vendor    http://localhost:5174
 *   admin     http://localhost:5175
 */
const { chromium } = require('playwright');

const APPS = [
    {
        name: 'customer', base: 'http://localhost:5173',
        routes: ['/', '/login', '/signup', '/recover', '/verify',
                 '/kyc', '/onboard-meter', '/buy-token', '/buy-meter',
                 '/meter-orders', '/wallet', '/wallet/fund', '/meters',
                 '/transactions', '/receipts', '/notifications',
                 '/profile', '/security', '/disputes'],
    },
    {
        name: 'vendor', base: 'http://localhost:5174',
        routes: ['/', '/login', '/wallet', '/wallet/fund', '/vend',
                 '/remote-send', '/transactions', '/receipts',
                 '/statement', '/profile', '/security', '/disputes',
                 '/password-change'],
    },
    {
        name: 'admin', base: 'http://localhost:5175',
        routes: ['/', '/login', '/applications', '/vendors',
                 '/vendors/new', '/funding', '/vending',
                 '/meter-orders', '/audit', '/fraud', '/disputes',
                 '/refunds', '/settlement', '/reconciliation',
                 '/feature-flags', '/privacy'],
    },
];

const TIMEOUT = 20000;

(async () => {
    const browser = await chromium.launch({ headless: true });
    const results = [];

    for (const app of APPS) {
        for (const route of app.routes) {
            const url = `${app.base}${route}`;
            const consoleErrors = [];
            const failedRequests = [];
            let httpStatus = null;
            let appRendered = false;
            let h1Text = null;
            let loadError = null;

            const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
            const page = await ctx.newPage();

            page.on('console', (msg) => {
                if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
            });
            page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message.slice(0, 200)}`));
            page.on('requestfailed', (req) => {
                const f = req.failure();
                failedRequests.push(`${req.method()} ${req.url().slice(0, 100)} :: ${f?.errorText ?? 'unknown'}`);
            });
            page.on('response', (resp) => {
                if (resp.url() === url) httpStatus = resp.status();
                if (resp.status() >= 400 && resp.url().includes(app.base)) {
                    // Don't double-record the main doc
                    if (resp.url() !== url) {
                        failedRequests.push(`${resp.status()} ${resp.url().slice(0, 100)}`);
                    }
                }
            });

            try {
                await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUT });
                // Wait for SPA to hydrate
                await page.waitForTimeout(800);
                appRendered = await page.evaluate(() => {
                    const app = document.querySelector('#app');
                    return !!(app && app.children.length > 0);
                });
                h1Text = await page.evaluate(() => {
                    const h1 = document.querySelector('h1, .bw-h1, .bw-page-title, [class*="title"]');
                    return h1 ? h1.textContent.trim().slice(0, 80) : null;
                });
            } catch (e) {
                loadError = e.message.slice(0, 200);
            } finally {
                await ctx.close();
            }

            const status =
                loadError ? 'LOAD_FAIL' :
                consoleErrors.length > 0 ? 'CONSOLE_ERR' :
                !appRendered ? 'EMPTY_RENDER' :
                failedRequests.length > 0 ? 'NETWORK_ERR' :
                'OK';

            results.push({ app: app.name, route, url, status, httpStatus,
                           consoleErrors, failedRequests, h1Text, loadError });

            process.stdout.write(`  ${status.padEnd(12)} ${app.name.padEnd(8)} ${route}\n`);
        }
    }

    await browser.close();

    // ── Summary ──
    console.log('\n══════════════════════════════════════════');
    console.log('SUMMARY');
    console.log('══════════════════════════════════════════');
    const byStatus = {};
    for (const r of results) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    for (const [k, v] of Object.entries(byStatus)) console.log(`  ${k.padEnd(14)} ${v}`);

    console.log('\n══════════════════════════════════════════');
    console.log('ISSUES');
    console.log('══════════════════════════════════════════');
    const issues = results.filter((r) => r.status !== 'OK');
    if (issues.length === 0) {
        console.log('  No issues detected.');
    } else {
        for (const r of issues) {
            console.log(`\n[${r.status}] ${r.app}${r.route}  (http ${r.httpStatus})`);
            if (r.loadError) console.log(`  load error: ${r.loadError}`);
            if (r.consoleErrors.length) {
                console.log(`  console errors (${r.consoleErrors.length}):`);
                r.consoleErrors.slice(0, 5).forEach((e) => console.log(`    • ${e}`));
            }
            if (r.failedRequests.length) {
                console.log(`  failed requests (${r.failedRequests.length}):`);
                r.failedRequests.slice(0, 5).forEach((e) => console.log(`    • ${e}`));
            }
        }
    }

    process.exit(issues.length > 0 ? 1 : 0);
})();
