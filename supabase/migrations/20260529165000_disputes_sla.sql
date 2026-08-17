-- Phase 3: SLA timers on disputes
--
-- Adds sla_deadline and escalated_at to disputes.
-- SLA policy: open disputes must reach under_review within 24 h,
--             and be resolved within 72 h of creation.
-- Scheduler escalates overdue disputes and logs them.

alter table disputes
    add column if not exists sla_deadline  timestamptz,
    add column if not exists escalated_at  timestamptz;

-- Back-fill existing open/under_review disputes: 72 h from creation
update disputes
   set sla_deadline = created_at + interval '72 hours'
 where status in ('open', 'under_review')
   and sla_deadline is null;

-- Index for scheduler SLA sweep
create index if not exists idx_disputes_sla
    on disputes (sla_deadline)
    where status in ('open', 'under_review') and escalated_at is null;

-- Trigger: auto-set sla_deadline on INSERT
create or replace function set_dispute_sla_deadline()
returns trigger language plpgsql as $$
begin
    if new.sla_deadline is null then
        new.sla_deadline := new.created_at + interval '72 hours';
    end if;
    return new;
end;
$$;

create trigger trg_dispute_sla_deadline
    before insert on disputes
    for each row execute function set_dispute_sla_deadline();
