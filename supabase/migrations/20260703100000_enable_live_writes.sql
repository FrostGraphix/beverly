insert into public.feature_flags (
  key,
  description,
  enabled,
  rollout_percent,
  regions,
  changed_by,
  change_reason
) values
  (
    'crm.live_writes.production.enabled',
    'Controls Beverly CRM live upstream writes in production.',
    true,
    100,
    '{}',
    'system',
    'Approved live-write activation on 2026-07-03'
  ),
  (
    'crm.live_writes.preview.enabled',
    'Controls Beverly CRM live upstream writes in preview.',
    true,
    100,
    '{}',
    'system',
    'Approved live-write activation on 2026-07-03'
  ),
  (
    'crm.live_writes.development.enabled',
    'Controls Beverly CRM live upstream writes in development.',
    true,
    100,
    '{}',
    'system',
    'Approved live-write activation on 2026-07-03'
  )
on conflict (key) do update
set
  enabled = excluded.enabled,
  rollout_percent = excluded.rollout_percent,
  changed_by = excluded.changed_by,
  change_reason = excluded.change_reason,
  updated_at = now();
