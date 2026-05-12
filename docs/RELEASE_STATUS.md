# Release Status

Date: 2026-05-12

Status: blocked.

Reason:
- Public Vercel smoke fails.
- Vercel Authentication blocks `npm run smoke:vercel`.
- Remote CI is red.
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

Failing release gates:
- `npm run smoke:vercel` against public preview.
- GitHub Actions `Production Hardening CI`.
- Deployed Supabase-mode smoke.

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
1. Add Vercel smoke bypass support.
2. Configure preview Supabase envs.
3. Push a clean branch.
4. Rerun remote CI.
5. Rerun public smoke.
6. Record final evidence.
