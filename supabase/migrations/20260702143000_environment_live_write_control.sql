-- Beverly CRM owns live-write activation per deployment environment.
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
) VALUES
  (
    'crm.live_writes.production.enabled',
    'Controls Beverly CRM live upstream writes in production.',
    false,
    0,
    '{}',
    'system',
    'Production starts disabled'
  ),
  (
    'crm.live_writes.preview.enabled',
    'Controls Beverly CRM live upstream writes in preview.',
    true,
    100,
    '{}',
    'admin',
    'Authorized Vercel preview operations'
  ),
  (
    'crm.live_writes.development.enabled',
    'Controls Beverly CRM live upstream writes in development.',
    false,
    0,
    '{}',
    'system',
    'Development starts disabled'
  )
ON CONFLICT (key) DO NOTHING;
UPDATE feature_flags
SET
  enabled = false,
  rollout_percent = 0,
  description = 'Deprecated unscoped Beverly CRM live-write flag.',
  changed_by = 'system',
  change_reason = 'Replaced by environment-scoped controls'
WHERE key = 'crm.live_writes.enabled';
