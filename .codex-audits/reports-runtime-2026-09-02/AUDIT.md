# Beverly report lineage audit

Date: 2 September 2026

## Verdict

The audited report lineage is healthy. The generated 90-day transaction report matches independent database totals exactly. Required reporting and announcement migrations are deployed. Dashboard and purchase KPI mappings work against live data. Production builds and backend tests pass.

## Audited flow

1. Report selection — Healthy
   - Transaction report selected.
   - Combined audience selected.
   - Vendor grouping selected.
   - All sites and vendors selected.

2. Scope mapping — Healthy
   - Period: 5 June through 2 September 2026.
   - Status scope: all transactions.
   - The generated review screen retained every selected scope.

3. Report generation — Healthy
   - Transactions: 736.
   - Delivered: 488.
   - Failed: 121.
   - Delivered revenue: ₦910,206.00.
   - Energy: 2,419.1454 kWh.

4. Database reconciliation — Healthy
   - Raw purchase rows: 736.
   - Distinct purchase identifiers: 736.
   - Daily roll-up total: 736.
   - Null statuses: 0.
   - Null amounts: 0.
   - Missing stations: 0.
   - Missing actors: 0.

5. Vendor breakdown — Healthy
   - Raw vendor purchases: 734.
   - Reported vendor purchases: 734.
   - Raw delivered vendor purchases: 487.
   - Reported delivered vendor purchases: 487.
   - Raw failed vendor purchases: 120.
   - Reported failed vendor purchases: 120.
   - Raw vendor revenue: ₦909,706.00.
   - Reported vendor revenue: ₦909,706.00.
   - Orphan vendor rows: 0.

6. Status filters — Healthy
   - Successful filter returned 487 purchases.
   - Every returned purchase was delivered.
   - Failed filter returned 120 purchases.
   - Every returned purchase was failed.

7. Dashboard mapping — Healthy
   - All Vends replaces applications.
   - Successful and failed counts appear inside.
   - Vendor names and businesses appear first.
   - Vendor applications are removed.

8. Purchase KPI filtering — Healthy
   - All-time purchases showed 743.
   - Applying Failed changed totals to 121.
   - Filtered amount changed to ₦224,219.00.
   - Filtered rows were failed purchases.

9. Announcement schema — Healthy
   - All ten required delivery columns exist.
   - Announcement history loads successfully.
   - The prior delivery_status error is absent.
   - No live broadcast was sent.

10. Export actions — Healthy
    - Daily CSV action completed without page errors.
    - Power BI CSV action completed without page errors.
    - PDF action completed without page errors.
    - Browser-managed downloads did not expose completion events.

## Deployed migrations

- 20260901120000_wallet_report_entity_breakdowns.sql
- 20260901143000_purchase_operator_receipt_identity.sql
- 20260901144500_vendor_application_review_flow.sql
- 20260902113000_announcement_email_delivery.sql

## Verification

- Workspace production build passed.
- Backend build passed.
- Admin build passed.
- Vendor build passed.
- Customer build passed.
- Landing build passed.
- Backend tests: 349 passed.
- Backend test files: 40 passed.
- Node 22 remains the declared engine.
- Node 24 produced warnings only.

## Evidence

- `02-transaction-report-top.png`
- `03-announcements-schema-healthy.png`
- `04-dashboard-vending-summary.png`
- `05-purchases-filtered-kpis.png`
- `reconciliation.json`
- `reconcile.cjs`

## Residual checks

No known data-lineage defect remains. Screen-reader verification remains a manual release check. Download persistence remains browser-managed and was not observable through the automation event channel.
