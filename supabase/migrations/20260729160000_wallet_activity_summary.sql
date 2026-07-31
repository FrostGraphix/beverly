create or replace function public.fn_wallet_activity_summary(
  p_wallet_id uuid,
  p_day_start timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'today_vended_minor', coalesce(sum(amount_minor) filter (
      where entry_type = 'purchase_debit' and created_at >= p_day_start
    ), 0),
    'today_vended_count', count(*) filter (
      where entry_type = 'purchase_debit' and created_at >= p_day_start
    ),
    'today_funded_minor', coalesce(sum(amount_minor) filter (
      where entry_type = 'funding_credit' and created_at >= p_day_start
    ), 0),
    'total_funded_minor', coalesce(sum(amount_minor) filter (
      where entry_type = 'funding_credit'
    ), 0),
    'total_reversed_minor', coalesce(sum(amount_minor) filter (
      where entry_type in ('reversal_credit', 'reversal_debit')
    ), 0)
  )
  from public.wallet_ledger_entries
  where wallet_id = p_wallet_id;
$$;

revoke all on function public.fn_wallet_activity_summary(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.fn_wallet_activity_summary(uuid, timestamptz) to service_role;

notify pgrst, 'reload schema';
