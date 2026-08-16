# Backend Remediation Roadmap

Status: Planned.
Owner: Engineering leadership.
Source: `BACKEND_DEEP_AUDIT_2026-06-22.md`.

## Goal

Create one trustworthy backend.

Guarantee money-flow correctness.

Guarantee tenant isolation.

Guarantee operational recovery.

Block unsafe production writes.

## Target Outcome

- One financial authority exists.
- Supabase holds financial truth.
- Every financial write is atomic.
- Every mutation is idempotent.
- MFA protects privileged actions.
- Preview deployments cannot mutate.
- Workers process durable jobs.
- Monitoring detects broken flows.
- Release evidence remains reproducible.

## Delivery Principles

- Fix P0 items first.
- Ship narrow vertical slices.
- Migrate before switching traffic.
- Preserve immutable ledger history.
- Use feature flags temporarily.
- Never delete financial records.
- Test database behavior directly.
- Require rollback readiness.

## Workstream Map

| Workstream | Findings | Exit outcome |
| --- | --- | --- |
| Financial authority | ARCH-001 | One production write path |
| Ledger integrity | FIN-001, FIN-002, FIN-003 | No overdrafts or duplicates |
| Payment fulfillment | PAY-001, PAY-002, PAY-003 | One verified fulfillment |
| Identity assurance | AUTH-001, AUTH-002, AUTH-003 | Verified sessions only |
| Platform boundaries | DEP-001, DEP-002, DEP-003, SEC-003, SEC-005 | Safe deployments and jobs |
| Data protection | SEC-002, SEC-004, SEC-006, SEC-007, DATA-001 | Isolated and minimized data |
| Privileged operations | SEC-001, SEC-008 | Controlled administrator access |
| Reliability | OPS-001 through OPS-008 | Detectable and recoverable failures |
| Verification | TEST-001 | Database-proven invariants |

## Phase 0: Release Containment

Status: Required before changes.

### P0-01: Freeze financial release

Scope:

- Pause new wallet production rollouts.
- Block vending feature expansion.
- Disable preview money mutations.
- Preserve current audit evidence.

Tasks:

1. Remove write flags from `vercel.json`.
2. Set preview writes false.
3. Keep production writes disabled.
4. Document emergency rollback steps.
5. Capture current migration state.

Dependencies:

- Vercel environment access.
- Supabase read-only access.

Expected outcome:

- Previews cannot mutate upstream.
- Existing balances remain untouched.
- Recovery evidence stays available.

Acceptance:

- Preview write smoke returns `403`.
- Production write smoke returns `403`.
- Read-only dashboards remain healthy.

### P0-02: Protect privileged access

Scope:

- Stop MFA bypasses.
- Restrict developer tooling.
- Preserve active legitimate sessions.

Tasks:

1. Remove factor-list MFA success.
2. Require verified MFA sessions.
3. Enforce MFA for staff roles.
4. Gate developer routes by environment.
5. Create audited break-glass access.

Dependencies:

- Staff MFA migration state.
- Staff account recovery runbook.

Expected outcome:

- Enrollment alone grants nothing.
- Privileged routes require assurance.
- Developer tools stay nonproduction.

Acceptance:

- Enrolled-only sessions receive `403`.
- Verified sessions access permitted routes.
- Production denies `/dev/*` routes.

## Phase 1: Establish Financial Authority

Status: Blocking architecture change.

### P1-01: Select canonical wallet backend

Scope:

- Retire legacy financial mutations.
- Keep reference facade read-only.
- Route wallet APIs to Fastify.

Tasks:

1. Inventory every `/api/wallet/*` caller.
2. Map legacy response contracts.
3. Add Fastify compatibility endpoints.
4. Redirect frontend services gradually.
5. Remove legacy write handlers.
6. Keep legacy reads temporarily.
7. Delete temporary compatibility later.

Dependencies:

- API contract inventory.
- Frontend owner approval.
- Staging database.

Expected outcome:

- Supabase-backed Fastify owns writes.
- SQLite no longer stores money.
- Portals share balances and receipts.

Acceptance:

- No financial write hits `api/reference.js`.
- All wallet writes hit Fastify.
- Vercel routes reach deployed backend.
- Cross-portal balances match exactly.

### P1-02: Deploy durable backend runtime

Scope:

- Deploy Fastify service separately.
- Deploy worker process separately.
- Keep Vercel SPA delivery.

Tasks:

1. Define backend runtime target.
2. Add production Dockerfile.
3. Add worker Dockerfile.
4. Add health and readiness probes.
5. Add secrets documentation.
6. Add deployment workflow.
7. Add deployment smoke tests.

Dependencies:

- Hosting decision.
- Redis production instance.
- Supabase production project.

Expected outcome:

- Wallet API has stable residency.
- Workers survive SPA deployments.
- Scheduler no longer depends Vercel.

Acceptance:

- `/health` returns readiness evidence.
- Worker exposes active heartbeat.
- Deployment rollback completes safely.

## Phase 2: Repair Ledger Invariants

Status: P0 financial blocker.

### P2-01: Atomic hold creation

Scope:

- Replace application-side availability reads.
- Prevent concurrent over-reservation.

Tasks:

1. Create `fn_create_hold` migration.
2. Lock wallet row `FOR UPDATE`.
3. Sum active holds inside transaction.
4. Validate available balance atomically.
5. Insert hold using unique idempotency.
6. Return existing hold on replay.
7. Replace `createHold` service logic.

Dependencies:

- Canonical wallet backend.
- Database integration harness.

Expected outcome:

- Concurrent requests cannot overspend.
- Replay returns original hold.

Acceptance:

- Parallel holds exceed balance once only.
- Retry returns same hold identifier.
- Ledger balance remains unchanged.

### P2-02: Atomic hold capture

Scope:

- Fix self-hold debit rejection.
- Guarantee capture exactly once.

Tasks:

1. Create `fn_capture_hold_v2` migration.
2. Lock hold and wallet rows.
3. Verify active unexpired hold.
4. Exclude target hold reservation.
5. Insert immutable debit entry.
6. Mark hold captured atomically.
7. Return original capture on replay.
8. Deprecate existing capture RPC.

Dependencies:

- P2-01 migration.
- Ledger entry constraints.

Expected outcome:

- Full-balance vend captures correctly.
- Duplicate capture becomes harmless.

Acceptance:

- Exact-balance hold captures successfully.
- Double capture creates one debit.
- Failed capture preserves active hold.

### P2-03: Enforce request idempotency

Scope:

- Require client keys for money actions.
- Preserve replay response semantics.

Tasks:

1. Require `Idempotency-Key` header.
2. Validate key format and length.
3. Store request fingerprint.
4. Store successful response payload.
5. Reject key payload mismatches.
6. Remove random fallback keys.
7. Add response replay middleware.

Dependencies:

- Canonical routing layer.
- Database idempotency schema.

Expected outcome:

- Retries never create extra vends.
- Clients receive stable replay results.

Acceptance:

- Duplicate vend returns same order.
- Changed payload receives conflict.
- Missing key receives validation error.

## Phase 3: Make Payments Exactly-Once

Status: P0 payment blocker.

### P3-01: Webhook verification hardening

Scope:

- Reject malformed signatures safely.
- Deduplicate gateway events.

Tasks:

1. Validate signature encoding.
2. Compare buffer lengths first.
3. Add gateway event identifier.
4. Add unique event index.
5. Store verified event digest.
6. Return duplicate acknowledgement.
7. Redact stored payload fields.

Dependencies:

- Paystack event schema.
- Privacy retention policy.

Expected outcome:

- Bad signatures return `401`.
- Replayed webhooks cause no work.

Acceptance:

- Invalid signature never returns `500`.
- Duplicate event inserts once.
- PII storage remains minimized.

### P3-02: Atomic fulfillment claim

Scope:

- Stop webhook scheduler races.
- Stop duplicate token generation.

Tasks:

1. Add `fulfillment_claimed_at` fields.
2. Add transaction lease token.
3. Claim transaction atomically.
4. Lock related purchase order.
5. Generate token after claim.
6. Persist delivery idempotency key.
7. Release stale leases safely.
8. Create manual recovery queue.

Dependencies:

- P3-01 event deduplication.
- Durable worker deployment.

Expected outcome:

- One transaction creates one token.
- Recovery remains reviewable.

Acceptance:

- Parallel fulfill attempts generate once.
- Crashed worker lease expires safely.
- Ops queue shows unresolved deliveries.

### P3-03: Payment lifecycle reconciliation

Scope:

- Repair silent sweep failures.
- Support retry visibility.

Tasks:

1. Persist verification attempts.
2. Add exponential retry schedule.
3. Set terminal failure states.
4. Emit security and audit events.
5. Alert retry exhaustion.
6. Add operator recovery action.

Expected outcome:

- Every payment has visible status.
- Failed reconciliation becomes actionable.

Acceptance:

- Failed attempts persist visibly.
- Exhausted jobs create incidents.
- Manual retry is idempotent.

## Phase 4: Secure Identities And Boundaries

Status: Security blocker.

### P4-01: Harden MFA sessions

Scope:

- Separate enrollment from assurance.
- Bind verification to session.

Tasks:

1. Remove `user.factors` success logic.
2. Use verified session lookup only.
3. Require recent MFA timestamps.
4. Add role-based assurance policy.
5. Add recovery code audit events.
6. Add forced-enrollment migration path.

Expected outcome:

- Staff money controls require MFA.
- Vendor vending requires valid MFA.

Acceptance:

- Factor enrollment alone fails.
- Expired assurance fails.
- Recovery code use is audited.

### P4-02: Fail OTP storage closed

Scope:

- Remove production memory fallback.
- Protect OTP rate limits.

Tasks:

1. Limit fallback to tests only.
2. Add database migration readiness check.
3. Fail authentication when unavailable.
4. Add shared Redis throttles.
5. Add SMS provider error metrics.

Expected outcome:

- OTP state stays durable.
- Missing migration blocks safely.

Acceptance:

- Missing table returns controlled failure.
- Restart preserves challenge state.
- Rate limits span instances.

### P4-03: Harden browser boundaries

Scope:

- Close CORS failures.
- Fix proxy rate identities.
- Protect cron endpoints.

Tasks:

1. Require production CORS origins.
2. Fail startup when empty.
3. Trust known proxy addresses.
4. Use platform client IPs.
5. Add Redis rate-limit storage.
6. Add strict cron secret checks.
7. Deny preview cron routes.

Expected outcome:

- Browser access stays allowlisted.
- Rate limits resist header spoofing.

Acceptance:

- Empty production CORS fails startup.
- Spoofed XFF cannot evade limits.
- Secretless cron receives `401`.

### P4-04: Protect uploads And profile data

Scope:

- Remove arbitrary profile URLs.
- Bind scans to storage objects.

Tasks:

1. Remove `profile_picture_url` PATCH input.
2. Accept controlled object paths only.
3. Verify file metadata server-side.
4. Enforce object size and MIME.
5. Scan stored object bytes.
6. Mark objects quarantined first.
7. Activate scanned objects only.
8. Remove abandoned objects later.

Expected outcome:

- Profiles use vetted storage only.
- Scanner cannot be bypassed.

Acceptance:

- Remote URLs are rejected.
- Oversized uploads are rejected.
- Unscanned images never activate.

### P4-05: Apply announcement RLS

Scope:

- Protect announcements and deliveries.
- Preserve service workflows.

Tasks:

1. Enable row-level security.
2. Force row-level security.
3. Add service role policies.
4. Add recipient self-read policies.
5. Deny cross-tenant reads.
6. Add migration policy tests.

Expected outcome:

- Recipients see only own messages.
- Staff delivery actions stay controlled.

Acceptance:

- Customer reads own deliveries only.
- Vendor reads own deliveries only.
- Anonymous reads fail.

## Phase 5: Repair Platform Operations

Status: Reliability blocker.

### P5-01: Replace in-process scheduling

Scope:

- Remove node-cron production dependency.
- Ensure one job execution.

Tasks:

1. Move schedules into workers.
2. Use BullMQ repeatable jobs.
3. Add Redis-backed job uniqueness.
4. Add advisory locks where needed.
5. Add scheduler lease heartbeat.
6. Add missed-run detection.
7. Remove production `startScheduler()`.

Expected outcome:

- Jobs run once globally.
- Deployments cannot duplicate jobs.

Acceptance:

- Two workers run one schedule.
- Missed jobs raise incident.
- Worker restart resumes safely.

### P5-02: Repair background workflows

Scope:

- Implement queues and workers.
- Move exports and notifications off requests.

Tasks:

1. Create worker entrypoints.
2. Create job payload schemas.
3. Add retry and backoff policy.
4. Add dead-letter queues.
5. Queue privacy exports.
6. Queue notifications and SMS.
7. Queue remote-send polling.
8. Persist job correlation IDs.

Expected outcome:

- Async work survives restarts.
- Failures remain recoverable.

Acceptance:

- Export completes after restart.
- Failed job reaches dead-letter queue.
- Ops can replay safely.

### P5-03: Repair lifecycle scanners

Scope:

- Fix stuck-order states.
- Complete fraud refresh coverage.

Tasks:

1. Define lifecycle state matrix.
2. Scan valid active statuses.
3. Add stale thresholds per state.
4. Create exception records.
5. Paginate fraud baseline refresh.
6. Record checkpoints.
7. Alert incomplete refreshes.

Expected outcome:

- Stuck orders become visible.
- All customers receive baseline refreshes.

Acceptance:

- Each active state gets scanned.
- Customer count exceeds 500 safely.
- Exceptions appear in operations queue.

### P5-04: Add operational truth

Scope:

- Replace synthetic status outputs.
- Add measurable production health.

Tasks:

1. Query actual migration history.
2. Report pending migrations honestly.
3. Remove runtime version details.
4. Add Prometheus metrics.
5. Add trace export.
6. Add money-flow dashboards.
7. Add alert thresholds.

Expected outcome:

- Operators trust system status.
- Incidents become observable.

Acceptance:

- Migration status matches Supabase.
- `/version` exposes build only.
- Dashboards show queue and ledger health.

## Phase 6: Rationalize API Governance

Status: Implemented locally. Production writes remain disabled.

Verification:

- `backend/wallet/src/contracts/route-policy.ts` denies unknown canonical mutations.
- `api/wallet-route-contract.cjs` replaces gateway money-path regex classification.
- `tests/route-policy.test.cjs` covers the policy inventory and developer-console defaults.
- Production deployment verification remains required before any write-gate change.

### P6-01: Replace path-name write detection

Scope:

- Create explicit mutation metadata.
- Guard all contract mutations.

Tasks:

1. Extend API contract metadata.
2. Mark every route read or write.
3. Fail unknown non-GET routes.
4. Derive cache behavior from metadata.
5. Derive approval gates from metadata.
6. Add route coverage test.
7. Remove regex classifier.

Expected outcome:

- Every mutation receives correct guards.
- Route names no longer matter.

Acceptance:

- All 149 mutations classify correctly.
- No contract mutation bypasses guards.
- Cache never stores mutations.

### P6-02: Restrict developer console

Scope:

- Remove production test capabilities.
- Preserve useful local tooling.

Tasks:

1. Register routes development-only.
2. Remove automatic super-admin grant.
3. Separate break-glass permission.
4. Require reauthentication.
5. Block real-wallet sandbox actions.
6. Enforce audit logging.
7. Remove unused API keys.

Expected outcome:

- Production exposes no test console.
- Local developers retain diagnostics.

Acceptance:

- Production `/dev/*` returns `404`.
- Staging requires break-glass role.
- Sandbox cannot credit production wallets.

## Phase 7: Data Governance

Status: Required before compliance release.

### P7-01: Minimize webhook retention

Scope:

- Reduce stored gateway PII.
- Add controlled lifecycle deletion.

Tasks:

1. Define required webhook fields.
2. Redact nonessential payload fields.
3. Encrypt retained sensitive fields.
4. Add retention expiration.
5. Add purge worker.
6. Record purge audit events.

Expected outcome:

- Payment troubleshooting remains possible.
- Privacy exposure decreases materially.

Acceptance:

- Stored payload matches policy.
- Expired payloads purge automatically.
- Audit trail remains intact.

### P7-02: Govern VAT changes

Scope:

- Keep current 7.5% default.
- Add finance-controlled tax policy.

Tasks:

1. Create tax policy table.
2. Add effective start dates.
3. Require finance approval.
4. Snapshot rate per purchase.
5. Expose read-only policy history.
6. Add migration rollback plan.

Expected outcome:

- VAT changes remain auditable.
- Old receipts retain exact VAT.

Acceptance:

- Default rate stays 750 basis points.
- Future rate activates by date.
- Purchases preserve historic rate.

## Phase 8: Verification Suite

Status: Mandatory release requirement.

### P8-01: Database integration harness

Scope:

- Test migrations against Postgres.
- Test RPC behavior directly.

Tasks:

1. Add ephemeral Supabase test project.
2. Apply every migration sequentially.
3. Seed isolated fixtures.
4. Run transaction race tests.
5. Run RLS role tests.
6. Run rollback compatibility tests.

Expected outcome:

- Database invariants gain proof.
- Migration failures stop releases.

Acceptance:

- Every migration applies cleanly.
- RLS denies unauthorized tenants.
- Concurrent holds stay safe.

### P8-02: Financial scenario suite

Scope:

- Test complete money journeys.

Scenarios:

1. Manual funding approval.
2. Paystack vendor funding.
3. Customer wallet funding.
4. Vendor token vending.
5. Customer direct payment.
6. Remote-send delivery.
7. Three-phase meter vending.
8. Net-plus-VAT receipt generation.
9. Failed vend hold release.
10. Unknown delivery reconciliation.
11. Refund approval and reversal.
12. Duplicate request replay.

Expected outcome:

- Every money state has test coverage.
- Ledger totals reconcile exactly.

Acceptance:

- Tests assert balance invariants.
- Tests assert receipt totals.
- Tests assert audit event creation.

### P8-03: Deployment and recovery drills

Scope:

- Validate production behavior safely.

Tasks:

1. Test preview write denial.
2. Test staging write approval.
3. Test worker crash recovery.
4. Test webhook replay.
5. Test database failover behavior.
6. Test credential rotation.
7. Test rollback migration procedure.

Expected outcome:

- Launch remains controlled.
- Incidents have rehearsed recovery.

Acceptance:

- Drill reports remain stored.
- Failed drill blocks release.

## Sequencing

1. Complete Phase 0.
2. Complete Phase 1.
3. Complete Phase 2.
4. Complete Phase 3.
5. Complete Phase 4.
6. Complete Phase 5.
7. Complete Phase 6.
8. Complete Phase 7.
9. Complete Phase 8.

## Release Checklist

- Financial authority consolidated.
- P0 findings closed.
- P1 findings closed.
- Database integration passes.
- Staging rehearsal passes.
- Preview writes remain denied.
- Production MFA enforcement passes.
- Workers show healthy heartbeats.
- Dashboard alerts are active.
- Finance signs reconciliation report.
- Security signs threat review.

## Result Register

| Result | Evidence |
| --- | --- |
| Correct wallet balances | Atomic ledger tests |
| One token per purchase | Fulfillment race tests |
| Reliable job processing | Worker heartbeat and queues |
| Isolated tenant data | RLS integration tests |
| Safe preview deployments | Write-denial smoke tests |
| Enforced privileged MFA | Session assurance tests |
| Auditable tax changes | Policy history and receipts |
| Recoverable operations | Rehearsal reports |

## Non-Negotiable Gate

Do not reopen money writes.

Complete P0 through P3.

Pass Phase 8 evidence.
