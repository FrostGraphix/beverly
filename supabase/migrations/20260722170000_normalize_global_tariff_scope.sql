-- Upstream tariff stationId identifies the administrative owner. Only a
-- canonical physical station is a valid station-specific tariff scope.
insert into public.tariff_rate_history (
  station_scope, tariff_id, tariff_name, raw_price, unit_price_ngn, tax_pct,
  effective_price_ngn, is_valid, effective_from, source_updated_at, observed_at, source
)
select '*', tariff_id, tariff_name, raw_price, unit_price_ngn, tax_pct,
  effective_price_ngn, is_valid, effective_from, source_updated_at, observed_at, source
from public.tariff_rate_history
where upper(station_scope) <> all(array['TUNGA','UMAISHA','OGUFA','KYAKALE','MUSHA'])
on conflict (station_scope, tariff_id, effective_from) do update set
  tariff_name = excluded.tariff_name,
  raw_price = excluded.raw_price,
  unit_price_ngn = excluded.unit_price_ngn,
  tax_pct = excluded.tax_pct,
  effective_price_ngn = excluded.effective_price_ngn,
  is_valid = excluded.is_valid,
  source_updated_at = excluded.source_updated_at,
  observed_at = excluded.observed_at,
  source = excluded.source;

delete from public.tariff_rate_history
where station_scope <> '*'
  and upper(station_scope) <> all(array['TUNGA','UMAISHA','OGUFA','KYAKALE','MUSHA']);
