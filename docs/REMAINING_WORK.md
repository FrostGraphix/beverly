# Beverly CRM - Remaining Work

Last updated: 2026-05-12

Rule: only list real gaps.

Release status: blocked.

## Blocking Now

### 1. Public Vercel smoke fails

- Command: `npm run smoke:vercel`
- Target: Vercel preview URL
- Current result: fails before JSON validation
- Cause: Vercel Authentication returns HTML
- Needed: bypass-aware smoke or public test access

### 2. Remote CI is red

- Workflow: `Production Hardening CI`
- Branch: `main`
- Latest known result: failure
- Needed: push clean branch and rerun
- Rule: do not claim release green

### 3. Supabase preview smoke is not proven

- Preview env vars: missing
- Supabase-mode tests: pass locally
- Deployed Supabase mode: not proven
- Needed: configure preview Supabase envs

### 4. Worktree is dirty

- Many files are modified.
- Some tmp files are generated.
- Needed: curate release branch carefully.
- Rule: never ship unknown drift.

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

1. Make Vercel smoke auth-aware.
2. Add preview Supabase envs.
3. Push a clean branch.
4. Confirm remote CI green.
5. Rerun public preview smoke.
6. Update release status.
