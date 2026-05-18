# Runbook: Database Failover

**Severity:** P0  
**Alert:** Database connection pool exhausted OR Supabase incident on status.supabase.com  
**Owner:** Engineering on-call + CTO

---

## Supabase Managed Failover

Supabase handles primary→replica failover automatically for managed instances. In most cases:

1. Check `status.supabase.com` for active incidents
2. Wait for Supabase to complete failover (usually <5 min)
3. Verify backend reconnects automatically (Fastify's pool reconnects on next request)

## Verify Database Connectivity

```bash
# Check backend health (includes DB ping)
curl https://api.beverly.acoblighting.com/health

# Direct DB connectivity test (requires psql)
psql $SUPABASE_DB_URL -c "SELECT 1;"
```

## Connection Pool Exhausted

If the alert is connection pool exhaustion (not a Supabase outage):

```bash
# Check active connections
# Run via Supabase SQL editor:
SELECT count(*), state, wait_event_type, wait_event
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state, wait_event_type, wait_event;
```

**Fix:** Scale the backend service down and back up to clear zombie connections:
```bash
fly scale count 0 --app beverly-wallet-api
fly scale count 2 --app beverly-wallet-api
```

## PITR Recovery (Last Resort)

Supabase provides 7-day point-in-time recovery. Contact Supabase support for restore.

Before requesting PITR:
1. Note the exact timestamp of last known-good state
2. Calculate data loss window
3. Get sign-off from CTO and Finance Lead

## Recovery Checklist

- [ ] Supabase status page shows operational
- [ ] Backend health endpoint returns `{ status: 'ok', db: true }`
- [ ] Connection pool within normal range (<80% utilization)
- [ ] Run reconciliation to verify no ledger corruption: `npm run reconcile`
- [ ] Spot-check 5 wallet balances against expected values
- [ ] All background jobs resume (check BullMQ dashboard)
- [ ] Post incident summary
