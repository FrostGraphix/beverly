# Beverly Wallet Reporting System

## Report flow

1. Staff opens `/wallet-admin/reports`.
2. Staff chooses a report family.
3. Staff chooses ownership scope.
4. Staff chooses entity grouping.
5. Staff optionally filters SiteID.
6. Staff sets reporting dates.
7. The screen requests report data.
8. KPI cards render totals.
9. Entity rows render separately.
10. Daily CSV remains available.
11. Power BI CSV stays tabular.
12. PDF includes entity performance.

## Template registry

| Family | Primary measure | Report emphasis |
| --- | --- | --- |
| Financial | Revenue | Revenue, VAT, funding, settlement |
| Transactions | Purchases | Vends, failures, success rate |
| Vendors and wallets | Funding | Channels, wallets, inflows |
| Audit | Purchases | Activity, controls, exceptions |
| Disputes | Funding | Cases, refunds, resolutions |
| General | Revenue | Executive operating summary |

## PDF structure

1. Cover and identity.
2. Executive summary.
3. Six KPI cards.
4. Performance bar chart.
5. Revenue line chart.
6. Outcome pie chart.
7. Decision insights.
8. Station breakdown.
9. Channel or activity mix.
10. Daily data appendix.

## Beverly green system

| Token | Value | Purpose |
| --- | --- | --- |
| Ink | `#12231D` | Headings and cover |
| Beverly green | `#146848` | Primary action and chart focus |
| Leaf | `#70AB6B` | Supporting metrics |
| Mist | `#E8F2EB` | Chart and table fields |
| Line | `#CDE0D4` | Borders and rules |
| Muted | `#5C7066` | Supporting copy |

## Data boundaries

- UI requests `/api/v1/admin/reports/overview`.
- Backend applies staff authorization.
- Date range limits aggregation.
- Data stays within browser memory.
- PDF contains current response data.
- CSV streams from the backend.
- Entity groups use database aggregation.
- Vendor groups split SiteIDs.
- Customer groups split SiteIDs.
- Staff scopes restrict SiteIDs.
- Power BI exports raw minors.
- Power BI exports NGN values.

## Entity breakdowns

| Grouping | Entity source | Site behavior |
| --- | --- | --- |
| SiteID | Purchase station | One row each |
| Vendor | Vendor organization | Split per SiteID |
| Customer | Purchase customer | Split per SiteID |

Customer grouping includes channels.

- Direct counts stay separate.
- Vendor-assisted counts stay separate.
- Revenue uses delivered purchases.
- Success uses processed purchases.
- Names use stored identities.
- Missing names retain identifiers.

## Power BI contract

- Endpoint uses authenticated CSV.
- Schema version stays explicit.
- Currency remains NGN.
- Amount scale remains one-hundred.
- Minor values remain exact.
- Naira values remain decimal.
- Dates use ISO formatting.
- Generated timestamps use UTC.

## Extension points

- Add family fields server-side.
- Add report-specific queries.
- Add branded logo assets.
- Persist generation audit events.
- Add scheduled report jobs.
