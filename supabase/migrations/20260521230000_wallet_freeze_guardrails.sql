-- Freeze and suspension guardrails.
-- Service code checks these states first. These database checks close the gap
-- for direct SQL, retries, and older deployed workers.

create or replace function public.fn_wallet_hold_guard()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.wallets
  where id = new.wallet_id;

  if v_status is null then
    raise exception 'wallet not found';
  end if;

  if v_status <> 'active' then
    raise exception 'wallet not active';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_wallet_hold_guard on public.wallet_holds;
create trigger trg_wallet_hold_guard
before insert on public.wallet_holds
for each row
execute function public.fn_wallet_hold_guard();

create or replace function public.fn_wallet_closed_final_guard()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'closed' and new.status <> 'closed' then
    raise exception 'closed wallets cannot be reactivated';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wallet_closed_final_guard on public.wallets;
create trigger trg_wallet_closed_final_guard
before update of status on public.wallets
for each row
execute function public.fn_wallet_closed_final_guard();
