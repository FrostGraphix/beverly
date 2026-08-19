-- Meter pricing: add property_category to orders + system_settings for admin-editable prices

-- 1. Add property_category to meter_purchase_orders
ALTER TABLE meter_purchase_orders
  ADD COLUMN IF NOT EXISTS property_category TEXT
    CHECK (property_category IN ('residential', 'commercial'))
    DEFAULT 'residential' NOT NULL;

-- 2. system_settings table - generic key-value store for admin-configurable values
CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- 3. Seed default meter prices (in kobo)
--    residential: N30,000 = 3,000,000 kobo
--    commercial:  N150,000 = 15,000,000 kobo
INSERT INTO system_settings (key, value) VALUES
  ('meter_price_residential_minor', '3000000'::jsonb),
  ('meter_price_commercial_minor',  '15000000'::jsonb)
ON CONFLICT (key) DO NOTHING;
