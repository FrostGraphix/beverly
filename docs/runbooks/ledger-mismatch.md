# Runbook: Ledger Mismatch

**Severity:** P1  
**Alert:** Reconciliation mismatch >₦10,000 OR wallet balance inconsistency detected  
**Owner:** Finance + Engineering on-call

---

## What This Means

The nightly reconciliation job (`daily_reconciliation` — runs 02:00) has found that:
- The sum of `wallet_ledger_entries` for a wallet does not equal `wallet_balances.balance_minor`, OR
- The total debits + credits do not match gateway records

The ledger is **append-only** and **immutable**. A mismatch means either:
1. A duplicate or missing entry was posted
2. `wallet_balances` materialized view is out of sync
3. A transaction was processed outside the ledger (bug)

## Immediate Investigation

```sql
-- Find wallets with balance mismatch
SELECT
  wb.wallet_id,
  wb.balance_minor AS cached_balance,
  SUM(CASE WHEN wle.direction = 'credit' THEN wle.amount_minor ELSE -wle.amount_minor END) AS computed_balance,
  wb.balance_minor - SUM(CASE WHEN wle.direction = 'credit' THEN wle.amount_minor ELSE -wle.amount_minor END) AS delta
FROM wallet_balances wb
JOIN wallet_ledger_entries wle ON wle.wallet_id = wb.wallet_id
GROUP BY wb.wallet_id, wb.balance_minor
HAVING wb.balance_minor != SUM(CASE WHEN wle.direction = 'credit' THEN wle.amount_minor ELSE -wle.amount_minor END);
```

```sql
-- Inspect last 10 entries for the affected wallet
SELECT id, direction, amount_minor, balance_after_minor, entry_type, created_at, idempotency_key
FROM wallet_ledger_entries
WHERE wallet_id = '<wallet_id>'
ORDER BY created_at DESC
LIMIT 10;
```

## Fix: Refresh Materialized View

If `wallet_balances` is stale:
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY wallet_balances;
```

## Fix: Compensating Entry

If a genuine entry is missing (e.g., debit posted without corresponding credit on failure):
1. **Do not** UPDATE or DELETE any ledger row
2. Post a compensating entry via:
   ```bash
   curl -X POST .../api/v1/admin/wallets/:id/manual-credit \
     -H "Authorization: Bearer $STAFF_TOKEN" \
     -d '{"amount_minor": 5000, "reason": "compensating-entry-YYYY-MM-DD", "reference": "INCIDENT-123"}'
   ```
3. This requires maker-checker: a second finance-role staff must approve

## Escalation

- Any mismatch >₦100,000: freeze affected wallet(s) immediately
  ```bash
  curl -X POST .../api/v1/admin/wallets/:id/freeze \
    -H "Authorization: Bearer $STAFF_TOKEN" \
    -d '{"reason": "ledger-mismatch-investigation"}'
  ```
- Notify Finance Lead and CTO within 15 min
- Open a formal incident in Linear

## Recovery Checklist

- [ ] Identify the affected wallet(s)
- [ ] Root cause identified and documented
- [ ] Compensating entries posted (if needed) and approved
- [ ] `wallet_balances` materialized view refreshed
- [ ] Reconciliation re-run confirms zero delta
- [ ] Incident report written
- [ ] Prevention PR raised (if code bug)
