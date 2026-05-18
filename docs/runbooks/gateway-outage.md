# Runbook: Payment Gateway Outage

**Severity:** P1  
**Alert:** Payment webhook lag >5 min OR payment success rate <90% over 10 min  
**Owner:** Finance + Engineering on-call

---

## Symptoms

- Paystack webhooks stop arriving at `/api/v1/webhook/paystack`
- `payment_transactions` rows stuck in `initiated` status
- Customer purchases fail with "payment processing" errors
- Grafana: payment success rate drops below threshold

## Immediate Actions (first 5 min)

1. **Check Paystack status page** — `status.paystack.co`
2. **Check webhook delivery** in Paystack dashboard → Logs → Webhook Deliveries
3. **Check Redis** — if BullMQ queue is backed up, Redis may be full or offline
   ```bash
   redis-cli -u $REDIS_URL PING
   redis-cli -u $REDIS_URL INFO memory
   ```
4. **Check backend health**
   ```bash
   curl https://api.beverly.acoblighting.com/health
   ```

## If Paystack is Down

1. Set feature flag `wallet.payment.gateway_maintenance = true` via admin UI
2. This surfaces a maintenance banner in the customer and vendor apps
3. No new purchases can be initiated (fail-safe)
4. Existing `initiated` transactions will be swept by the payment status sweeper every 5 min once Paystack recovers

## Manual Payment Status Sweep

If the sweeper is stuck:
```bash
# Trigger a manual sweep via admin API
curl -X POST https://api.beverly.acoblighting.com/api/v1/admin/jobs/payment-sweep \
  -H "Authorization: Bearer $STAFF_TOKEN"
```

## Customer Communication

- Post status update on `beverly.acoblighting.com/status` if outage >15 min
- Send Slack notification to `#beverly-ops`

## Recovery Checklist

- [ ] Paystack status page shows operational
- [ ] Test webhook delivery from Paystack dashboard
- [ ] Confirm `payment_transactions` sweeper is clearing stuck rows
- [ ] Disable `wallet.payment.gateway_maintenance` flag
- [ ] Verify customer purchase flow end-to-end
- [ ] Check reconciliation: `SELECT COUNT(*) FROM payment_transactions WHERE status = 'initiated' AND created_at < now() - interval '1 hour'`
- [ ] Post incident summary in `#beverly-incidents`

## Escalation

- >30 min: notify Finance lead and CTO
- >2 hours: engage Paystack account manager (contact in 1Password)
