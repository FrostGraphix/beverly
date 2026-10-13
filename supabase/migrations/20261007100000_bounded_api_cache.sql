-- Keep only reusable, short-lived API responses. The writer serializes all
-- cache admissions so concurrent refresh pages cannot exceed the byte budget.
alter table public.api_cache
  add column if not exists cache_origin text not null default 'legacy';

create or replace function public.put_bounded_api_cache(
  p_method text,
  p_path text,
  p_request_key text,
  p_status_code integer,
  p_response_json jsonb,
  p_source text,
  p_expires_at timestamptz,
  p_origin text default 'request'
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_method is null or length(p_method) > 10
     or p_path is null or length(p_path) > 1024
     or p_request_key is null or length(p_request_key) > 2048
     or p_status_code is null or p_status_code not between 200 and 399
     or p_response_json is null
     or p_expires_at is null or p_expires_at <= v_now
     or pg_column_size(p_response_json) > 65536
     or p_path ~* '^/api/(DailyDataMeter/(read|export\.xlsx)|gateway/read|notifications/gateway-health|customer/read|account/read|RemoteMeterTask/Get(Reading|Control)Task)$'
  then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtext('public.api_cache.budget'));

  delete from public.api_cache
  where expires_at is null or expires_at <= v_now
     or updated_at < v_now - interval '1 hour';

  insert into public.api_cache (
    method, path, request_key, status_code, response_json, source,
    expires_at, cache_origin, updated_at
  ) values (
    upper(p_method), p_path, p_request_key, p_status_code, p_response_json,
    coalesce(nullif(p_source, ''), 'unknown'),
    least(p_expires_at, v_now + interval '1 hour'),
    left(coalesce(nullif(p_origin, ''), 'request'), 100), v_now
  )
  on conflict (method, path, request_key) do update set
    status_code = excluded.status_code,
    response_json = excluded.response_json,
    source = excluded.source,
    expires_at = excluded.expires_at,
    cache_origin = excluded.cache_origin,
    updated_at = excluded.updated_at;

  -- Keep newest entries first. Existing cache rows are included so an older
  -- deployment cannot leave this table above the budget after the next write.
  with sized as (
    select id,
      sum(pg_column_size(response_json)) over (order by updated_at desc, id desc) as cumulative_bytes
    from public.api_cache
  )
  delete from public.api_cache c
  using sized s
  where c.id = s.id and s.cumulative_bytes > 16777216;

  return true;
end;
$$;

revoke all on function public.put_bounded_api_cache(text,text,text,integer,jsonb,text,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.put_bounded_api_cache(text,text,text,integer,jsonb,text,timestamptz,text)
  to service_role;

notify pgrst, 'reload schema';
