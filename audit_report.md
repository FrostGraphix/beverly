# Beverly Go-Live Audit

Audit date: 2026-07-14.

Scope: `src`, `api`, `backend`, `supabase/migrations`, `tools`.

Phase 0 complete.

- Architecture read.
- Environment template read.
- Workspace manifests read.
- Vite configs read.
- Vercel config read.
- Route manifest read.
- API layers read.
- Latest migrations read.

Phase 1 complete.

- Files scanned: 345.
- Source bytes read: 3,243,157.

## Findings

| # | File | Line | Category | Finding | Fix Applied | Verified |
|---|---|---:|---|---|---|---|
| 1 | `src/App.vue` | 452 | Auth | Startup trusted role cookie. | Role starts null. | `test:auth` passed. |
| 2 | `src/services/api.js` | 345 | Auth | Failed profile request trusted cookies. | Failure now throws. | `api-authz` passed. |
| 3 | `tools/prefill-live-login.cjs` | 8 | Secrets | Credentials and URL were embedded. | Environment-only inputs. | Literal scan passed. |
| 4 | `tools/live-auth-crawl.cjs` | 11 | Secrets | Credentials and URL were embedded. | Environment-only inputs. | Literal scan passed. |
| 5 | `tools/live-auth-crawl-interactive.cjs` | 11 | Secrets | Credentials and URL were embedded. | Environment-only inputs. | Literal scan passed. |
| 6 | `tools/live-auth-session-wait.cjs` | 13 | Secrets | Credentials and URL were embedded. | Environment-only inputs. | Literal scan passed. |
| 7 | `tools/crawl-source-site.cjs` | 10 | Configuration | External source URL was embedded. | `SOURCE_SITE_URL` required. | Literal scan passed. |
| 8 | `tools/capture-live-samples.cjs` | 12 | Configuration | Upstream API had default URL. | Explicit URL required. | Hardening audit passed. |
| 9 | `.env.example` | 5 | Environment | New source inputs lacked template entries. | Added four empty keys. | Template reviewed. |
| 10 | `supabase/migrations/20260518100000_meter_purchase_orders.sql` | 16 | Migration | Historical migration lacks rerun guards. | Not changed. Applied history. | Human decision required. |
| 11 | `.env.example` | 1 | Environment | Tool environment catalog remains incomplete. | Not changed. Many keys are tool-only. | Human decision required. |

## Verified Controls

- Main CI passed.
- Production health returned 200.
- Production writes are enabled.
- Production flag changed 2026-07-03.
- Source integrity passed.
- Route permissions passed.
- API authorization passed.
- Migration contracts passed.
- Security configuration passed.
- Hardening audit passed.
- Dependency audit found zero vulnerabilities.
- Typecheck passed.
- Production build passed.
- Source maps are disabled.
- Client external fetch scan passed.
- Client secret-prefix scan passed.
- Anon execute grant scan passed.

## Required Go-Live Checklist

### Release Evidence

- [x] Main CI green.
- [x] Local production build green.
- [x] Security tests green.
- [x] Wallet tests green.
- [x] Browser tests green.
- [x] Visual audit green.
- [x] Production health reachable.
- [ ] Record production deployment commit.
- [ ] Record deployment timestamp.
- [ ] Record rollback deployment.

### Vercel Configuration

- [ ] Confirm production target URL.
- [ ] Confirm production CORS origins.
- [ ] Confirm production JWT secret.
- [ ] Confirm encryption key length.
- [ ] Confirm Supabase service key.
- [ ] Confirm live bearer token.
- [ ] Confirm payment webhook secret.
- [ ] Confirm Twilio credentials.
- [ ] Confirm production-only variables.
- [ ] Remove legacy write flags.

### Database And Storage

- [ ] Confirm migration ledger.
- [ ] Confirm latest migrations applied.
- [ ] Confirm RLS runtime policies.
- [ ] Confirm private storage buckets.
- [ ] Confirm backup timestamp.
- [ ] Restore one backup copy.
- [ ] Confirm retention schedules.
- [ ] Confirm service-role isolation.

### Authentication And Access

- [ ] Test super-admin login.
- [ ] Test operations-manager login.
- [ ] Test finance-checker login.
- [ ] Test vendor login.
- [ ] Test vendor-user login.
- [ ] Test expired-session redirect.
- [ ] Test unauthorized API write.
- [ ] Test denied route navigation.
- [ ] Test password reset flow.
- [ ] Test MFA recovery flow.

### Live Reads And Writes

- [x] Runtime writes enabled.
- [ ] Obtain smoke credentials.
- [ ] Run authenticated Vercel smoke.
- [ ] Record smoke output.
- [ ] Confirm health matches control.
- [ ] Confirm live read endpoints.
- [ ] Confirm payment reconciliation.
- [ ] Confirm wallet idempotency.
- [ ] Confirm upstream failure behavior.
- [ ] Name write approver.
- [ ] Record write window.

### Operations And Rollback

- [ ] Confirm error alert delivery.
- [ ] Confirm uptime monitor.
- [ ] Confirm log retention.
- [ ] Confirm incident owner.
- [ ] Confirm rollback owner.
- [ ] Test rollback procedure.
- [ ] Freeze nonessential deploys.
- [ ] Record support contacts.

## Build Result

Pass.

`npm run build` completed.

## Audit Totals

- Files scanned: 345.
- Findings: 11.
- Fixed: 9.
- Flagged: 2.

## Go-Live Decision

Not approved yet.

Authenticated smoke remains missing.

Production configuration remains unverified.

## Resolution Phase Checklist

Run date: 2026-07-14.

### Phase A: Source Corrections

- [x] Replaced raw export button.
- [x] Used approved BaseButton.
- [x] Corrected vendor-user label.
- [x] Updated stale label contract.

### Phase B: Local Verification

- [x] Typecheck completed successfully.
- [x] Contracts completed successfully.
- [x] Services completed successfully.
- [x] Wallet tests completed successfully.
- [x] Security tests completed successfully.
- [x] Browser tests completed successfully.
- [x] Visual audit completed successfully.
- [x] Production build completed successfully.

### Phase C: Release Evidence

- [x] Prior main CI passed.
- [x] Prior health check passed.
- [x] Production writes were enabled.
- [ ] Record deployed commit.
- [ ] Verify deployment source branch.
- [ ] Verify Vercel production variables.

### Phase D: Runtime Confirmation

- [ ] Run authenticated production smoke.
- [ ] Test permitted write path.
- [ ] Test forbidden write path.
- [ ] Confirm production error alerts.
- [ ] Confirm rollback procedure.

### Phase E: Environment Parity

- [x] Repository specifies Node 22.13.1.
- [x] Re-ran build using Node 22.

Node 22.13.1 build passed.

Local Node 22 is workspace-scoped.

### Phase F: Publish Gate

- [ ] Review existing worktree changes.
- [ ] Commit approved change set.
- [ ] Push reviewed commit.
- [ ] Confirm Vercel production deployment.

Publishing was not performed.

The worktree contains unrelated changes.

## Database And Storage

### Migration State

- [ ] Confirm migration ledger.
- [ ] Confirm latest migrations applied.
- [x] Migration contract passed.
- [x] Latest Beverly migration identified.

Runtime ledger access is unavailable.

The Supabase CLI is unavailable.

### Row-Level Security

- [ ] Confirm RLS runtime policies.
- [x] RLS migration contracts passed.
- [x] Client service-role scan passed.

Runtime catalog access is unavailable.

### Storage

- [x] Confirmed five private buckets.
- [ ] Profile-picture bucket is public.
- [x] Upload policy limits verified.

The public profile bucket is intentional.

It returns stored public URLs.

### Backup And Retention

- [ ] Confirm backup timestamp.
- [ ] Restore one backup copy.
- [ ] Confirm retention schedules.

Dashboard access is required.

### Service-Role Isolation

- [x] Server service-role usage found.
- [x] Client secret scan passed.
- [ ] Confirm deployed environment isolation.

Production dashboard access is required.

## Authentication And Access

### Production Role Logins

- [ ] Test super-admin login.
- [ ] Test operations-manager login.
- [ ] Test finance-checker login.
- [ ] Test vendor login.
- [ ] Test vendor-user login.

Production test accounts are required.

### Session And Authorization

- [x] Expired-session redirect contract passed.
- [x] Unauthorized API write contract passed.
- [x] Denied route navigation contract passed.
- [x] Password recovery contract passed.
- [x] Vendor MFA recovery passed.
- [x] Staff MFA recovery passed.

### Test Evidence

- [x] Authentication suite passed.
- [x] MFA suite passed.
- [x] Wallet MFA runtime passed.

Production browser smoke remains required.
