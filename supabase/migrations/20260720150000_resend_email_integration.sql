-- Resend email integration: per-area rollout flags + email OTP challenges
-- for email/password customer verification and password recovery.

-- ── Gradual rollout flags (one per email area, default off) ────────────────────
INSERT INTO feature_flags (key, description, enabled, rollout_percent, regions) VALUES
    ('notifications.email.welcome',            'Customer signup welcome emails via Resend',        false, 0, '{}'),
    ('notifications.email.verification',       'Email verification code messages via Resend',      false, 0, '{}'),
    ('notifications.email.password_recovery',  'Password recovery code emails via Resend',         false, 0, '{}'),
    ('notifications.email.admin_announcement', 'Admin announcement email fan-out via Resend',       false, 0, '{}'),
    ('notifications.email.vendor_onboarding',  'Vendor onboarding invitation emails via Resend',    false, 0, '{}'),
    ('notifications.email.staff_invitation',   'Staff account invitation emails via Resend',        false, 0, '{}'),
    ('notifications.email.role_assignment',    'Role assignment notification emails via Resend',    false, 0, '{}'),
    ('notifications.email.station_assignment', 'Station assignment change emails via Resend',       false, 0, '{}')
ON CONFLICT (key) DO NOTHING;

UPDATE feature_flags
SET description = 'Send transactional emails via Resend'
WHERE key = 'notifications.email';

-- ── Email OTP challenges (verification + password recovery for email/password customers) ──
CREATE TABLE IF NOT EXISTS public.customer_email_otp (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    otp_hash text NOT NULL,
    purpose text NOT NULL CHECK (purpose IN ('verify', 'recovery')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    consumed_at timestamptz,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_email_otp_email_purpose_idx
    ON public.customer_email_otp (lower(email), purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_email_otp_expires_idx
    ON public.customer_email_otp (expires_at);

ALTER TABLE public.customer_email_otp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet service role manages customer email otp"
    ON public.customer_email_otp;

CREATE POLICY "wallet service role manages customer email otp"
    ON public.customer_email_otp
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
