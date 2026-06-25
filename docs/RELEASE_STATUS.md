# Release Status

Date: 2026-05-12

Status: blocked.

Reason:
- Public Vercel smoke fails behind Vercel Authentication.
- Protected API reads return `401 authz` without smoke credentials.
- Remote CI has no run for branch `codex/production-gap-fixes-20260512`.
- Worktree is dirty.

Current proof:
- `npm run build` passed.
- `npm run typecheck` passed.
- `npm test` passed.
- `npm run test:browser` passed on Edge.
- `npm run hardening:audit` passed.
- Production dependency audit passed.
- Vercel preview deploy passed.
- Protected Vercel health passed.
- Supabase-mode tests passed locally.
- Preview Supabase envs exist.
- Smoke tooling supports `VERCEL_PROTECTION_BYPASS`.
- Smoke tooling supports `SMOKE_AUTH_TOKEN`.
- Smoke tooling supports `SMOKE_USER_ID` and `SMOKE_PASSWORD`.

Failing release gates:
- `npm run smoke:vercel` against public preview.
- Authenticated deployed read smoke without smoke credentials.
- GitHub Actions `Production Hardening CI` for this branch.

Canonical architecture:
- Root `ARCHITECTURE.md` is canonical.
- `docs/ARCHITECTURE.md` is legacy reference only.
- Update root architecture first.
- Mirror docs only when needed.

Release rule:
- Do not mark production ready.
- Do not promote preview.
- Do not enable live writes.
- Do not claim CI green.

Latest preview:
- `https://beverly-3lrokjz2q-danmusa-abdulsamads-projects.vercel.app`

Unblock order:
1. Set `VERCEL_PROTECTION_BYPASS`.
2. Set `SMOKE_AUTH_TOKEN` or `SMOKE_USER_ID` and `SMOKE_PASSWORD`.
3. Rerun `npm run smoke:vercel`.
4. Push branch `codex/production-gap-fixes-20260512`.
5. Confirm remote CI green.
