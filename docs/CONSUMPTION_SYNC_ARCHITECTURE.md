# Consumption Sync Architecture

Beverly now separates daily meter persistence into a smart sync service and thin cron endpoints.

## Flow

1. Vercel calls `/api/cron/consumption-sync`.
2. `api/reference.js` checks `CRON_SECRET`.
3. `consumption-sync-service.js` asks Supabase for each station's latest stored reading.
4. Incremental mode pulls `/api/DailyDataMeter/read` from that latest date through today.
5. Backfill mode pulls from `CONSUMPTION_BACKFILL_FROM` through today.
6. Pages are written through `writeDailyMeterRows`.
7. Supabase upserts by `station_id`, `meter_id`, and `reading_date`.

## Modes

`incremental` is the normal background path.

`backfill` is the historical repair path.

## Endpoints

`GET /api/cron/consumption-sync`

Runs incremental sync.

`GET /api/cron/consumption-backfill`

Runs full historical sync.

Both accept query parameters:

- `stations=TUNGA,UMAISHA`
- `from=2025-01-01`
- `to=2026-05-20`
- `pageSize=500`
- `maxPages=2`

## Environment

- `LIVE_API_BASE_URL`
- `LIVE_API_BEARER_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_CONSUMPTION_STORE_ENABLED=true`
- `CONSUMPTION_SYNC_STATIONS`
- `CONSUMPTION_SYNC_PAGE_SIZE`
- `CONSUMPTION_SYNC_INCREMENTAL_MAX_PAGES`
- `CONSUMPTION_SYNC_BACKFILL_MAX_PAGES`
- `CONSUMPTION_BACKFILL_FROM`

## Guardrails

The sync is idempotent.

Rows are upserted.

Incremental mode avoids old pages.

Backfill can be bounded.

Failures are per-station.

One failed station continues.
