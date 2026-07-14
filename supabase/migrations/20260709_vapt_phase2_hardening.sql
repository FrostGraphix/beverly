-- ============================================================
-- Beverly — VAPT Phase 2 Hardening
-- Beverly project: qpoipyqgrjsjdvfqmxok
-- Scope: Beverly notifications RLS gap only.
--        crm_*, cbt_questions, employee_number are ERP — NOT Beverly.
--        This file intentionally contains NO ERP fixes.
-- Apply via: Supabase Dashboard > SQL Editor
-- ============================================================

-- ── Confirm notifications RLS is active (idempotent) ─────────────────────────
-- Belt-and-suspenders: ensures the table is still RLS-protected after the
-- Phase 1 migration. Safe to re-run — all statements are idempotent.

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;
-- Ensure no residual open-access policies exist.
DROP POLICY IF EXISTS allow_all ON public.notifications;
DROP POLICY IF EXISTS anon_read ON public.notifications;
-- ── Audit: find any Beverly tables still missing RLS ─────────────────────────
-- Run this after applying. Should return only tables you knowingly left open.
-- SELECT tablename
-- FROM   pg_tables
-- WHERE  schemaname = 'public'
--   AND  NOT rowsecurity
-- ORDER  BY tablename;

-- Reload PostgREST schema cache.
NOTIFY pgrst, 'reload schema';
-- ── Acceptance Test ───────────────────────────────────────────────────────────
-- GET /rest/v1/notifications?select=* with anon key → []
-- POST /rest/v1/rpc/mark_notifications_read (anon) → 401/403;
