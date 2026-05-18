# Runbook: Security Incident

**Severity:** P0  
**Alert:** Auth failures >100/min OR fraud score >90 mass event OR unauthorized data access  
**Owner:** Engineering on-call + CTO immediately

---

## First 15 Minutes

1. **Do not** delete logs or evidence
2. **Isolate** — if active compromise suspected, immediately:
   ```bash
   # Set API to maintenance mode (blocks all external traffic)
   fly secrets set MAINTENANCE_MODE=true --app beverly-wallet-api
   ```
3. **Assess scope** — what was accessed / modified?
4. **Notify CTO** — do not wait

## Common Scenarios

### Brute-Force Login Attempt

**Symptoms:** Auth failures >100/min, many IPs or single IP

```sql
-- Check recent auth failures
SELECT ip_hash, count(*), max(created_at)
FROM security_events
WHERE event_type = 'login_failed'
  AND created_at > now() - interval '1 hour'
GROUP BY ip_hash
ORDER BY count DESC
LIMIT 20;
```

**Action:** Rate limit is already in place (5/min/IP via Redis). If Redis is bypassed:
- Add IP block at Vercel/Fly.io edge level
- Review rate limit implementation

### Compromised Staff Credential

**Symptoms:** Unusual admin actions in `admin_action_log`, unknown IP

```sql
-- Audit staff actions in last hour
SELECT actor_id, action, target_type, target_id, ip_hash, created_at
FROM admin_action_log
WHERE created_at > now() - interval '1 hour'
ORDER BY created_at DESC;
```

**Action:**
1. Immediately revoke the user's Supabase session: `supabase auth admin deleteUser <user_id>`
2. Rotate that user's credentials
3. Review all actions taken during the compromised window
4. Enable mandatory 2FA re-enrollment for all staff

### Mass Fraud Signal

**Symptoms:** Hundreds of purchases flagged at score >90

```sql
SELECT customer_id, count(*), avg(score), max(created_at)
FROM fraud_signals
WHERE score >= 90 AND created_at > now() - interval '30 min'
GROUP BY customer_id
HAVING count(*) > 3;
```

**Action:**
1. Set `wallet.purchase.enabled = false` temporarily
2. Review affected customer IDs
3. Block confirmed bad actors: `supabase auth admin updateUser <id> { banned: true }`

### Unauthorized Data Access (PII)

**Symptoms:** Abnormal query patterns, export requests from unknown IPs

**Immediate actions:**
1. Revoke all active sessions for the affected scope
2. Check `audit_logs` for the specific actor and time window
3. Notify DPO (Data Protection Officer) — NDPR requires 72-hour notification

## Post-Incident

- [ ] Scope of breach documented
- [ ] All compromised credentials rotated
- [ ] Session tokens invalidated
- [ ] Evidence preserved (do not delete logs)
- [ ] NDPR notification filed if PII was accessed (72-hour deadline)
- [ ] CBN notified if financial data was accessed
- [ ] Post-mortem written within 5 business days
- [ ] Prevention controls implemented and tested
