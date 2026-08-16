#!/usr/bin/env node
/**
 * Beverly Wallet load test — Phase 3
 *
 * Uses autocannon (no external k6 required). Covers:
 *   • GET  /api/v1/health            (liveness probe)
 *   • GET  /api/v1/ready             (readiness probe)
 *   • GET  /api/v1/customer/wallet   (authenticated read — requires SMOKE_AUTH_TOKEN)
 *
 * Usage:
 *   node tools/load-test.cjs [BASE_URL] [DURATION_SECONDS] [CONNECTIONS]
 *
 * Environment:
 *   TARGET_URL          — override base URL
 *   SMOKE_AUTH_TOKEN    — Bearer token for authenticated endpoints
 *
 * Exit code: 0 if p99 latency < 1 s and error rate < 1%, else 1
 */
'use strict';

const autocannon = require('autocannon');

const BASE   = process.env.TARGET_URL || process.argv[2] || 'http://localhost:4000';
const SECS   = Number(process.argv[3] ?? 30);
const CONNS  = Number(process.argv[4] ?? 10);
const TOKEN  = process.env.SMOKE_AUTH_TOKEN ?? '';

const authHeaders = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};

function pct(instance, p) {
    // autocannon percentile accessor
    return instance.latency[`p${p}`];
}

async function runBenchmark(title, opts) {
    console.log(`\n⚡ ${title}`);
    const result = await new Promise((resolve, reject) => {
        const instance = autocannon({ ...opts, duration: SECS, connections: CONNS }, (err, r) => {
            if (err) reject(err); else resolve(r);
        });
        autocannon.track(instance, { renderProgressBar: true });
    });
    return result;
}

async function main() {
    console.log(`Beverly load test → ${BASE} | ${SECS}s | ${CONNS} connections`);

    const results = [];

    // ── 1. Health liveness ─────────────────────────────────────────────────────
    results.push(await runBenchmark('GET /api/v1/health', {
        url: `${BASE}/api/v1/health`,
        method: 'GET',
    }));

    // ── 2. Readiness ───────────────────────────────────────────────────────────
    results.push(await runBenchmark('GET /api/v1/ready', {
        url: `${BASE}/api/v1/ready`,
        method: 'GET',
    }));

    // ── 3. Authenticated wallet read ───────────────────────────────────────────
    if (TOKEN) {
        results.push(await runBenchmark('GET /api/v1/customer/wallet (authed)', {
            url: `${BASE}/api/v1/customer/wallet`,
            method: 'GET',
            headers: authHeaders,
        }));
    } else {
        console.log('\n⚠  SMOKE_AUTH_TOKEN not set — skipping authenticated endpoints');
    }

    // ── Summary ────────────────────────────────────────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────┐');
    console.log('│ RESULTS SUMMARY                                                 │');
    console.log('├─────────────────────────────────────────────────────────────────┤');

    let allOk = true;
    for (const r of results) {
        const p99       = pct(r, 99);
        const errRate   = r.errors > 0 ? ((r.errors / r.requests.total) * 100).toFixed(2) : '0.00';
        const latOk     = p99 < 1000;
        const errOk     = parseFloat(errRate) < 1;
        const ok        = latOk && errOk;
        if (!ok) allOk = false;

        console.log(`│ ${(r.url ?? '').padEnd(40)} p99=${String(p99).padStart(5)}ms err=${errRate}% ${ok ? '✓' : '✗'} │`);
    }
    console.log('└─────────────────────────────────────────────────────────────────┘');

    if (!allOk) {
        console.error('\n✗ Load test FAILED: p99 > 1 s or error rate ≥ 1%');
        process.exit(1);
    }
    console.log('\n✓ Load test PASSED');
    process.exit(0);
}

main().catch((err) => {
    console.error('Load test error:', err);
    process.exit(2);
});
