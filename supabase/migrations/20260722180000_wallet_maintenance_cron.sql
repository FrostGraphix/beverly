-- Schedule wallet payment recovery and maintenance without an always-on worker.
-- The target URL and bearer token live in Supabase Vault under:
--   beverly_wallet_maintenance_url
--   beverly_cron_secret

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

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
        'holds', 'payments', 'stuck-purchases', 'remote-send',
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

revoke all on function public.invoke_wallet_maintenance(text) from public, anon, authenticated;

do $wallet_cron$
declare
    v_job text;
begin
    foreach v_job in array array[
        'wallet-holds', 'wallet-payments', 'wallet-stuck-purchases',
        'wallet-remote-send', 'wallet-reconciliation', 'wallet-settlement',
        'wallet-fraud-baseline', 'wallet-refund-expiry', 'wallet-webhook-retention'
    ] loop
        if exists (select 1 from cron.job where jobname = v_job) then
            perform cron.unschedule(v_job);
        end if;
    end loop;
end;
$wallet_cron$;

select cron.schedule('wallet-holds', '*/5 * * * *', $$select public.invoke_wallet_maintenance('holds')$$);
select cron.schedule('wallet-payments', '2-57/5 * * * *', $$select public.invoke_wallet_maintenance('payments')$$);
select cron.schedule('wallet-stuck-purchases', '*/10 * * * *', $$select public.invoke_wallet_maintenance('stuck-purchases')$$);
select cron.schedule('wallet-remote-send', '*/3 * * * *', $$select public.invoke_wallet_maintenance('remote-send')$$);
select cron.schedule('wallet-reconciliation', '0 2 * * *', $$select public.invoke_wallet_maintenance('reconciliation')$$);
select cron.schedule('wallet-settlement', '0 3 * * *', $$select public.invoke_wallet_maintenance('settlement')$$);
select cron.schedule('wallet-fraud-baseline', '0 5 * * *', $$select public.invoke_wallet_maintenance('fraud-baseline')$$);
select cron.schedule('wallet-refund-expiry', '0 * * * *', $$select public.invoke_wallet_maintenance('refund-expiry')$$);
select cron.schedule('wallet-webhook-retention', '20 4 * * *', $$select public.invoke_wallet_maintenance('webhook-retention')$$);
