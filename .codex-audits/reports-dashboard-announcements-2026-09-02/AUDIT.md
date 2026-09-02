# Reports, Dashboard, Purchases, And Announcements Audit

Date: 2 September 2026.

## Outcome

Report metrics now use complete paged datasets.
Report filters now reach every relevant query family.
Purchase KPIs now share table filters.
Dashboard vending totals are all-time.
Recent activity shows vendor identities.
Announcement sends tolerate delayed schema refreshes.
Mobile table headers now wrap consistently.

## Report Accuracy

- Purchase series use filtered purchase orders.
- Revenue includes delivered purchases only.
- Units include delivered purchases only.
- Transaction counts preserve daily counts.
- Funding totals use approved funding requests.
- Refund totals use approved refund amounts.
- Settlement totals use settled batches.
- Settlement fees use stored fees.
- Dispute outcomes use dispute statuses.
- Reconciliation mismatches use exact runs.
- Ownership filters reach database queries.
- Status filters reach breakdown queries.
- Report reads paginate beyond 50,000 rows.
- CSV exports include scope metadata.
- PDF reports use report-family sections.

## Dashboard Accuracy

- Applications KPI became All Vends.
- All Vends shows successful counts.
- All Vends shows failed counts.
- Vendor applications were removed.
- Recent rows show vendor names.
- Recent rows show business names.
- Recent exports include both identities.

## Purchase Accuracy

- First KPI shows purchase count.
- Second KPI shows total amount.
- Failed KPI shows count and value.
- Refunded KPI shows count and value.
- Every active filter reaches summaries.
- Summary paging prevents row truncation.
- Staff station scope remains enforced.

## Announcement Reliability

- Current migrations add delivery columns.
- Fresh installs receive full columns.
- Delayed schema caches receive fallbacks.
- Legacy history receives safe defaults.
- Legacy sends still reach recipients.
- Deferred tracking is disclosed explicitly.
- Resend failures remain actionable.

## Responsive Headers

- Table actions wrap on mobile.
- Controls retain touch target sizing.
- Vending controls use one grid.
- Export, filter, and view align.
- Narrow screens avoid toolbar overflow.

## Verification

- Full workspace build passed.
- Backend build passed.
- Admin build passed.
- Forty backend files passed.
- Three hundred forty-nine tests passed.
- Ten focused contracts passed.
- Report live-window test passed.
- Report accuracy tests passed.
- Announcement contract passed.
- Dashboard KPI contract passed.
- Diff whitespace check passed.

## Evidence Sources

- Purchase orders table queries.
- Funding request table queries.
- Refund request table queries.
- Settlement batch table queries.
- Dispute table queries.
- Reconciliation run table queries.
- Admin report route mappings.
- Admin interface bindings.
- Migration definitions.
- Automated contract outputs.

## Verification Boundary

The admin browser session expired.
Authenticated final screens stayed unavailable.
The login redirect was verified.
Runtime logic received automated verification.
Migration deployment was not attempted.
