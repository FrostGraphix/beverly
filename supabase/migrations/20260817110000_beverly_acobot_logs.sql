-- Migration: 20260817110000_beverly_acobot_logs.sql
-- Description: Create acobot_logs table for Beverly AI prompt audit, RBAC enforcement, and rate-limiting diagnostics.

CREATE TABLE IF NOT EXISTS public.acobot_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('staff', 'vendor_user', 'customer')),
    user_role TEXT NOT NULL,
    portal TEXT NOT NULL CHECK (portal IN ('admin', 'customer', 'vendor')),
    user_prompt TEXT NOT NULL,
    detected_intents TEXT[] NOT NULL DEFAULT '{}',
    permission_status TEXT NOT NULL CHECK (permission_status IN ('granted', 'denied', 'partial')),
    denied_intents TEXT[] NOT NULL DEFAULT '{}',
    bot_response TEXT,
    prompt_tokens INT DEFAULT 0,
    completion_tokens INT DEFAULT 0,
    model_name TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast audit filtering and rate limiting checks
CREATE INDEX IF NOT EXISTS acobot_logs_user_idx ON public.acobot_logs (auth_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS acobot_logs_status_idx ON public.acobot_logs (permission_status, created_at DESC);
CREATE INDEX IF NOT EXISTS acobot_logs_portal_idx ON public.acobot_logs (portal, created_at DESC);

-- Enable Row-Level Security
ALTER TABLE public.acobot_logs ENABLE ROW LEVEL SECURITY;

-- Service Role Full Access
DROP POLICY IF EXISTS "acobot_logs_service_role_all" ON public.acobot_logs;
CREATE POLICY "acobot_logs_service_role_all" ON public.acobot_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Staff Audit View Policy
DROP POLICY IF EXISTS "acobot_logs_staff_read" ON public.acobot_logs;
CREATE POLICY "acobot_logs_staff_read" ON public.acobot_logs
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.roles r
        JOIN public.permissions p ON p.role_key = r.role_key
        WHERE p.route_hash = 'wallet.audit.view'
    ));
