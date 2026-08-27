# Station Consumption KPI audit

Date: 2026-08-26

## Scope

Station Consumption KPI cards for 2026-07-27 through 2026-08-25, Daily, All stations. Traced from `StationConsumptionPage.vue` through the authenticated API route, `consumption-store.js`, aggregate tables/RPCs, and Supabase refresh migrations.

## Visible-value reconciliation

- Delta Consumption: 9,353.80 kWh.
- Avg / Customer: 9,353.80 / 2,670 = 3.5033, displayed 3.50 kWh.
- Avg / Meter: 9,353.80 / 2,675 = 3.4967, displayed 3.50 kWh.
- Avg / Station: 9,353.80 / 6 = 1,558.9667, displayed 1,558.97 kWh.
- Avg Daily Load: 9,353.80 / 17 positive-load labels = 550.2235, displayed 550.22 kWh.
- Growth: -53.9% implies a prior-window total of approximately 20,290.24 kWh. The formula is correct when both windows use comparable rows.
- Meter rollup coverage: 2,257 latest reads / 2,675 period meters = 84.4%; 418 period meters are not represented by the displayed odometer rollup count.

## Findings

1. **Critical — all-station Supabase analytics are hardcoded to five stations.** The RPC and rollup selection restrict rows to TUNGA, UMAISHA, OGUFA, KYAKALE, and MUSHA, while the rendered KPI reports six stations. A deployed RPC can silently omit any sixth or newly commissioned station.
2. **Critical — scheduled aggregate refresh is also hardcoded to five stations.** New stations can remain absent or stale until a manual dynamic refresh occurs.
3. **High — Meter Read Total is not as-of the selected end date on aggregate/RPC paths.** It sums each meter's latest all-history odometer rollup. Raw fallback instead finds the latest reading at or before the selected `to` date, so the same filter can return different semantics depending on backend path.
4. **High — Meter Read Total is incomplete in the visible state.** Only 84.4% as many latest-rollup meters as period meters are represented. The UI shows a precise total without freshness, coverage, or an incomplete-data warning.
5. **High — Avg Daily Load is not reliably daily.** The backend divides consumption by positive temporal labels. Zero-load/reporting days are excluded; Weekly and Monthly views divide by week/month label counts while retaining the `Avg Daily Load` label. For the visible 30-day range, calendar-day average would be 311.79 kWh, versus the displayed positive-period average of 550.22 kWh.
6. **High — assigned-station authorization does not fail closed for All stations.** A scoped actor with an empty station payload passes `actorCanAccessStation`; the station-analytics handler then resolves all live stations. This can change KPI scope and expose cross-station operational totals.
7. **Medium — monthly/yearly prior-period growth can use non-comparable aggregate windows.** Current-range bucket alignment is checked, but the immediately preceding equal-day window is not checked before querying whole month/year aggregate rows. Short months and leap years can produce missing or mismatched prior totals.
8. **Medium — KPI definition tests are incomplete.** Existing tests cover response shape, valuation, and partial-range aggregate selection, but do not assert KPI denominators, rollup as-of behavior, station expansion, or scoped All-stations authorization.
9. **Medium — the Station Consumption chart contract is currently red.** The implementation uses different station-share sizing/capping and retains table classes that the contract forbids. This is adjacent to, but not the cause of, the KPI arithmetic issues.
10. **Accessibility/UX — mobile KPI labels are 9.5 px and values drop to 14 px.** The supplied mobile evidence also shows the fixed Beverly AI control covering part of the Top Station card. Contrast and keyboard/focus behavior require an authenticated live rerun.

## Confirmed strengths

- Delta consumption is computed per station+meter and clamps negative/reset deltas to zero.
- Partial custom ranges fall back to daily aggregate rows instead of over-counting whole month/week buckets.
- Customer, meter, active-meter, and station counts use distinct server-side identities.
- Tariff money values fail closed when historical tariff coverage is incomplete.
- Cards, tables, and charts consume one server response, reducing frontend calculation drift.

## Verification limits

The current in-app browser session had expired to the login screen. The authenticated endpoint returned 401 without that session, so the underlying 9,353.80 kWh and 145,021.05 kWh source rows could not be independently re-queried during this audit. The screenshot supplied with the request was used to reconcile visible arithmetic; implementation and migration paths were inspected directly. No code was changed.
