# Beverly by ACOB Production Completion Plan

## Goal

Build a true compatible remake clone of the reference AMR Meter System.

## Current State

- Vue 2 remake exists.
- Reference hash routes exist.
- Local facade exists.
- Vercel config exists.
- Offline demo data exists.
- Live proxy switch exists.
- CRUD modals exist.
- Screenshot diff exists.

## Production Rule

- Reads may proxy live API.
- Writes are production-capable.
- Writes stay disabled until `ALLOW_LIVE_WRITES=true`.
- Tokens must stay in environment variables.
- No bearer token is committed.

## Phase 1: Contract Lock

1. Copy `docs/AMR_API_REFERENCE.md` into this repo.
2. Copy `tmp/reference-crawl-results.json` into this repo.
3. Keep `reference-route-manifest.json` as visible-route truth.
4. Generate `reference-contract.json` from Swagger, crawl, and registry.
5. Record every endpoint:
   - method
   - path
   - casing variants
   - operation type
   - request schema
   - response schema
   - UI route consumer
   - write risk level

Done when:
- All 144 Swagger endpoints are represented.
- All crawled endpoints are represented.
- All sidebar pages map to endpoints.

## Phase 2: Live Proxy Completion

1. Add `LIVE_API_BEARER_TOKEN`.
2. Forward caller bearer token first.
3. Fallback to env bearer token.
4. Preserve query strings.
5. Support `GET`, `POST`, and uploads.
6. Normalize `/API/...` and `/api/...`.
7. Keep live response raw.
8. Add app-normalized response.
9. Log proxy failures.
10. Fallback to local facade only when live fails.

Done when:
- `readMore` works.
- `readHourly` works.
- Prepay reports work.
- Remote task reads work.
- Token records work.

## Phase 3: Response Shapes

1. Capture live payload samples.
2. Store samples under `contracts/samples`.
3. Build normalizers:
   - `code/reason/result`
   - `code/msg/data`
   - paginated records
   - array responses
4. Add table mappers.
5. Add export mappers.
6. Add print mappers.

Done when:
- Every table page renders from live shape.
- No page relies on fake row arrays.

## Phase 4: Visible Pages

1. Dashboard.
2. Credit Token.
3. Clear Tamper Token.
4. Clear Credit Token.
5. Set Maximum Power Limit Token.
6. Credit Token Record.
7. Clear Tamper Token Record.
8. Clear Credit Token Record.
9. Set Maximum Power Limit Token Record.
10. Meter Reading.
11. Meter Control.
12. Meter Token.
13. Meter Reading Task.
14. Meter Control Task.
15. Meter Token Task.
16. Long Nonpurchase Situation.
17. Low Purchase Situation.
18. Consumption Statistics.
19. Interval Data.
20. Gateway.
21. Customer.
22. Tariff.
23. Account.

Done when:
- Search works.
- Reset works.
- Sort works.
- Pagination works.
- Row actions work.
- Modals match reference flow.

## Phase 5: Hidden Modules

1. User.
2. Role.
3. Log.
4. Station.
5. Item.
6. Meter.
7. Debt.
8. DLMS.
9. DLT645.
10. GPRS tasks.
11. GPRS online status.
12. Load profile.
13. Event notification.
14. Firmware update.
15. File upload.

Done when:
- Super Admin can access all modules.
- Role permissions control visibility.
- Hidden endpoint pages are available.

## Phase 6: Writes

1. Add write confirmation.
2. Add authorization password prompts.
3. Send arrays for CRUD writes.
4. Validate before submit.
5. Log request payload.
6. Log response payload.
7. Refresh table after success.
8. Block writes if env denies them.

Done when:
- Create works.
- Update works.
- Delete works.
- Import works.
- Token generation works.
- Task creation works.
- Task updates work.

## Phase 7: Import Export

1. Excel import.
2. CSV import.
3. Row validation.
4. Preview diff.
5. Batch submit.
6. Error report.
7. Excel export.
8. CSV export.
9. Current filters included.

Done when:
- Every management page imports.
- Every table exports exact columns.

## Phase 8: Print Receipts

1. Credit token receipt.
2. Clear credit receipt.
3. Clear tamper receipt.
4. Cancel receipt.
5. Print preview.
6. PDF export.
7. Browser print.

Done when:
- Receipt matches reference layout.
- Record page print works.

## Phase 9: Local Database

Use SQLite now.

Tables:
- users
- roles
- permissions
- audit_logs
- api_cache
- import_jobs
- export_jobs
- print_jobs
- write_confirmations

Done when:
- App runs offline.
- Live reads can be cached.
- Audit logs persist.

## Phase 10: Supabase Later

Keep schema portable.

Rules:
- Use UUID keys.
- Use timestamp columns.
- Avoid SQLite-only SQL.
- Keep migrations clean.

Done when:
- SQLite schema maps cleanly to Postgres.

## Phase 11: Visual Parity

1. Crawl live.
2. Screenshot every route.
3. Screenshot local.
4. Pixel diff each route.
5. Fix top gaps.
6. Fix sidebar gaps.
7. Fix table gaps.
8. Fix modal gaps.
9. Fix mobile gaps.

Targets:
- Key pages below 5%.
- All pages below 10%.

## Phase 12: Vercel Production

1. Set env vars.
2. Build Vue app.
3. Deploy API functions.
4. Test live reads.
5. Test protected writes.
6. Enable production writes.
7. Add domain later.
8. Add SSL via Vercel.

Done when:
- `npm run build` passes.
- Vercel preview works.
- Production smoke passes.
