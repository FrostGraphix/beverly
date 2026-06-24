# Beverly Wallet Reporting System

## Report flow

1. Staff opens `/wallet-admin/reports`.
2. Staff chooses a report family.
3. Staff sets a report period.
4. The screen requests report overview data.
5. KPI cards render current values.
6. Trend data renders charts.
7. The assigned template shapes output.
8. Generate PDF compiles pages.
9. Browser downloads the PDF.
10. CSV remains available.

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

## Extension points

- Add family fields server-side.
- Add report-specific queries.
- Add branded logo assets.
- Persist generation audit events.
- Add scheduled report jobs.
