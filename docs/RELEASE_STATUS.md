# Release Status

Date: 2026-05-12

Status: blocked.

Reason:
- Public Vercel smoke fails.
- Vercel Authentication blocks `npm run smoke:vercel`.
- Remote CI is green on latest checked run.
- Preview Supabase envs are missing.
- Worktree is dirty.

Current proof:
- Local build passed.
- Local typecheck passed.
- Local `npm test` passed.
- Local hardening audit passed.
- Edge browser smoke passed.
- Vercel preview deploy passed.
- Protected Vercel smoke passed through `vercel curl`.
- Supabase-mode tests passed locally.
- GitHub Actions `ci.yml` latest checked run passed.
- Smoke tooling now supports `VERCEL_PROTECTION_BYPASS`.

Failing release gates:
- `npm run smoke:vercel` against public preview.
- Deployed Supabase-mode smoke.
- Public preview smoke without bypass secret.

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

Unblock order:
1. Add `VERCEL_PROTECTION_BYPASS` secret.
2. Configure preview Supabase envs.
3. Push a clean branch.
4. Rerun public smoke.
5. Run staging write guard.
6. Record final evidence.
