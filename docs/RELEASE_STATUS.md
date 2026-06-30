# Release Status

Date: 2026-06-17

Status: blocked.

Reason:
- Latest unread Vercel mail reports failed preview deployments.
- Public Vercel smoke still needs a successful preview URL.
- Protected API reads need bypass and smoke credentials.
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

Latest unread deployment failure:
- `2026-06-13T08:54:37Z`
- project: `acob-crm-4-clean-deploy`
- deployment: `dpl_ApHZfUvEfjjC1UNM6Rk6TjE1We6S`
- details: `https://vercel.com/danmusa-abdulsamads-projects/acob-crm-4-clean-deploy/dpl_ApHZfUvEfjjC1UNM6Rk6TjE1We6S`
- latest `beverly` failure: `dpl_4TL5qsL4Dbe9FuAgx9xWSRrY9fMS`

Latest preview smoke checklist:
1. Confirm the target is a successful `beverly` preview URL.
2. Set `$env:PREVIEW_TARGET_URL="https://beverly-3lrokjz2q-danmusa-abdulsamads-projects.vercel.app"`.
3. Set `$env:TARGET_URL=$env:PREVIEW_TARGET_URL`.
4. Set `$env:VERCEL_PROTECTION_BYPASS="<preview-bypass-secret>"`.
5. Set `$env:SMOKE_AUTH_TOKEN="<smoke-token>"`.
6. Or set `$env:SMOKE_USER_ID` and `$env:SMOKE_PASSWORD`.
7. Run `npm run smoke:vercel`.
8. Set `$env:STAGING_TARGET_URL=$env:PREVIEW_TARGET_URL`.
9. Run `npm run write:staging`.
10. Record `readMode`, `liveProxyEnabled`, and `writeGuarded`.
11. Record `protectionBypassEnabled` and `authEnabled`.

Preview operator console checklist:
1. Sign in as `super-admin`.
2. Open Developer Console > Service Health.
3. Confirm Supabase reports `healthy`.
4. Review unresolved incidents.
5. Open Queue Monitor.
6. Confirm no failed jobs.
7. Retry only reviewed failures.
8. Open Schema Explorer > Deploy Log.
9. Confirm latest preview status.
10. Record deployment SHA and timestamp.

Unblock order:
1. Set `VERCEL_PROTECTION_BYPASS`.
2. Set `SMOKE_AUTH_TOKEN` or `SMOKE_USER_ID` and `SMOKE_PASSWORD`.
3. Rerun `npm run smoke:vercel`.
4. Push branch `codex/production-gap-fixes-20260512`.
5. Confirm remote CI green.
