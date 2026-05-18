# Runbook: Mass Refund

**Severity:** P1  
**Owner:** Finance Lead + Engineering on-call

---

## When This Is Needed

- A batch of purchases failed to deliver tokens due to a system error
- A pricing error caused overcharging
- A gateway error resulted in double-charges
- Compliance order (CBN, court)

## Pre-Requisites

- Identify the scope: list of `purchase_order_id`s or a date range
- Get formal approval from Finance Lead (maker-checker required)
- Document the incident reference number

## Step 1: Identify Affected Orders

```sql
-- Example: all failed orders in a time window
SELECT
  po.id,
  po.customer_id,
  po.wallet_id,
  po.amount_minor,
  po.status,
  po.token,
  po.failure_reason
FROM purchase_orders po
WHERE po.created_at BETWEEN '2026-05-18 00:00:00' AND '2026-05-18 23:59:59'
  AND po.status = 'failed'
  AND po.token IS NULL;
```

Export to CSV for Finance sign-off.

## Step 2: Create Refund Requests

Use the admin API to create refund requests (each requires approval):
```bash
for ORDER_ID in $ORDER_IDS; do
  curl -X POST https://api.beverly.acoblighting.com/api/v1/admin/refunds \
    -H "Authorization: Bearer $STAFF_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"purchase_order_id\": \"$ORDER_ID\", \"reason\": \"system-error-INCIDENT-123\"}"
done
```

## Step 3: Bulk Approve (Finance role required)

Finance staff approves via the Refunds page in wallet admin (`/refunds`).

Each approval:
- Posts `reversal_credit` ledger entry to the customer wallet
- Customer receives SMS notification
- Audit log entry written

## Step 4: Verify

```sql
-- Confirm all affected orders have a corresponding reversal
SELECT po.id, po.amount_minor, wle.amount_minor AS refund_amount, wle.created_at AS refunded_at
FROM purchase_orders po
JOIN wallet_ledger_entries wle ON wle.reference_id = po.id AND wle.entry_type = 'reversal_credit'
WHERE po.id = ANY(ARRAY[<order_ids>]);
```

## Recovery Checklist

- [ ] Scope of affected orders documented
- [ ] Finance Lead signed off
- [ ] All refund requests created
- [ ] All refund requests approved by a different staff member (maker-checker)
- [ ] Customer wallets show correct balances
- [ ] Customer notification SMSes confirmed sent
- [ ] Incident report filed
- [ ] Root cause fixed and tested
