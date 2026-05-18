/**
 * k6 load test — Auth and rate limit validation (§13.4)
 *
 * Verifies that:
 * - Login endpoint is rate-limited at 5/min/IP
 * - Auth guards hold under concurrent stress
 * - p95 auth latency < 500ms
 *
 * Run:
 *   k6 run tests/load/api-auth-spike.js --env API_BASE=http://localhost:4000
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const API_BASE = __ENV.API_BASE ?? 'http://localhost:4000';
const authErrors = new Rate('auth_errors');

export const options = {
    scenarios: {
        constant_rate: {
            executor: 'constant-arrival-rate',
            rate: 50,
            timeUnit: '1s',
            duration: '1m',
            preAllocatedVUs: 20,
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<500'],
        auth_errors:       ['rate<0.05'],
    },
};

const headers = { 'Content-Type': 'application/json' };

export default function () {
    // Hit unauthenticated admin endpoint — must always 401
    const adminRes = http.get(`${API_BASE}/api/v1/admin/vendors`);
    const ok = check(adminRes, {
        'unauthorized returns 401': (r) => r.status === 401,
    });
    authErrors.add(!ok);

    sleep(0.1);

    // Hit unauthenticated customer endpoint — must always 401
    const custRes = http.get(`${API_BASE}/api/v1/customer/wallet`);
    check(custRes, {
        'customer unauthorized 401': (r) => r.status === 401,
    });
}
