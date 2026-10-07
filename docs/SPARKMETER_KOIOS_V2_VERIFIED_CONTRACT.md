# Managed Koios v2 evidence

Verified through an authenticated official portal session on 2026-09-27:
https://www.sparkmeter.cloud/docs/api/

The earlier login failure was an expired CSRF token, not evidence of invalid credentials. A fresh login reached the official documentation. No authentication controls were bypassed.

## Observed contract

- Server prefix: `/api/v2`.
- Authentication: `X-API-KEY` and `X-API-SECRET`.
- `GET /organizations`: organization inventory.
- `GET /organizations/{org_id}/sites`: scoped site inventory.
- `POST /organizations/{org_id}/data/freshness`: read-only query with `filters.sites`; response contains `error` and `freshness`, keyed by site UUID. Entries are null or contain `reading` timestamps.
- `POST /organizations/{org_id}/data/live`: read-only query with `per_page` and `filters.sites`, `filters.age`. Age defaults to 15 minutes, maximum one hour; syntax uses s/m/h suffixes.
- `POST /organizations/{org_id}/data/historical`: read-only query with `per_page`, `filters.sites`, and `filters.date_range.from`/`to` date strings.
- Data endpoints permit three requests per five seconds. Metadata endpoints permit ten per second. Responses expose `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.
- Page size ranges from 1 to 200, default 100. Envelope is `{ data, pagination: { count, has_more, cursor } }`.
- Continuation supplies `per_page` and `cursor`. Filters cannot change mid-pagination. Each issued cursor expires five minutes after creation, not sliding.
- Nova sites require a configured service area. Historical requests exceeding 30 days should be split. Nova limits: 500 inclusive site-days; more than 90 days allows at most one Nova site; at most 4,000 parquet files. ThunderCloud historical queries allow 90 site-days.

## Reading schema

| Field | Official description |
| --- | --- |
| `site_id` | UUID string |
| `meter_id` | Meter serial number, **not** the v1 meter UUID |
| `customer_id` | Nullable string |
| `timestamp` | Date-time; reading `period_end` |
| `energy` | Floating-point total energy, kWh |
| `voltage_avg`, `current_avg`, `power_factor_avg` | Floating-point values |
| `credit_wallet_balance` | Floating-point value; currency/unit not specified in the observed schema |
| `state` | on/off/fault |
| `type` | customer/totalizer |

Do not infer whether `energy` is a lifetime counter or interval total solely from the phrase “Total energy.” Do not normalize the credit balance into minor units without verified currency/unit evidence. Preserve provider evidence and classify unknown semantics explicitly.

## Live read evidence

- Organization query returned HTTP 200 and one ACOB Lighting Technology organization.
- Site query returned HTTP 200 and ten Nova sites. A site named `NOVA 205 TEST` exists; its name alone does not authorize financial testing or prove isolation.
- AJEGUNLE freshness query returned HTTP 200 with a null freshness entry.
- AJEGUNLE live query with `age=1h` returned HTTP 200, zero rows, `has_more=false`, and null cursor.
- These responses prove authenticated telemetry API access, not meter connectivity, relay state, or physical zero-credit cutoff.
- Provider mutations and database writes: zero.
- A subsequent all-site freshness query returned four non-null timestamps among ten sites. Three showed `2026-09-27T18:45:00.000+00:00`; one showed `2026-09-27T17:30:00.000+00:00`.
- A single-record live query for a site with freshness data still returned zero rows. A historical query across the ten sites for 2026-09-27 also returned HTTP 200 with zero rows. No claim about the reason for these empty responses is established.

## Still unverified

Reading correction/version semantics, interval-versus-counter interpretation, credit balance units, guarantees after missing intervals, offline firmware cutoff, and ambiguous financial payment retry/reconciliation remain unverified. V2 read POST operations must not be conflated with financial write POST operations.

## Nonempty historical response correction (2026-10-07)

An authenticated, read-only ACOB request returned 200 historical rows and a continuation cursor for 2026-10-06 through 2026-10-07. The actual wire fields differ from the simplified schema above: `site` contains the site UUID; `meter.serial_number` contains the meter serial; `meter.customer.id` contains the customer UUID; `type` is `reading`; and states include `ElectricalMeterStateOn`, `ElectricalMeterStateOff`, `ElectricalMeterStateTamper`, and `ElectricalMeterStateMeterDisabled`. The first 200 rows matched active installation-scoped inventory by site, serial, and customer in both configured databases: the restore target's sandbox draft and Beverly's production draft. The prior assertion that production inventory was empty came from querying only the restore target.

Only `ElectricalMeterStateOn` and `ElectricalMeterStateOff` map to canonical on/off. Other states quarantine until authoritative semantics are established. `energy` remains semantically unknown. The response includes `kilowatt_hours`, but its relationship to `energy` is unverified. Credit balance does not appear in these rows. No payment or relay mutation occurred.

This nonempty result supersedes the earlier empty-response observation. It does not prove complete backfill, live relay status, or physical cutoff. One all-site single-date query completed in two pages with 260 rows. A seven-day all-site request did not return its first page within the adapter's fifteen-second timeout. Complete traversal remains unmeasured; volume-safe partitioning and recovery are required before activating telemetry synchronization.
