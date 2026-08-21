# Release Status

Evidence date: 2026-07-10.

Status: branch preview rolling.

Current Vercel truth:

- Canonical production URL: `https://beverly.acoblighting.com`
- Public Vercel alias: `https://acob-beverly.vercel.app` (redirects to the canonical domain after this release)
- Production deployment: `dpl_8G3DXooMiE8YCDoGiiDJbzNZsopf`
- Production URL: `https://beverly-ko88e8hyh-danmusa-abdulsamads-projects.vercel.app`
- Production commit: `af455ac2741d4ceb89a89902c517bc49b4e652f1`
- PR #9 preview deployment: `dpl_FLQH1voAnWntR5TnYLdnF2oTQF3K`
- PR #9 preview URL: `https://beverly-kpdyn47c9-danmusa-abdulsamads-projects.vercel.app`
- PR #9 commit: `de989ef7919144e927f079289e96926bf5c10930`
- Current branch alias: `https://beverly-git-codex-post-june-046264-danmusa-abdulsamads-projects.vercel.app`
- Current branch name: `codex/post-june24-features`
- Current branch deployment changes after every push.
- Latest observed branch deployment: `dpl_9RiPZQRvWVjsWcUSdQN77xiMcmzA`
- Latest observed branch URL: `https://beverly-he3e8k63p-danmusa-abdulsamads-projects.vercel.app`
- Latest observed branch commit: `8ada91be4b2b974f343263b19581f72df24751d8`
- Latest observed branch state: `QUEUED`
- Latest separate feature preview: `dpl_A6ZTx9QqhiiXsv8YYqoBhA5m1Sua`
- Latest separate feature URL: `https://beverly-ce61s6h78-danmusa-abdulsamads-projects.vercel.app`
- Latest separate feature branch: `codex/mobile-avatar-dropdown-fix`
- Latest separate feature commit: `97580a26cc431a9efbe05f19d4f97ff09ce4dd16`
- Latest separate feature state: `READY`

Excluded deployment evidence:

- Dirty local previews from commit `1f1744068b0c8b3b2bcdf6805df848bc418406a6`
- URLs `beverly-dtfkps6x8`, `beverly-66btpfz3e`, and `beverly-131eoxklc`
- These remain non-release candidates.

Live-write contract:

- Live-write state is runtime controlled by `/api/system/live-write-control`.
- Smoke tooling must read that endpoint.
- Smoke tooling must compare it with `/api/system/health`.
- Write probes are skipped when live writes are enabled.
- Write probes must remain guarded when live writes are disabled.

Local proof:

- `npm run typecheck`
- `npm run build`
- `npm run test:wallet`
- `npm run test:security`
- `node tests/payment-transaction-status-contract.test.cjs`
- `node tests/smoke-tooling.test.cjs`
- `node tests/api-authz.test.cjs`
- `node tests/supabase-migrations.test.cjs`

Production smoke checklist:

```powershell
cd "C:\Users\ACOB\Desktop\VS Code\Beverly"
$env:TARGET_URL="https://beverly.acoblighting.com"
$env:VERCEL_PROTECTION_BYPASS="<production-bypass-secret>"
$env:SMOKE_AUTH_TOKEN="<smoke-token>"
npm run smoke:vercel
```

PR #9 preview smoke checklist:

```powershell
cd "C:\Users\ACOB\Desktop\VS Code\Beverly"
$env:TARGET_URL="https://beverly-kpdyn47c9-danmusa-abdulsamads-projects.vercel.app"
$env:VERCEL_PROTECTION_BYPASS="<preview-bypass-secret>"
$env:SMOKE_AUTH_TOKEN="<smoke-token>"
npm run smoke:vercel
```

Current branch preview checklist:

1. Set `TARGET_URL` to `https://beverly-git-codex-post-june-046264-danmusa-abdulsamads-projects.vercel.app`.
2. Set `VERCEL_PROTECTION_BYPASS`.
3. Set `SMOKE_AUTH_TOKEN`.
4. Run `npm run smoke:vercel`.
5. Record `allowLiveWrites`.
6. Record `liveWriteControl.enabled`.
7. Record `mutationCheckSkipped`.
8. Review browser console on CRM dashboard.
9. Review wallet admin login.

Promotion rule:

- Do not promote unverified previews.
- Do not promote without authenticated smoke.
- Do not promote dirty local previews.
- Do not force-push shared history.
