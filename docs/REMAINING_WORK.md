# Beverly CRM - Remaining Work

Last updated: 2026-05-12

Rule: only list real gaps.

Release status: blocked.

## Blocking Now

### 1. Public Vercel smoke needs bypass secret

- Command: `npm run smoke:vercel`
- Target: Vercel preview URL
- Current result: fails with protected 401
- Cause: Vercel Authentication is enabled
- Tooling fix: implemented
- Needed: set `VERCEL_PROTECTION_BYPASS`

### 2. Staging target needs protected access

- `STAGING_TARGET_URL` or `PREVIEW_TARGET_URL` is required.
- Protected preview also needs `VERCEL_PROTECTION_BYPASS`.
- Guarded write smoke must return `403`.

### 3. Supabase preview smoke is not proven

- Preview env vars: configured for `codex/production-gap-fixes-20260512`
- Supabase-mode tests: pass locally
- Deployed Supabase mode: not proven
- Needed: redeploy preview and smoke with bypass

### 4. Worktree is dirty

- Many files are modified.
- Some tmp files are generated.
- Needed: curate release branch carefully.
- Rule: never ship unknown drift.

## Fixed This Pass

- Receipt detail contract restored.
- Public smoke supports `PREVIEW_TARGET_URL`.
- Public smoke supports `VERCEL_PROTECTION_BYPASS`.
- Staging smoke falls back to preview target.
- Browser QA defaults to Edge on Windows.
- Monitoring workflow uses Node 22.
- Monitoring workflow passes bypass secret.
- Remote CI lookup works through `npm run ci:actions`.
- Preview Supabase envs were added.
- Branch `codex/production-gap-fixes-20260512` was pushed.

## Canonical Docs

- Root `ARCHITECTURE.md` is canonical.
- `docs/ARCHITECTURE.md` is legacy reference.
- `docs/PRODUCTION_GAP_ANALYSIS.md` owns gap truth.
- `docs/RELEASE_STATUS.md` owns go/no-go truth.

## Not Blocking Locally

- `npm run build` passed.
- `npm run typecheck` passed.
- `npm test` passed.
- `npm run hardening:audit` passed.
- Edge browser QA passed.
- Protected Vercel smoke passed.
- Supabase-mode local tests passed.

## Next Order

1. Set `VERCEL_PROTECTION_BYPASS`.
2. Redeploy preview branch.
3. Rerun public preview smoke.
4. Run staging write guard.
5. Update release status.
