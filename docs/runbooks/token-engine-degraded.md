# Runbook: Token Engine Degraded

**Severity:** P1  
**Alert:** Token generation success rate <99% over 10 min  
**Owner:** Engineering on-call

---

## Symptoms

- `purchase_orders` rows stuck in `processing` or `failed` status
- Customers purchased but did not receive tokens
- Alert from Grafana: `token_generation_success_rate < 0.99`
- Backend logs: `Error calling energy backend` or timeout errors

## Immediate Check

```bash
# Check energy backend reachability
curl -H "Authorization: Bearer $ENERGY_BEARER_TOKEN" \
  http://8.208.16.168:9310/api/health

# Check stuck purchase orders
curl https://api.beverly.acoblighting.com/api/v1/admin/jobs/stuck-purchases \
  -H "Authorization: Bearer $STAFF_TOKEN"
```

## If Energy Backend is Down

The energy backend at `ENERGY_BACKEND_URL` is the CRM token engine proxy.

1. Mark feature flag `wallet.purchase.enabled = false` (stops new purchases)
2. Stuck orders in `processing` state will be auto-retried by the stuck purchase scanner (every 10 min, 3 retries)
3. After max retries, orders move to `failed` and wallets are automatically refunded

## Manual Refund for Stuck Orders

If automatic retry/refund does not trigger within 30 min:
```bash
# Trigger manual refund sweep
curl -X POST https://api.beverly.acoblighting.com/api/v1/admin/jobs/refund-failed-purchases \
  -H "Authorization: Bearer $STAFF_TOKEN"
```

This posts `reversal_credit` ledger entries for all orders in `failed` status with no token.

## Check Specific Order

```sql
SELECT id, status, meter_id, amount_minor, token, failure_reason, created_at, updated_at
FROM purchase_orders
WHERE status IN ('processing', 'failed')
  AND created_at > now() - interval '2 hours'
ORDER BY created_at DESC;
```

## Customer Communication

- If >20 customers are affected: post to `beverly.acoblighting.com/status`
- In-app notification is automatically suppressed while flag is off
- Individual refund confirmation SMS sent by refund sweep

## Recovery Checklist

- [ ] Energy backend responding normally
- [ ] No stuck orders in `processing` >30 min
- [ ] All `failed` orders with no token have been refunded
- [ ] `wallet.purchase.enabled` re-enabled
- [ ] Test purchase end-to-end
- [ ] Token generation rate back to >99%
- [ ] Customer-facing notifications cleared
