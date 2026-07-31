"use strict";

// Dashboard + wallet-summary contract.
//
// Behavioural coverage lives in backend/wallet/src/services/__tests__/
// (wallet-summary.test.ts, paged-query.test.ts). This file guards the wiring
// those unit tests cannot see: that the route selects the columns the scoping
// rule needs, that the dashboard gates each feed on its own permission, and
// that a feed the role cannot see is not rendered as a zero.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const dashboard = read("apps/admin/src/views/Dashboard.vue");
const adminRoutes = read("backend/wallet/src/routes/admin.ts");
const walletSummary = read("backend/wallet/src/services/wallet-summary.ts");
const authStore = read("apps/admin/src/stores/auth.ts");

/* ── wallets/summary: the station-scope regression ─────────────────────── */

const summaryHandler = adminRoutes.slice(
  adminRoutes.indexOf("fastify.get('/wallets/summary'"),
  adminRoutes.indexOf("fastify.get('/wallets/:id'"),
);
assert.ok(summaryHandler.length > 0, "wallets/summary handler not found");

assert.match(
  summaryHandler,
  /select\('id, owner_type, owner_id, status'\)/,
  "wallets/summary must select owner_id — scoping filters on it, and omitting it zeroes the float for every station-scoped admin",
);
assert.ok(
  !/getBalance\(/.test(summaryHandler),
  "wallets/summary must not call getBalance per wallet — it is polled every 30s by every open dashboard",
);
assert.match(
  summaryHandler,
  /fetchAllRows<WalletBalanceRow>/,
  "wallet balances must be read in one paged query from v_wallet_balances",
);
assert.match(
  summaryHandler,
  /scopeWalletsToStations\(walletRows, stationOwners\)/,
  "wallets/summary must delegate scoping to the tested helper",
);

/* ── summary aggregation contract the dashboard depends on ─────────────── */

assert.match(walletSummary, /totalBalanceMinor: totalFloat/, "summary must keep the totalBalanceMinor alias");
assert.match(walletSummary, /activeWallets: byStatus\.active \?\? 0/, "summary must keep the activeWallets alias");
assert.match(
  dashboard,
  /walletSummary\.value\.vendorFloatMinor/,
  "dashboard must read vendor wallet float",
);
assert.match(
  dashboard,
  /walletSummary\.value\.customerFloatMinor/,
  "dashboard must read customer wallet float",
);
assert.match(
  dashboard,
  /Vendor Wallet Float[\s\S]*Customer Wallet Float/,
  "dashboard must separate vendor and customer wallet float",
);

/* ── purchases/summary: exact day totals ───────────────────────────────── */

const purchaseSummaryHandler = adminRoutes.slice(
  adminRoutes.indexOf("fastify.get('/purchases/summary'"),
  adminRoutes.indexOf("fastify.get('/purchases/:id'"),
);
assert.ok(purchaseSummaryHandler.length > 0, "purchases/summary handler not found");
assert.match(
  purchaseSummaryHandler,
  /deliveredTodayValueMinor:\s*sumMinor\(deliveredToday\)/,
  "purchases/summary must expose a delivered-only day total — the dashboard money tile reads it",
);
assert.match(
  purchaseSummaryHandler,
  /vendorTodayValueMinor:\s*sumMinor\(vendorDeliveredToday\)/,
  "purchases/summary must expose exact vendor purchase value",
);
assert.match(
  purchaseSummaryHandler,
  /customerTodayValueMinor:\s*sumMinor\(customerDeliveredToday\)/,
  "purchases/summary must expose exact customer purchase value",
);
assert.match(
  dashboard,
  /Vendor Purchases Today[\s\S]*Customer Purchases Today/,
  "dashboard must separate vendor and customer purchases",
);
assert.match(
  purchaseSummaryHandler,
  /startOfBusinessDay\(now\)/,
  "purchases/summary must pin the day boundary to the business timezone, not server-local midnight",
);
assert.ok(
  !/select\('id, amount_minor', \{ count: 'exact' \}\)/.test(purchaseSummaryHandler),
  "value totals must be paged with fetchAllRows, not summed over one capped select",
);
assert.match(
  adminRoutes,
  /'GET \/purchases\/summary': 'wallet\.vending\.monitor'/,
  "purchases/summary must stay mapped in the route policy or it 403s as permission_not_mapped",
);

/* ── dashboard entitlement gating ──────────────────────────────────────── */

assert.ok(
  !/Promise\.allSettled/.test(dashboard),
  "dashboard must classify each feed via settle(), not blanket-catch with allSettled",
);
for (const [feed, permission] of [
  ["funding", "wallet.funding.view"],
  ["apps", "wallet.vendors.review"],
  ["vending", "wallet.vending.monitor"],
]) {
  assert.ok(
    dashboard.includes(`settle('${feed}'`),
    `dashboard must gate the ${feed} feed through settle()`,
  );
  assert.ok(
    dashboard.includes(permission),
    `dashboard must reference ${permission} to gate its feed`,
  );
}
assert.match(
  dashboard,
  /error instanceof ApiError && error\.status === 403 \? 'restricted' : 'error'/,
  "a 403 is a policy outcome and must be classified as restricted, never as an outage",
);
assert.ok(
  (dashboard.match(/isRestricted\('/g) || []).length >= 5,
  "every KPI tile backed by a permissioned feed must render a restricted state",
);
assert.match(
  dashboard,
  /bw-kpi-restricted/,
  "restricted tiles need their own muted treatment so they do not read as a figure",
);

/* ── total wallet float tile: no dead-end link ─────────────────────────── */

assert.match(
  dashboard,
  /:is="canSeeFunding \? 'router-link' : 'div'"/,
  "the wallet float tile must only be a link when the role may open /wallets",
);
assert.match(
  dashboard,
  /canSeeFunding \? '\/wallets' : undefined/,
  "total wallet float KPI must link to the wallets flow when entitled",
);
assert.match(
  dashboard,
  /canSeeFunding \? 'Open vendor wallets' : undefined/,
  "the vendor wallet float keeps its accessible name",
);
assert.match(
  dashboard,
  /canSeeFunding \? 'Open customer wallets' : undefined/,
  "the customer wallet float keeps its accessible name",
);

/* ── recent activity: no hidden filter, no dead tab ────────────────────── */

assert.ok(
  !/\{ id: 'disputes'/.test(dashboard),
  "the disputes tab has no row source and must not render a permanent zero",
);
assert.match(
  dashboard,
  /const recentDateFilter = ref\('all'\)/,
  "the recent-activity range must default to all available range instead of today-only or 7-day restriction",
);
assert.match(dashboard, /bw-recent-filters/, "the recent-activity filter controls must be rendered, not just declared");
assert.match(dashboard, /recentRangeLabel/, "the recent-activity card must state which range it is showing");

/* ── business-day arithmetic must not run in the viewer's timezone ─────── */

const businessDay = read("apps/admin/src/lib/business-day.ts");

// Comments legitimately name the banned calls when explaining why they are
// banned, so scan code only.
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const businessDayCode = stripComments(businessDay);
const dashboardCode = stripComments(dashboard);

assert.ok(
  !/setDate\(/.test(dashboardCode),
  "date-range maths must not use setDate on a business-day instant — those setters run in the viewer's local timezone, so any viewer off UTC+01:00 lands a day out and silently drops rows",
);
assert.match(dashboard, /startOfBusinessMonth\(now\)/, "the month range must be computed in the business timezone");
assert.match(dashboard, /businessDaysAgo\(6, now\)/, "the 7-day range must be computed in the business timezone");
assert.match(
  businessDay,
  /export function startOfBusinessMonth/,
  "business-day.ts must own the month boundary rather than leaving it to local-time setters",
);
assert.ok(
  !/setDate\(|setMonth\(/.test(businessDayCode),
  "business-day helpers must build instants from Intl parts plus a fixed offset, never local-time setters",
);

/* ── polling and session hygiene ───────────────────────────────────────── */

assert.match(
  dashboard,
  /visibilitychange/,
  "the 30s poll must pause on a hidden tab — it drives permission-denied audit writes",
);
assert.match(dashboard, /cancelAnimationFrame/, "count-up animations must be cancelled, not left to interleave");
assert.match(
  authStore,
  /permissionsStale/,
  "a non-terminal /me failure must mark cached entitlements stale rather than present them as current",
);
assert.match(
  authStore,
  /station_ids\?: string\[\]/,
  "StaffProfile must declare the station scope the server already returns",
);
assert.match(dashboard, /scopeLabel/, "the dashboard must state whose stations the figures cover");

/* ── audited dashboard trust and responsive contracts ─────────────── */

assert.ok(
  !/class="bw-spark"/.test(dashboard),
  "dashboard KPIs must not show fabricated trend lines without historical data",
);
assert.match(
  dashboard,
  /dashboardFreshness/,
  "dashboard must show when live figures were last checked",
);
assert.match(
  dashboard,
  /:disabled="refreshing" @click="fetchAll"/,
  "dashboard must provide one guarded manual refresh action",
);
assert.match(
  dashboard,
  /bw-kpi-unavailable/,
  "failed feeds must render as unavailable instead of a trustworthy-looking zero",
);
assert.match(
  dashboard,
  /const recentRowsInScope = computed/,
  "recent filter counts must use the selected range and station",
);
assert.match(
  dashboard,
  /const showRecentFilters = ref\(true\)/,
  "recent filters must be visible on first render",
);
assert.match(
  dashboard,
  /\{ id: 'all', label: 'All available' \}/,
  "the range filter must expose every transaction already loaded by the dashboard",
);
assert.match(
  dashboard,
  /showAllRecentTransactions/,
  "the filtered empty state must offer a direct recovery action",
);
assert.match(
  dashboard,
  /\.bw-recent-tab:focus-visible/,
  "transaction filters must retain a visible keyboard focus indicator",
);
assert.match(
  dashboard,
  /role="group" aria-label="Transaction type"/,
  "transaction type controls must use grouped-button semantics",
);
assert.ok(
  !/role="tablist"|role="tab"|aria-selected/.test(dashboard),
  "transaction filters must not claim incomplete tab semantics",
);
assert.match(
  dashboard,
  /aria-label="Recent transactions"/,
  "recent transactions must include the mobile card view",
);

console.log("admin dashboard wallet summary contract passed");
