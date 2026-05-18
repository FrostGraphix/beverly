-- Phase 7: Compliance + Launch
-- Feature flags, NDPR data requests, account deletion queue

-- ── Feature flags ─────────────────────────────────────────────────────────────
CREATE TABLE feature_flags (
    key             TEXT PRIMARY KEY,
    description     TEXT NOT NULL DEFAULT '',
    enabled         BOOLEAN NOT NULL DEFAULT false,
    rollout_percent INTEGER NOT NULL DEFAULT 0 CHECK (rollout_percent BETWEEN 0 AND 100),
    regions         TEXT[] NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_feature_flags_updated_at
    BEFORE UPDATE ON feature_flags
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON feature_flags USING (auth.role() = 'service_role');

-- Seed default flags
INSERT INTO feature_flags (key, description, enabled, rollout_percent, regions) VALUES
    ('wallet.customer.enabled',    'Customer wallet app visible to end users',           false, 0, '{}'),
    ('wallet.vendor.enabled',      'Vendor portal visible to vendors',                   false, 0, '{}'),
    ('wallet.purchase.enabled',    'Token purchase flow enabled',                        false, 0, '{}'),
    ('wallet.meter_order.enabled', 'Meter purchase order flow enabled',                  false, 0, '{}'),
    ('wallet.disputes.enabled',    'Dispute raise flow enabled for customers+vendors',   false, 0, '{}'),
    ('kyc.paystack_identity',      'Use Paystack Identity for automated KYC',            false, 0, '{}'),
    ('fraud.step_up_auth',         'Require OTP step-up for high-risk purchases',        false, 0, '{}'),
    ('notifications.email',        'Send transactional emails via Postmark',             false, 0, '{}'),
    ('notifications.sms',          'Send SMS notifications via Twilio',                  false, 0, '{}');

-- ── NDPR data export requests ─────────────────────────────────────────────────
CREATE TYPE data_export_status AS ENUM ('pending', 'processing', 'ready', 'delivered', 'failed');

CREATE TABLE data_export_requests (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id      UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    status           data_export_status NOT NULL DEFAULT 'pending',
    requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at     TIMESTAMPTZ,
    download_url     TEXT,
    expires_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_data_export_requests_customer ON data_export_requests(customer_id);
CREATE INDEX idx_data_export_requests_status   ON data_export_requests(status);

ALTER TABLE data_export_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON data_export_requests USING (auth.role() = 'service_role');

-- ── Account deletion requests ─────────────────────────────────────────────────
CREATE TYPE deletion_status AS ENUM ('pending', 'approved', 'rejected', 'completed', 'cancelled');

CREATE TABLE account_deletion_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    status          deletion_status NOT NULL DEFAULT 'pending',
    reason          TEXT,
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    scheduled_for   TIMESTAMPTZ,           -- 30-day cooling-off
    reviewed_by     UUID,                  -- staff user id
    reviewed_at     TIMESTAMPTZ,
    review_note     TEXT,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_account_deletion_updated_at
    BEFORE UPDATE ON account_deletion_requests
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_account_deletion_customer ON account_deletion_requests(customer_id);
CREATE INDEX idx_account_deletion_status   ON account_deletion_requests(status);

ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON account_deletion_requests USING (auth.role() = 'service_role');
