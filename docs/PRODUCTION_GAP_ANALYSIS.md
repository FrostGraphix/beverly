# Production Gap Analysis

Date: 2026-05-12

Scope:
- Frontend
- Backend proxy
- Data flows
- Tests
- UI and UX
- Supabase
- Deployment
- Security
- Operations
- Documentation

Architecture basis:
- Root [ARCHITECTURE.md](/C:/Users/ACOB/Desktop/VS%20Code/acob-crm-4/ARCHITECTURE.md)
- Mirror [docs/ARCHITECTURE.md](/C:/Users/ACOB/Desktop/VS%20Code/acob-crm-4/docs/ARCHITECTURE.md)

## Executive Verdict

Status: release blocked.

Production status:
- Not production-ready.
- Public preview smoke fails.
- Remote CI fails.
- Deployed Supabase smoke is unproven.

Why:
- `npm run build` passes.
- `npm run typecheck` passes.
- `npm run hardening:audit` passes.
- `npm test` passes.
- `npm run test:browser` passes on Edge.
- CI is configured for the full release gate.
- Remote CI is currently red.
- Supabase account binding and automation delivery persistence are now mapped.
- Vercel preview deploy succeeded.
- Public `npm run smoke:vercel` fails behind Vercel Authentication.
- Protected smoke through `vercel curl` passed.
- Preview Supabase env vars are missing.

Readiness score: `7.4/10`

Confidence score: `8.8/10`

This repo is locally healthier.
Release truth is still blocked.

## Evidence Snapshot

Confirmed on this audit:
- Build passed.
- Typecheck passed.
- Hardening audit passed `12/12`.
- Creative flow audit passed `11/11`.
- Full test suite passed.
- Browser QA passed on Edge.
- Vercel preview deploy passed.
- Public Vercel smoke failed.
- Protected Vercel smoke passed.
- Supabase-mode local tests passed.
- Remote CI failed.
- Worktree is dirty.
- `README.md` now points to release truth.

Fixed in implementation:
- `table-action-visibility`
- browser login selector contract
- account table column-key browser contract
- remote batch task browser flow
- Vercel cron config
- CI release gate alignment
- Supabase account binding persistence
- Supabase automation delivery persistence

## Proven Mismatches

### 1. Quality gate mismatch

Claim:
- Project docs imply release readiness.

Reality:
- Full local suite now passes.
- Remote CI currently fails.
- Public preview smoke currently fails.

Impact:
- Release confidence is overstated.
- Docs are ahead of software truth.

Proof:
- `npm test` passes.
- `npm run test:browser` passes on Edge.
- `npm run smoke:vercel` fails against public preview.
- GitHub Actions `Production Hardening CI` is red.

### 2. UI contract mismatch

Claim:
- Table action column is tokenized.

Reality:
- The action visibility contract now passes.

Impact:
- Row actions may clip.
- Theme parity may drift.
- Table usability can break quietly.

Proof:
- `tools/creative-implementation-audit.cjs`
- `tmp/creative-implementation-flow/audit-report.json`

### 3. Browser automation mismatch

Claim:
- Browser QA exists.

Reality:
- Browser QA now has restored login compatibility and stable table column-key selectors.

Impact:
- Automated UI confidence is false.
- Regressions can ship unnoticed.

Proof:
- `tests/vue-app.browser.test.cjs` clicks `button.login-button`
- [src/components/LoginPage.vue](/C:/Users/ACOB/Desktop/VS%20Code/acob-crm-4/src/components/LoginPage.vue) uses `BaseButton.auth-submit`

### 4. Architecture documentation drift

Claim:
- `docs/ARCHITECTURE.md` reflects shipped reality.

Reality:
- It contains encoding artifacts.
- It describes files no longer current.
- Root `ARCHITECTURE.md` is cleaner and newer.

Impact:
- New work may follow stale boundaries.
- AI assistants may anchor to old structure.
- Human onboarding slows down.

Proof:
- `docs/ARCHITECTURE.md` still references `src/styles/index.css`
- Root architecture centers `tokens.css`, `themes.css`, `primitives.css`, `layouts.css`

### 5. Runtime version mismatch

Claim:
- Engine is Node `22.x`.

Reality:
- CI now runs Node `22`.
- This audit ran locally on Node `24.13.1`.

Impact:
- "Works here" risk.
- CI and prod parity risk.
- ESM and fetch behavior drift risk.

Proof:
- [package.json](/C:/Users/ACOB/Desktop/VS%20Code/acob-crm-4/package.json)
- [.github/workflows/ci.yml](/C:/Users/ACOB/Desktop/VS%20Code/acob-crm-4/.github/workflows/ci.yml)

### 6. Persistence cutover is incomplete

Claim:
- Supabase is production persistence.

Reality:
- Account bindings now have Supabase persistence.
- Automation deliveries now have Supabase persistence.
- Remaining Supabase proof needs a real deployed project.

Impact:
- "Production persistence" is only partial.
- Cross-deployment continuity is incomplete.
- Audit integrity can fragment.

Proof:
- [backend/src/services/storage-adapter.js](/C:/Users/ACOB/Desktop/VS%20Code/acob-crm-4/backend/src/services/storage-adapter.js)
- `saveAccountBinding`
- `deleteAccountBinding`
- `listAccountBindings`
- `recordAutomationDelivery`
- `listAutomationDeliveries`

### 7. Release documentation mismatch

Claim:
- `README.md` should orient operators and developers.

Reality:
- It contains only `# beverly`

Impact:
- Onboarding is weak.
- Deployment handoff is weak.
- Operational memory lives in scattered docs.

## Gap Matrix

| Area | Current state | Gap | Severity | Next move |
|---|---|---|---|---|
| Build | Passes | No blocker here | Low | Keep as gate |
| Type safety | Passes custom typecheck | No strict TS across app | Medium | Expand typed contracts gradually |
| Unit and integration tests | Passing suite | Needs CI confirmation | Medium | Watch CI on next push |
| Browser QA | Passing on Edge | Optional engines missing locally | Medium | Install browser runtimes where needed |
| UI design system | Tokenized | Contract fixed | Low | Keep flow audit in CI |
| Route parity | Strong coverage | Docs still overclaim completion | Medium | Re-baseline route truth |
| Auth | Supabase path exists | Production auth proof missing | High | Verify live auth end-to-end |
| Supabase data | Migrations expanded | Needs deployed Supabase proof | Medium | Run Supabase mode smoke |
| Storage | Buckets supported | No end-to-end production proof | High | Stage upload, receipt, export checks |
| Deployment | Preview deploy succeeds | Public smoke blocked by Vercel Auth | Critical | Add bypass-aware smoke |
| CI | Full release gate configured | Remote CI red | Critical | Push clean branch and fix CI |
| Docs | Many runbooks | Canonical docs drift | High | Consolidate and refresh |
| Observability | Health docs exist | No deployed target evidence | High | Wire real preview and prod monitors |
| Security | Good env posture | Production secrets not verified here | High | Run production env review after deploy |
| Data logic | EIH pipeline mature | Needs live re-verification after auth and Supabase shifts | Medium | Run post-cutover parity audit |

## Deep Gap Analysis

### Frontend

What is strong:
- Vue shell exists.
- Core route system exists.
- Base primitives exist.
- Custom pages exist.
- Design tokens exist.

What is weak:
- Test selectors are brittle.
- UI contracts are not fully encoded.
- Browser QA depends on styling hooks.
- Legacy CSS remains large.
- Some visual behavior still spans old and new layers.

What to fix:
1. Add stable `data-testid` hooks for login, modal actions, export, print, and table actions.
2. Make the action column width and overflow fully token-driven.
3. Remove selector reliance on cosmetic classes.
4. Audit all modal open and close flows against browser tests.
5. Finish migration of table and modal rules from legacy sheets into primitive contracts.

### UX

What is strong:
- The login page is visually upgraded.
- Table pages have search, sort, paging, and action flow.
- EIH has progressive loading.

What is weak:
- QA proves UX flows are not contract-stable.
- Critical actions lack explicit test identifiers.
- "Production-ready" UX is not measurable today.

Creative improvements:
1. Define route-level task success criteria.
2. Add first-class empty states per route family.
3. Add persistent load provenance.
4. Show "live", "cached", or "demo" source badges.
5. Add operator-safe write previews before submission.

### Backend Proxy

What is strong:
- Single proxy entry exists.
- Auth priority rules exist.
- Rate limit and CORS controls exist.

What is weak:
- Production proof is absent in this audit.
- Auth behavior now spans live token, cookies, demo auth, and Supabase auth.
- Complexity is rising faster than verification.

What to fix:
1. Create one auth truth table.
2. Test every login mode.
3. Test every fallback branch.
4. Log branch selection without leaking secrets.
5. Freeze unsupported mixed modes.

### Data and Logic

What is strong:
- EIH logic is explicitly documented.
- Pure aggregation and fraud services exist.
- Route manifests centralize screen behavior.

What is weak:
- Logic maturity exceeds release proof.
- Post-change regression surface is large.
- Not all logic paths are validated in browser mode.

What to fix:
1. Re-run route and flow parity after auth changes.
2. Add release fixtures for token, remote task, and management flows.
3. Add contract snapshots for route-specific action rendering.

### Supabase

What is strong:
- Migrations exist.
- Auth helpers exist.
- Storage helpers exist.
- REST helpers exist.

What is weak:
- Adapter cutover is inconsistent.
- Some persistence remains local-only.
- Production data ownership is still hybrid.
- Auth metadata shape is custom and fragile.

What to fix:
1. Finish the storage adapter map.
2. Mark every method `local-only`, `hybrid`, or `supabase-ready`.
3. Move account bindings and automation deliveries to Supabase tables.
4. Add a migration completeness test.
5. Add a runtime boot check for required Supabase tables and buckets.

### Security

What is strong:
- No hardcoded secrets in source.
- Env examples are blank.
- Write guard exists.
- Upload policy exists.

What is weak:
- Production env has not been audited here.
- Session and auth mode combinations need sharper lock-down.
- Dirty worktree raises release hygiene concerns.

What to fix:
1. Lock Node version.
2. Lock auth mode matrix.
3. Run production env validation after preview config.
4. Add branch protection around the full release gate.

### DevEx and Operations

What is strong:
- Many scripts exist.
- Runbooks exist.
- Monitoring workflow exists.

What is weak:
- Repo truth is scattered.
- CI is not the same as the local release gate.
- README is empty.
- Architecture exists twice.

What to fix:
1. Make one canonical architecture file.
2. Turn `npm test` into CI truth.
3. Add a release command.
4. Rewrite README for setup, run, verify, deploy, recover.

## Critical Errors To Fix First

These blocked production before this pass.

1. `table-action-visibility`: fixed.
2. Browser login selector drift: fixed.
3. `npm test`: green.
4. `npm run test:browser`: green on Edge.
5. CI release suite alignment: fixed.
6. Vercel preview deploy: passed.
7. Public Vercel smoke: blocked by Vercel Authentication.
8. Supabase deployed smoke: still pending.
9. Remote CI: failing.

## Code Mismatch Register

| Mismatch | Source | Target | Why it matters |
|---|---|---|---|
| Login test selector | `button.login-button` | `BaseButton.auth-submit login-button` | Fixed compatibility |
| Architecture source of truth | `docs/ARCHITECTURE.md` | root `ARCHITECTURE.md` | Design and boundary drift |
| Node version | `22.x` engine | CI `22`, audit `24.13.1` | CI fixed, local still newer |
| Production readiness claim | docs | local gates pass, release gates fail | Public smoke and CI needed |
| Supabase persistence claim | architecture | mapped locally, not deployed | Deployed smoke needed |

## Production Readiness Plan

### Phase 0. Stop Lying To Ourselves

Goal:
- Make repo truth honest.

Tasks:
1. Add this gap report: done.
2. Mark release as blocked until tests pass: done.
3. Update remaining-work docs with current blockers: done.
4. Decide the single canonical architecture file: root `ARCHITECTURE.md`.

Exit:
- All release docs reflect failing gates.
- Public smoke failure is documented.
- Remote CI failure is documented.
- Supabase preview gap is documented.

### Phase 1. Restore Green Quality Gates

Goal:
- Green local verification.

Tasks:
1. Fix `table-action-visibility`.
2. Update browser tests to stable selectors.
3. Add `data-testid` contracts.
4. Re-run `npm test`.
5. Re-run `npm run test:browser`.

Exit:
- Both commands pass locally.

### Phase 2. Stabilize UI Contracts

Goal:
- Prevent styling drift from breaking behavior.

Tasks:
1. Encode action-column width in token + primitive CSS + page usage.
2. Standardize modal trigger selectors.
3. Standardize auth form selectors.
4. Snapshot route action layouts.

Exit:
- UI tests assert behavior, not aesthetics.

### Phase 3. Finish Supabase Reality

Goal:
- Make persistence architecture true.

Tasks:
1. Inventory every local DB write.
2. Map each write to Supabase ownership.
3. Add missing tables and migrations.
4. Remove fake remote branches that still write local-only.
5. Add boot diagnostics for Supabase readiness.

Exit:
- Every persistence path is classified and tested.

### Phase 4. Harden Auth Modes

Goal:
- Make auth predictable.

Tasks:
1. Document supported auth combinations.
2. Reject invalid mixed modes at startup.
3. Add tests for demo, live, cookie, and Supabase auth resolution.
4. Add explicit session timeout coverage.

Exit:
- Auth behavior is deterministic.

### Phase 5. Deploy Preview For Real

Goal:
- Replace hypothetical production with evidence.

Tasks:
1. Deploy Vercel preview.
2. Configure preview env vars.
3. Run `npm run smoke:vercel`.
4. Run auth smoke.
5. Run one guarded write smoke.
6. Run one artifact persistence smoke.

Exit:
- Preview URL is green.

### Phase 6. Align CI With Release Truth

Goal:
- CI should fail where release fails.

Tasks:
1. Add `npm test`.
2. Add browser smoke for one installed engine.
3. Add release artifact upload.
4. Gate merges on real release commands.

Exit:
- Local green equals CI green.

### Phase 7. Documentation Rebuild

Goal:
- Make onboarding fast.

Tasks:
1. Replace placeholder README.
2. Merge architecture truth.
3. Add env matrix.
4. Add auth matrix.
5. Add persistence matrix.
6. Add release checklist tied to commands.

Exit:
- A new engineer can run, test, and deploy from docs alone.

### Phase 8. Production Launch Review

Goal:
- Final go/no-go.

Tasks:
1. Confirm green build.
2. Confirm green tests.
3. Confirm green browser smoke.
4. Confirm green preview smoke.
5. Confirm monitoring targets.
6. Confirm rollback steps.
7. Confirm DLT645 blocker acceptance.

Exit:
- Ship only with explicit evidence.

## Suggested Work Order

Do this next:

1. Fix table action visibility.
2. Fix login and modal test selectors.
3. Make `npm test` pass.
4. Make `npm run test:browser` pass.
5. Upgrade CI to run the same gate.
6. Finish Supabase adapter coverage.
7. Deploy preview.
8. Run smoke and security review.
9. Refresh docs.
10. Launch.

## Acceptance Checklist

Production-ready means all are true:

- `npm run build` passes.
- `npm run typecheck` passes.
- `npm test` passes.
- `npm run test:browser` passes.
- `npm run hardening:audit` passes.
- CI uses the same gate.
- Preview deploy is live.
- Preview smoke passes.
- Auth modes are verified.
- Supabase persistence is complete or explicitly scoped.
- README is real.
- Architecture is singular.
- Monitoring targets are configured.
- Rollback is documented.

## Brutal Critique

What this project does well:
- Strong architecture intent.
- Strong service separation.
- Strong operational ambition.

What it does badly today:
- It overstates release readiness.
- It spreads truth across too many docs.
- It lets tests drift from UI contracts.
- It claims Supabase ownership before full cutover.

Most important correction:
- Stop treating "builds" as "ready".

## My Audit Rating

Architecture quality: `8.4/10`

Frontend structure: `7.8/10`

Backend safety posture: `7.9/10`

Test trustworthiness: `5.4/10`

Docs trustworthiness: `5.8/10`

Deployment readiness: `5.2/10`

Supabase maturity: `6.3/10`

Overall production readiness: `6.1/10`
Current local readiness after implementation: `7.4/10`

## Best Next Step

Start with release truth.

Next:
- Make `npm run smoke:vercel` work with Vercel Authentication.
- Configure preview Supabase env vars.
- Push a clean branch.
- Confirm remote CI passes.
