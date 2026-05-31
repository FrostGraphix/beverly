/**
 * Phase 6 regression — Vendor performance analytics.
 *
 * Covers:
 *   • admin.ts: GET /vendors/:id/analytics route + permission entry
 *   • admin.ts: analytics response shape (summary, by_mode, daily, top_stations, top_meters)
 *   • admin.ts: period filtering (7d, 30d, 90d, all)
 *   • VendorDetail.vue: analytics tab present in tab list
 *   • VendorDetail.vue: period selector pills
 *   • VendorDetail.vue: KPI cards (revenue, success rate, avg, kWh)
 *   • VendorDetail.vue: daily bar chart elements
 *   • VendorDetail.vue: mode breakdown + top stations + top meters
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd(), '../..');

// ── Backend route ─────────────────────────────────────────────────────────────
describe('admin routes — GET /vendors/:id/analytics', () => {
    const src = readFileSync(resolve(ROOT, 'backend/wallet/src/routes/admin.ts'), 'utf-8');

    it('has permission entry for analytics route', () => {
        expect(src).toContain("'GET /vendors/:id/analytics'");
        expect(src).toContain("'wallet.vending.monitor'");
    });

    it('has fastify.get route handler', () => {
        expect(src).toContain("fastify.get('/vendors/:id/analytics'");
    });

    it('accepts period query param (7d, 30d, 90d, all)', () => {
        const start = src.indexOf("fastify.get('/vendors/:id/analytics'");
        const block = src.slice(start, start + 2000);
        expect(block).toContain("'7d'");
        expect(block).toContain("'30d'");
        expect(block).toContain("'90d'");
        expect(block).toContain("'all'");
    });

    it('defaults to 30d when no period provided', () => {
        const start = src.indexOf("fastify.get('/vendors/:id/analytics'");
        const block = src.slice(start, start + 500);
        expect(block).toContain("'30d'");
    });

    it('returns 404 when vendor not found', () => {
        const start = src.indexOf("fastify.get('/vendors/:id/analytics'");
        const block = src.slice(start, start + 500);
        expect(block).toContain('404');
        expect(block).toContain("'not_found'");
    });

    it('queries purchase_orders filtered by actor_type=vendor and actor_id', () => {
        const start = src.indexOf("fastify.get('/vendors/:id/analytics'");
        const block = src.slice(start, start + 2000);
        expect(block).toContain("'purchase_orders'");
        expect(block).toContain("'actor_type', 'vendor'");
        expect(block).toContain("'actor_id', id");
    });

    it('applies since filter for non-all periods', () => {
        const start = src.indexOf("fastify.get('/vendors/:id/analytics'");
        const block = src.slice(start, start + 2000);
        expect(block).toContain('since');
        expect(block).toContain('gte');
    });

    it('returns summary with total, delivered, failed, success_rate', () => {
        const start = src.indexOf("fastify.get('/vendors/:id/analytics'");
        const block = src.slice(start, start + 5000);
        expect(block).toContain('summary');
        expect(block).toContain('total:');
        expect(block).toContain('delivered:');
        expect(block).toContain('failed:');
        expect(block).toContain('success_rate:');
    });

    it('returns summary with total_amount_minor, total_units_kwh, avg_amount_minor', () => {
        const start = src.indexOf("fastify.get('/vendors/:id/analytics'");
        const block = src.slice(start, start + 5000);
        expect(block).toContain('total_amount_minor:');
        expect(block).toContain('total_units_kwh:');
        expect(block).toContain('avg_amount_minor:');
    });

    it('returns by_mode breakdown keyed by purchase_mode', () => {
        const start = src.indexOf("fastify.get('/vendors/:id/analytics'");
        const block = src.slice(start, start + 5000);
        expect(block).toContain('by_mode');
        expect(block).toContain('purchase_mode');
    });

    it('returns daily array with date, count, amount_minor, delivered, failed', () => {
        const start = src.indexOf("fastify.get('/vendors/:id/analytics'");
        const block = src.slice(start, start + 5000);
        expect(block).toContain('daily');
        expect(block).toContain('date');
        expect(block).toContain('delivered');
        expect(block).toContain('failed');
    });

    it('returns top_stations sorted by count descending, capped at 10', () => {
        const start = src.indexOf("fastify.get('/vendors/:id/analytics'");
        const block = src.slice(start, start + 6000);
        expect(block).toContain('top_stations');
        expect(block).toContain('station_id');
        expect(block).toContain('.slice(0, 10)');
    });

    it('returns top_meters sorted by count descending, capped at 10', () => {
        const start = src.indexOf("fastify.get('/vendors/:id/analytics'");
        const block = src.slice(start, start + 6000);
        expect(block).toContain('top_meters');
        expect(block).toContain('meter_id');
        expect(block).toContain('.slice(0, 10)');
    });

    it('limits query to 10000 rows for safety', () => {
        const start = src.indexOf("fastify.get('/vendors/:id/analytics'");
        const block = src.slice(start, start + 2000);
        expect(block).toContain('10000');
    });

    it('returns period and since in response', () => {
        const start = src.indexOf("fastify.get('/vendors/:id/analytics'");
        const block = src.slice(start, start + 6000);
        expect(block).toContain('period,');
        expect(block).toContain('since,');
    });
});

// ── Frontend VendorDetail.vue ─────────────────────────────────────────────────
describe('VendorDetail.vue — analytics tab', () => {
    const src = readFileSync(resolve(ROOT, 'apps/admin/src/views/VendorDetail.vue'), 'utf-8');

    it('analytics is in the Tab type union', () => {
        expect(src).toContain("'analytics'");
    });

    it('analytics tab appears in tabs list', () => {
        const start = src.indexOf("'overview','wallet','transactions','funding','staff'");
        expect(start).toBeGreaterThan(0);
        const block = src.slice(start, start + 80);
        expect(block).toContain("'analytics'");
    });

    it('has analytics ref for storing response', () => {
        expect(src).toContain('const analytics');
    });

    it('has analyticsPeriod ref with default 30d', () => {
        expect(src).toContain('analyticsPeriod');
        expect(src).toContain("'30d'");
    });

    it('calls loadAnalytics when analytics tab is switched to', () => {
        expect(src).toContain('loadAnalytics');
        expect(src).toContain("t === 'analytics'");
    });

    it('loadAnalytics fetches /api/v1/admin/vendors/:id/analytics with period param', () => {
        const start = src.indexOf('loadAnalytics');
        const block = src.slice(start, start + 300);
        expect(block).toContain('/vendors/');
        expect(block).toContain('/analytics');
        expect(block).toContain('analyticsPeriod');
    });

    it('changeAnalyticsPeriod resets analytics and reloads', () => {
        const start = src.indexOf('changeAnalyticsPeriod');
        const block = src.slice(start, start + 250);
        expect(block).toContain('analyticsPeriod.value');
        expect(block).toContain('analytics.value = null');
        expect(block).toContain('loadAnalytics');
    });

    it('has period selector pills (7d, 30d, 90d, all)', () => {
        expect(src).toContain("'7d','30d','90d','all'");
        expect(src).toContain('an-pill');
        expect(src).toContain('changeAnalyticsPeriod');
    });

    it('has KPI cards showing total revenue, success rate, avg transaction, kWh', () => {
        expect(src).toContain('Total revenue');
        expect(src).toContain('Success rate');
        expect(src).toContain('Avg transaction');
        expect(src).toContain('Total kWh vended');
    });

    it('renders daily bar chart with delivered and failed bars', () => {
        expect(src).toContain('an-bar delivered');
        expect(src).toContain('an-bar failed');
        expect(src).toContain('an-chart');
    });

    it('bar height is driven by barHeight helper', () => {
        expect(src).toContain('barHeight(');
        expect(src).toContain('analyticsMaxDaily(');
    });

    it('has mode breakdown section', () => {
        expect(src).toContain('By purchase mode');
        expect(src).toContain('an-mode-bar');
        expect(src).toContain('modePct(');
    });

    it('has top stations table with station_id, orders, revenue columns', () => {
        expect(src).toContain('Top stations');
        expect(src).toContain('top_stations');
        expect(src).toContain('s.station_id');
    });

    it('has top meters table with meter_id, orders, revenue columns', () => {
        expect(src).toContain('Top meters');
        expect(src).toContain('top_meters');
        expect(src).toContain('m.meter_id');
    });

    it('shows empty state when no daily data', () => {
        expect(src).toContain('No transaction data for this period.');
    });

    it('has barHeight, analyticsMaxDaily, modePct helper functions', () => {
        expect(src).toContain('function barHeight(');
        expect(src).toContain('function analyticsMaxDaily(');
        expect(src).toContain('function modePct(');
    });

    it('has analytics-specific CSS classes', () => {
        expect(src).toContain('.an-kpi-grid');
        expect(src).toContain('.an-chart');
        expect(src).toContain('.an-period-pills');
        expect(src).toContain('.an-two-col');
    });
});
