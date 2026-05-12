# Quality Assurance In Beverly

Date: 2026-05-12

Architecture source:
- Root `ARCHITECTURE.md`

Scope:
- Local release gates
- Edge browser QA
- Vercel preview smoke
- Staging write smoke
- Production gap analysis

## Verdict

Status: release blocked.

Local readiness: 9.2/10.

Production readiness: 8.7/10.

Reason:
- Local gates pass.
- Public preview smoke needs bypass secret.
- Staging target needs bypass secret.
- Remote CI latest checked run passed.
- Preview Supabase envs are configured.
- Clean branch is pushed.
- Worktree contains unrelated drift.

## Verified Gates

Passed:
- `npm run build`
- `npm run typecheck`
- `npm run hardening:audit`
- `npm run flow:audit`
- `npm test`
- `BROWSER_QA_TARGETS=edge npm run test:browser`
- `npm run security:check`
- `npm run env:validate`
- Protected Vercel health via `vercel curl`
- GitHub Actions lookup via `npm run ci:actions`

Failed:
- `npm run smoke:vercel` without `TARGET_URL`
- Public Vercel smoke without bypass secret
- Default browser QA target

Blocked:
- `npm run write:staging` against protected preview
- `npm run smoke:vercel` against protected preview

## Bug Log

### BUG-001: Receipt export contract fails

Severity: High.

Status: fixed locally.

Repro steps:
1. Run `npm test`.
2. Observe `creative-implementation-flow.test.cjs`.

Expected result:
- Receipt/export contract passes.

Actual result:
- `receipt-export-content` failed.
- Missing `detail-section` contract.

Fix:
- Added receipt detail section.
- Preserved browser/PDF export contract.

Files:
- `src/services/receipt-tools.mjs`

### BUG-002: Public preview API is inaccessible

Severity: Critical.

Status: open.

Repro steps:
1. Set `TARGET_URL` to latest Vercel preview.
2. Run `npm run smoke:vercel`.

Expected result:
- JSON health and route smoke pass.

Actual result:
- Public API returns HTML/401.
- JSON parser fails.

Likely cause:
- Vercel Authentication blocks smoke.

Required fix:
- Set `VERCEL_PROTECTION_BYPASS`.
- Rerun preview smoke.
- Redeploy the pushed branch.

Implemented:
- Tooling accepts bypass header.
- Tooling reports protected HTML cleanly.
- Preview Supabase envs are set.

### BUG-003: Staging target needs bypass

Severity: Critical.

Status: open.

Repro steps:
1. Set `PREVIEW_TARGET_URL`.
2. Run `npm run write:staging`.

Expected result:
- Staging write guard is tested.

Actual result:
- Protected preview returns `401`.

Required fix:
- Configure `STAGING_TARGET_URL` or `PREVIEW_TARGET_URL`.
- Set `VERCEL_PROTECTION_BYPASS`.
- Keep `ALLOW_LIVE_WRITES=false`.
- Run guarded write smoke first.

### BUG-004: Default browser QA target fails

Severity: Medium.

Status: open.

Repro steps:
1. Run `npm run test:browser`.

Expected result:
- Browser QA passes.

Actual result:
- Fails with `no browsers passed`.

Workaround:
- Run `$env:BROWSER_QA_TARGETS='edge'; npm run test:browser`.

Required fix:
- Fixed locally.
- Browser QA defaults to Edge.

### BUG-005: Remote CI status unavailable locally

Severity: High.

Status: fixed.

Repro steps:
1. Run `gh run list --limit 10`.

Expected result:
- Latest CI run is visible.

Actual result:
- `npm run ci:actions` works.
- Latest `ci.yml` passed.

Required fix:
- None locally.

### BUG-006: Worktree contains unrelated drift

Severity: High.

Status: open.

Repro steps:
1. Run `git status --short`.

Expected result:
- Only intentional QA changes appear.

Actual result:
- Generated tmp files changed.
- SQLite WAL changed.
- UI files show unrelated edits.

Required fix:
- Curate release branch.
- Commit only reviewed changes.
- Exclude generated artifacts.

## Best Gap Plan

1. Set bypass secret.
2. Configure preview Supabase envs.
3. Curate dirty worktree.
4. Rerun public smoke.
5. Run staging write guard.
6. Record deployed evidence.

## Triage Summary

Ship status: controlled no-go.

Highest blocker:
- Missing bypass secret.

Second blocker:
- Preview Supabase proof.

Best next action:
- Set `VERCEL_PROTECTION_BYPASS`.
