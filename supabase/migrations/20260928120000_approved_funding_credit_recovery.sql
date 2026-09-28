-- A Paystack funding request uses payment_credit. Bank approvals use funding_credit.
-- Guard both paths before scheduling recovery, because legacy requests may have both.
create or replace function public.fn_guard_funding_credit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.reference_type = 'funding_request'
     and new.direction = 'credit'
     and new.entry_type in ('funding_credit', 'payment_credit') then
    if nullif(btrim(new.reference_id), '') is null then
      raise exception 'funding credit reference required';
    end if;

    -- Serialize inserts even when callers chose different wallets or keys.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.reference_id, 0)
    );
    if exists (
      select 1 from public.wallet_ledger_entries existing
      where existing.reference_type = 'funding_request'
        and existing.reference_id = new.reference_id
        and existing.direction = 'credit'
        and existing.entry_type in ('funding_credit', 'payment_credit')
    ) then
      raise exception 'funding request already credited';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_funding_credit on public.wallet_ledger_entries;
create trigger guard_funding_credit
before insert on public.wallet_ledger_entries
for each row execute function public.fn_guard_funding_credit();

-- Only bank and manual approvals can be recovered from local approval evidence.
-- Paystack payment recovery must verify the gateway independently.
create or replace function public.fn_reconcile_approved_funding_credits(
  p_limit integer default 250
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_funding public.funding_requests%rowtype;
  v_wallet public.wallets%rowtype;
  v_entry public.wallet_ledger_entries%rowtype;
  v_owner_id uuid;
  v_issue record;
  v_checked integer := 0;
  v_repaired integer := 0;
  v_missing integer := 0;
  v_stale integer := 0;
  v_blocked integer := 0;
  v_duplicates integer := 0;
  v_gateway_missing integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 250 then
    raise exception 'invalid funding recovery limit';
  end if;

  for v_funding in
    select * from public.funding_requests
    where status = 'approved'
      and channel in ('bank_transfer', 'manual')
      and coalesce(approved_at, updated_at, created_at) < now() - interval '5 minutes'
      and not exists (
        select 1 from public.wallet_ledger_entries existing
        where existing.reference_type = 'funding_request'
          and existing.reference_id = funding_requests.id::text
          and existing.direction = 'credit'
          and existing.entry_type in ('funding_credit', 'payment_credit')
      )
    order by approved_at desc
    limit p_limit
    for update skip locked
  loop
    v_checked := v_checked + 1;
    v_owner_id := case
      when v_funding.owner_type = 'customer' then v_funding.customer_id
      else v_funding.vendor_organization_id
    end;

    select * into v_wallet from public.wallets
    where owner_type = v_funding.owner_type and owner_id = v_owner_id
    for update;
    if not found or v_wallet.status <> 'active' then
      v_blocked := v_blocked + 1;
      continue;
    end if;

    select * into v_entry from public.wallet_ledger_entries
    where reference_type = 'funding_request'
      and reference_id = v_funding.id::text
      and direction = 'credit'
      and entry_type in ('funding_credit', 'payment_credit')
    order by created_at asc
    limit 1;

    if found then
      if v_entry.wallet_id <> v_wallet.id
         or v_funding.wallet_id <> v_wallet.id
         or v_entry.amount_minor <> v_funding.amount_minor then
        v_stale := v_stale + 1;
      end if;
      continue;
    end if;

    v_missing := v_missing + 1;
    v_entry := public.fn_post_ledger_entry(
      v_wallet.id,
      'credit',
      v_funding.amount_minor,
      'funding_credit',
      'funding_request',
      v_funding.id::text,
      'funding.' || v_funding.id::text || '.credit',
      'Approved funding recovered · ' || v_funding.channel,
      coalesce(v_funding.approved_by, v_funding.submitted_by)
    );
    if v_entry.wallet_id <> v_wallet.id
       or v_entry.amount_minor <> v_funding.amount_minor
       or v_entry.direction <> 'credit'
       or v_entry.reference_type <> 'funding_request'
       or v_entry.reference_id <> v_funding.id::text then
      raise exception 'funding recovery ledger mismatch';
    end if;
    update public.funding_requests
    set wallet_id = v_wallet.id, updated_at = now()
    where id = v_funding.id;
    v_repaired := v_repaired + 1;
  end loop;

  -- Surface financial discrepancies for an authorized human review.
  for v_issue in
    select f.id, f.channel, f.amount_minor,
           count(e.id)::integer as credit_count,
           coalesce(sum(e.amount_minor), 0)::bigint as credited_minor,
           coalesce(bool_or(e.wallet_id <> f.wallet_id), false) as wallet_mismatch
    from public.funding_requests f
    left join public.wallet_ledger_entries e
      on e.reference_type = 'funding_request'
     and e.reference_id = f.id::text
     and e.direction = 'credit'
     and e.entry_type in ('funding_credit', 'payment_credit')
    where f.status = 'approved'
    group by f.id
    having count(e.id) <> 1
        or coalesce(sum(e.amount_minor), 0) <> max(f.amount_minor)
        or coalesce(bool_or(e.wallet_id <> f.wallet_id), false)
    order by max(f.approved_at) desc
    limit p_limit
  loop
    if v_issue.credit_count > 1 then
      v_duplicates := v_duplicates + 1;
    elsif v_issue.channel = 'paystack' then
      v_gateway_missing := v_gateway_missing + 1;
    end if;
    insert into public.operations_exceptions (
      exception_key, category, target_type, target_id,
      severity, status, details, updated_at
    ) values (
      'funding-integrity:' || v_issue.id::text,
      case when v_issue.credit_count > 1 then 'funding_duplicate_credit'
           else 'funding_credit_missing' end,
      'funding_request', v_issue.id::text,
      'critical', 'open',
      jsonb_build_object(
        'channel', v_issue.channel,
        'expected_minor', v_issue.amount_minor,
        'credited_minor', v_issue.credited_minor,
        'credit_count', v_issue.credit_count,
        'wallet_mismatch', v_issue.wallet_mismatch
      ),
      now()
    ) on conflict (exception_key) do update
      set category = excluded.category,
          severity = excluded.severity,
          status = 'open',
          details = excluded.details,
          updated_at = now();
  end loop;

  return jsonb_build_object(
    'checked', v_checked,
    'repaired', v_repaired,
    'missingLedger', v_missing,
    'staleWallet', v_stale,
    'blockedInactive', v_blocked,
    'duplicateCredits', v_duplicates,
    'gatewayMissing', v_gateway_missing
  );
end;
$$;

revoke all on function public.fn_reconcile_approved_funding_credits(integer)
from public, anon, authenticated;
grant execute on function public.fn_reconcile_approved_funding_credits(integer)
to service_role;

create or replace function public.invoke_wallet_maintenance(p_task text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_url text;
    v_secret text;
    v_request_id bigint;
begin
    if p_task not in (
        'holds', 'payments', 'funding-credits', 'stuck-purchases', 'remote-send',
        'reconciliation', 'settlement', 'fraud-baseline',
        'refund-expiry', 'webhook-retention'
    ) then
        raise exception 'Unknown wallet maintenance task';
    end if;

    select decrypted_secret into v_url
    from vault.decrypted_secrets
    where name = 'beverly_wallet_maintenance_url';
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'beverly_cron_secret';
    if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
        raise exception 'Wallet maintenance Vault secrets are not configured';
    end if;

    select net.http_get(
        url := v_url || '?task=' || p_task,
        headers := jsonb_build_object(
            'Accept', 'application/json',
            'Authorization', 'Bearer ' || v_secret
        ),
        timeout_milliseconds := 15000
    ) into v_request_id;
    return v_request_id;
end;
$$;

revoke all on function public.invoke_wallet_maintenance(text)
from public, anon, authenticated;

do $wallet_cron$
begin
  if exists (select 1 from cron.job where jobname = 'wallet-funding-credits') then
    perform cron.unschedule('wallet-funding-credits');
  end if;
end;
$wallet_cron$;

select cron.schedule(
  'wallet-funding-credits',
  '17 * * * *',
  $$select public.invoke_wallet_maintenance('funding-credits')$$
);
