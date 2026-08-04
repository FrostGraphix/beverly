-- The row_json column on daily_meter_readings is retired for good. Nothing has
-- read it since the read-path change in consumption-store.js (see
-- 20260804170000's commit history); nothing has written real content to it since
-- that same migration's discard_row_json trigger started forcing it to '{}' on
-- every write; and the deployed ingestion code (PR #71) no longer even builds the
-- payload it used to send. Dropping the column recovers its per-row width on the
-- next table rewrite, and retires the now-redundant trigger/function with it.
alter table public.daily_meter_readings drop column if exists row_json;
drop trigger if exists discard_row_json on public.daily_meter_readings;
drop function if exists public.discard_daily_meter_reading_payload();
