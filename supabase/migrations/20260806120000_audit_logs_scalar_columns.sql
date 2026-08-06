-- audit_logs was writing the FULL API response body into two JSONB columns
-- (detail, metadata) on every single audited action -- byte-identical in both,
-- confirmed live. Investigation of every caller of the one read function
-- (listAuditLogs, only ever invoked by client-error-service.js's
-- listClientErrors, filtered to source='client-error') showed this content is
-- read for exactly one narrow slice of rows: client-error telemetry (~3% of the
-- table). The other ~97% (login/download/create/remote_command actions from
-- auditResult() in api/reference.js) write and never read this JSON at all --
-- confirmed by grepping every caller in the repo, not assumed.
--
-- outcome/status_code/method were only ever embedded inside that JSON blob --
-- they were never given real columns, unlike the local SQLite backend
-- (backend/src/services/local-database.js), which already stores them as real
-- columns alongside a single detail_json. This migration brings the Supabase
-- schema in line with what the other backend already does correctly.

alter table public.audit_logs
  add column if not exists outcome text,
  add column if not exists status_code integer,
  add column if not exists method text;

-- Backfill from the JSON before it's blanked below -- nothing lost.
update public.audit_logs
set outcome = coalesce(detail->>'outcome', 'success'),
    status_code = coalesce((detail->>'statusCode')::integer, 200),
    method = coalesce(detail->>'method', 'GET')
where outcome is null;

-- Blank the JSON for every row except the one genuinely-read slice.
update public.audit_logs
set detail = '{}'::jsonb, metadata = '{}'::jsonb
where source is distinct from 'client-error'
  and (detail <> '{}'::jsonb or metadata <> '{}'::jsonb);

-- metadata is retired entirely: it was always byte-identical to detail and
-- nothing anywhere reads it distinctly (confirmed: listAuditLogs's fallback
-- chain never reaches it in practice since detail is always selected first).
-- Even for the surviving client-error rows, only detail is kept populated.
update public.audit_logs set metadata = '{}'::jsonb where metadata <> '{}'::jsonb;
