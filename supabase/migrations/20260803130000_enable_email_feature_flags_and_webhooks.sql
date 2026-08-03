-- Migration: Enable Resend email feature flags, add vendor email verification column, and add OTP cleanup stored procedure

-- 1. Upsert and enable email integration feature flags
INSERT INTO public.feature_flags (key, description, enabled, rollout_percent, regions) VALUES
    ('notifications.email',                    'Send transactional emails via Resend',             true, 100, '{}'),
    ('notifications.email.welcome',            'Customer signup welcome emails via Resend',        true, 100, '{}'),
    ('notifications.email.verification',       'Email verification code messages via Resend',      true, 100, '{}'),
    ('notifications.email.password_recovery',  'Password recovery code emails via Resend',         true, 100, '{}'),
    ('notifications.email.admin_announcement', 'Admin announcement email fan-out via Resend',       true, 100, '{}'),
    ('notifications.email.vendor_onboarding',  'Vendor onboarding invitation emails via Resend',    true, 100, '{}'),
    ('notifications.email.staff_invitation',   'Staff account invitation emails via Resend',        true, 100, '{}'),
    ('notifications.email.role_assignment',    'Role assignment notification emails via Resend',    true, 100, '{}'),
    ('notifications.email.station_assignment', 'Station assignment change emails via Resend',       true, 100, '{}')
ON CONFLICT (key) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    rollout_percent = EXCLUDED.rollout_percent,
    description = EXCLUDED.description;

-- 2. Add email_verified_at column to vendor_users if not existing
ALTER TABLE public.vendor_users
    ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

-- 3. Stored procedure to prune expired OTP records older than 24 hours
CREATE OR REPLACE FUNCTION public.prune_expired_otp_challenges()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_customer_email_otp_count integer := 0;
    deleted_customer_otp_count integer := 0;
BEGIN
    DELETE FROM public.customer_email_otp
    WHERE (consumed_at IS NOT NULL OR expires_at < now() - INTERVAL '24 hours');
    GET DIAGNOSTICS deleted_customer_email_otp_count = ROW_COUNT;

    DELETE FROM public.customer_otp_challenges
    WHERE (consumed_at IS NOT NULL OR expires_at < now() - INTERVAL '24 hours');
    GET DIAGNOSTICS deleted_customer_otp_count = ROW_COUNT;

    RETURN deleted_customer_email_otp_count + deleted_customer_otp_count;
END;
$$;

NOTIFY pgrst, 'reload schema';
