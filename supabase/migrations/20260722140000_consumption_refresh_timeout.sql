-- The complete station rebuild performs dated tariff lookups for every reading.
-- Production's largest station exceeds the legacy two-minute ceiling.
alter function public.refresh_meter_reading_aggregates_for_station(text)
  set statement_timeout = '600s';
