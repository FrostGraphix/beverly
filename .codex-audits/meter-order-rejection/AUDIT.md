# Meter Order Rejection Audit

## Scope

- Admin rejection decision.
- Vendor refund visibility.
- Customer recovery visibility.
- Wallet receipt evidence.
- Station authorization boundaries.

## Intended Outcome

- Pending orders allow rejection.
- Paid orders allow rejection.
- Approved work blocks rejection.
- Paid orders refund atomically.
- Every rejection records reasons.
- Every portal shows outcomes.

## Journey Health

1. Admin authentication: blocked.
2. Order discovery: healthy.
3. Station authorization: healthy.
4. Eligibility decision: healthy.
5. Reason capture: healthy.
6. Atomic rejection: healthy.
7. Refund handling: healthy.
8. Audit logging: healthy.
9. Customer notification: healthy.
10. Vendor notification: healthy.
11. Portal recovery: healthy.
12. Receipt evidence: healthy.
13. Remote deployment: pending.

## Closed Gaps

- Added terminal rejection status.
- Separated rejection from cancellation.
- Added dedicated money endpoint.
- Added mandatory rejection reasons.
- Added station-scoped authorization.
- Added locked database transition.
- Added idempotent wallet refunds.
- Added customer wallet refunds.
- Added vendor wallet refunds.
- Added complete audit metadata.
- Added customer recovery guidance.
- Added vendor outcome guidance.
- Added receipt rejection evidence.

## Guardrails

- Assigned orders reject nothing.
- Dispatched orders reject nothing.
- Installed orders reject nothing.
- Cancelled orders reject nothing.
- Rejected orders reject nothing.
- Missing wallets stop rejection.
- Duplicate requests refund once.
- Wrong stations return nothing.

## Evidence Limits

- Login blocked authenticated screenshots.
- Network login remained unavailable.
- No production order changed.
- No wallet movement occurred.
- Remote migration remains unapplied.

## Saved Evidence

- `01-auth-blocker.png`

## Validation

- Contract tests passed.
- Service tests passed.
- Type-checks passed.
- Production builds passed.
- Whitespace checks passed.
