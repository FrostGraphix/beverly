# Beverly CRM - Remaining Work

Last updated: 2026-05-12

Rule: only list real gaps.

Release status: blocked.

## Blocking Now

### 1. Public Vercel smoke needs bypass secret

- Command: `npm run smoke:vercel`
- Target: Vercel preview URL
- Current result: protected 401 HTML
- Cause: Vercel Authentication is enabled
- Tooling fix: implemented
- Needed: set `VERCEL_PROTECTION_BYPASS`

### 2. Deployed read smoke needs API auth

- Protected health: passes
- Protected read routes: `401 authz`
- Cause: preview API requires authenticated read access
- Tooling fix: implemented
- Needed: set `SMOKE_AUTH_TOKEN` or `SMOKE_USER_ID` and `SMOKE_PASSWORD`

### 3. Remote CI is not proven

- Current branch: `codex/production-gap-fixes-20260512`
- Latest current-branch result: no runs found
- Needed: push the branch and inspect GitHub Actions
- Rule: do not claim release green

### 4. Worktree is dirty

- Many files are modified.
- Some tmp files are generated.
- Needed: curate release branch carefully.
- Rule: never ship unknown drift.

## Fixed This Pass

- Build/package/Vite runtime mismatch fixed.
- Table action visibility remains contract-guarded.
- Browser tests now use stable `data-testid` selectors.
- Login fields expose stable `data-testid` selectors.
- Toolbar and row actions expose stable `data-testid` selectors.
- Theme menu now uses `role="menuitemradio"`.
- Public smoke supports `PREVIEW_TARGET_URL`.
- Public smoke supports `VERCEL_PROTECTION_BYPASS`.
- Public smoke supports smoke auth token and credentials.
- Browser QA defaults to Edge on Windows.
- Preview Supabase envs exist.

## Canonical Docs

- Root `ARCHITECTURE.md` is canonical.
- `docs/ARCHITECTURE.md` is legacy reference.
- `docs/PRODUCTION_GAP_ANALYSIS.md` owns gap truth.
- `docs/RELEASE_STATUS.md` owns go/no-go truth.

## Not Blocking Locally

- `npm run build` passed.
- `npm run typecheck` passed.
- `npm test` passed.
- `npm run test:browser` passed.
- `npm run hardening:audit` passed.
- Production dependency audit passed.
- Supabase-mode local tests passed.

## Next Order

1. Set `VERCEL_PROTECTION_BYPASS`.
2. Set smoke API auth.
3. Rerun public preview smoke.
4. Push branch.
5. Confirm remote CI green.
