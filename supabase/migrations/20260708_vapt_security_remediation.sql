-- ============================================================
-- Beverly ERP — VAPT Security Remediation (Supabase SQL)
-- Findings: E1, E2, E3, E4  |  Project: itqegqxeqkeogwrvlzlj
-- Apply via: Supabase Dashboard > SQL Editor, or supabase db push
-- ============================================================

-- RLS Audit: run this first to find any other unprotected tables.
-- After this migration, no rows should be returned.
-- SELECT schemaname, tablename FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename NOT IN (SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public');


-- ============================================================
-- E1: mark_notifications_read — IDOR Fix
-- ============================================================
DROP FUNCTION IF EXISTS public.mark_notifications_read(UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_notification_ids UUID[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE notifications
  SET read_at = NOW(), is_read = TRUE
  WHERE id = ANY(p_notification_ids) AND user_id = v_user_id AND read_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notifications_read(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_notifications_read(UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(UUID[]) TO authenticated;


-- ============================================================
-- E2: next_employee_number — Sequence Drain Fix
-- ============================================================
CREATE OR REPLACE FUNCTION public.next_employee_number()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT;
  v_next BIGINT;
BEGIN
  v_role := (SELECT raw_user_meta_data->>'role_id' FROM auth.users WHERE id = auth.uid());
  IF auth.uid() IS NULL OR v_role NOT IN ('super-admin','hr-admin','hr-officer') THEN
    RAISE EXCEPTION 'Insufficient privileges' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT nextval('employee_number_seq') INTO v_next;
  RETURN 'EMP-' || LPAD(v_next::TEXT, 7, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_employee_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_employee_number() FROM anon;
GRANT EXECUTE ON FUNCTION public.next_employee_number() TO authenticated;


-- ============================================================
-- E3: cbt_questions — Anonymous Read + Answer Exposure Fix
-- ============================================================
ALTER TABLE public.cbt_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_questions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON public.cbt_questions;
DROP POLICY IF EXISTS anon_read ON public.cbt_questions;

-- Only HR reviewers and admins can read the full row (with answers).
CREATE POLICY cbt_reviewer_select ON public.cbt_questions
  FOR SELECT TO authenticated
  USING ((SELECT raw_user_meta_data->>'role_id' FROM auth.users WHERE id = auth.uid())
    IN ('super-admin','hr-admin','reviewer'));

-- Examinee view: correct_option and explanation stripped.
CREATE OR REPLACE VIEW public.cbt_questions_examinee AS
SELECT id, question_text, option_a, option_b, option_c, option_d,
       category, difficulty, created_at
FROM public.cbt_questions;

REVOKE ALL ON public.cbt_questions_examinee FROM PUBLIC;
REVOKE ALL ON public.cbt_questions_examinee FROM anon;
GRANT SELECT ON public.cbt_questions_examinee TO authenticated;


-- ============================================================
-- E4: crm_* Tables — Missing RLS Fix
-- ============================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_pipelines','crm_activities','crm_contacts','crm_tags']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS allow_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS anon_read ON public.%I', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t || '_auth_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
      t || '_auth_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (true)',
      t || '_auth_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (true)',
      t || '_auth_delete', t);
  END LOOP;
END;
$$;


-- ============================================================
-- Acceptance Tests
-- ============================================================
-- E1: POST /rest/v1/rpc/mark_notifications_read (anon) -> 401/403
-- E2: POST /rest/v1/rpc/next_employee_number (anon)    -> 403
-- E3: GET  /rest/v1/cbt_questions?select=* (anon)      -> []
-- E4: GET  /rest/v1/crm_pipelines?select=* (anon)      -> []
-- E4: GET  /rest/v1/crm_activities?select=* (anon)     -> []
-- E4: GET  /rest/v1/crm_contacts?select=* (anon)       -> []
-- E4: GET  /rest/v1/crm_tags?select=* (anon)           -> []
