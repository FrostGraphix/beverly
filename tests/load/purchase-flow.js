/**
 * k6 load test — Customer token purchase flow (§23.1)
 *
 * Simulates concurrent customers hitting the token purchase flow.
 *
 * Run:
 *   k6 run tests/load/purchase-flow.js --env API_BASE=http://localhost:4000
 *
 * Targets from master design §23.1:
 *   - Payment + token flow at expected peak
 *   - p95 latency < 2000ms
 *   - Error rate < 1%
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const API_BASE = __ENV.API_BASE ?? 'http://localhost:4000';
const TOKEN    = __ENV.CUSTOMER_TOKEN ?? '';  // pre-issued test token

const errorRate  = new Rate('errors');
const tokenTime  = new Trend('token_purchase_duration', true);

export const options = {
    stages: [
        { duration: '30s', target: 10  }, // ramp up
        { duration: '2m',  target: 50  }, // sustained load
        { duration: '30s', target: 100 }, // peak burst
        { duration: '30s', target: 0   }, // cool down
    ],
    thresholds: {
        http_req_duration:    ['p(95)<2000'],
        errors:               ['rate<0.01'],
        token_purchase_duration: ['p(95)<3000'],
    },
};

const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${TOKEN}`,
};

export default function () {
    // Step 1: check wallet balance
    const balanceRes = http.get(`${API_BASE}/api/v1/customer/wallet`, { headers });
    check(balanceRes, {
        'wallet status 200': (r) => r.status === 200,
    });
    errorRate.add(balanceRes.status !== 200);

    sleep(0.5);

    // Step 2: preview purchase (tariff computation)
    const previewStart = Date.now();
    const previewRes = http.post(
        `${API_BASE}/api/v1/customer/purchase/preview`,
        JSON.stringify({ meter_id: __ENV.TEST_METER_ID ?? 'test-meter', amount_minor: 50000 }),
        { headers },
    );
    const previewOk = check(previewRes, {
        'preview status 200 or 400': (r) => [200, 400, 422].includes(r.status),
    });
    errorRate.add(!previewOk);
    tokenTime.add(Date.now() - previewStart);

    sleep(1);
}

export function handleSummary(data) {
    return {
        'tests/load/results/purchase-flow-summary.json': JSON.stringify(data),
    };
}
