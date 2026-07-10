-- Beverly CRM owns live-write activation.
ALTER TABLE feature_flags
  ADD COLUMN IF NOT EXISTS changed_by TEXT,
  ADD COLUMN IF NOT EXISTS change_reason TEXT;
INSERT INTO feature_flags (
  key,
  description,
  enabled,
  rollout_percent,
  regions,
  changed_by,
  change_reason
) VALUES (
  'crm.live_writes.enabled',
  'Controls Beverly CRM live upstream writes.',
  false,
  0,
  '{}',
  'system',
  'Safe default created by migration'
)
ON CONFLICT (key) DO NOTHING;
