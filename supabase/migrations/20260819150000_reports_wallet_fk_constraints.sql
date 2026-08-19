-- Add foreign key constraints on wallet_ledger_entries and wallet_holds referencing public.wallets(id)
-- so PostgREST schema cache recognizes relationships for resource embedding joins.

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'wallet_ledger_entries_wallet_id_fkey'
      and table_name = 'wallet_ledger_entries'
  ) then
    alter table public.wallet_ledger_entries
      add constraint wallet_ledger_entries_wallet_id_fkey
      foreign key (wallet_id) references public.wallets(id) on delete cascade;
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'wallet_holds_wallet_id_fkey'
      and table_name = 'wallet_holds'
  ) then
    alter table public.wallet_holds
      add constraint wallet_holds_wallet_id_fkey
      foreign key (wallet_id) references public.wallets(id) on delete cascade;
  end if;
end $$;

notify pgrst, 'reload schema';
