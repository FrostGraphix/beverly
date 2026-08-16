-- Capture the OEM fault/electrical signal fields that abnormal-alarm-service.js
-- already knows how to interpret (ALARM_SIGNALS, normalizeIntervalRow), but that
-- ingestion has never persisted -- they only ever lived in row_json, which is now
-- unconditionally discarded at write time (20260804170000). /api/local/abnormal-alarms
-- has been silently returning zero alarms for any station backed by our own store
-- because readDailyMeterRows() never selected these fields.
--
-- All nullable: absence means "not reported this cycle", matching the OEM's own
-- sparse field presence (confirmed live -- not every reading includes every field).
-- Deliberately excludes `updateDate` (redundant with our own captured_at/created_at).
alter table public.daily_meter_readings
  add column if not exists gateway_id text,
  add column if not exists usage1 numeric,
  add column if not exists interval_demand numeric,
  add column if not exists power numeric,
  add column if not exists voltage_a numeric,
  add column if not exists voltage_b numeric,
  add column if not exists voltage_c numeric,
  add column if not exists current_a numeric,
  add column if not exists current_b numeric,
  add column if not exists current_c numeric,
  add column if not exists source2_activated boolean,
  add column if not exists relay_open boolean,
  add column if not exists battery_low boolean,
  add column if not exists magnetic_interference boolean,
  add column if not exists terminal_cover_open boolean,
  add column if not exists cover_open boolean,
  add column if not exists current_reverse boolean,
  add column if not exists current_unbalance boolean;
