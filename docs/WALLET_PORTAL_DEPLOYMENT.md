# Beverly Wallet Portal Deployment

Current production host:

- CRM: `https://beverly.acoblighting.com/`
- Staff wallet admin: `https://beverly.acoblighting.com/wallet-admin/`
- Vendor wallet: `https://beverly.acoblighting.com/wallet-vendor/`
- Customer wallet: `https://beverly.acoblighting.com/wallet-customer/`

Current deployment truth, checked 2026-07-10:

- Production deployment: `dpl_8G3DXooMiE8YCDoGiiDJbzNZsopf`
- Production commit: `af455ac2741d4ceb89a89902c517bc49b4e652f1`
- PR #9 preview: `https://beverly-kpdyn47c9-danmusa-abdulsamads-projects.vercel.app`
- PR #9 commit: `de989ef7919144e927f079289e96926bf5c10930`
- Current branch alias: `https://beverly-git-codex-post-june-046264-danmusa-abdulsamads-projects.vercel.app`
- Current branch latest observed state: `QUEUED`
- Separate avatar preview: `https://beverly-ce61s6h78-danmusa-abdulsamads-projects.vercel.app`
- Separate avatar branch: `codex/mobile-avatar-dropdown-fix`

Canonical domain map:

- CRM: `beverly.acoblighting.com`
- Staff wallet admin: `beverly.acoblighting.com/wallet-admin/`
- Vendor wallet: `beverly.acoblighting.com/wallet-vendor/`
- Customer wallet: `beverly.acoblighting.com/wallet-customer/`

All four portals are produced by one Vercel deployment. The CRM owns `/api`.
The three wallet portals call the same `/api/v1/...` endpoints through the
same origin, so browser CORS stays simple and sessions remain scoped by token
storage keys.

The first rollout is path-based on the hosted CRM domain:

- Admin: `/wallet-admin/`
- Vendor: `/wallet-vendor/`
- Customer: `/wallet-customer/`

The same build also contains host-aware rewrites for these Vercel aliases:

- `admin-acob-beverly.vercel.app`
- `vendor-acob-beverly.vercel.app`
- `customer-acob-beverly.vercel.app`

Build output:

- CRM shell: `dist/`
- Staff admin: `dist/wallet-admin/`
- Vendor portal: `dist/wallet-vendor/`
- Customer PWA: `dist/wallet-customer/`

Smoke command:

```powershell
cd "C:\Users\ACOB\Desktop\VS Code\Beverly"
$env:TARGET_URL="https://beverly.acoblighting.com"
$env:VERCEL_PROTECTION_BYPASS="<bypass-secret>"
$env:SMOKE_AUTH_TOKEN="<smoke-token>"
npm run smoke:vercel
```

Expected smoke fields:

- `allowLiveWrites`
- `liveWriteControl.enabled`
- `mutationCheckSkipped`
- `writeGuarded`

Custom domain rollout:

1. Add the three portal domains in the same Vercel project.
2. Point DNS to Vercel.
3. Add domain redirects at the edge when ready:
   - admin host to `/wallet-admin/`
   - vendor host to `/wallet-vendor/`
   - customer host to `/wallet-customer/`
4. Keep `beverly.acoblighting.com` as the canonical UI and API host; the public Vercel alias redirects to it.
